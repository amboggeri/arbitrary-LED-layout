import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createController } from "@ledlay/core";
import {
  BridgeClient,
  decodeFrameMessage,
  encodeFrameMessage,
  parseClientMessage,
  type LinkStatus,
  type SocketLike,
} from "../src";

class FakeSocket implements SocketLike {
  readyState = 0;
  bufferedAmount = 0;
  binaryType = "blob";
  sent: (string | Uint8Array)[] = [];
  onopen: SocketLike["onopen"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  onmessage: SocketLike["onmessage"] = null;
  constructor(readonly url: string) {}
  send(d: string | Uint8Array) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  json() {
    return this.sent.filter((s): s is string => typeof s === "string").map((s) => JSON.parse(s));
  }
}

describe("frame messages", () => {
  it("round-trips", () => {
    const enc = encodeFrameMessage({
      controllerIndex: 513,
      channelsPerPixel: 4,
      data: new Uint8Array([1, 2, 3, 4]),
    });
    expect([...enc.subarray(0, 5)]).toEqual([0x46, 1, 2, 1, 4]);
    const dec = decodeFrameMessage(enc);
    expect(dec.controllerIndex).toBe(513);
    expect(dec.channelsPerPixel).toBe(4);
    expect([...dec.data]).toEqual([1, 2, 3, 4]);
  });
  it("validates", () => {
    expect(() =>
      encodeFrameMessage({ controllerIndex: 70000, channelsPerPixel: 3, data: new Uint8Array() }),
    ).toThrow();
    expect(() => decodeFrameMessage(new Uint8Array([1, 2]))).toThrow(/Not a frame/);
    expect(() => decodeFrameMessage(new Uint8Array([0x46, 9, 0, 0, 3]))).toThrow(/version/);
    expect(() => decodeFrameMessage(new Uint8Array([0x46, 1, 0, 0, 5]))).toThrow(/channels-per-pixel/);
  });
});

describe("client messages", () => {
  it("parses and applies defaults", () => {
    expect(parseClientMessage('{"type":"rpc","id":1,"method":"ping"}')).toEqual({
      type: "rpc",
      id: 1,
      method: "ping",
      params: {},
    });
    expect(() => parseClientMessage('{"type":"rpc","id":1,"method":"rm -rf"}')).toThrow();
    expect(() => parseClientMessage("nope")).toThrow();
    const c = parseClientMessage(
      JSON.stringify({ type: "setControllers", controllers: [{ id: "c", name: "c" }] }),
    );
    expect(c.type === "setControllers" && c.controllers[0]!.protocol).toBe("ddp");
  });
});

describe("BridgeClient", () => {
  let sockets: FakeSocket[];
  let statuses: LinkStatus[];
  let client: BridgeClient;
  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    statuses = [];
    client = new BridgeClient({
      url: "ws://x",
      socketFactory: (u) => {
        const s = new FakeSocket(u);
        sockets.push(s);
        return s;
      },
      reconnectMs: 100,
      rpcTimeoutMs: 500,
      maxBufferedBytes: 10,
      onStatus: (s) => statuses.push(s),
    });
  });
  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  it("says hello and replays controllers on open", () => {
    client.setControllers([createController({ id: "c", name: "c" })]);
    client.connect();
    expect(client.state).toBe("connecting");
    sockets[0]!.open();
    expect(sockets[0]!.binaryType).toBe("arraybuffer");
    expect(sockets[0]!.json().map((m) => m.type)).toEqual(["hello", "setControllers"]);
    expect(statuses).toEqual(["connecting", "open"]);
  });

  it("sends frames as binary and drops when congested or closed", () => {
    expect(client.sendFrame(0, new Uint8Array(3))).toBe(false);
    client.connect();
    sockets[0]!.open();
    expect(client.sendFrame(0, new Uint8Array([9, 9, 9]))).toBe(true);
    expect(sockets[0]!.sent.at(-1)).toBeInstanceOf(Uint8Array);
    sockets[0]!.bufferedAmount = 100;
    expect(client.sendFrame(0, new Uint8Array(3))).toBe(false);
    expect(client.droppedFrames).toBe(1);
    client.blackout();
    expect(sockets[0]!.json().at(-1)).toEqual({ type: "blackout" });
  });

  it("resolves and rejects RPCs, times out, and fails when disconnected", async () => {
    await expect(client.rpc("ping")).rejects.toThrow(/not connected/);
    client.connect();
    sockets[0]!.open();
    const ok = client.rpc("ping");
    const bad = client.rpc("wled.info", { host: "h" });
    const slow = client.rpc("discover");
    const [r1, r2] = sockets[0]!.json().filter((m) => m.type === "rpc");
    sockets[0]!.receive({ type: "rpcResult", id: r1.id, ok: true, result: "pong" });
    sockets[0]!.receive({ type: "rpcResult", id: r2.id, ok: false, error: "nope" });
    sockets[0]!.receive({ type: "rpcResult", id: 999, ok: true, result: 1 });
    await expect(ok).resolves.toBe("pong");
    await expect(bad).rejects.toThrow("nope");
    vi.advanceTimersByTime(600);
    await expect(slow).rejects.toThrow(/timed out/);
  });

  it("forwards stats and ignores junk", () => {
    const stats = vi.fn();
    const c = new BridgeClient({
      url: "ws://x",
      socketFactory: (u) => (sockets[0] = new FakeSocket(u)),
      onStats: stats,
    });
    c.connect();
    sockets[0]!.open();
    sockets[0]!.receive({ type: "stats", stats: { frames: 1 } });
    sockets[0]!.onmessage?.({ data: "not json" });
    sockets[0]!.onmessage?.({ data: new ArrayBuffer(1) });
    expect(stats).toHaveBeenCalledWith({ frames: 1 });
    c.disconnect();
  });

  it("reconnects after close and fails pending RPCs", async () => {
    client.connect();
    sockets[0]!.open();
    const p = client.rpc("ping");
    sockets[0]!.close();
    await expect(p).rejects.toThrow(/closed/);
    expect(client.state).toBe("closed");
    vi.advanceTimersByTime(150);
    expect(sockets).toHaveLength(2);
    client.disconnect();
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
  });

  it("retries when the socket factory throws", () => {
    let n = 0;
    const c = new BridgeClient({
      url: "ws://x",
      reconnectMs: 50,
      socketFactory: (u) => {
        n++;
        if (n === 1) throw new Error("boom");
        return new FakeSocket(u);
      },
    });
    c.connect();
    vi.advanceTimersByTime(60);
    expect(n).toBe(2);
    c.disconnect();
  });
});
