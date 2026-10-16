import { describe, expect, it } from "vitest";
import { createController, createFixture, createProject } from "@ledlay/core";
import { compileLayout, controllerChannelCount } from "../src";
import { twoStrips } from "./fixtures";

describe("compileLayout", () => {
  it("builds the pixel space and routes", () => {
    const c = compileLayout(twoStrips());
    expect(c.space.count).toBe(8);
    expect(c.fixtures.map((f) => [f.id, f.offset, f.count])).toEqual([
      ["a", 0, 4],
      ["b", 4, 4],
    ]);
    expect(c.fixtureIndex.get("b")).toBe(1);
    expect([...c.controllers[0]!.route]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(controllerChannelCount(c.controllers[0]!)).toBe(24);
    expect(c.space.xyz[4 * 3 + 1]).toBe(10);
  });

  it("leaves gaps unrouted and handles reversed fixtures and multi-output controllers", () => {
    const ctl = createController({
      id: "c",
      name: "C",
      outputs: [
        { pixelCount: 6, colorOrder: "RGB" },
        { pixelCount: 0, colorOrder: "GRBW" },
      ],
    });
    const a = createFixture({
      id: "a",
      name: "A",
      geometry: { kind: "strip", count: 3, spacing: 1 },
      reversed: true,
    });
    a.patch = { controllerId: "c", output: 0, startPixel: 2 };
    const b = createFixture({ id: "b", name: "B", geometry: { kind: "strip", count: 2, spacing: 1 } });
    b.patch = { controllerId: "c", output: 1, startPixel: 0 };
    const c = compileLayout(createProject({ fixtures: [a, b], controllers: [ctl] }));
    const cc = c.controllers[0]!;
    expect([...cc.route]).toEqual([-1, -1, 0, 1, 2, -1, 3, 4]);
    expect([...cc.slotOutput]).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);
    // reversed: global pixel 0 is the strip's far end
    expect(c.space.xyz[0]).toBe(2);
    expect(controllerChannelCount(cc)).toBe(6 * 3 + 2 * 4);
    expect(cc.slotMa[2]).toBe(20);
    expect(cc.slotMa[0]).toBe(0);
  });

  it("truncates fixtures that overflow a fixed-size output", () => {
    const ctl = createController({ id: "c", name: "C", outputs: [{ pixelCount: 2 }] });
    const a = createFixture({ id: "a", name: "A", geometry: { kind: "strip", count: 5, spacing: 1 } });
    a.patch = { controllerId: "c", output: 0, startPixel: 0 };
    const bad = createFixture({ id: "x", name: "X", geometry: { kind: "strip", count: 1, spacing: 1 } });
    bad.patch = { controllerId: "c", output: 9, startPixel: 0 };
    const cc = compileLayout(createProject({ fixtures: [a, bad], controllers: [ctl] })).controllers[0]!;
    expect([...cc.route]).toEqual([0, 1]);
  });
});
