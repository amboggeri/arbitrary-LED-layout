import { describe, expect, it } from "vitest";
import {
  EffectRegistry,
  chase,
  compileScript,
  createDefaultRegistry,
  createPixelSpace,
  defaultParamValues,
  gradient,
  orb,
  planeSweep,
  resolveParams,
  script,
  solid,
  strobe,
  twinkle,
  type ParamSpecs,
  type ScriptState,
} from "../src";
import { gridSpace, lineSpace, luma, px, renderOnce } from "./helpers";

describe("pixel space", () => {
  it("normalises coordinates", () => {
    const s = createPixelSpace({ xyz: [0, 0, 0, 10, 20, 0], fixture: [0, 0], indexInFixture: [0, 1] });
    expect([...s.unit]).toEqual([0, 0, 0.5, 1, 1, 0.5]);
    expect(s.halfExtent).toBe(10);
    expect([...s.centered]).toEqual([-0.5, -1, 0, 0.5, 1, 0]);
    expect([...s.u]).toEqual([0, 1]);
    expect(s.fixtureCount).toBe(1);
  });
  it("defaults fixture data and u for single-pixel fixtures", () => {
    const s = createPixelSpace({ xyz: [1, 1, 1, 2, 2, 2], fixture: [0, 1], indexInFixture: [0, 0] });
    expect([...s.u]).toEqual([0, 0]);
    expect(s.fixtureCount).toBe(2);
    expect([...createPixelSpace({ xyz: [0, 0, 0, 1, 0, 0] }).indexInFixture]).toEqual([0, 1]);
  });
});

