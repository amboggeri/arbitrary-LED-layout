/**
 * ANSI E1.31 (Streaming ACN / sACN) data packets.
 * Layout (for N slots, total = 126 + N bytes):
 *   Root layer     0..37   preamble, ACN id, flags+len, vector 0x04, CID(16)
 *   Framing layer  38..114 flags+len, vector 0x02, source name(64), priority, sync, seq, options, universe
 *   DMP layer      115..   flags+len, vector 0x02, 0xA1, first addr 0, incr 1, count N+1, start code, data
 */

export const E131_PORT = 5568;
export const E131_MAX_SLOTS = 512;
export const E131_DATA_OFFSET = 126;
const ACN_ID = [0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0x00, 0x00, 0x00];

export const E131_OPT_PREVIEW = 0x80;
export const E131_OPT_TERMINATED = 0x40;

export interface E131Options {
  universe: number;
  sequence: number;
  /** 16-byte component id. */
  cid: Uint8Array;
  sourceName: string;
  priority?: number;
  syncUniverse?: number;
  options?: number;
}

function flagsLength(len: number): number {
  return 0x7000 | (len & 0x0fff);
}

export function encodeE131Packet(o: E131Options, slots: Uint8Array): Uint8Array {
  if (slots.length > E131_MAX_SLOTS) throw new RangeError("E1.31 supports at most 512 slots");
  if (o.cid.length !== 16) throw new RangeError("CID must be 16 bytes");
  if (o.universe < 1 || o.universe > 63999) throw new RangeError("E1.31 universe must be 1..63999");
  const total = E131_DATA_OFFSET + slots.length;
  const pkt = new Uint8Array(total);
  const v = new DataView(pkt.buffer);
  // Root layer
  v.setUint16(0, 0x0010);
  v.setUint16(2, 0x0000);
  pkt.set(ACN_ID, 4);
  v.setUint16(16, flagsLength(total - 16));
  v.setUint32(18, 0x00000004);
  pkt.set(o.cid, 22);
  // Framing layer
  v.setUint16(38, flagsLength(total - 38));
  v.setUint32(40, 0x00000002);
  const name = new TextEncoder().encode(o.sourceName).subarray(0, 63);
  pkt.set(name, 44);
  pkt[108] = o.priority ?? 100;
  v.setUint16(109, o.syncUniverse ?? 0);
  pkt[111] = o.sequence & 0xff;
  pkt[112] = o.options ?? 0;
  v.setUint16(113, o.universe);
  // DMP layer
  v.setUint16(115, flagsLength(total - 115));
  pkt[117] = 0x02;
  pkt[118] = 0xa1;
  v.setUint16(119, 0x0000);
  v.setUint16(121, 0x0001);
  v.setUint16(123, slots.length + 1);
  pkt[125] = 0x00; // DMX start code
  pkt.set(slots, E131_DATA_OFFSET);
  return pkt;
}

export function decodeE131Packet(pkt: Uint8Array): {
  universe: number;
  sequence: number;
  priority: number;
  slots: Uint8Array;
  sourceName: string;
} {
  if (pkt.length < E131_DATA_OFFSET) throw new RangeError("E1.31 packet too short");
  for (let i = 0; i < ACN_ID.length; i++)
    if (pkt[4 + i] !== ACN_ID[i]) throw new Error("Not an E1.31 packet");
  const v = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  const count = v.getUint16(123) - 1;
  const nameBytes = pkt.subarray(44, 108);
  const nul = nameBytes.indexOf(0);
  return {
    universe: v.getUint16(113),
    sequence: pkt[111]!,
    priority: pkt[108]!,
    slots: pkt.subarray(E131_DATA_OFFSET, E131_DATA_OFFSET + count),
    sourceName: new TextDecoder().decode(nul >= 0 ? nameBytes.subarray(0, nul) : nameBytes),
  };
}

/** Multicast group for a universe: 239.255.{hi}.{lo}. */
export function e131MulticastAddress(universe: number): string {
  return `239.255.${(universe >> 8) & 0xff}.${universe & 0xff}`;
}
