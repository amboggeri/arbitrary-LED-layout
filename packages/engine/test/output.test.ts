import { describe, expect, it } from "vitest";
import { createController, createFixture, createProject } from "@ledlay/core";
import { compileLayout, ControllerEncoder } from "../src";
import { twoStrips } from "./fixtures";

function frameOf(n: number, rgb: [number, number, number]): Float32Array {
  const f = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) f.set(rgb, i * 3);
  return f;
}

describe("ControllerEncoder", () => {
  it("encodes RGB at gamma 1 exactly", () => {
    const c = compileLayout(twoStrips());
    const enc = new ControllerEncoder(c.controllers[0]!);
    const { data, powerScale } = enc.encode(frameOf(8, [1, 0.5, 0]));
    expect(data.length).toBe(24);
    expect([...data.subarray(0, 3)]).toEqual([255, 128, 0]);
    expect(powerScale).toBe(1);
  });

  it("applies color order, brightness and gamma", () => {
    const c = compileLayout(twoStrips({ outputs: [{ colorOrder: "GRB" }], brightness: 0.5, gamma: 2 }));
    const { data } = new ControllerEncoder(c.controllers[0]!).encode(frameOf(8, [1, 0.5, 0]));
    // r=1 -> 255*0.5=128 ; g=0.5 -> 0.25*0.5*255=32
    expect([...data.subarray(0, 3)]).toEqual([32, 128, 0]);
  });

  it("applies master brightness and clamps out-of-range floats", () => {
    const c = compileLayout(twoStrips());
    const { data } = new ControllerEncoder(c.controllers[0]!).encode(frameOf(8, [2, -1, Number.NaN]), 0.5);
    expect([...data.subarray(0, 3)]).toEqual([128, 0, 0]);
  });

  it("extracts white for RGBW outputs", () => {
    const c = compileLayout(twoStrips({ outputs: [{ colorOrder: "GRBW" }] }));
    const enc = new ControllerEncoder(c.controllers[0]!);
    const { data } = enc.encode(frameOf(8, [1, 1, 0.5]));
    expect(data.length).toBe(32);
    // w = 0.5, r=g=0.5, b=0 ; order G R B W
    expect([...data.subarray(0, 4)]).toEqual([128, 128, 0, 128]);
  });

  it("writes black into unrouted slots", () => {
    const ctl = createController({ id: "c", name: "C", outputs: [{ pixelCount: 3 }] });
    const f = createFixture({ id: "a", name: "A", geometry: { kind: "strip", count: 1, spacing: 1 } });
    f.patch = { controllerId: "c", output: 0, startPixel: 1 };
    const c = compileLayout(createProject({ fixtures: [f], controllers: [ctl] }));
    const { data } = new ControllerEncoder(c.controllers[0]!).encode(frameOf(1, [1, 1, 1]));
    expect([...data]).toEqual([0, 0, 0, 255, 255, 255, 0, 0, 0]);
  });

  it("estimates current and limits power", () => {
    // 8 px * 3 ch * 20mA = 0.48A at full white
    const unl = new ControllerEncoder(compileLayout(twoStrips()).controllers[0]!).encode(frameOf(8, [1, 1, 1]));
    expect(unl.estimatedAmps).toBeCloseTo(0.48);
    const lim = new ControllerEncoder(compileLayout(twoStrips({ maxAmps: 0.24 })).controllers[0]!).encode(frameOf(8, [1, 1, 1]));
    expect(lim.powerScale).toBeCloseTo(0.5);
    expect(lim.data[0]).toBe(127);
  });
});
