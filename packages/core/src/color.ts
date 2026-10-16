/** Color math. Internal render color is linear-ish float RGB in [0, 1]; bytes only appear at the output stage. */

export type RGB = [number, number, number];

/** Wire channel orders. W variants carry a white channel. */
export const COLOR_ORDERS = [
  "RGB",
  "RBG",
  "GRB",
  "GBR",
  "BRG",
  "BGR",
  "RGBW",
  "GRBW",
  "BRGW",
  "WRGB",
] as const;
export type ColorOrder = (typeof COLOR_ORDERS)[number];

export function channelsFor(order: ColorOrder): 3 | 4 {
  return order.length === 4 ? 4 : 3;
}

/**
 * For each output channel, the source index into [r, g, b, w].
 * e.g. GRB -> [1, 0, 2].
 */
export function orderIndices(order: ColorOrder): number[] {
  const map: Record<string, number> = { R: 0, G: 1, B: 2, W: 3 };
  return [...order].map((c) => map[c]!);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : Number.isNaN(v) ? 0 : v;
}

export function parseHex(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Invalid hex color: ${hex}`);
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function toHex(c: RGB): string {
  return (
    "#" +
    c
      .map((v) =>
        Math.round(clamp01(v) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** HSV -> RGB. h in turns (0..1, wraps), s and v in 0..1. Writes into `out` if given. */
export function hsv(h: number, s: number, v: number, out: RGB = [0, 0, 0]): RGB {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      out[0] = v;
      out[1] = t;
      out[2] = p;
      break;
    case 1:
      out[0] = q;
      out[1] = v;
      out[2] = p;
      break;
    case 2:
      out[0] = p;
      out[1] = v;
      out[2] = t;
      break;
    case 3:
      out[0] = p;
      out[1] = q;
      out[2] = v;
      break;
    case 4:
      out[0] = t;
      out[1] = p;
      out[2] = v;
      break;
    default:
      out[0] = v;
      out[1] = p;
      out[2] = q;
  }
  return out;
}

export function lerpColor(a: RGB, b: RGB, t: number, out: RGB = [0, 0, 0]): RGB {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

export interface GradientStop {
  pos: number;
  color: string;
}

/** Pre-parsed gradient for fast sampling. */
export interface Gradient {
  pos: Float32Array;
  rgb: Float32Array;
}

export function compileGradient(stops: readonly GradientStop[]): Gradient {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  if (sorted.length === 0) sorted.push({ pos: 0, color: "#000000" });
  const pos = new Float32Array(sorted.length);
  const rgb = new Float32Array(sorted.length * 3);
  sorted.forEach((s, i) => {
    pos[i] = s.pos;
    rgb.set(parseHex(s.color), i * 3);
  });
  return { pos, rgb };
}

/** Sample a compiled gradient at t (clamped to [0,1]). */
export function sampleGradient(g: Gradient, t: number, out: RGB = [0, 0, 0]): RGB {
  const n = g.pos.length;
  t = clamp01(t);
  if (t <= g.pos[0]! || n === 1) {
    out[0] = g.rgb[0]!;
    out[1] = g.rgb[1]!;
    out[2] = g.rgb[2]!;
    return out;
  }
  for (let i = 1; i < n; i++) {
    const p1 = g.pos[i]!;
    if (t <= p1) {
      const p0 = g.pos[i - 1]!;
      const f = p1 === p0 ? 1 : (t - p0) / (p1 - p0);
      const a = (i - 1) * 3,
        b = i * 3;
      out[0] = g.rgb[a]! + (g.rgb[b]! - g.rgb[a]!) * f;
      out[1] = g.rgb[a + 1]! + (g.rgb[b + 1]! - g.rgb[a + 1]!) * f;
      out[2] = g.rgb[a + 2]! + (g.rgb[b + 2]! - g.rgb[a + 2]!) * f;
      return out;
    }
  }
  const last = (n - 1) * 3;
  out[0] = g.rgb[last]!;
  out[1] = g.rgb[last + 1]!;
  out[2] = g.rgb[last + 2]!;
  return out;
}

/** 256-entry lookup: float [0,1] quantized -> gamma-corrected byte, with brightness folded in. */
export function buildGammaLut(gamma: number, brightness = 1, size = 1024): Uint8Array {
  const lut = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const v = Math.pow(i / (size - 1), gamma) * clamp01(brightness);
    lut[i] = Math.round(v * 255);
  }
  return lut;
}
