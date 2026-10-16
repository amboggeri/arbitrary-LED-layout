import { describe, expect, it } from "vitest";
import { transformPoint, type TransformData, type Vec3 } from "@ledlay/core";
import { worldToLocal } from "../src/viewport/coords";

describe("worldToLocal", () => {
  it("inverts arbitrary transforms", () => {
    const t: TransformData = { position: [10, -5, 3], rotation: [30, -45, 120], scale: [2, 0.5, 3] };
    for (const p of [
      [0, 0, 0],
      [1, 2, 3],
      [-7, 4.5, 0.25],
    ] as Vec3[]) {
      const back = worldToLocal(t, transformPoint(t, p));
      back.forEach((v, i) => expect(v).toBeCloseTo(p[i]!, 9));
    }
  });
  it("returns the point unchanged for degenerate scale", () => {
    expect(worldToLocal({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [0, 1, 1] }, [1, 2, 3])).toEqual([
      1, 2, 3,
    ]);
  });
});
