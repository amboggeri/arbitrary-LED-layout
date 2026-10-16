/**
 * FSEQ v2 (Falcon Player / xLights sequence) writer and header reader. Uncompressed, no
 * sparse ranges — readable by FPP, ESPixelStick, xLights and WLED forks with FSEQ playback.
 *
 * Header (little-endian):
 *   0  "PSEQ"            4  u16 channel data offset   6 u8 minor(0)  7 u8 major(2)
 *   8  u16 variable header offset                     10 u32 channels per frame
 *   14 u32 frame count   18 u8 step time (ms)         19 u8 flags
 *   20 u8 compression (low nibble) | block count high bits (high nibble)
 *   21 u8 block count (low 8 bits)  22 u8 sparse range count  23 u8 reserved
 *   24 u64 unique id
 *   32.. compression block index (8 bytes each), sparse ranges (6 bytes each), variable headers
 *   Variable header: u16 total length (incl. 4-byte header), 2-char code, payload (NUL-terminated string)
 */

export interface FseqVariableHeader {
  code: string;
  value: string;
}

export interface FseqHeader {
  channelDataOffset: number;
  majorVersion: number;
  minorVersion: number;
  channelCount: number;
  frameCount: number;
  stepTimeMs: number;
  compression: number;
  uniqueId: bigint;
  variableHeaders: FseqVariableHeader[];
}

export interface FseqWriteOptions {
  channelCount: number;
  stepTimeMs: number;
  /** e.g. [{code:"mf", value:"song.mp3"}, {code:"sp", value:"ledlay"}] */
  variableHeaders?: FseqVariableHeader[];
  uniqueId?: bigint;
}

const FIXED_HEADER = 32;

function encodeVarHeaders(vhs: FseqVariableHeader[]): Uint8Array {
  const enc = new TextEncoder();
  const parts = vhs.map((vh) => {
    if (vh.code.length !== 2) throw new RangeError(`FSEQ variable header code must be 2 chars: ${vh.code}`);
    const payload = enc.encode(vh.value + "\0");
    const len = 4 + payload.length;
    const b = new Uint8Array(len);
    b[0] = len & 0xff;
    b[1] = len >> 8;
    b[2] = vh.code.charCodeAt(0);
    b[3] = vh.code.charCodeAt(1);
    b.set(payload, 4);
    return b;
  });
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Writes frames incrementally into a growable buffer. */
export class FseqWriter {
  private frames: Uint8Array[] = [];
  constructor(private readonly opts: FseqWriteOptions) {
    if (opts.stepTimeMs < 1 || opts.stepTimeMs > 255) throw new RangeError("FSEQ step time must be 1..255 ms");
  }

  addFrame(data: Uint8Array): void {
    if (data.length > this.opts.channelCount) throw new RangeError("Frame larger than channel count");
    const f = new Uint8Array(this.opts.channelCount);
    f.set(data);
    this.frames.push(f);
  }

  get frameCount(): number {
    return this.frames.length;
  }

  finish(): Uint8Array {
    const vh = encodeVarHeaders(this.opts.variableHeaders ?? [{ code: "sp", value: "ledlay" }]);
    // Channel data is conventionally 4-byte aligned.
    const dataOffset = Math.ceil((FIXED_HEADER + vh.length) / 4) * 4;
    if (dataOffset > 0xffff) throw new RangeError("FSEQ header too large");
    const total = dataOffset + this.frames.length * this.opts.channelCount;
    const out = new Uint8Array(total);
    const v = new DataView(out.buffer);
    out.set([0x50, 0x53, 0x45, 0x51], 0);
    v.setUint16(4, dataOffset, true);
    out[6] = 0;
    out[7] = 2;
    v.setUint16(8, FIXED_HEADER, true);
    v.setUint32(10, this.opts.channelCount, true);
    v.setUint32(14, this.frames.length, true);
    out[18] = this.opts.stepTimeMs;
    out[19] = 0;
    out[20] = 0; // no compression, 0 blocks
    out[21] = 0;
    out[22] = 0; // no sparse ranges
    out[23] = 0;
    v.setBigUint64(24, this.opts.uniqueId ?? BigInt(Date.now()) * 1000n, true);
    out.set(vh, FIXED_HEADER);
    let o = dataOffset;
    for (const f of this.frames) {
      out.set(f, o);
      o += f.length;
    }
    return out;
  }
}

export function readFseqHeader(buf: Uint8Array): FseqHeader {
  if (buf.length < FIXED_HEADER) throw new RangeError("FSEQ too short");
  if (String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!) !== "PSEQ") throw new Error("Not an FSEQ file");
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const majorVersion = buf[7]!;
  if (majorVersion !== 2) throw new Error(`Unsupported FSEQ major version ${majorVersion}`);
  const channelDataOffset = v.getUint16(4, true);
  const varOffset = v.getUint16(8, true);
  const blocks = buf[21]! | ((buf[20]! >> 4) << 8);
  const sparse = buf[22]!;
  const variableHeaders: FseqVariableHeader[] = [];
  let p = Math.max(varOffset, FIXED_HEADER + blocks * 8 + sparse * 6);
  const dec = new TextDecoder();
  while (p + 4 <= channelDataOffset) {
    const len = v.getUint16(p, true);
    if (len < 4 || p + len > channelDataOffset) break;
    const code = String.fromCharCode(buf[p + 2]!, buf[p + 3]!);
    const payload = buf.subarray(p + 4, p + len);
    const nul = payload.indexOf(0);
    variableHeaders.push({ code, value: dec.decode(nul >= 0 ? payload.subarray(0, nul) : payload) });
    p += len;
  }
  return {
    channelDataOffset,
    majorVersion,
    minorVersion: buf[6]!,
    channelCount: v.getUint32(10, true),
    frameCount: v.getUint32(14, true),
    stepTimeMs: buf[18]!,
    compression: buf[20]! & 0x0f,
    uniqueId: v.getBigUint64(24, true),
    variableHeaders,
  };
}

/** Get frame `i` of an uncompressed FSEQ. */
export function readFseqFrame(buf: Uint8Array, header: FseqHeader, i: number): Uint8Array {
  if (header.compression !== 0) throw new Error("Compressed FSEQ not supported");
  if (i < 0 || i >= header.frameCount) throw new RangeError("Frame out of range");
  const start = header.channelDataOffset + i * header.channelCount;
  return buf.subarray(start, start + header.channelCount);
}
