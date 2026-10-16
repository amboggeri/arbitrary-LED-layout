/** Every built-in effect must honour the same basic contract. */
import { describe, expect, it } from "vitest";
import { BUILTIN_EFFECTS, createPixelSpace } from "../src";
import { gridSpace, lineSpace, renderOnce } from "./helpers";

describe.each(BUILTIN_EFFECTS.map((e) => [e.id, e] as const))("%s", (_id, effect) => {
  it("has metadata and sane param specs", () => {
    expect(effect.name.length).toBeGreaterThan(0);
    expect(effect.description.length).toBeGreaterThan(0);
    for (const [key, spec] of Object.entries(effect.params)) {
      expect(spec.label, key).toBeTruthy();
      if (spec.type === "number") {
        expect(spec.min).toBeLessThanOrEqual(spec.default);
        expect(spec.max).toBeGreaterThanOrEqual(spec.default);
      }
      if (spec.type === "select") expect(spec.options.some((o) => o.value === spec.default)).toBe(true);
    }
  });

  it("writes finite, non-negative values for every pixel over time", () => {
    const space = gridSpace();
    for (const t of [0, 0.37, 1.5, 12.25, 1000.1]) {
      const out = renderOnce(effect, space, t);
      for (const v of out) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("is deterministic for a given time", () => {
    const space = gridSpace(4);
    expect(renderOnce(effect, space, 3.21)).toEqual(renderOnce(effect, space, 3.21));
  });

  it("handles empty, single-pixel and flat layouts", () => {
    expect(renderOnce(effect, createPixelSpace({ xyz: [] }), 1)).toHaveLength(0);
    expect(renderOnce(effect, createPixelSpace({ xyz: [5, 5, 5] }), 1)).toHaveLength(3);
    const flat = renderOnce(effect, lineSpace(20), 1);
    expect(flat.every((v) => Number.isFinite(v))).toBe(true);
  });
});
