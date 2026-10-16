/**
 * User-scripted effect, Pixelblaze-style: a function body evaluated per pixel.
 *
 * Available variables: x, y, z (0..1 across layout), cx, cy, cz (−1..1 centered),
 * wx, wy, wz (world units), t (seconds), i (pixel index), u (0..1 along fixture),
 * f (fixture index), n (pixel count).
 * Helpers: hsv(h,s,v), rgb(r,g,b), noise(x,y,z), fbm(x,y,z,oct), fract, clamp, sin, cos, PI, ...
 * Return [r, g, b] (0..1), a single number (grey), or call rgb()/hsv() as the last expression.
 *
 * NOTE: scripts run with the privileges of the app (new Function). Only run scripts you trust.
 */
import { hsv as hsvFn, type RGB } from "@ledlay/core";
import { defineEffect } from "../effect";
import { fract, setPixel, smoothstep, triangle } from "../helpers";
import { fbm3, hash01, noise3 } from "../noise";

const ARGS = ["x", "y", "z", "cx", "cy", "cz", "wx", "wy", "wz", "t", "i", "u", "f", "n", "lib"] as const;

type PixelFn = (...args: unknown[]) => unknown;

export interface CompiledScript {
  fn: PixelFn | null;
  error: string | null;
}

const cache = new Map<string, CompiledScript>();

export const DEFAULT_SCRIPT = "// Rainbow that rises over time\nreturn hsv(y * 0.5 + t * 0.2, 1, 1);";

export function compileScript(code: string): CompiledScript {
  const hit = cache.get(code);
  if (hit) return hit;
  let result: CompiledScript;
  try {
    const prelude =
      "const {hsv, rgb, noise, fbm, hash, fract, clamp, mix, smoothstep, triangle, sin, cos, tan, abs, min, max, pow, sqrt, floor, ceil, atan2, PI, TAU} = lib;\n";
    const fn = new Function(...ARGS, `"use strict";\n${prelude}${code}`) as PixelFn;
    result = { fn, error: null };
  } catch (e) {
    result = { fn: null, error: (e as Error).message };
  }
  if (cache.size > 256) cache.clear();
  cache.set(code, result);
  return result;
}

const scratch: RGB = [0, 0, 0];
const lib = {
  hsv: (h: number, s: number, v: number): RGB => [...hsvFn(h, s, v, scratch)] as RGB,
  rgb: (r: number, g: number, b: number): RGB => [r, g, b],
  noise: (x: number, y = 0, z = 0) => noise3(x, y, z),
  fbm: (x: number, y = 0, z = 0, o = 3) => fbm3(x, y, z, o),
  hash: hash01,
  fract,
  clamp: (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v)),
  mix: (a: number, b: number, t: number) => a + (b - a) * t,
  smoothstep,
  triangle,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  sqrt: Math.sqrt,
  floor: Math.floor,
  ceil: Math.ceil,
  atan2: Math.atan2,
  PI: Math.PI,
  TAU: Math.PI * 2,
};

export interface ScriptState {
  /** Last runtime/compile error, surfaced to the UI. */
  error: string | null;
}

export const script = defineEffect({
  id: "script",
  name: "Script",
  category: "custom",
  description: "Write your own per-pixel function in JavaScript.",
  params: {
    code: { type: "code", label: "Code", default: DEFAULT_SCRIPT },
  },
  init(): ScriptState {
    return { error: null };
  },
  render({ params, space, time, state }, out) {
    const { fn, error } = compileScript(params.code);
    state.error = error;
    if (!fn) {
      out.fill(0);
      return;
    }
    try {
      for (let i = 0; i < space.count; i++) {
        const j = i * 3;
        const r = fn(
          space.unit[j],
          space.unit[j + 1],
          space.unit[j + 2],
          space.centered[j],
          space.centered[j + 1],
          space.centered[j + 2],
          space.xyz[j],
          space.xyz[j + 1],
          space.xyz[j + 2],
          time,
          i,
          space.u[i],
          space.fixture[i],
          space.count,
          lib,
        );
        if (typeof r === "number") setPixel(out, i, r, r, r);
        else if (Array.isArray(r)) setPixel(out, i, +r[0] || 0, +r[1] || 0, +r[2] || 0);
        else setPixel(out, i, 0, 0, 0);
      }
    } catch (e) {
      state.error = (e as Error).message;
      out.fill(0);
    }
  },
});
