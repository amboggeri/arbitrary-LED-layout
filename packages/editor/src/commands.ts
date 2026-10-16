/**
 * Pure editing commands: (project, ...args) => new project. Structural sharing via immer,
 * so unchanged branches keep identity (cheap React re-renders, cheap undo snapshots).
 * Commands referencing unknown ids are no-ops and return the same project instance.
 */
import { produce, type Draft } from "immer";
import {
  autoPatch as coreAutoPatch,
  createController,
  createFixture,
  createLayer,
  newId,
  type Clip,
  type Controller,
  type ControllerInput,
  type Fixture,
  type FixtureInput,
  type Keyframe,
  type Layer,
  type LayerInput,
  type Param,
  type ParamValue,
  type Patch,
  type Project,
  type SceneModel,
  type Track,
  type TransformData,
} from "@ledlay/core";

type Recipe = (draft: Draft<Project>) => void;
const edit = (p: Project, recipe: Recipe): Project => produce(p, recipe);

function findIdx<T extends { id: string }>(list: readonly T[], id: string): number {
  return list.findIndex((x) => x.id === id);
}

// ---------------------------------------------------------------- project

export function setProjectMeta(
  p: Project,
  meta: Partial<Pick<Project, "name" | "units" | "fps" | "playback">>,
): Project {
  return edit(p, (d) => void Object.assign(d, meta));
}

// ---------------------------------------------------------------- fixtures

export function addFixture(p: Project, input: Omit<FixtureInput, "id"> & { id?: string }): Project {
  const f = createFixture(input);
  return edit(p, (d) => void d.fixtures.push(f as Draft<Fixture>));
}

export function updateFixture(p: Project, id: string, changes: Partial<Omit<Fixture, "id">>): Project {
  const i = findIdx(p.fixtures, id);
  if (i < 0) return p;
  return edit(p, (d) => void Object.assign(d.fixtures[i]!, changes));
}

export function setFixtureTransform(p: Project, id: string, t: Partial<TransformData>): Project {
  const i = findIdx(p.fixtures, id);
  if (i < 0) return p;
  return edit(p, (d) => void Object.assign(d.fixtures[i]!.transform, t));
}

export function removeFixtures(p: Project, ids: readonly string[]): Project {
  const set = new Set(ids);
  if (!p.fixtures.some((f) => set.has(f.id))) return p;
  return edit(p, (d) => {
    d.fixtures = d.fixtures.filter((f) => !set.has(f.id));
    // Clean dangling mask references.
    const scrub = (l: Draft<Layer>) => {
      if (l.mask) l.mask.fixtureIds = l.mask.fixtureIds.filter((x) => !set.has(x));
    };
    d.layers.forEach(scrub);
    d.timeline.tracks.forEach((t) => t.clips.forEach((c) => scrub(c.layer)));
  });
}

/** Duplicate fixtures, offsetting copies and leaving them unpatched. Returns new ids too. */
export function duplicateFixtures(
  p: Project,
  ids: readonly string[],
  offset: [number, number, number] = [0, 0, 0],
): { project: Project; newIds: string[] } {
  const newIds: string[] = [];
  const project = edit(p, (d) => {
    for (const id of ids) {
      const src = p.fixtures.find((f) => f.id === id);
      if (!src) continue;
      const copy = structuredClone(src) as Fixture;
      copy.id = newId("fx");
      copy.name = `${src.name} copy`;
      copy.patch = null;
      copy.transform.position = [
        src.transform.position[0] + offset[0],
        src.transform.position[1] + offset[1],
        src.transform.position[2] + offset[2],
      ];
      newIds.push(copy.id);
      d.fixtures.push(copy as Draft<Fixture>);
    }
  });
  return { project: newIds.length ? project : p, newIds };
}

export function patchFixture(p: Project, id: string, patch: Patch | null): Project {
  const i = findIdx(p.fixtures, id);
  if (i < 0) return p;
  return edit(p, (d) => void (d.fixtures[i]!.patch = patch));
}

export function autoPatch(p: Project, controllerId: string, output = 0): Project {
  if (findIdx(p.controllers, controllerId) < 0) return p;
  const fixtures = coreAutoPatch(p, controllerId, output);
  return edit(p, (d) => void (d.fixtures = fixtures as Draft<Fixture>[]));
}

// ---------------------------------------------------------------- controllers

export function addController(p: Project, input: Omit<ControllerInput, "id"> & { id?: string }): Project {
  const c = createController(input);
  return edit(p, (d) => void d.controllers.push(c as Draft<Controller>));
}

