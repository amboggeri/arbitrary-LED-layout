/** Ready-made fixture and project templates for quick starts and demos. */
import {
  createController,
  createFixture,
  createLayer,
  createProject,
  ledCount,
  type Fixture,
  type Project,
  type Vec3,
} from "@ledlay/core";

export type FixtureTemplateId = "strip" | "ring" | "matrix" | "cube" | "polyline" | "helix";

export interface FixtureTemplate {
  id: FixtureTemplateId;
  label: string;
  make(at?: Vec3): Fixture;
}

const at3 = (p?: Vec3) => ({
  position: p ?? ([0, 0, 0] as Vec3),
  rotation: [0, 0, 0] as Vec3,
  scale: [1, 1, 1] as Vec3,
});

/** Helix polyline points — handy for "tree" wraps. */
export function helixPoints(turns: number, radius: number, height: number, segmentsPerTurn = 24): Vec3[] {
  const n = Math.max(2, Math.round(turns * segmentsPerTurn) + 1);
  return Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1);
    const a = f * turns * Math.PI * 2;
    const r = radius * (1 - f * 0.85); // taper towards the top
    return [Math.cos(a) * r, f * height, Math.sin(a) * r] as Vec3;
  });
}

export const FIXTURE_TEMPLATES: readonly FixtureTemplate[] = [
  {
    id: "strip",
    label: "Strip (60 LEDs/m, 1 m)",
    make: (p) =>
      createFixture({
        name: "Strip",
        geometry: { kind: "strip", count: 60, spacing: 16.667 },
        transform: at3(p),
      }),
  },
  {
    id: "ring",
    label: "Ring (24 LEDs)",
    make: (p) =>
      createFixture({ name: "Ring", geometry: { kind: "ring", count: 24, radius: 80 }, transform: at3(p) }),
  },
  {
    id: "matrix",
    label: "Matrix 16×16",
    make: (p) =>
      createFixture({
        name: "Matrix",
        geometry: { kind: "matrix", cols: 16, rows: 16, spacingX: 10, spacingY: 10 },
        transform: at3(p),
      }),
  },
  {
    id: "cube",
    label: "Cube 8×8×8",
    make: (p) =>
      createFixture({
        name: "Cube",
        geometry: { kind: "cube", nx: 8, ny: 8, nz: 8, spacing: 30 },
        transform: at3(p),
      }),
  },
  {
    id: "polyline",
    label: "Path (draw on model)",
    make: (p) =>
      createFixture({
        name: "Path",
        geometry: {
          kind: "polyline",
          points: [
            [0, 0, 0],
            [300, 0, 0],
          ],
          spacing: 16.667,
        },
        transform: at3(p),
      }),
  },
  {
    id: "helix",
    label: "Tree wrap (helix)",
    make: (p) =>
      createFixture({
        name: "Tree",
        geometry: { kind: "polyline", points: helixPoints(8, 400, 1800), spacing: 33 },
        transform: at3(p),
      }),
  },
];

/** A small but complete demo project: tree, ring and matrix on one WLED, a few layers. */
export function demoProject(): Project {
  const ctl = createController({ id: "wled1", name: "WLED", host: "", protocol: "ddp" });
  const tree = createFixture({
    id: "tree",
    name: "Tree",
    geometry: { kind: "polyline", points: helixPoints(8, 400, 1800), spacing: 33 },
    tags: ["tree"],
  });
  const ring = createFixture({
    id: "ring",
    name: "Star ring",
    geometry: { kind: "ring", count: 24, radius: 120 },
    transform: { position: [0, 1950, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    tags: ["star"],
  });
  const floor = createFixture({
    id: "floor",
    name: "Floor matrix",
    geometry: { kind: "matrix", cols: 16, rows: 16, spacingX: 60, spacingY: 60 },
    transform: { position: [-450, 0, 450], rotation: [-90, 0, 0], scale: [1, 1, 1] },
    tags: ["floor"],
  });
  let start = 0;
  for (const f of [tree, ring, floor]) {
    f.patch = { controllerId: ctl.id, output: 0, startPixel: start };
    start += ledCount(f.geometry);
  }
  return createProject({
    name: "Demo",
    fixtures: [tree, ring, floor],
    controllers: [ctl],
    layers: [
      createLayer({ name: "Base", effectId: "spiral", params: {} }),
      createLayer({
        name: "Star",
        effectId: "twinkle",
        params: { density: 0.5 },
        mask: { fixtureIds: [], tags: ["star"], invert: false },
      }),
      createLayer({
        name: "Orb",
        effectId: "orb",
        blend: "add",
        opacity: 0.8,
        params: { color: "#66ccff", orbitRadius: 0.8 },
      }),
    ],
  });
}
