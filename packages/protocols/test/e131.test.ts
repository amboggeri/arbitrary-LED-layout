import { describe, expect, it } from "vitest";
import { decodeE131Packet, e131MulticastAddress, encodeE131Packet } from "../src";

const cid = new Uint8Array(16).map((_, i) => i + 1);

describe("E1.31", () => {
  it("builds a 638-byte full-universe packet with correct layer lengths", () => {
    const slots = new Uint8Array(512).fill(7);
    const pkt = encodeE131Packet({ universe: 1, sequence: 9, cid, sourceName: "ledlay" }, slots);
    const v = new DataView(pkt.buffer);
    expect(pkt.length).toBe(638);
    expect(v.getUint16(0)).toBe(0x0010);
    expect(new TextDecoder().decode(pkt.subarray(4, 13))).toBe("ASC-E1.17");
    expect(v.getUint16(16)).toBe(0x726e);
    expect(v.getUint32(18)).toBe(4);
    expect([...pkt.subarray(22, 38)]).toEqual([...cid]);
    expect(v.getUint16(38)).toBe(0x7258);
    expect(v.getUint32(40)).toBe(2);
    expect(pkt[108]).toBe(100);
    expect(pkt[111]).toBe(9);
    expect(v.getUint16(113)).toBe(1);
    expect(v.getUint16(115)).toBe(0x720b);
    expect(pkt[117]).toBe(0x02);
    expect(pkt[118]).toBe(0xa1);
    expect(v.getUint16(121)).toBe(1);
    expect(v.getUint16(123)).toBe(513);
    expect(pkt[125]).toBe(0);
    expect(pkt[126]).toBe(7);
  });

  it("round-trips short universes", () => {
    const pkt = encodeE131Packet(
      { universe: 300, sequence: 255, cid, sourceName: "x", priority: 150 },
      new Uint8Array([1, 2, 3]),
    );
    const d = decodeE131Packet(pkt);
    expect(d).toMatchObject({ universe: 300, sequence: 255, priority: 150, sourceName: "x" });
    expect([...d.slots]).toEqual([1, 2, 3]);
  });

  it("validates inputs", () => {
    expect(() =>
      encodeE131Packet({ universe: 0, sequence: 0, cid, sourceName: "" }, new Uint8Array(1)),
    ).toThrow();
    expect(() =>
      encodeE131Packet(
        { universe: 1, sequence: 0, cid: new Uint8Array(3), sourceName: "" },
        new Uint8Array(1),
      ),
    ).toThrow();
    expect(() =>
      encodeE131Packet({ universe: 1, sequence: 0, cid, sourceName: "" }, new Uint8Array(513)),
    ).toThrow();
    expect(() => decodeE131Packet(new Uint8Array(10))).toThrow();
    expect(() => decodeE131Packet(new Uint8Array(200))).toThrow(/Not an E1.31/);
  });

  it("truncates long source names to fit with a terminating NUL", () => {
    const pkt = encodeE131Packet(
      { universe: 1, sequence: 0, cid, sourceName: "n".repeat(100) },
      new Uint8Array(1),
    );
    expect(decodeE131Packet(pkt).sourceName).toHaveLength(63);
  });

  it("computes multicast addresses", () => {
    expect(e131MulticastAddress(1)).toBe("239.255.0.1");
    expect(e131MulticastAddress(258)).toBe("239.255.1.2");
  });
});
