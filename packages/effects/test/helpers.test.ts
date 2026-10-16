import { describe, expect, it } from "vitest";
import { axisCoord, createPixelSpace, fbm3, fill, fract, hash01, mulberry32, noise3, normalizeDir, smoothstep, triangle } from "../src";

describe("helpers", () => {
  const s = createPixelSpace({ xyz: [0, 0, 0, 10, 20, 30], fixture: [0, 1], indexInFixture: [0, 0] });
  it("axisCoord covers every axis", () => {
    expect([0, 1].map((i) => axisCoord(s, i, "x"))).toEqual([0, 1]);
    expect([0, 1].map((i) => axisCoord(s, i, "y"))).toEqual([0, 1]);
    expect([0, 1].map((i) => axisCoord(s, i, "z"))).toEqual([0, 1]);
    expect(axisCoord(s, 0, "radial")).toBeGreaterThan(0);
    expect(axisCoord(s, 1, "fixture")).toBe(0);
    expect([0, 1].map((i) => axisCoord(s, i, "index"))).toEqual([0, 1]);
    expect(axisCoord(createPixelSpace({ xyz: [0, 0, 0] }), 0, "index")).toBe(0);
    expect(axisCoord(s, 0, "bogus")).toBe(0);
  });
  it("math helpers", () => {
    expect(fract(-0.25)).toBe(0.75);
    expect(triangle(0.25)).toBe(0.5);
    expect(triangle(0.75)).toBe(0.5);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(normalizeDir([0, 0, 0])).toEqual([1, 0, 0]);
    const out = new Float32Array(6);
    fill(out, 1, 0.5, 0);
    expect([...out]).toEqual([1, 0.5, 0, 1, 0.5, 0]);
  });
  it("noise and prng are deterministic and bounded", () => {
    const a = mulberry32(5),
      b = mulberry32(5);
    for (let i = 0; i < 10; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hash01(3, 1)).toBe(hash01(3, 1));
    expect(hash01(3, 1)).not.toBe(hash01(4, 1));
    for (let i = 0; i < 50; i++) {
      const n = noise3(i * 0.37, i * 0.11, -i * 0.23);
      expect(Math.abs(n)).toBeLessThanOrEqual(1.1);
      const f = fbm3(i * 0.1, 0, 0, 4);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});
