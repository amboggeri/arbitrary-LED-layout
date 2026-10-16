import { describe, expect, it } from "vitest";
import { ease, evaluateKeyframes, evaluateParam, evaluateParams } from "../src";

describe("easing", () => {
  it("hits endpoints", () => {
    for (const k of ["linear", "easeIn", "easeOut", "easeInOut"] as const) {
      expect(ease(k, 0)).toBeCloseTo(0);
      expect(ease(k, 1)).toBeCloseTo(1);
    }
    expect(ease("step", 0.9)).toBe(0);
    expect(ease("easeIn", 0.5)).toBeLessThan(0.5);
    expect(ease("easeOut", 0.5)).toBeGreaterThan(0.5);
    expect(ease("easeInOut", 0.25)).toBeLessThan(0.25);
    expect(ease("easeInOut", 0.75)).toBeGreaterThan(0.75);
  });
});

describe("keyframes", () => {
  const num = [
    { t: 0, v: 0, ease: "linear" as const },
    { t: 2, v: 10, ease: "step" as const },
    { t: 4, v: 20, ease: "linear" as const },
  ];
  it("interpolates numbers and clamps outside the range", () => {
    expect(evaluateKeyframes(num, -1)).toBe(0);
    expect(evaluateKeyframes(num, 1)).toBe(5);
    expect(evaluateKeyframes(num, 3)).toBe(10); // step holds
    expect(evaluateKeyframes(num, 4)).toBe(20);
    expect(evaluateKeyframes(num, 99)).toBe(20);
  });
  it("sorts unsorted keys defensively", () => {
    expect(evaluateKeyframes([num[2]!, num[0]!], 2)).toBe(10);
  });
  it("interpolates colors and vec3, holds other types", () => {
    expect(
      evaluateKeyframes(
        [
          { t: 0, v: "#000000", ease: "linear" },
          { t: 1, v: "#ffffff", ease: "linear" },
        ],
        0.5,
      ),
    ).toBe("#808080");
    expect(
      evaluateKeyframes(
        [
          { t: 0, v: [0, 0, 0], ease: "linear" },
          { t: 1, v: [2, 4, 6], ease: "linear" },
        ],
        0.5,
      ),
    ).toEqual([1, 2, 3]);
    const bools = [
      { t: 0, v: true, ease: "linear" as const },
      { t: 1, v: false, ease: "linear" as const },
    ];
    expect(evaluateKeyframes(bools, 0.99)).toBe(true);
    expect(evaluateKeyframes(bools, 1)).toBe(false);
    expect(evaluateKeyframes([{ t: 0, v: "x", ease: "linear" }, { t: 0, v: "y", ease: "linear" }], 0.5)).toBe("y");
  });
  it("evaluates static and animated params", () => {
    expect(evaluateParam(5, 100)).toBe(5);
    expect(evaluateParams({ a: 1, b: { keyframes: [{ t: 0, v: 0, ease: "linear" }, { t: 1, v: 1, ease: "linear" }] } }, 0.25)).toEqual({
      a: 1,
      b: 0.25,
    });
  });
});
