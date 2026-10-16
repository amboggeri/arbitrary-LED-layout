import { createServer, type Server } from "node:http";
import { createSocket, type Socket } from "node:dgram";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createController } from "@ledlay/core";
import { BridgeClient, type LinkStatus, type SocketLike } from "@ledlay/link";
import { decodeDdpPacket, decodeArtDmx } from "@ledlay/protocols";
import { startBridge, isAllowedOrigin, type BridgeServer } from "../src/server";
import { NodeUdpTransport } from "../src/udp";

function udpReceiver(): Promise<{ socket: Socket; port: number; packets: Buffer[]; next(): Promise<Buffer> }> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    const packets: Buffer[] = [];
    const waiters: ((b: Buffer) => void)[] = [];
    socket.on("message", (m) => {
      const w = waiters.shift();
      if (w) w(m);
      else packets.push(m);
    });
    socket.bind(0, "127.0.0.1", () =>
      resolve({
        socket,
        port: (socket.address() as AddressInfo).port,
        packets,
        next: () => (packets.length ? Promise.resolve(packets.shift()!) : new Promise((r) => waiters.push(r))),
      }),
    );
  });
}

function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (cond()) resolve();
      else if (Date.now() - start > ms) reject(new Error("timeout"));
      else setTimeout(tick, 5);
    };
    tick();
  });
}

describe("bridge end-to-end", () => {
  let transport: NodeUdpTransport;
  let bridge: BridgeServer;
  let wledHttp: Server;
  let wledPort: number;
  let client: BridgeClient;
  let status: LinkStatus[];

  beforeEach(async () => {
    wledHttp = createServer((req, res) => {
      if (req.url === "/json/info") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ver: "0.15.0", name: "FakeWLED", mac: "x", leds: { count: 30 } }));
      } else res.writeHead(404).end();
    });
    await new Promise<void>((r) => wledHttp.listen(0, "127.0.0.1", () => r()));
    wledPort = (wledHttp.address() as AddressInfo).port;
    transport = new NodeUdpTransport();
    bridge = await startBridge({
      transport,
      port: 0,
      statsIntervalMs: 50,
      discover: async () => [{ name: "w", host: "10.0.0.2", port: 80, kind: "wled" }],
    });
    status = [];
    client = new BridgeClient({
      url: `ws://127.0.0.1:${bridge.port}`,
      socketFactory: (u) => new WebSocket(u) as unknown as SocketLike,
      onStatus: (s) => status.push(s),
    });
    client.connect();
    await waitFor(() => client.state === "open");
  });

  afterEach(async () => {
    client.disconnect();
    await bridge.close();
    await transport.close();
    await new Promise<void>((r) => wledHttp.close(() => r()));
  });

  it("relays DDP frames to the controller over real UDP", async () => {
    const rx = await udpReceiver();
    client.setControllers([createController({ id: "c", name: "c", host: "127.0.0.1", port: rx.port })]);
    const data = new Uint8Array([10, 20, 30, 40, 50, 60]);
    await waitFor(() => client.sendFrame(0, data));
    const pkt = decodeDdpPacket(new Uint8Array(await rx.next()));
    expect([...pkt.data]).toEqual([...data]);
    expect(pkt.header.flags & 1).toBe(1);
    // blackout zeroes the same length
    client.blackout();
    const black = decodeDdpPacket(new Uint8Array(await rx.next()));
    expect([...black.data]).toEqual([0, 0, 0, 0, 0, 0]);
    rx.socket.close();
  });

  it("relays Art-Net and ignores unknown controller indices", async () => {
    const rx = await udpReceiver();
    client.setControllers([createController({ id: "c", name: "c", host: "127.0.0.1", port: rx.port, protocol: "artnet", universeStart: 2 })]);
    client.sendFrame(5, new Uint8Array(3)); // ignored
    client.sendFrame(0, new Uint8Array([1, 2, 3]));
    const d = decodeArtDmx(new Uint8Array(await rx.next()));
    expect(d.universe).toBe(2);
    expect([...d.slots.subarray(0, 3)]).toEqual([1, 2, 3]);
    rx.socket.close();
  });

  it("answers RPCs: ping, wled.info against a fake device, discover, and errors", async () => {
    expect(await client.rpc("ping")).toBe("pong");
    const info = await client.rpc<{ name: string }>("wled.info", { host: `127.0.0.1:${wledPort}` });
    expect(info.name).toBe("FakeWLED");
    expect(await client.rpc("discover", { timeoutMs: 10 })).toEqual([{ name: "w", host: "10.0.0.2", port: 80, kind: "wled" }]);
    await expect(client.rpc("wled.info", { host: "8.8.8.8" })).rejects.toThrow(/not on a private network/);
    await expect(client.rpc("wled.info", {})).rejects.toThrow(/Missing "host"/);
  });

  it("pushes stats", async () => {
    const stats: unknown[] = [];
    const c2 = new BridgeClient({
      url: `ws://127.0.0.1:${bridge.port}`,
      socketFactory: (u) => new WebSocket(u) as unknown as SocketLike,
      onStats: (s) => stats.push(s),
    });
    c2.connect();
    await waitFor(() => stats.length > 0);
    expect(stats[0]).toMatchObject({ frames: expect.any(Number), fps: expect.any(Number) });
    c2.disconnect();
  });

  it("serves /health and reports bad messages", async () => {
    const res = await fetch(`http://127.0.0.1:${bridge.port}/health`);
    expect(await res.json()).toMatchObject({ ok: true });
    expect((await fetch(`http://127.0.0.1:${bridge.port}/nope`)).status).toBe(404);
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
    const msgs: string[] = [];
    ws.on("message", (m) => msgs.push(m.toString()));
    await new Promise((r) => ws.on("open", r));
    ws.send("garbage");
    ws.send(Buffer.from([1, 2, 3]));
    await waitFor(() => msgs.filter((m) => m.includes('"error"')).length >= 2);
    expect(msgs.some((m) => m.includes("Bad message"))).toBe(true);
    expect(msgs.some((m) => m.includes("Not a frame"))).toBe(true);
    ws.close();
  });

  it("rejects WebSocket connections from foreign origins", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, { headers: { Origin: "https://evil.example" } });
    const err = await new Promise<Error>((r) => ws.on("error", r));
    expect(err.message).toMatch(/401|403|Unexpected server response/);
  });
});

describe("origin policy", () => {
  it("allows localhost, tauri and explicit origins only", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4173")).toBe(true);
    expect(isAllowedOrigin("tauri://localhost")).toBe(true);
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(isAllowedOrigin("https://my.site", ["https://my.site"])).toBe(true);
    expect(isAllowedOrigin("not a url")).toBe(false);
  });
});
