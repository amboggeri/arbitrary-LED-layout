/**
 * Art-Net 4 ArtDmx (OpCode 0x5000).
 *   0..7  "Art-Net\0"
 *   8..9  OpCode, little-endian
 *   10..11 protocol version 14, big-endian
 *   12 sequence, 13 physical, 14 SubUni (low byte of port address), 15 Net (bits 8..14)
 *   16..17 length, big-endian (even, 2..512)
 *   18..  data
 */

export const ARTNET_PORT = 6454;
export const ARTNET_MAX_SLOTS = 512;
const ID = [0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00];
export const ARTNET_OP_DMX = 0x5000;
export const ARTNET_OP_SYNC = 0x5200;
export const ARTNET_OP_POLL = 0x2000;

export interface ArtDmxOptions {
  /** 15-bit port address (net:7 | subnet:4 | universe:4). */
  universe: number;
  sequence: number;
  physical?: number;
}

export function encodeArtDmx(o: ArtDmxOptions, slots: Uint8Array): Uint8Array {
  if (slots.length > ARTNET_MAX_SLOTS) throw new RangeError("Art-Net supports at most 512 slots");
  if (o.universe < 0 || o.universe > 0x7fff) throw new RangeError("Art-Net port address must be 0..32767");
  // Length must be even and at least 2.
  const len = Math.max(2, slots.length + (slots.length % 2));
  const pkt = new Uint8Array(18 + len);
  pkt.set(ID, 0);
  pkt[8] = ARTNET_OP_DMX & 0xff;
  pkt[9] = ARTNET_OP_DMX >> 8;
  pkt[10] = 0;
  pkt[11] = 14;
  pkt[12] = o.sequence & 0xff;
  pkt[13] = o.physical ?? 0;
  pkt[14] = o.universe & 0xff;
  pkt[15] = (o.universe >> 8) & 0x7f;
  pkt[16] = len >> 8;
  pkt[17] = len & 0xff;
  pkt.set(slots, 18);
  return pkt;
}

/** ArtSync: tells receivers to output buffered ArtDmx data simultaneously. */
export function encodeArtSync(): Uint8Array {
  const pkt = new Uint8Array(14);
  pkt.set(ID, 0);
  pkt[8] = ARTNET_OP_SYNC & 0xff;
  pkt[9] = ARTNET_OP_SYNC >> 8;
  pkt[11] = 14;
  return pkt;
}

export function decodeArtDmx(pkt: Uint8Array): { universe: number; sequence: number; slots: Uint8Array } {
  if (pkt.length < 18) throw new RangeError("Art-Net packet too short");
  for (let i = 0; i < ID.length; i++) if (pkt[i] !== ID[i]) throw new Error("Not an Art-Net packet");
  const op = pkt[8]! | (pkt[9]! << 8);
  if (op !== ARTNET_OP_DMX) throw new Error(`Not ArtDmx (opcode 0x${op.toString(16)})`);
  const len = (pkt[16]! << 8) | pkt[17]!;
  return {
    universe: pkt[14]! | (pkt[15]! << 8),
    sequence: pkt[12]!,
    slots: pkt.subarray(18, 18 + len),
  };
}
