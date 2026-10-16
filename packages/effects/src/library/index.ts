import type { AnyEffect } from "../effect";
import { gradient, solid, strobe, twinkle } from "./basic";
import { chase, scanner } from "./linear";
import { script } from "./script";
import { clouds, fire, orb, planeSweep, plasma, rainbow, shockwave, spiral } from "./spatial";

export { gradient, solid, strobe, twinkle, chase, scanner, script, clouds, fire, orb, planeSweep, plasma, rainbow, shockwave, spiral };
export { compileScript, DEFAULT_SCRIPT, type ScriptState } from "./script";

export const BUILTIN_EFFECTS: readonly AnyEffect[] = [
  solid,
  gradient,
  rainbow,
  planeSweep,
  shockwave,
  orb,
  spiral,
  plasma,
  clouds,
  fire,
  chase,
  scanner,
  twinkle,
  strobe,
  script,
];
