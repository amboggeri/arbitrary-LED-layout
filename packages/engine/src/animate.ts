/** Keyframe evaluation for layer parameters. */
import {
  isAnimated,
  lerpColor,
  parseHex,
  toHex,
  type Easing,
  type Keyframe,
  type Param,
  type ParamValue,
} from "@ledlay/core";

export function ease(kind: Easing, t: number): number {
  switch (kind) {
    case "linear":
      return t;
    case "step":
      return 0;
    case "easeIn":
      return t * t;
    case "easeOut":
      return 1 - (1 - t) * (1 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function interpolate(a: ParamValue, b: ParamValue, t: number): ParamValue {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * t;
  if (typeof a === "string" && typeof b === "string" && HEX.test(a) && HEX.test(b)) {
    return toHex(lerpColor(parseHex(a), parseHex(b), t));
  }
  if (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === 3 &&
    b.length === 3 &&
    typeof a[0] === "number" &&
    typeof b[0] === "number"
  ) {
    const av = a as [number, number, number],
      bv = b as [number, number, number];
    return [av[0] + (bv[0] - av[0]) * t, av[1] + (bv[1] - av[1]) * t, av[2] + (bv[2] - av[2]) * t];
  }
  // Non-interpolable (booleans, selects, gradients, code): hold until the next key.
  return t < 1 ? a : b;
}

/**
 * Evaluate keyframes at time t. Keys are assumed sorted by time (the editor keeps them
 * sorted; we sort defensively if not). The easing of the *earlier* key shapes each span.
 */
export function evaluateKeyframes(keys: readonly Keyframe[], t: number): ParamValue {
  let ks = keys;
  for (let i = 1; i < ks.length; i++) {
    if (ks[i]!.t < ks[i - 1]!.t) {
      ks = [...keys].sort((a, b) => a.t - b.t);
      break;
    }
  }
  const first = ks[0]!;
  if (t <= first.t || ks.length === 1) return first.v;
  for (let i = 1; i < ks.length; i++) {
    const k1 = ks[i]!;
    if (t < k1.t) {
      const k0 = ks[i - 1]!;
      const span = k1.t - k0.t;
      const f = span <= 0 ? 1 : ease(k0.ease, (t - k0.t) / span);
      return interpolate(k0.v, k1.v, f);
    }
  }
  return ks[ks.length - 1]!.v;
}

export function evaluateParam(p: Param, t: number): ParamValue {
  return isAnimated(p) ? evaluateKeyframes(p.keyframes, t) : p;
}

export function evaluateParams(params: Record<string, Param>, t: number): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const k of Object.keys(params)) out[k] = evaluateParam(params[k]!, t);
  return out;
}
