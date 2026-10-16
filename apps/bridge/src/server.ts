/**
 * The bridge: a local WebSocket server the studio connects to. It forwards binary frames
 * to controllers over UDP and answers RPCs (WLED API, discovery).
 *
 * Security: binds to 127.0.0.1 by default and only accepts WebSocket upgrades from
 * localhost origins (or an explicit allowlist), so arbitrary websites can't drive your LAN.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Controller } from "@ledlay/core";
import {
  DEFAULT_BRIDGE_PORT,
  LINK_VERSION,
  decodeFrameMessage,
  parseClientMessage,
  type BridgeStats,
  type ServerMessage,
} from "@ledlay/link";
import { FrameSender, type UdpTransport } from "@ledlay/targets";
import { WebSocketServer, type WebSocket } from "ws";
import { handleRpc, type RpcDeps } from "./rpc";

export const BRIDGE_VERSION = "0.1.0";

export interface BridgeOptions extends RpcDeps {
  transport: UdpTransport;
  port?: number;
  host?: string;
  /** Extra allowed Origin values (exact match). Localhost origins are always allowed. */
  allowedOrigins?: string[];
  statsIntervalMs?: number;
  log?: (msg: string) => void;
}

export interface BridgeServer {
  readonly port: number;
  readonly http: Server;
  close(): Promise<void>;
}

export function isAllowedOrigin(origin: string | undefined, extra: readonly string[] = []): boolean {
  if (!origin) return true; // non-browser clients (CLI, tests) send no Origin
  if (extra.includes(origin)) return true;
  try {
    const u = new URL(origin);
    return (
      ["localhost", "127.0.0.1", "[::1]", "tauri.localhost"].includes(u.hostname) || u.protocol === "tauri:"
    );
  } catch {
    return false;
  }
}

export async function startBridge(opts: BridgeOptions): Promise<BridgeServer> {
  const log = opts.log ?? (() => {});
  const sender = new FrameSender(opts.transport, { sourceName: "ledlay-bridge" });
  const http = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, version: BRIDGE_VERSION }));
      return;
    }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({
    server: http,
    verifyClient: (info: { origin: string; req: IncomingMessage }) =>
      isAllowedOrigin(info.origin || undefined, opts.allowedOrigins),
  });

  // Per-connection state: controller list the client refers to by index, and the size of
  // the last frame sent to each (so blackout can zero exactly what was lit).
  const sessions = new Map<WebSocket, Controller[]>();
  const lastFrame = new Map<WebSocket, Map<number, { length: number; cpp: 3 | 4 }>>();
  let framesThisWindow = 0;
  let lastFps = 0;

  wss.on("connection", (ws) => {
    sessions.set(ws, []);
    lastFrame.set(ws, new Map());
    log("studio connected");
    const send = (m: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
    send({
      type: "welcome",
      version: LINK_VERSION,
      bridge: { name: "ledlay-bridge", version: BRIDGE_VERSION },
    });

    ws.on("message", async (raw, isBinary) => {
      if (isBinary) {
        const buf = raw instanceof Buffer ? raw : Buffer.concat(raw as Buffer[]);
        try {
          const frame = decodeFrameMessage(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
          const c = sessions.get(ws)?.[frame.controllerIndex];
          if (!c) return;
          framesThisWindow++;
          lastFrame
            .get(ws)
            ?.set(frame.controllerIndex, { length: frame.data.length, cpp: frame.channelsPerPixel });
          await sender.send(c, frame.data, frame.channelsPerPixel);
        } catch (e) {
          send({ type: "error", message: (e as Error).message });
        }
        return;
      }
      let msg;
      try {
        msg = parseClientMessage(raw.toString());
      } catch (e) {
        send({ type: "error", message: `Bad message: ${(e as Error).message}` });
        return;
      }
      switch (msg.type) {
        case "hello":
          log(`hello from ${msg.client}`);
          break;
        case "setControllers":
          sessions.set(ws, msg.controllers);
          lastFrame.get(ws)?.clear();
          log(
            `controllers: ${msg.controllers.map((c) => `${c.name}@${c.host || "?"}/${c.protocol}`).join(", ") || "(none)"}`,
          );
          break;
        case "blackout": {
          const list = sessions.get(ws) ?? [];
          for (const [idx, info] of lastFrame.get(ws) ?? []) {
            const c = list[idx];
            if (c) await sender.send(c, new Uint8Array(info.length), info.cpp);
          }
          break;
        }
        case "rpc":
          try {
            const result = await handleRpc(msg.method, msg.params, opts);
            send({ type: "rpcResult", id: msg.id, ok: true, result });
          } catch (e) {
            send({ type: "rpcResult", id: msg.id, ok: false, error: (e as Error).message });
          }
          break;
      }
    });
    ws.on("close", () => {
      sessions.delete(ws);
      lastFrame.delete(ws);
      log("studio disconnected");
    });
  });

  const statsMs = opts.statsIntervalMs ?? 1000;
  const statsTimer = setInterval(() => {
    lastFps = (framesThisWindow * 1000) / statsMs;
    framesThisWindow = 0;
    const stats: BridgeStats = { ...sender.stats, fps: lastFps };
    const msg = JSON.stringify({ type: "stats", stats } satisfies ServerMessage);
    for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(msg);
  }, statsMs);
  statsTimer.unref?.();

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(opts.port ?? DEFAULT_BRIDGE_PORT, opts.host ?? "127.0.0.1", () => resolve());
  });
  const port = (http.address() as AddressInfo).port;
  log(`bridge listening on ws://${opts.host ?? "127.0.0.1"}:${port}`);

  return {
    port,
    http,
    async close() {
      clearInterval(statsTimer);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => http.close(() => r()));
    },
  };
}
