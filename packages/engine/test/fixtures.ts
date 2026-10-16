import { createController, createFixture, createLayer, createProject, type ControllerInput, type Project } from "@ledlay/core";

/** Two 4-pixel strips on one controller; strip B starts at pixel 4. */
export function twoStrips(ctl: Partial<ControllerInput> = {}): Project {
  const a = createFixture({ id: "a", name: "A", geometry: { kind: "strip", count: 4, spacing: 1 }, tags: ["left"] });
  const b = createFixture({
    id: "b",
    name: "B",
    geometry: { kind: "strip", count: 4, spacing: 1 },
    transform: { position: [0, 10, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    tags: ["right"],
  });
  a.patch = { controllerId: "c", output: 0, startPixel: 0 };
  b.patch = { controllerId: "c", output: 0, startPixel: 4 };
  return createProject({
    fixtures: [a, b],
    controllers: [createController({ id: "c", name: "C", host: "127.0.0.1", ...ctl })],
    layers: [createLayer({ id: "l1", effectId: "solid", params: { color: "#ff0000" } })],
  });
}
