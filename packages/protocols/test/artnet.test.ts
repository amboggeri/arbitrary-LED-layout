import { describe, expect, it } from "vitest";
import { decodeArtDmx, encodeArtDmx, encodeArtSync, splitUniverses, universeCount } from "../src";

describe("Art-Net", () => {
  it("encodes the ArtDmx header exactly", () => {
    const pkt = encodeArtDmx({ universe: 0x0123, sequence: 5 }, new Uint8Array([10, 20, 30, 40]));
    expect([...pkt]).toEqual([
      0x41,
      0x72,
      0x74,
      0x2d,
      0x4e,
      0x65,
      0x74,
      0x00, // "Art-Net\0"
      0x00,
      0x50, // OpDmx LE
      0x00,
      0x0e, // ProtVer 14
      5,
      0, // sequence, physical
      0x23,
      0x01, // SubUni, Net
      0x00,
      0x04, // length
      10,
      20,
      30,
      40,
    ]);
  });

  it("pads odd lengths to even and enforces a minimum of 2", () => {
    expect(encodeArtDmx({ universe: 0, sequence: 0 }, new Uint8Array(3)).length).toBe(18 + 4);
    expect(encodeArtDmx({ universe: 0, sequence: 0 }, new Uint8Array(0)).length).toBe(18 + 2);
  });

  it("round-trips and validates", () => {
    const d = decodeArtDmx(encodeArtDmx({ universe: 32767, sequence: 200 }, new Uint8Array([1, 2])));
    expect(d.universe).toBe(32767);
    expect(d.sequence).toBe(200);
    expect([...d.slots]).toEqual([1, 2]);
    expect(() => encodeArtDmx({ universe: 40000, sequence: 0 }, new Uint8Array(1))).toThrow();
    expect(() => encodeArtDmx({ universe: 0, sequence: 0 }, new Uint8Array(600))).toThrow();
    expect(() => decodeArtDmx(new Uint8Array(4))).toThrow();
    expect(() => decodeArtDmx(new Uint8Array(20))).toThrow(/Not an Art-Net/);
    const sync = new Uint8Array(18);
    sync.set(encodeArtSync());
    expect(() => decodeArtDmx(sync)).toThrow(/Not ArtDmx/);
  });

  it("encodes ArtSync", () => {
    const s = encodeArtSync();
    expect(s.length).toBe(14);
    expect(s[8]).toBe(0x00);
    expect(s[9]).toBe(0x52);
  });
});

describe("universe splitting", () => {
  it("splits into 510-channel universes", () => {
    const data = new Uint8Array(1200);
    const u = splitUniverses(data, 5);
    expect(u.map((x) => [x.universe, x.data.length])).toEqual([
      [5, 510],
      [6, 510],
      [7, 180],
    ]);
    expect(universeCount(1200)).toBe(3);
    expect(universeCount(512, 512)).toBe(1);
    expect(() => splitUniverses(data, 1, 0)).toThrow();
  });
});
