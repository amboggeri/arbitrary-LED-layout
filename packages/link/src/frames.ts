/**
 * Binary frame message: one controller's encoded channel data.
 *   0   u8  magic 0x46 ('F')
 *   1   u8  link version
 *   2-3 u16 controller index (into the last setControllers list), big-endian
 *   4   u8  channels per pixel (3 or 4)
 *   5.. channel data
 */
import { LINK_VERSION } from "./messages";

export const FRAME_MAGIC = 0x46;
export const FRAME_HEADER = 5;

export interface FrameMessage {
  controllerIndex: number;
  channelsPerPixel: 3 | 4;
  data: Uint8Array;
}

export function encodeFrameMessage(m: FrameMessage): Uint8Array {
  if (m.controllerIndex < 0 || m.controllerIndex > 0xffff) throw new RangeError("controller index out of range");
  const out = new Uint8Array(FRAME_HEADER + m.data.length);
  out[0] = FRAME_MAGIC;
  out[1] = LINK_VERSION;
  out[2] = m.controllerIndex >> 8;
  out[3] = m.controllerIndex & 0xff;
  out[4] = m.channelsPerPixel;
  out.set(m.data, FRAME_HEADER);
  return out;
}

export function decodeFrameMessage(buf: Uint8Array): FrameMessage {
  if (buf.length < FRAME_HEADER || buf[0] !== FRAME_MAGIC) throw new Error("Not a frame message");
  if (buf[1] !== LINK_VERSION) throw new Error(`Unsupported frame version ${buf[1]}`);
  const cpp = buf[4];
  if (cpp !== 3 && cpp !== 4) throw new Error(`Bad channels-per-pixel ${cpp}`);
  return { controllerIndex: (buf[2]! << 8) | buf[3]!, channelsPerPixel: cpp, data: buf.subarray(FRAME_HEADER) };
}
