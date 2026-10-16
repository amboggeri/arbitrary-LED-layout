import { describe, expect, it } from "vitest";
import { createProject, parseProject, validatePatch, type Project } from "@ledlay/core";
import * as cmd from "../src";

function base(): Project {
  let p = createProject();
  p = cmd.addController(p, { id: "c", name: "C", host: "h" });
  p = cmd.addFixture(p, { id: "a", name: "A", geometry: { kind: "strip", count: 5, spacing: 1 } });
  p = cmd.addFixture(p, { id: "b", name: "B", geometry: { kind: "strip", count: 3, spacing: 1 } });
  p = cmd.addLayer(p, {
    id: "l1",
    effectId: "solid",
    mask: { fixtureIds: ["a", "b"], tags: [], invert: false },
  });
  p = cmd.addLayer(p, { id: "l2", effectId: "rainbow" });
  return p;
}

/** Every command result must still be a valid project. */
function valid(p: Project): Project {
  expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  return p;
}

describe("unknown ids are no-ops returning the same instance", () => {
  const p = base();
  const cases: [string, (p: Project) => Project][] = [
    ["updateFixture", (p) => cmd.updateFixture(p, "x", { name: "n" })],
    ["setFixtureTransform", (p) => cmd.setFixtureTransform(p, "x", {})],
    ["removeFixtures", (p) => cmd.removeFixtures(p, ["x"])],
    ["patchFixture", (p) => cmd.patchFixture(p, "x", null)],
    ["autoPatch", (p) => cmd.autoPatch(p, "x")],
    ["updateController", (p) => cmd.updateController(p, "x", {})],
    ["removeController", (p) => cmd.removeController(p, "x")],
    ["updateLayer", (p) => cmd.updateLayer(p, { layerId: "x" }, {})],
    ["removeLayer", (p) => cmd.removeLayer(p, "x")],
    ["moveLayer", (p) => cmd.moveLayer(p, "x", 0)],
    ["setLayerParam", (p) => cmd.setLayerParam(p, { clipId: "x" }, "k", 1)],
    ["clearLayerParam", (p) => cmd.clearLayerParam(p, { layerId: "x" }, "k")],
    ["setKeyframe", (p) => cmd.setKeyframe(p, { layerId: "x" }, "k", 0, 1)],
    ["removeKeyframe", (p) => cmd.removeKeyframe(p, { layerId: "x" }, "k", 0)],
    ["updateTrack", (p) => cmd.updateTrack(p, "x", {})],
    ["removeTrack", (p) => cmd.removeTrack(p, "x")],
    ["updateClip", (p) => cmd.updateClip(p, "x", {})],
    ["moveClip", (p) => cmd.moveClip(p, "x", "y")],
    ["removeClip", (p) => cmd.removeClip(p, "x")],
    ["updateModel", (p) => cmd.updateModel(p, "x", {})],
    ["removeModel", (p) => cmd.removeModel(p, "x")],
    ["addClip", (p) => cmd.addClip(p, "x", { start: 0, duration: 1, layer: { effectId: "solid" } }).project],
    ["duplicateFixtures", (p) => cmd.duplicateFixtures(p, ["x"]).project],
  ];
  for (const [name, fn] of cases) it(name, () => expect(fn(p)).toBe(p));
});

