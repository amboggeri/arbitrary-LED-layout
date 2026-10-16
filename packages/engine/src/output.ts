/**
 * Frame -> controller bytes: routing, RGBW white extraction, gamma, brightness, color
 * order and an optional power limiter.
 */
import { buildGammaLut, channelsFor, orderIndices } from "@ledlay/core";
import type { CompiledController } from "./compile";
import { controllerChannelCount } from "./compile";

const LUT_SIZE = 4096;
const lutCache = new Map<string, Uint8Array>();
function lutFor(gamma: number, brightness: number): Uint8Array {
  const key = `${gamma}|${brightness}`;
  let lut = lutCache.get(key);
  if (!lut) {
    lut = buildGammaLut(gamma, brightness, LUT_SIZE);
    if (lutCache.size > 64) lutCache.clear();
    lutCache.set(key, lut);
  }
  return lut;
}

export interface EncodeResult {
  data: Uint8Array;
  /** Estimated current draw before limiting, in amps. */
  estimatedAmps: number;
  /** Scale applied by the power limiter (1 = none). */
  powerScale: number;
}

export class ControllerEncoder {
  private readonly buf: Uint8Array;
  /** Per slot: byte offset in buf. */
  private readonly slotByte: Uint32Array;
  /** Per slot: channel order indices (into r,g,b,w). */
  private readonly slotOrder: (readonly number[])[];

  constructor(readonly compiled: CompiledController) {
    this.buf = new Uint8Array(controllerChannelCount(compiled));
    const n = compiled.route.length;
    this.slotByte = new Uint32Array(n);
    this.slotOrder = new Array(n);
    let byte = 0;
    const orders = compiled.controller.outputs.map((o) => orderIndices(o.colorOrder));
    for (let s = 0; s < n; s++) {
      const out = compiled.controller.outputs[compiled.slotOutput[s]!]!;
      this.slotByte[s] = byte;
      this.slotOrder[s] = orders[compiled.slotOutput[s]!]!;
      byte += channelsFor(out.colorOrder);
    }
  }

  /** Encode a float frame. The returned buffer is reused between calls — copy if you keep it. */
  encode(frame: Float32Array, masterBrightness = 1): EncodeResult {
    const c = this.compiled.controller;
    const lut = lutFor(c.gamma, Math.max(0, Math.min(1, c.brightness * masterBrightness)));
    const max = LUT_SIZE - 1;
    const route = this.compiled.route;
    const buf = this.buf;
    const px = [0, 0, 0, 0];
    let milliamps = 0;
    for (let s = 0; s < route.length; s++) {
      const src = route[s]!;
      const order = this.slotOrder[s]!;
      const base = this.slotByte[s]!;
      if (src < 0) {
        for (let k = 0; k < order.length; k++) buf[base + k] = 0;
        continue;
      }
      let r = frame[src * 3]!,
        g = frame[src * 3 + 1]!,
        b = frame[src * 3 + 2]!;
      r = r > 1 ? 1 : r > 0 ? r : 0;
      g = g > 1 ? 1 : g > 0 ? g : 0;
      b = b > 1 ? 1 : b > 0 ? b : 0;
      let w = 0;
      if (order.length === 4) {
        w = Math.min(r, g, b);
        r -= w;
        g -= w;
        b -= w;
      }
      px[0] = lut[Math.round(r * max)]!;
      px[1] = lut[Math.round(g * max)]!;
      px[2] = lut[Math.round(b * max)]!;
      px[3] = lut[Math.round(w * max)]!;
      let sum = 0;
      for (let k = 0; k < order.length; k++) {
        const v = px[order[k]!]!;
        buf[base + k] = v;
        sum += v;
      }
      milliamps += (sum / 255) * this.compiled.slotMa[s]!;
    }
    const estimatedAmps = milliamps / 1000;
    let powerScale = 1;
    if (c.maxAmps > 0 && estimatedAmps > c.maxAmps) {
      powerScale = c.maxAmps / estimatedAmps;
      for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(buf[i]! * powerScale);
    }
    return { data: buf, estimatedAmps, powerScale };
  }
}
