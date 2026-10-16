/** Effect parameter specifications and resolution of raw project values into typed values. */
import {
  compileGradient,
  parseHex,
  type Gradient,
  type GradientStop,
  type RGB,
  type Vec3,
} from "@ledlay/core";

interface Base {
  label: string;
  description?: string;
}
export interface NumberParamSpec extends Base {
  type: "number";
  default: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}
export interface ColorParamSpec extends Base {
  type: "color";
  default: string;
}
export interface BooleanParamSpec extends Base {
  type: "boolean";
  default: boolean;
}
export interface SelectParamSpec extends Base {
  type: "select";
  default: string;
  options: readonly { value: string; label: string }[];
}
export interface Vec3ParamSpec extends Base {
  type: "vec3";
  default: Vec3;
  min?: number;
  max?: number;
}
export interface GradientParamSpec extends Base {
  type: "gradient";
  default: GradientStop[];
}
export interface CodeParamSpec extends Base {
  type: "code";
  default: string;
}

export type ParamSpec =
  | NumberParamSpec
  | ColorParamSpec
  | BooleanParamSpec
  | SelectParamSpec
  | Vec3ParamSpec
  | GradientParamSpec
  | CodeParamSpec;

export type ParamSpecs = Record<string, ParamSpec>;

/** The runtime type a spec resolves to. */
export type ResolvedOf<S extends ParamSpec> = S extends NumberParamSpec
  ? number
  : S extends ColorParamSpec
    ? RGB
    : S extends BooleanParamSpec
      ? boolean
      : S extends SelectParamSpec
        ? string
        : S extends Vec3ParamSpec
          ? Vec3
          : S extends GradientParamSpec
            ? Gradient
            : string;

export type ResolvedParams<P extends ParamSpecs> = { [K in keyof P]: ResolvedOf<P[K]> };

/** Raw (serialisable) value accepted for a spec. */
export type RawParamValue = number | string | boolean | Vec3 | GradientStop[];

const gradientCache = new WeakMap<object, Gradient>();
const colorCache = new Map<string, RGB>();

function cachedGradient(stops: GradientStop[]): Gradient {
  let g = gradientCache.get(stops);
  if (!g) {
    g = compileGradient(stops);
    gradientCache.set(stops, g);
  }
  return g;
}

function cachedColor(hex: string): RGB {
  let c = colorCache.get(hex);
  if (!c) {
    try {
      c = parseHex(hex);
    } catch {
      c = [0, 0, 0];
    }
    if (colorCache.size > 4096) colorCache.clear();
    colorCache.set(hex, c);
  }
  return c;
}

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number");
}

function isStops(v: unknown): v is GradientStop[] {
  return (
    Array.isArray(v) && v.every((s) => typeof s === "object" && s !== null && "pos" in s && "color" in s)
  );
}

/**
 * Coerce one raw value to the spec's type, falling back to the default when the value is
 * missing or of the wrong shape. Numbers are clamped to the spec range.
 */
export function resolveParam(spec: ParamSpec, raw: unknown): unknown {
  switch (spec.type) {
    case "number": {
      const n = typeof raw === "number" && Number.isFinite(raw) ? raw : spec.default;
      return Math.min(spec.max, Math.max(spec.min, n));
    }
    case "color":
      return cachedColor(typeof raw === "string" ? raw : spec.default);
    case "boolean":
      return typeof raw === "boolean" ? raw : spec.default;
    case "select":
      return typeof raw === "string" && spec.options.some((o) => o.value === raw) ? raw : spec.default;
    case "vec3":
      return isVec3(raw) ? raw : spec.default;
    case "gradient":
      return cachedGradient(isStops(raw) && raw.length > 0 ? raw : spec.default);
    case "code":
      return typeof raw === "string" ? raw : spec.default;
  }
}

export function resolveParams<P extends ParamSpecs>(
  specs: P,
  raw: Record<string, unknown>,
): ResolvedParams<P> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(specs)) out[key] = resolveParam(specs[key]!, raw[key]);
  return out as ResolvedParams<P>;
}

export function defaultParamValues(specs: ParamSpecs): Record<string, RawParamValue> {
  const out: Record<string, RawParamValue> = {};
  for (const [k, s] of Object.entries(specs)) {
    out[k] = Array.isArray(s.default) ? (structuredClone(s.default) as RawParamValue) : s.default;
  }
  return out;
}
