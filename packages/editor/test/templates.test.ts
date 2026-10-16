import { describe, expect, it } from "vitest";
import { ledCount, validatePatch } from "@ledlay/core";
import { FIXTURE_TEMPLATES, demoProject, helixPoints } from "../src";

describe("templates", () => {
  it("every fixture template builds at a position", () => {
    for (const t of FIXTURE_TEMPLATES) {
      const f = t.make([1, 2, 3]);
      expect(f.transform.position).toEqual([1, 2, 3]);
      expect(ledCount(f.geometry)).toBeGreaterThan(0);
      expect(t.make().transform.position).toEqual([0, 0, 0]);
    }
  });

  it("helix tapers and rises", () => {
    const pts = helixPoints(2, 100, 1000, 8);
    expect(pts).toHaveLength(17);
    expect(pts[0]).toEqual([100, 0, 0]);
    expect(pts.at(-1)![1]).toBeCloseTo(1000);
    expect(Math.hypot(pts.at(-1)![0], pts.at(-1)![2])).toBeCloseTo(15);
  });

  it("demo project is patched without overlaps", () => {
    const p = demoProject();
    const issues = validatePatch(p).filter((i) => !i.message.includes("no host"));
    expect(issues).toEqual([]);
    expect(p.layers.length).toBeGreaterThan(0);
  });
});
