import { createPixelSpace, defaultParamValues, resolveParams, type AnyEffect, type PixelSpace } from "../src";

/** A 5x5x5 grid of pixels split into 5 "fixtures" (one per z-layer). */
export function gridSpace(n = 5): PixelSpace {
  const xyz: number[] = [];
  const fixture: number[] = [];
  const idx: number[] = [];
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        xyz.push(x * 10, y * 10, z * 10);
        fixture.push(z);
        idx.push(y * n + x);
      }
  return createPixelSpace({ xyz, fixture, indexInFixture: idx });
}

export function lineSpace(n: number): PixelSpace {
  return createPixelSpace({ xyz: Array.from({ length: n * 3 }, (_, i) => (i % 3 === 0 ? i / 3 : 0)) });
}

/** Render one frame of an effect with optional param overrides. */
export function renderOnce(
  effect: AnyEffect,
  space: PixelSpace,
  time: number,
  raw: Record<string, unknown> = {},
  state?: unknown,
): Float32Array {
  const params = resolveParams(effect.params, { ...defaultParamValues(effect.params), ...raw });
  const st = state ?? effect.init?.(space, params);
  const out = new Float32Array(space.count * 3);
  effect.render({ time, dt: 0, frame: 0, params, space, state: st }, out);
  return out;
}

export function px(out: Float32Array, i: number): [number, number, number] {
  return [out[i * 3]!, out[i * 3 + 1]!, out[i * 3 + 2]!];
}

export function luma(out: Float32Array, i: number): number {
  return out[i * 3]! + out[i * 3 + 1]! + out[i * 3 + 2]!;
}
