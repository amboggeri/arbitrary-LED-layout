import { describe, expect, it } from "vitest";
import { blendInto } from "../src";

const f = (...v: number[]) => new Float32Array(v);

describe("blendInto", () => {
  const cases = [
    ["normal", 0.8],
    ["add", 1],
    ["multiply", 0.4],
    ["screen", 0.9],
    ["max", 0.8],
    ["min", 0.5],
    ["subtract", 0],
  ] as const;
  for (const [mode, expected] of cases) {
    it(mode, () => {
      const dst = f(0.5, 0.5, 0.5);
      blendInto(dst, f(0.8, 0.8, 0.8), mode, 1);
      expect(dst[0]).toBeCloseTo(expected);
    });
  }
  it("respects opacity and mask", () => {
    const dst = f(0, 0, 0, 0, 0, 0);
    blendInto(dst, f(1, 1, 1, 1, 1, 1), "normal", 0.5, new Uint8Array([1, 0]));
    expect([...dst]).toEqual([0.5, 0.5, 0.5, 0, 0, 0]);
    blendInto(dst, f(1, 1, 1, 1, 1, 1), "normal", 0);
    expect(dst[0]).toBe(0.5);
  });
});
