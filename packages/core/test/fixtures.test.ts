import { describe, expect, it } from "vitest";
import {
  createFixture,
  cubePoints,
  fixtureWorldPoints,
  ledCount,
  localPoints,
  matrixPoints,
  polylineLedCount,
  polylineLength,
  polylinePoints,
  ringPoints,
  stripPoints,
  type FixtureGeometry,
  type Vec3,
} from "../src";

const round = (pts: Vec3[]) => pts.map((p) => p.map((v) => Math.round(v * 1e6) / 1e6 + 0));

describe("strip", () => {
  it("places LEDs along +X", () => {
    expect(stripPoints({ kind: "strip", count: 3, spacing: 10 })).toEqual([
      [0, 0, 0],
      [10, 0, 0],
      [20, 0, 0],
    ]);
  });
});

describe("ring", () => {
  it("full ring does not duplicate start", () => {
    const pts = round(ringPoints({ kind: "ring", count: 4, radius: 1, startAngle: 0, sweep: 360 }));
    expect(pts).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [-1, 0, 0],
      [0, -1, 0],
    ]);
  });
  it("partial arc includes both ends", () => {
    const pts = round(ringPoints({ kind: "ring", count: 3, radius: 1, startAngle: 0, sweep: 180 }));
    expect(pts).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [-1, 0, 0],
    ]);
  });
  it("single LED ring", () => {
    expect(ringPoints({ kind: "ring", count: 1, radius: 2, startAngle: 90, sweep: 360 }).length).toBe(1);
  });
});

describe("matrix wiring", () => {
  const base = { kind: "matrix" as const, cols: 3, rows: 2, spacingX: 1, spacingY: 1 };
  it("progressive from bottom-left", () => {
    const pts = matrixPoints({ ...base, wiring: "progressive", start: "bottom-left", vertical: false });
    expect(pts.map((p) => [p[0], p[1]])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
  });
  it("serpentine reverses odd rows", () => {
    const pts = matrixPoints({ ...base, wiring: "serpentine", start: "bottom-left", vertical: false });
    expect(pts.map((p) => [p[0], p[1]])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [0, 1],
    ]);
  });
  it("top-right start mirrors both axes", () => {
    const pts = matrixPoints({ ...base, wiring: "progressive", start: "top-right", vertical: false });
    expect(pts[0]!.slice(0, 2)).toEqual([2, 1]);
    expect(pts[2]!.slice(0, 2)).toEqual([0, 1]);
  });
  it("vertical runs along columns", () => {
    const pts = matrixPoints({ ...base, wiring: "serpentine", start: "bottom-left", vertical: true });
    expect(pts.map((p) => [p[0], p[1]])).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [2, 0],
      [2, 1],
    ]);
  });
  it("covers each cell exactly once for every option combination", () => {
    for (const wiring of ["progressive", "serpentine"] as const)
      for (const start of ["bottom-left", "bottom-right", "top-left", "top-right"] as const)
        for (const vertical of [false, true]) {
          const pts = matrixPoints({ kind: "matrix", cols: 4, rows: 3, spacingX: 1, spacingY: 1, wiring, start, vertical });
          expect(new Set(pts.map((p) => `${p[0]},${p[1]}`)).size).toBe(12);
        }
  });
});

describe("cube", () => {
  it("serpentine path only ever moves one grid step", () => {
    const pts = cubePoints({ kind: "cube", nx: 3, ny: 3, nz: 3, spacing: 1, wiring: "serpentine" });
    expect(pts.length).toBe(27);
    expect(new Set(pts.map((p) => p.join(","))).size).toBe(27);
    for (let i = 1; i < pts.length; i++) {
      const d = pts[i]!.reduce((s, v, k) => s + Math.abs(v - pts[i - 1]![k]!), 0);
      expect(d).toBe(1);
    }
  });
  it("progressive restarts each row", () => {
    const pts = cubePoints({ kind: "cube", nx: 2, ny: 1, nz: 2, spacing: 5, wiring: "progressive" });
    expect(pts).toEqual([
      [0, 0, 0],
      [5, 0, 0],
      [0, 0, 5],
      [5, 0, 5],
    ]);
  });
});

describe("polyline", () => {
  const L: Vec3[] = [
    [0, 0, 0],
    [10, 0, 0],
    [10, 10, 0],
  ];
  it("measures length", () => {
    expect(polylineLength(L)).toBe(20);
    expect(polylineLength(L, true)).toBeCloseTo(20 + Math.SQRT2 * 10);
  });
  it("spaces LEDs across corners", () => {
    const g = { kind: "polyline" as const, points: L, spacing: 5, closed: false };
    expect(polylineLedCount(g)).toBe(5);
    expect(round(polylinePoints(g))).toEqual([
      [0, 0, 0],
      [5, 0, 0],
      [10, 0, 0],
      [10, 5, 0],
      [10, 10, 0],
    ]);
  });
  it("closed loop does not duplicate the start", () => {
    const sq: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ];
    const pts = round(polylinePoints({ kind: "polyline", points: sq, spacing: 1, closed: true }));
    expect(pts).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ]);
  });
  it("handles zero-length segments", () => {
    const pts = polylinePoints({
      kind: "polyline",
      points: [
        [0, 0, 0],
        [0, 0, 0],
        [2, 0, 0],
      ],
      spacing: 1,
      closed: false,
    });
    expect(round(pts)).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
  });
});

describe("ledCount matches generated points for every kind", () => {
  const geoms: FixtureGeometry[] = [
    { kind: "strip", count: 7, spacing: 1 },
    { kind: "ring", count: 12, radius: 3, startAngle: 0, sweep: 270 },
    { kind: "matrix", cols: 5, rows: 4, spacingX: 1, spacingY: 2, wiring: "serpentine", start: "top-left", vertical: false },
    { kind: "cube", nx: 2, ny: 3, nz: 4, spacing: 1, wiring: "serpentine" },
    { kind: "polyline", points: [[0, 0, 0], [3.3, 0, 0], [3.3, 7.1, 2]], spacing: 0.7, closed: false },
    { kind: "polyline", points: [[0, 0, 0], [3, 0, 0], [3, 3, 0]], spacing: 0.5, closed: true },
    { kind: "points", points: [[1, 2, 3], [4, 5, 6]] },
  ];
  for (const g of geoms) {
    it(g.kind, () => expect(localPoints(g).length).toBe(ledCount(g)));
  }
});

describe("fixtureWorldPoints", () => {
  it("applies transform and reversal", () => {
    const f = createFixture({
      name: "s",
      geometry: { kind: "strip", count: 2, spacing: 1 },
      transform: { position: [0, 5, 0], rotation: [0, 0, 90], scale: [1, 1, 1] },
      reversed: true,
    });
    expect(round(fixtureWorldPoints(f))).toEqual([
      [0, 6, 0],
      [0, 5, 0],
    ]);
  });
});
