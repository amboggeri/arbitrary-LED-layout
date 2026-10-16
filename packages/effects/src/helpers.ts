/** Small shared helpers for effect implementations. */
import type { PixelSpace } from "./space";

export const AXIS_OPTIONS = [
  { value: "x", label: "X (left → right)" },
  { value: "y", label: "Y (bottom → top)" },
  { value: "z", label: "Z (back → front)" },
  { value: "radial", label: "Radial (from center)" },
  { value: "fixture", label: "Along each fixture" },
  { value: "index", label: "Fixture order" },
] as const;

/** A 0..1 coordinate of pixel i along the selected axis. */
export function axisCoord(space: PixelSpace, i: number, axis: string): number {
  switch (axis) {
    case "x":
      return space.unit[i * 3]!;
    case "y":
      return space.unit[i * 3 + 1]!;
    case "z":
      return space.unit[i * 3 + 2]!;
    case "radial": {
      const x = space.centered[i * 3]!,
        y = space.centered[i * 3 + 1]!,
        z = space.centered[i * 3 + 2]!;
      return Math.min(1, Math.sqrt(x * x + y * y + z * z) / Math.SQRT2);
    }
    case "fixture":
      return space.u[i]!;
    case "index":
      return space.fixtureCount > 1 ? space.fixture[i]! / (space.fixtureCount - 1) : 0;
    default:
      return 0;
  }
}

export function fract(v: number): number {
  return v - Math.floor(v);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Triangle wave in [0,1] with period 1. */
export function triangle(v: number): number {
  const f = fract(v);
  return f < 0.5 ? f * 2 : 2 - f * 2;
}

export function fill(out: Float32Array, r: number, g: number, b: number): void {
  for (let i = 0; i < out.length; i += 3) {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
}

export function setPixel(out: Float32Array, i: number, r: number, g: number, b: number): void {
  out[i * 3] = r;
  out[i * 3 + 1] = g;
  out[i * 3 + 2] = b;
}

export function normalizeDir(d: readonly number[]): [number, number, number] {
  const l = Math.hypot(d[0]!, d[1]!, d[2]!);
  return l === 0 ? [1, 0, 0] : [d[0]! / l, d[1]! / l, d[2]! / l];
}