describe("fixtures", () => {
  it("updates without mutating the original and shares untouched branches", () => {
    const p = base();
    const q = cmd.updateFixture(p, "a", { name: "Renamed" });
    expect(p.fixtures[0]!.name).toBe("A");
    expect(q.fixtures[0]!.name).toBe("Renamed");
    expect(q.fixtures[1]).toBe(p.fixtures[1]);
    expect(q.controllers).toBe(p.controllers);
    valid(q);
  });

  it("sets partial transforms", () => {
    const q = cmd.setFixtureTransform(base(), "a", { position: [1, 2, 3] });
    expect(q.fixtures[0]!.transform).toEqual({ position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] });
  });

  it("removes fixtures and scrubs mask references", () => {
    const q = valid(cmd.removeFixtures(base(), ["a"]));
    expect(q.fixtures.map((f) => f.id)).toEqual(["b"]);
    expect(q.layers[0]!.mask!.fixtureIds).toEqual(["b"]);
  });

  it("scrubs masks inside timeline clips too", () => {
    let p = base();
    const t = cmd.addTrack(p, "T");
    p = cmd.addClip(t.project, t.trackId, {
      start: 0,
      duration: 1,
      layer: { effectId: "solid", mask: { fixtureIds: ["a"], tags: [], invert: false } },
    }).project;
    p = cmd.removeFixtures(p, ["a"]);
    expect(p.timeline.tracks[0]!.clips[0]!.layer.mask!.fixtureIds).toEqual([]);
  });

  it("duplicates with offset and no patch", () => {
    const p = cmd.patchFixture(base(), "a", { controllerId: "c", output: 0, startPixel: 0 });
    const { project, newIds } = cmd.duplicateFixtures(p, ["a"], [10, 0, 0]);
    expect(newIds).toHaveLength(1);
    const copy = project.fixtures.find((f) => f.id === newIds[0])!;
    expect(copy.name).toBe("A copy");
    expect(copy.patch).toBeNull();
    expect(copy.transform.position).toEqual([10, 0, 0]);
    valid(project);
  });

  it("patches and auto-patches", () => {
    let p = cmd.patchFixture(base(), "a", { controllerId: "c", output: 0, startPixel: 0 });
    p = valid(cmd.autoPatch(p, "c"));
    expect(p.fixtures[1]!.patch).toEqual({ controllerId: "c", output: 0, startPixel: 5 });
    expect(validatePatch(p)).toEqual([]);
    expect(cmd.patchFixture(p, "a", null).fixtures[0]!.patch).toBeNull();
  });
});

describe("controllers", () => {
  it("updates and removes, unpatching fixtures", () => {
    let p = cmd.autoPatch(base(), "c");
    p = cmd.updateController(p, "c", { host: "10.0.0.1", protocol: "e131" });
    expect(p.controllers[0]).toMatchObject({ host: "10.0.0.1", protocol: "e131" });
    p = valid(cmd.removeController(p, "c"));
    expect(p.controllers).toEqual([]);
    expect(p.fixtures.every((f) => f.patch === null)).toBe(true);
  });
});

describe("layers", () => {
  it("updates, reorders and removes", () => {
    let p = base();
    p = cmd.updateLayer(p, { layerId: "l1" }, { opacity: 0.5, blend: "add" });
    expect(p.layers[0]).toMatchObject({ opacity: 0.5, blend: "add" });
    p = cmd.moveLayer(p, "l1", 99);
    expect(p.layers.map((l) => l.id)).toEqual(["l2", "l1"]);
    expect(cmd.moveLayer(p, "l1", 1)).toBe(p);
    p = valid(cmd.removeLayer(p, "l2"));
    expect(p.layers.map((l) => l.id)).toEqual(["l1"]);
  });

  it("sets and clears params", () => {
    let p = cmd.setLayerParam(base(), { layerId: "l1" }, "color", "#00ff00");
    expect(p.layers[0]!.params.color).toBe("#00ff00");
    p = cmd.clearLayerParam(p, { layerId: "l1" }, "color");
    expect(p.layers[0]!.params.color).toBeUndefined();
  });

  it("keyframes: seeds from static value, replaces same time, sorts, collapses", () => {
    let p = cmd.setLayerParam(base(), { layerId: "l2" }, "speed", 1);
    p = cmd.setKeyframe(p, { layerId: "l2" }, "speed", 2, 3);
    expect(p.layers[1]!.params.speed).toEqual({
      keyframes: [
        { t: 0, v: 1, ease: "linear" },
        { t: 2, v: 3, ease: "linear" },
      ],
    });
    p = cmd.setKeyframe(p, { layerId: "l2" }, "speed", 1, 5, "easeIn");
    p = cmd.setKeyframe(p, { layerId: "l2" }, "speed", 2, 4);
    expect(
      (p.layers[1]!.params.speed as { keyframes: { t: number; v: unknown }[] }).keyframes.map((k) => [
        k.t,
        k.v,
      ]),
    ).toEqual([
      [0, 1],
      [1, 5],
      [2, 4],
    ]);
    valid(p);
    p = cmd.removeKeyframe(p, { layerId: "l2" }, "speed", 1);
    p = cmd.removeKeyframe(p, { layerId: "l2" }, "speed", 0);
    expect(p.layers[1]!.params.speed).toBe(4);
    expect(cmd.removeKeyframe(p, { layerId: "l2" }, "speed", 0)).toEqual(p); // static: nothing to remove
    // single key on a fresh param at t>0 without a static value
    p = cmd.setKeyframe(p, { layerId: "l2" }, "scale", 3, 2);
    expect(p.layers[1]!.params.scale).toEqual({ keyframes: [{ t: 3, v: 2, ease: "linear" }] });
    p = cmd.removeKeyframe(p, { layerId: "l2" }, "scale", 3);
    expect(p.layers[1]!.params.scale).toBeUndefined();
  });
});