export function updateController(p: Project, id: string, changes: Partial<Omit<Controller, "id">>): Project {
  const i = findIdx(p.controllers, id);
  if (i < 0) return p;
  return edit(p, (d) => void Object.assign(d.controllers[i]!, changes));
}

/** Remove a controller and unpatch every fixture that pointed at it. */
export function removeController(p: Project, id: string): Project {
  if (findIdx(p.controllers, id) < 0) return p;
  return edit(p, (d) => {
    d.controllers = d.controllers.filter((c) => c.id !== id);
    for (const f of d.fixtures) if (f.patch?.controllerId === id) f.patch = null;
  });
}

// ---------------------------------------------------------------- live layers

export function addLayer(p: Project, input: Omit<LayerInput, "id"> & { id?: string }): Project {
  const l = createLayer(input);
  return edit(p, (d) => void d.layers.push(l as Draft<Layer>));
}

type LayerLocator = { layerId: string } | { clipId: string };

function locateLayer(d: Draft<Project>, loc: LayerLocator): Draft<Layer> | undefined {
  if ("layerId" in loc) return d.layers.find((l) => l.id === loc.layerId);
  for (const t of d.timeline.tracks) {
    const c = t.clips.find((c) => c.id === loc.clipId);
    if (c) return c.layer;
  }
  return undefined;
}

function hasLayer(p: Project, loc: LayerLocator): boolean {
  if ("layerId" in loc) return p.layers.some((l) => l.id === loc.layerId);
  return p.timeline.tracks.some((t) => t.clips.some((c) => c.id === loc.clipId));
}

export function updateLayer(p: Project, loc: LayerLocator, changes: Partial<Omit<Layer, "id">>): Project {
  if (!hasLayer(p, loc)) return p;
  return edit(p, (d) => void Object.assign(locateLayer(d, loc)!, changes));
}

export function removeLayer(p: Project, layerId: string): Project {
  if (findIdx(p.layers, layerId) < 0) return p;
  return edit(p, (d) => void (d.layers = d.layers.filter((l) => l.id !== layerId)));
}

export function moveLayer(p: Project, layerId: string, toIndex: number): Project {
  const from = findIdx(p.layers, layerId);
  if (from < 0) return p;
  const to = Math.max(0, Math.min(p.layers.length - 1, toIndex));
  if (from === to) return p;
  return edit(p, (d) => {
    const [l] = d.layers.splice(from, 1);
    d.layers.splice(to, 0, l!);
  });
}

/** Set a static parameter value (replacing any animation). */
export function setLayerParam(p: Project, loc: LayerLocator, key: string, value: Param): Project {
  if (!hasLayer(p, loc)) return p;
  return edit(p, (d) => void (locateLayer(d, loc)!.params[key] = value as Draft<Param>));
}

export function clearLayerParam(p: Project, loc: LayerLocator, key: string): Project {
  if (!hasLayer(p, loc)) return p;
  return edit(p, (d) => void delete locateLayer(d, loc)!.params[key]);
}

/**
 * Insert or replace a keyframe at time t. Converting a static param seeds the animation
 * with the static value at t=0 when t > 0, so turning on animation never changes the look at t=0.
 */
export function setKeyframe(
  p: Project,
  loc: LayerLocator,
  key: string,
  t: number,
  v: ParamValue,
  ease: Keyframe["ease"] = "linear",
): Project {
  if (!hasLayer(p, loc)) return p;
  return edit(p, (d) => {
    const layer = locateLayer(d, loc)!;
    const cur = layer.params[key];
    let keys: Keyframe[];
    if (cur !== undefined && typeof cur === "object" && !Array.isArray(cur) && "keyframes" in cur) {
      keys = cur.keyframes as Keyframe[];
    } else {
      keys = cur !== undefined && t > 0 ? [{ t: 0, v: cur as ParamValue, ease: "linear" }] : [];
    }
    keys = keys.filter((k) => Math.abs(k.t - t) > 1e-6);
    keys.push({ t, v, ease });
    keys.sort((a, b) => a.t - b.t);
    layer.params[key] = { keyframes: keys } as Draft<Param>;
  });
}

/** Remove the keyframe at time t; if one key remains the param becomes static. */
export function removeKeyframe(p: Project, loc: LayerLocator, key: string, t: number): Project {
  if (!hasLayer(p, loc)) return p;
  return edit(p, (d) => {
    const layer = locateLayer(d, loc)!;
    const cur = layer.params[key];
    if (!cur || typeof cur !== "object" || Array.isArray(cur) || !("keyframes" in cur)) return;
    const keys = (cur.keyframes as Keyframe[]).filter((k) => Math.abs(k.t - t) > 1e-6);
    if (keys.length === 0) delete layer.params[key];
    else if (keys.length === 1) layer.params[key] = keys[0]!.v as Draft<Param>;
    else layer.params[key] = { keyframes: keys } as Draft<Param>;
  });
}

