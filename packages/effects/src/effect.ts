import type { ParamSpecs, ResolvedParams } from "./params";
import type { PixelSpace } from "./space";

export const EFFECT_CATEGORIES = ["basic", "spatial", "pattern", "particle", "custom"] as const;
export type EffectCategory = (typeof EFFECT_CATEGORIES)[number];

export interface RenderContext<P extends ParamSpecs, S> {
  /** Effect-local time in seconds (layer speed and clip offset already applied). */
  time: number;
  /** Seconds since the previous rendered frame of this layer (0 on the first frame). */
  dt: number;
  frame: number;
  params: ResolvedParams<P>;
  space: PixelSpace;
  /** Per-instance mutable state created by `init` (e.g. particle buffers). */
  state: S;
}

/**
 * An effect paints every pixel of a PixelSpace into `out` (float RGB, 3 per pixel, 0..1).
 * Effects must be deterministic for a given (time, params, state) so timelines can be
 * scrubbed and baked; stateful effects should derive randomness from a seeded PRNG.
 */
export interface EffectDefinition<P extends ParamSpecs = ParamSpecs, S = unknown> {
  id: string;
  name: string;
  category: EffectCategory;
  description: string;
  params: P;
  /** Create per-layer state. Called again whenever the pixel space changes. */
  init?(space: PixelSpace, params: ResolvedParams<P>): S;
  render(ctx: RenderContext<P, S>, out: Float32Array): void;
}

/** Identity helper giving full type inference for effect authors. */
export function defineEffect<P extends ParamSpecs, S = undefined>(def: EffectDefinition<P, S>): EffectDefinition<P, S> {
  return def;
}

/** Type-erased effect for registries. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEffect = EffectDefinition<any, any>;
