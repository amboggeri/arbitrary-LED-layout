import { describe, expect, it } from "vitest";
import {
  autoPatch,
  computeControllerLayout,
  createController,
  createFixture,
  createProject,
  getLedType,
  totalLedCount,
  validatePatch,
} from "../src";

function setup() {
  const c = createController({
    id: "c1",
    name: "Ctl",
    host: "10.0.0.2",
    outputs: [
      { pixelCount: 0, colorOrder: "RGB" },
      { pixelCount: 5, colorOrder: "GRBW" },
    ],
  });
  const a = createFixture({ id: "a", name: "A", geometry: { kind: "strip", count: 10, spacing: 1 } });
  const b = createFixture({ id: "b", name: "B", geometry: { kind: "strip", count: 4, spacing: 1 } });
  return { c, a, b };
}

describe("computeControllerLayout", () => {
  it("derives auto output lengths and offsets", () => {
    const { c, a, b } = setup();
    a.patch = { controllerId: "c1", output: 0, startPixel: 0 };
    b.patch = { controllerId: "c1", output: 0, startPixel: 12 };
    const l = computeControllerLayout(c, [a, b]);
    expect(l.outputs).toEqual([
      { output: 0, offset: 0, length: 16, channelsPerPixel: 3 },
      { output: 1, offset: 16, length: 5, channelsPerPixel: 4 },
    ]);
    expect(l.totalPixels).toBe(21);
    expect(l.totalChannels).toBe(16 * 3 + 5 * 4);
  });
});

describe("validatePatch", () => {
  it("flags overlap, overflow, missing controllers and unpatched fixtures", () => {
    const { c, a, b } = setup();
    a.patch = { controllerId: "c1", output: 0, startPixel: 0 };
    b.patch = { controllerId: "c1", output: 0, startPixel: 5 };
    const over = createFixture({ id: "o", name: "Over", geometry: { kind: "strip", count: 6, spacing: 1 } });
    over.patch = { controllerId: "c1", output: 1, startPixel: 0 };
    const ghost = createFixture({ id: "g", name: "Ghost", geometry: { kind: "strip", count: 1, spacing: 1 } });
    ghost.patch = { controllerId: "nope", output: 0, startPixel: 0 };
    const badOut = createFixture({ id: "bo", name: "BadOut", geometry: { kind: "strip", count: 1, spacing: 1 } });
    badOut.patch = { controllerId: "c1", output: 7, startPixel: 0 };
    const loose = createFixture({ id: "l", name: "Loose", geometry: { kind: "strip", count: 1, spacing: 1 } });
    const issues = validatePatch(createProject({ controllers: [c], fixtures: [a, b, over, ghost, badOut, loose] }));
    const msgs = issues.map((i) => `${i.severity}: ${i.message}`);
    expect(msgs).toContain("warning: B overlaps A on Ctl output 1");
    expect(msgs.some((m) => m.startsWith("error: Over: needs pixels 0-5"))).toBe(true);
    expect(msgs).toContain("error: Ghost: patched to a missing controller");
    expect(msgs).toContain("error: BadOut: output 8 does not exist on Ctl");
    expect(msgs).toContain("warning: Loose: not patched to a controller");
  });

  it("flags duplicate ids, missing host, empty controllers and universe overflow", () => {
    const c = createController({ id: "c", name: "Empty", host: "" });
    const big = createController({ id: "big", name: "Big", host: "x", protocol: "artnet", universeStart: 32767 });
    const f1 = createFixture({ id: "dup", name: "1", geometry: { kind: "strip", count: 400, spacing: 1 } });
    f1.patch = { controllerId: "big", output: 0, startPixel: 0 };
    const f2 = createFixture({ id: "dup", name: "2", geometry: { kind: "strip", count: 1, spacing: 1 } });
    const msgs = validatePatch(createProject({ controllers: [c, big], fixtures: [f1, f2] })).map((i) => i.message);
    expect(msgs).toContain("Duplicate fixture id dup");
    expect(msgs).toContain("Empty: no host/IP set");
    expect(msgs).toContain("Empty: no fixtures patched");
    expect(msgs).toContain("Big: universe range exceeds 32767");
  });

  it("is clean for a well-formed project", () => {
    const { c, a } = setup();
    a.patch = { controllerId: "c1", output: 0, startPixel: 0 };
    expect(validatePatch(createProject({ controllers: [c], fixtures: [a] }))).toEqual([]);
  });
});

describe("autoPatch", () => {
  it("appends unpatched fixtures after existing ones", () => {
    const { c, a, b } = setup();
    a.patch = { controllerId: "c1", output: 0, startPixel: 0 };
    const p = createProject({ controllers: [c], fixtures: [a, b] });
    const out = autoPatch(p, "c1");
    expect(out[0]).toBe(p.fixtures[0]);
    expect(out[1]!.patch).toEqual({ controllerId: "c1", output: 0, startPixel: 10 });
    expect(totalLedCount(p)).toBe(14);
    expect(() => autoPatch(p, "missing")).toThrow();
  });
});

describe("led types", () => {
  it("falls back to the first type", () => {
    expect(getLedType("sk6812rgbw").nativeOrder).toBe("GRBW");
    expect(getLedType("unknown").id).toBe("ws2812b");
  });
});