// ---------------------------------------------------------------- timeline

export function setTimeline(
  p: Project,
  changes: Partial<Pick<Project["timeline"], "duration" | "loop">>,
): Project {
  return edit(p, (d) => void Object.assign(d.timeline, changes));
}

export function addTrack(p: Project, name = ""): { project: Project; trackId: string } {
  const trackId = newId("tr");
  const project = edit(p, (d) => void d.timeline.tracks.push({ id: trackId, name, muted: false, clips: [] }));
  return { project, trackId };
}

export function updateTrack(
  p: Project,
  id: string,
  changes: Partial<Pick<Track, "name" | "muted">>,
): Project {
  const i = findIdx(p.timeline.tracks, id);
  if (i < 0) return p;
  return edit(p, (d) => void Object.assign(d.timeline.tracks[i]!, changes));
}

export function removeTrack(p: Project, id: string): Project {
  if (findIdx(p.timeline.tracks, id) < 0) return p;
  return edit(p, (d) => void (d.timeline.tracks = d.timeline.tracks.filter((t) => t.id !== id)));
}

export interface ClipInput {
  start: number;
  duration: number;
  fadeIn?: number;
  fadeOut?: number;
  layer: Omit<LayerInput, "id"> & { id?: string };
}

export function addClip(p: Project, trackId: string, input: ClipInput): { project: Project; clipId: string } {
  const ti = findIdx(p.timeline.tracks, trackId);
  if (ti < 0) return { project: p, clipId: "" };
  const clip: Clip = {
    id: newId("clip"),
    start: Math.max(0, input.start),
    duration: Math.max(0.01, input.duration),
    fadeIn: input.fadeIn ?? 0,
    fadeOut: input.fadeOut ?? 0,
    layer: createLayer(input.layer),
  };
  const project = edit(p, (d) => {
    d.timeline.tracks[ti]!.clips.push(clip as Draft<Clip>);
    d.timeline.duration = Math.max(d.timeline.duration, clip.start + clip.duration);
  });
  return { project, clipId: clip.id };
}

function findClip(p: Project, clipId: string): [number, number] | null {
  for (let ti = 0; ti < p.timeline.tracks.length; ti++) {
    const ci = findIdx(p.timeline.tracks[ti]!.clips, clipId);
    if (ci >= 0) return [ti, ci];
  }
  return null;
}

export function updateClip(
  p: Project,
  clipId: string,
  changes: Partial<Pick<Clip, "start" | "duration" | "fadeIn" | "fadeOut">>,
): Project {
  const at = findClip(p, clipId);
  if (!at) return p;
  return edit(p, (d) => {
    const c = d.timeline.tracks[at[0]]!.clips[at[1]]!;
    Object.assign(c, changes);
    c.start = Math.max(0, c.start);
    c.duration = Math.max(0.01, c.duration);
    d.timeline.duration = Math.max(d.timeline.duration, c.start + c.duration);
  });
}

/** Move a clip to another track (keeping timing). */
export function moveClip(p: Project, clipId: string, toTrackId: string): Project {
  const at = findClip(p, clipId);
  const to = findIdx(p.timeline.tracks, toTrackId);
  if (!at || to < 0 || at[0] === to) return p;
  return edit(p, (d) => {
    const [c] = d.timeline.tracks[at[0]]!.clips.splice(at[1], 1);
    d.timeline.tracks[to]!.clips.push(c!);
  });
}

export function removeClip(p: Project, clipId: string): Project {
  const at = findClip(p, clipId);
  if (!at) return p;
  return edit(p, (d) => void d.timeline.tracks[at[0]]!.clips.splice(at[1], 1));
}

// ---------------------------------------------------------------- scene models

export function addModel(p: Project, model: Omit<SceneModel, "id"> & { id?: string }): Project {
  const m = { ...model, id: model.id ?? newId("mdl") } as SceneModel;
  return edit(p, (d) => void d.models.push(m as Draft<SceneModel>));
}

export function updateModel(p: Project, id: string, changes: Partial<Omit<SceneModel, "id">>): Project {
  const i = findIdx(p.models, id);
  if (i < 0) return p;
  return edit(p, (d) => void Object.assign(d.models[i]!, changes));
}

export function removeModel(p: Project, id: string): Project {
  if (findIdx(p.models, id) < 0) return p;
  return edit(p, (d) => void (d.models = d.models.filter((m) => m.id !== id)));
}
