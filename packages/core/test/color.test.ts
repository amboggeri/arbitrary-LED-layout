import { describe, expect, it } from "vitest";
import {
  buildGammaLut,
  channelsFor,
  clamp01,
  compileGradient,
  hsv,
  orderIndices,
  parseHex,
  sampleGradient,
  toHex,
} from "../src";

describe("hex", () => {
  it("round-trips", () => {
    expect(toHex(parseHex("#ff8000"))).toBe("#ff8000");
    expect(toHex(parseHex("0f0"))).toBe("#00ff00");
  });
  it("rejects garbage", () => {
    expect(() => parseHex("#zzzzzz")).toThrow(/Invalid hex/);
  });
  it("clamps when formatting", () => {
    expect(toHex([2, -1, Number.NaN])).toBe("#ff0000");
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe("hsv", () => {
  it("maps primary hues", () => {
    expect(hsv(0, 1, 1)).toEqual([1, 0, 0]);
    expect(hsv(1 / 3, 1, 1).map((v) => +v.toFixed(6))).toEqual([0, 1, 0]);
    expect(hsv(2 / 3, 1, 1).map((v) => +v.toFixed(6))).toEqual([0, 0, 1]);
  });
  it("wraps hue and handles negative", () => {
    expect(hsv(1.5, 1, 1)).toEqual(hsv(0.5, 1, 1));
    expect(hsv(-0.5, 1, 1)).toEqual(hsv(0.5, 1, 1));
  });
  it("zero saturation is grey", () => {
    expect(hsv(0.3, 0, 0.5)).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("color orders", () => {
  it("indices and channel counts", () => {
    expect(orderIndices("GRB")).toEqual([1, 0, 2]);
    expect(orderIndices("WRGB")).toEqual([3, 0, 1, 2]);
    expect(channelsFor("RGB")).toBe(3);
    expect(channelsFor("GRBW")).toBe(4);
  });
});

describe("gradients", () => {
  const g = compileGradient([
    { pos: 1, color: "#0000ff" },
    { pos: 0, color: "#ff0000" },
  ]);
  it("sorts stops and interpolates", () => {
    expect(sampleGradient(g, 0)).toEqual([1, 0, 0]);
    expect(sampleGradient(g, 1)).toEqual([0, 0, 1]);
    const mid = sampleGradient(g, 0.5);
    expect(mid[0]).toBeCloseTo(0.5);
    expect(mid[2]).toBeCloseTo(0.5);
  });
  it("clamps outside range and supports single/empty stops", () => {
    expect(sampleGradient(g, -3)).toEqual([1, 0, 0]);
    expect(sampleGradient(g, 9)).toEqual([0, 0, 1]);
    expect(sampleGradient(compileGradient([]), 0.5)).toEqual([0, 0, 0]);
  });
  it("handles coincident stops (hard edge)", () => {
    const hard = compileGradient([
      { pos: 0, color: "#000000" },
      { pos: 0.5, color: "#000000" },
      { pos: 0.5, color: "#ffffff" },
      { pos: 1, color: "#ffffff" },
    ]);
    expect(sampleGradient(hard, 0.49)[0]).toBe(0);
    expect(sampleGradient(hard, 0.51)[0]).toBe(1);
  });
});

describe("gamma lut", () => {
  it("is identity-ish for gamma 1 and darker for gamma 2.2", () => {
    const lin = buildGammaLut(1, 1, 256);
    expect(lin[0]).toBe(0);
    expect(lin[255]).toBe(255);
    expect(lin[128]).toBe(128);
    const g = buildGammaLut(2.2, 1, 256);
    expect(g[128]).toBeLessThan(64);
  });
  it("folds brightness in", () => {
    expect(buildGammaLut(1, 0.5, 256)[255]).toBe(128);
  });
});