describe("param resolution", () => {
  const specs = {
    n: { type: "number", label: "n", default: 1, min: 0, max: 2 },
    c: { type: "color", label: "c", default: "#ff0000" },
    b: { type: "boolean", label: "b", default: true },
    s: { type: "select", label: "s", default: "a", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
    v: { type: "vec3", label: "v", default: [1, 2, 3] },
    g: { type: "gradient", label: "g", default: [{ pos: 0, color: "#000000" }] },
    k: { type: "code", label: "k", default: "return 1" },
  } satisfies ParamSpecs;
  it("clamps and falls back to defaults on bad input", () => {
    const r = resolveParams(specs, { n: 99, c: 5, b: "yes", s: "zzz", v: [1, 2], g: [], k: 3 });
    expect(r.n).toBe(2);
    expect(r.c).toEqual([1, 0, 0]);
    expect(r.b).toBe(true);
    expect(r.s).toBe("a");
    expect(r.v).toEqual([1, 2, 3]);
    expect(r.g.pos.length).toBe(1);
    expect(r.k).toBe("return 1");
  });
  it("accepts valid input and caches gradients by identity", () => {
    const stops = [{ pos: 0, color: "#ffffff" }];
    const r1 = resolveParams(specs, { n: 0.5, c: "#00ff00", b: false, s: "b", v: [0, 0, 0], g: stops });
    const r2 = resolveParams(specs, { g: stops });
    expect(r1).toMatchObject({ n: 0.5, c: [0, 1, 0], b: false, s: "b", v: [0, 0, 0] });
    expect(r1.g).toBe(r2.g);
    expect(resolveParams(specs, { c: "#nothex" }).c).toEqual([0, 0, 0]);
  });
  it("produces deep-cloned defaults", () => {
    const d = defaultParamValues(specs);
    expect(d.v).toEqual([1, 2, 3]);
    expect(d.v).not.toBe(specs.v.default);
  });
});

describe("registry", () => {
  it("lists built-ins and rejects duplicates", () => {
    const r = createDefaultRegistry();
    expect(r.list().length).toBeGreaterThanOrEqual(15);
    expect(r.require("solid")).toBe(solid);
    expect(r.has("nope")).toBe(false);
    expect(r.get("nope")).toBeUndefined();
    expect(() => r.require("nope")).toThrow(/Unknown effect/);
    expect(() => r.register(solid)).toThrow(/already registered/);
    expect(new EffectRegistry().register(solid).list()).toHaveLength(1);
  });
});

describe("specific effects", () => {
  it("solid fills", () => {
    expect(px(renderOnce(solid, lineSpace(3), 0, { color: "#ff0080" }), 2)).toEqual([1, 0, Math.fround(128 / 255)]);
  });

  it("gradient follows the chosen axis", () => {
    const out = renderOnce(gradient, lineSpace(11), 0, {
      axis: "x",
      gradient: [
        { pos: 0, color: "#000000" },
        { pos: 1, color: "#ffffff" },
      ],
    });
    expect(px(out, 0)[0]).toBeCloseTo(0);
    expect(px(out, 5)[0]).toBeCloseTo(0.5);
    // fract wraps the last pixel (x=1) back to 0 when not mirrored
    const mirrored = renderOnce(gradient, lineSpace(11), 0, {
      axis: "x",
      mirror: true,
      repeat: 0.5,
      gradient: [
        { pos: 0, color: "#000000" },
        { pos: 1, color: "#ffffff" },
      ],
    });
    expect(px(mirrored, 10)[0]).toBeCloseTo(1);
  });

  it("chase head sits at u = speed*t", () => {
    const space = lineSpace(101);
    const out = renderOnce(chase, space, 0.5, { speed: 1, count: 1, tail: 0.1 });
    // head at u=0.5 -> pixel 50 brightest, pixels ahead are dark
    expect(luma(out, 50)).toBeCloseTo(3);
    expect(luma(out, 55)).toBe(0);
    expect(luma(out, 47)).toBeGreaterThan(0);
  });

  it("plane sweep visits every pixel during one cycle", () => {
    const space = gridSpace(4);
    const lit = new Set<number>();
    for (let t = 0; t < 2; t += 0.02) {
      const out = renderOnce(planeSweep, space, t, { speed: 0.5, direction: [1, 1, 0] });
      for (let i = 0; i < space.count; i++) if (luma(out, i) > 0.5) lit.add(i);
    }
    expect(lit.size).toBe(space.count);
  });

  it("plane sweep recomputes extents when direction changes", () => {
    const space = gridSpace(3);
    const params = { speed: 0.5 };
    const state = planeSweep.init!(space, resolveParams(planeSweep.params, {}));
    renderOnce(planeSweep, space, 0, { ...params, direction: [1, 0, 0] }, state);
    const before = { ...state };
    renderOnce(planeSweep, space, 0, { ...params, direction: [0, 0, 1] }, state);
    expect(state.dir).not.toEqual(before.dir);
  });

  it("orb is brightest at its position", () => {
    const space = gridSpace(5);
    const out = renderOnce(orb, space, 0, { position: [1, 1, 1], orbitRadius: 0, radius: 0.5 });
    const corner = 124; // (4,4,4) == centered (1,1,1)
    expect(luma(out, corner)).toBeGreaterThan(luma(out, 0));
    expect(luma(out, 0)).toBe(0);
  });

  it("strobe toggles with duty cycle", () => {
    const s = lineSpace(1);
    expect(luma(renderOnce(strobe, s, 0.01, { rate: 1, duty: 0.5 }), 0)).toBe(3);
    expect(luma(renderOnce(strobe, s, 0.75, { rate: 1, duty: 0.5 }), 0)).toBe(0);
  });

  it("twinkle density 0 is dark and density 1 lights something", () => {
    const s = gridSpace(4);
    expect(renderOnce(twinkle, s, 1, { density: 0 }).every((v) => v === 0)).toBe(true);
    expect(renderOnce(twinkle, s, 1, { density: 1, randomHue: true }).some((v) => v > 0)).toBe(true);
  });
});

describe("script effect", () => {
  it("runs user code with helpers", () => {
    const out = renderOnce(script, lineSpace(3), 0, { code: "return [x, 0.5, i / 10];" });
    expect(px(out, 2)).toEqual([1, 0.5, Math.fround(0.2)]);
    expect(px(renderOnce(script, lineSpace(2), 0, { code: "return 0.25" }), 0)).toEqual([0.25, 0.25, 0.25]);
    expect(px(renderOnce(script, lineSpace(2), 0, { code: "return hsv(0, 1, 1)" }), 0)).toEqual([1, 0, 0]);
    expect(px(renderOnce(script, lineSpace(2), 0, { code: "return 'nope'" }), 0)).toEqual([0, 0, 0]);
    expect(px(renderOnce(script, lineSpace(2), 0, { code: "return [NaN, 'a', 1]" }), 0)).toEqual([0, 0, 1]);
  });

  it("reports compile errors without throwing", () => {
    const space = lineSpace(2);
    const state: ScriptState = { error: null };
    const out = renderOnce(script, space, 0, { code: "return (" }, state);
    expect(state.error).toBeTruthy();
    expect(out.every((v) => v === 0)).toBe(true);
    expect(compileScript("return (").fn).toBeNull();
  });

  it("reports runtime errors without throwing", () => {
    const state: ScriptState = { error: null };
    renderOnce(script, lineSpace(2), 0, { code: "undefinedThing.foo" }, state);
    expect(state.error).toMatch(/undefinedThing/);
  });

  it("caches compiled scripts", () => {
    expect(compileScript("return 1")).toBe(compileScript("return 1"));
  });
});
