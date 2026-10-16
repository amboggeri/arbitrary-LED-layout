/**
 * DDP (Distributed Display Protocol) v1 — http://www.3waylabs.com/ddp/
 * Header (10 bytes, no timecode):
 *   0  flags   : VVxTSRQP  (V=01 version 1, T=timecode, S=storage, R=reply, Q=query, P=push)
 *   1  sequence: low nibble 1..15 (0 = sequence numbers unused)
 *   2  data type: CRTTTSSS (TTT=1 RGB, 3 RGBW; SSS=3 8-bit) -> RGB8 = 0x0B, RGBW8 = 0x1B
 *   3  destination id (1 = default output device)
 *   4-7 data offset in bytes (big-endian)
 *   8-9 data length in bytes (big-endian)
 */

export const DDP_PORT = 4048;
export const DDP_HEADER_LEN = 10;
/** 480 RGB pixels per packet — the de-facto standard (fits a 1500 MTU). */
export const DDP_MAX_DATA = 1440;

export const DDP_FLAG_VER1 = 0x40;
export const DDP_FLAG_PUSH = 0x01;
export const DDP_FLAG_QUERY = 0x02;
export const DDP_FLAG_REPLY = 0x04;
export const DDP_FLAG_STORAGE = 0x08;
export const DDP_FLAG_TIMECODE = 0x10;

export const DDP_TYPE_RGB8 = 0x0b;
export const DDP_TYPE_RGBW8 = 0x1b;
export const DDP_ID_DISPLAY = 1;
export const DDP_ID_CONFIG = 250;
export const DDP_ID_STATUS = 251;

export interface DdpHeader {
  flags: number;
  sequence: number;
  dataType: number;
  destination: number;
  offset: number;
  length: number;
}

export function encodeDdpPacket(h: Omit<DdpHeader, "length">, data: Uint8Array): Uint8Array {
  if (data.length > 0xffff) throw new RangeError("DDP payload too large");
  const pkt = new Uint8Array(DDP_HEADER_LEN + data.length);
  const view = new DataView(pkt.buffer);
  pkt[0] = h.flags;
  pkt[1] = h.sequence & 0x0f;
  pkt[2] = h.dataType;
  pkt[3] = h.destination;
  view.setUint32(4, h.offset >>> 0, false);
  view.setUint16(8, data.length, false);
  pkt.set(data, DDP_HEADER_LEN);
  return pkt;
}

export function decodeDdpPacket(pkt: Uint8Array): { header: DdpHeader; data: Uint8Array } {
  if (pkt.length < DDP_HEADER_LEN) throw new RangeError("DDP packet too short");
  const view = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  const flags = pkt[0]!;
  const headerLen = flags & DDP_FLAG_TIMECODE ? 14 : DDP_HEADER_LEN;
  const length = view.getUint16(8, false);
  if (pkt.length < headerLen + length) throw new RangeError("DDP packet truncated");
  return {
    header: {
      flags,
      sequence: pkt[1]! & 0x0f,
      dataType: pkt[2]!,
      destination: pkt[3]!,
      offset: view.getUint32(4, false),
      length,
    },
    data: pkt.subarray(headerLen, headerLen + length),
  };
}

export interface DdpFrameOptions {
  /** Sequence number 1..15; 0 disables. */
  sequence?: number;
  channelsPerPixel?: 3 | 4;
  destination?: number;
  maxData?: number;
}

/**
 * Split a frame's channel data into DDP packets. Packet boundaries are aligned to whole
 * pixels; only the final packet carries PUSH so receivers display the frame atomically.
 */
export function ddpFramePackets(data: Uint8Array, opts: DdpFrameOptions = {}): Uint8Array[] {
  const cpp = opts.channelsPerPixel ?? 3;
  const maxData = Math.floor((opts.maxData ?? DDP_MAX_DATA) / cpp) * cpp;
  if (maxData <= 0) throw new RangeError("maxData smaller than one pixel");
  const dataType = cpp === 4 ? DDP_TYPE_RGBW8 : DDP_TYPE_RGB8;
  const packets: Uint8Array[] = [];
  const total = data.length;
  for (let offset = 0; offset < total || (total === 0 && packets.length === 0); offset += maxData) {
    const chunk = data.subarray(offset, Math.min(total, offset + maxData));
    const last = offset + maxData >= total;
    packets.push(
      encodeDdpPacket(
        {
          flags: DDP_FLAG_VER1 | (last ? DDP_FLAG_PUSH : 0),
          sequence: opts.sequence ?? 0,
          dataType,
          destination: opts.destination ?? DDP_ID_DISPLAY,
          offset,
        },
        chunk,
      ),
    );
    if (total === 0) break;
  }
  return packets;
}
