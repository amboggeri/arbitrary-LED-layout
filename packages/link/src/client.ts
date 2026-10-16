/**
 * Browser/Node WebSocket client for the bridge with auto-reconnect, RPC promises and
 * backpressure (frames are dropped while the socket buffer is congested).
 */
import type { Controller } from "@ledlay/core";
import { encodeFrameMessage } from "./frames";
import { LINK_VERSION, type BridgeStats, type ClientMessageInput, type RpcMethod, type ServerMessage } from "./messages";

/** Minimal WebSocket surface we rely on (DOM WebSocket and `ws` both satisfy it). */
export interface SocketLike {
  readonly readyState: number;
  readonly bufferedAmount: number;
  binaryType: string;
  send(data: string | Uint8Array): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export type LinkStatus = "connecting" | "open" | "closed";

export interface BridgeClientOptions {
  url: string;
  socketFactory?: SocketFactory;
  reconnectMs?: number;
  rpcTimeoutMs?: number;
  /** Max bytes queued in the socket before frames are dropped. */
  maxBufferedBytes?: number;
  onStatus?: (s: LinkStatus) => void;
  onStats?: (s: BridgeStats) => void;
}

const OPEN = 1;

export class BridgeClient {
  private socket: SocketLike | null = null;
  private status: LinkStatus = "closed";
  private nextRpc = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private controllers: Controller[] = [];
  private stopped = true;
  droppedFrames = 0;

  constructor(private readonly opts: BridgeClientOptions) {}

  get state(): LinkStatus {
    return this.status;
  }

  connect(): void {
    this.stopped = false;
    this.open();
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.setStatus("closed");
    this.failPending("Disconnected");
  }

  private setStatus(s: LinkStatus) {
    if (this.status === s) return;
    this.status = s;
    this.opts.onStatus?.(s);
  }

  private failPending(reason: string) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private open() {
    const factory =
      this.opts.socketFactory ?? ((url: string) => new (globalThis as unknown as { WebSocket: new (u: string) => SocketLike }).WebSocket(url));
    this.setStatus("connecting");
    let sock: SocketLike;
    try {
      sock = factory(this.opts.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    sock.binaryType = "arraybuffer";
    this.socket = sock;
    sock.onopen = () => {
      this.setStatus("open");
      this.sendJson({ type: "hello", client: "ledlay-studio", version: LINK_VERSION });
      if (this.controllers.length) this.sendJson({ type: "setControllers", controllers: this.controllers });
    };
    sock.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data) as ServerMessage;
      } catch {
        return;
      }
      this.handle(msg);
    };
    sock.onclose = () => {
      if (this.socket !== sock) return;
      this.socket = null;
      this.setStatus("closed");
      this.failPending("Bridge connection closed");
      this.scheduleReconnect();
    };
    sock.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.open();
    }, this.opts.reconnectMs ?? 2000);
  }

  private handle(msg: ServerMessage) {
    if (msg.type === "rpcResult") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    } else if (msg.type === "stats") this.opts.onStats?.(msg.stats);
  }

  private sendJson(m: ClientMessageInput): boolean {
    if (!this.socket || this.socket.readyState !== OPEN) return false;
    this.socket.send(JSON.stringify(m));
    return true;
  }

  /** Tell the bridge which controllers frames refer to (index = position in this list). */
  setControllers(controllers: Controller[]): void {
    this.controllers = controllers;
    this.sendJson({ type: "setControllers", controllers });
  }

  blackout(): void {
    this.sendJson({ type: "blackout" });
  }

  /** Returns false if the frame was dropped (not connected or congested). */
  sendFrame(controllerIndex: number, data: Uint8Array, channelsPerPixel: 3 | 4 = 3): boolean {
    const s = this.socket;
    if (!s || s.readyState !== OPEN) return false;
    if (s.bufferedAmount > (this.opts.maxBufferedBytes ?? 1 << 20)) {
      this.droppedFrames++;
      return false;
    }
    s.send(encodeFrameMessage({ controllerIndex, channelsPerPixel, data }));
    return true;
  }

  rpc<T = unknown>(method: RpcMethod, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextRpc++;
    return new Promise<T>((resolve, reject) => {
      if (!this.sendJson({ type: "rpc", id, method, params })) {
        reject(new Error("Bridge not connected"));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Bridge RPC ${method} timed out`));
      }, this.opts.rpcTimeoutMs ?? 10_000);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    });
  }
}