describe("timeline", () => {
  it("adds tracks and clips, extends duration, updates, moves and removes", () => {
    let p = cmd.setTimeline(base(), { duration: 10, loop: false });
    const t1 = cmd.addTrack(p, "One");
    const t2 = cmd.addTrack(t1.project, "Two");
    p = t2.project;
    const added = cmd.addClip(p, t1.trackId, {
      start: 8,
      duration: 5,
      fadeIn: 1,
      layer: { effectId: "solid" },
    });
    p = valid(added.project);
    expect(p.timeline.duration).toBe(13);
    p = cmd.updateClip(p, added.clipId, { start: -5, duration: 0 });
    const clip = p.timeline.tracks[0]!.clips[0]!;
    expect([clip.start, clip.duration]).toEqual([0, 0.01]);
    p = cmd.updateLayer(p, { clipId: added.clipId }, { opacity: 0.3 });
    expect(p.timeline.tracks[0]!.clips[0]!.layer.opacity).toBe(0.3);
    p = cmd.setLayerParam(p, { clipId: added.clipId }, "color", "#123456");
    p = cmd.moveClip(p, added.clipId, t2.trackId);
    expect(p.timeline.tracks[1]!.clips).toHaveLength(1);
    expect(cmd.moveClip(p, added.clipId, t2.trackId)).toBe(p);
    p = cmd.updateTrack(p, t2.trackId, { muted: true });
    expect(p.timeline.tracks[1]!.muted).toBe(true);
    p = cmd.removeClip(p, added.clipId);
    expect(p.timeline.tracks[1]!.clips).toHaveLength(0);
    p = valid(cmd.removeTrack(p, t1.trackId));
    expect(p.timeline.tracks.map((t) => t.name)).toEqual(["Two"]);
  });
});

describe("models and meta", () => {
  it("manages scene models", () => {
    let p = cmd.addModel(base(), {
      name: "house",
      format: "glb",
      uri: "data:,",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      opacity: 0.3,
      visible: true,
    });
    const id = p.models[0]!.id;
    expect(id).toMatch(/^mdl_/);
    p = cmd.updateModel(p, id, { visible: false });
    expect(p.models[0]!.visible).toBe(false);
    p = valid(cmd.removeModel(p, id));
    expect(p.models).toEqual([]);
  });

  it("sets project meta", () => {
    const p = cmd.setProjectMeta(base(), { name: "X", fps: 60, playback: "timeline", units: "m" });
    expect(p).toMatchObject({ name: "X", fps: 60, playback: "timeline", units: "m" });
  });
});
