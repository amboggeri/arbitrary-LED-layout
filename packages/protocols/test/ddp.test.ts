import { describe, expect, it } from "vitest";
import {
  DDP_FLAG_PUSH,
  DDP_FLAG_VER1,
  DDP_MAX_DATA,
  DDP_TYPE_RGB8,
  DDP_TYPE_RGBW8,
  ddpFramePackets,
  decodeDdpPacket,
  encodeDdpPacket,
} from "../src";

describe("DDP packet encoding", () => {
  it("produces the exact header bytes", () => {
    const pkt = encodeDdpPacket(
      {
        flags: DDP_FLAG_VER1 | DDP_FLAG_PUSH,
        sequence: 3,
        dataType: DDP_TYPE_RGB8,
        destination: 1,
        offset: 0x01020304,
      },
      new Uint8Array([255, 0, 128]),
    );
    expect([...pkt]).toEqual([0x41, 0x03, 0x0b, 0x01, 0x01, 0x02, 0x03, 0x04, 0x00, 0x03, 255, 0, 128]);
  });

  it("masks the sequence to 4 bits", () => {
    const pkt = encodeDdpPacket(
      { flags: 0x40, sequence: 0x1f, dataType: 0x0b, destination: 1, offset: 0 },
      new Uint8Array(0),
    );
    expect(pkt[1]).toBe(0x0f);
  });

  it("decodes what it encodes", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const pkt = encodeDdpPacket(
      { flags: 0x41, sequence: 7, dataType: 0x0b, destination: 1, offset: 300 },
      data,
    );
    const d = decodeDdpPacket(pkt);
    expect(d.header).toEqual({
      flags: 0x41,
      sequence: 7,
      dataType: 0x0b,
      destination: 1,
      offset: 300,
      length: 6,
    });
    expect([...d.data]).toEqual([...data]);
  });

  it("rejects short and truncated packets", () => {
    expect(() => decodeDdpPacket(new Uint8Array(5))).toThrow(/too short/);
    const pkt = encodeDdpPacket(
      { flags: 0x41, sequence: 0, dataType: 0x0b, destination: 1, offset: 0 },
      new Uint8Array(6),
    );
    expect(() => decodeDdpPacket(pkt.subarray(0, 12))).toThrow(/truncated/);
    expect(() =>
      encodeDdpPacket(
        { flags: 0, sequence: 0, dataType: 0, destination: 0, offset: 0 },
        new Uint8Array(70000),
      ),
    ).toThrow();
  });
});

describe("DDP framing", () => {
  it("splits a large frame on pixel boundaries with PUSH only on the last packet", () => {
    const px = 1000;
    const data = new Uint8Array(px * 3).map((_, i) => i & 0xff);
    const pkts = ddpFramePackets(data, { sequence: 2 });
    expect(pkts).toHaveLength(Math.ceil((px * 3) / DDP_MAX_DATA));
    const reassembled = new Uint8Array(data.length);
    pkts.forEach((p, i) => {
      const { header, data: chunk } = decodeDdpPacket(p);
      expect(header.offset % 3).toBe(0);
      expect(header.sequence).toBe(2);
      expect(!!(header.flags & DDP_FLAG_PUSH)).toBe(i === pkts.length - 1);
      reassembled.set(chunk, header.offset);
    });
    expect(reassembled).toEqual(data);
  });

  it("aligns RGBW to 4-channel pixels and sets the RGBW type", () => {
    const pkts = ddpFramePackets(new Uint8Array(2000), { channelsPerPixel: 4 });
    const first = decodeDdpPacket(pkts[0]!);
    expect(first.header.length % 4).toBe(0);
    expect(first.header.dataType).toBe(DDP_TYPE_RGBW8);
  });

  it("emits a single push packet for an empty frame", () => {
    const pkts = ddpFramePackets(new Uint8Array(0));
    expect(pkts).toHaveLength(1);
    expect(pkts[0]![0]).toBe(0x41);
  });

  it("emits exactly one packet when the frame fits", () => {
    expect(ddpFramePackets(new Uint8Array(DDP_MAX_DATA))).toHaveLength(1);
    expect(() => ddpFramePackets(new Uint8Array(3), { maxData: 2 })).toThrow();
  });
});
