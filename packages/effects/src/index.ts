export * from "./space";
export * from "./params";
export * from "./effect";
export * from "./registry";
export * from "./noise";
export * from "./helpers";
export * from "./library";

import { BUILTIN_EFFECTS } from "./library";
import { EffectRegistry } from "./registry";

/** A fresh registry containing every built-in effect. */
export function createDefaultRegistry(): EffectRegistry {
  return new EffectRegistry(BUILTIN_EFFECTS);
}
