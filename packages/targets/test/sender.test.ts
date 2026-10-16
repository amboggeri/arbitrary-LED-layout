import { describe, expect, it } from "vitest";
import { createController } from "@ledlay/core";
import { decodeArtDmx, decodeDdpPacket, decodeE131Packet } from "@ledlay/protocols";
import { FrameSender, MemoryTransport, defaultPort, type UdpTransport } from "../src";

const data = new Uint8Array(600 * 3).map((_, i) => i & 0xff);

describe("FrameSender", () => {
  it("sends DDP to port 4048 with cycling 1..15 sequence numbers", async () => {
    const t = new MemoryTransport();
    const s = new FrameSender(t);
    const c = createController({ id: "c", name: "c", host: "10.0.0.9" });
    for (let i = 0; i < 16; i++) await s.send(c, data);
    expect(t.sent.every((p) => p.port === 4048 && p.host === "10.0.0.9")).toBe(true);
    const seqs = t.sent.filter((_, i) => i % 2 === 0).map((p) => decodeDdpPacket(p.data).header.sequence);
    expect(seqs.slice(0, 3)).toEqual([1, 2, 3]);
    expect(seqs[14]).toBe(15);
    expect(seqs[15]).toBe(1);
    expect(s.stats.frames).toBe(16);
    expect(s.stats.packets).toBe(32);
  });

  it("splits E1.31 across universes with a shared sequence and source", async () => {
    const t = new MemoryTransport();
    const s = new FrameSender(t, { sourceName: "test", cid: new Uint8Array(16) });
    const c = createController({ id: "c", name: "c", host: "h", protocol: "e131", universeStart: 3 });
    await s.send(c, data);
    const pk = t.sent.map((p) => decodeE131Packet(p.data));
    expect(pk.map((p) => p.universe)).toEqual([3, 4, 5, 6]);
    expect(new Set(pk.map((p) => p.sequence))).toEqual(new Set([0]));
    expect(pk[0]!.sourceName).toBe("test");
    expect(t.sent[0]!.port).toBe(5568);
  });

  it("sends Art-Net with sequence starting at 1 and custom port", async () => {
    const t = new MemoryTransport();
    const s = new FrameSender(t);
    const c = createController({ id: "c", name: "c", host: "h", protocol: "artnet", universeStart: 0, port: 7000 });
    await s.send(c, data.subarray(0, 30));
    const d = decodeArtDmx(t.sent[0]!.data);
    expect(d.universe).toBe(0);
    expect(d.sequence).toBe(1);
    expect(t.sent[0]!.port).toBe(7000);
    await s.sendArtSync("255.255.255.255");
    expect(t.sent.at(-1)!.data[9]).toBe(0x52);
  });

  it("skips disabled or host-less controllers", async () => {
    const t = new MemoryTransport();
    const s = new FrameSender(t);
    await s.send(createController({ name: "x", host: "" }), data);
    await s.send(createController({ name: "x", host: "h", enabled: false }), data);
    expect(t.sent).toHaveLength(0);
  });

  it("counts transport errors without throwing", async () => {
    const failing: UdpTransport = {
      send() {
        throw new Error("EHOSTUNREACH");
      },
    };
    const s = new FrameSender(failing);
    await s.send(createController({ name: "x", host: "h" }), data);
    expect(s.stats.errors).toBe(2);
    expect(s.stats.lastError).toBe("EHOSTUNREACH");
  });

  it("knows default ports and clears memory transport", () => {
    expect(defaultPort("ddp")).toBe(4048);
    expect(defaultPort("e131")).toBe(5568);
    expect(defaultPort("artnet")).toBe(6454);
    const t = new MemoryTransport();
    t.send(new Uint8Array(1), "h", 1);
    t.clear();
    expect(t.sent).toHaveLength(0);
  });
});
