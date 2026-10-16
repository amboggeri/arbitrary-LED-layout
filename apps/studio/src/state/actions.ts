/** File-level actions (open/save/import/export). UI-agnostic so they can be unit-tested. */
import {
  createProject,
  fixtureWorldPoints,
  parseProjectJson,
  serializeProject,
  type Project,
  type Vec3,
} from "@ledlay/core";
import * as cmd from "@ledlay/editor";
import type { EffectRegistry } from "@ledlay/effects";
import { parsePointsCsv, parseXModel, pointsToCsv, toXModel, type CsvImportOptions } from "@ledlay/io";
import { bakeFseq } from "@ledlay/targets";
import { downloadBlob, modelFormat, pickFile, readFileAsDataUrl, safeFileName } from "./persistence";
import type { StudioStore } from "./store";

export function newProject(store: StudioStore): void {
  store
    .getState()
    .loadProject(cmd.addLayer(createProject({ name: "Untitled" }), { name: "Rainbow", effectId: "rainbow" }));
}

export function openProjectText(store: StudioStore, text: string): void {
  store.getState().loadProject(parseProjectJson(text));
}

export function saveProject(project: Project): void {
  downloadBlob(serializeProject(project), `${safeFileName(project.name)}.ledlay.json`, "application/json");
}

/** Add an imported point list as a new "points" fixture. Returns the fixture id. */
export function importPoints(store: StudioStore, name: string, points: Vec3[]): string {
  const id = `fx_import_${Date.now().toString(36)}`;
  store
    .getState()
    .apply((p) => cmd.addFixture(p, { id, name, geometry: { kind: "points", points } }), `Import ${name}`);
  store.getState().select({ kind: "fixture", ids: [id] });
  return id;
}

export function importCsvText(
  store: StudioStore,
  name: string,
  text: string,
  opts?: CsvImportOptions,
): string[] {
  const r = parsePointsCsv(text, opts);
  if (r.points.length === 0) throw new Error(r.warnings[0] ?? "No points found");
  importPoints(store, name, r.points);
  return r.warnings;
}

/** xLights models are in grid units; `unit` scales them into project units. */
export function importXModelText(store: StudioStore, text: string, unit = 10): void {
  const m = parseXModel(text);
  importPoints(
    store,
    m.name,
    m.points.map((p) => [p[0] * unit, p[1] * unit, p[2] * unit] as Vec3),
  );
}

export function exportPointsCsv(project: Project, fixtureIds?: string[]): string {
  const fx = project.fixtures.filter((f) => !fixtureIds || fixtureIds.includes(f.id));
  return pointsToCsv(fx.flatMap((f) => fixtureWorldPoints(f)));
}

export function exportXModel(project: Project, fixtureIds?: string[]): string {
  const fx = project.fixtures.filter((f) => !fixtureIds || fixtureIds.includes(f.id));
  return toXModel(
    fx.length === 1 ? fx[0]!.name : project.name,
    fx.flatMap((f) => fixtureWorldPoints(f)),
  );
}

export function exportFseq(
  project: Project,
  registry: EffectRegistry,
  controllerId: string,
  duration?: number,
): Uint8Array {
  return bakeFseq(project, registry, { controllerId, duration });
}

// ---- browser-only wrappers -------------------------------------------------------------

export async function pickAndOpenProject(store: StudioStore): Promise<void> {
  const f = await pickFile(".json,.ledlay.json,application/json");
  if (f) openProjectText(store, await f.text());
}

export async function pickAndImportModel(store: StudioStore): Promise<void> {
  const f = await pickFile(".glb,.gltf,.obj,.stl");
  if (!f) return;
  const format = modelFormat(f.name);
  if (!format) throw new Error(`Unsupported model format: ${f.name}`);
  if (f.size > 25 * 1024 * 1024)
    store.getState().notify("info", "Large model embedded in the project; autosave may be skipped.");
  const uri = await readFileAsDataUrl(f);
  store.getState().apply(
    (p) =>
      cmd.addModel(p, {
        name: f.name,
        format,
        uri,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        opacity: 0.35,
        visible: true,
      }),
    "Import model",
  );
}

export async function pickAndImportPoints(store: StudioStore): Promise<void> {
  const f = await pickFile(".csv,.txt,.xmodel");
  if (!f) return;
  const text = await f.text();
  if (f.name.toLowerCase().endsWith(".xmodel")) importXModelText(store, text);
  else {
    const warnings = importCsvText(store, f.name.replace(/\.[^.]+$/, ""), text);
    for (const w of warnings) store.getState().notify("info", w);
  }
}

/** Add a controller for a discovered device (deduplicated by host). Returns its id. */
export function addDiscoveredController(
  store: StudioStore,
  device: { name: string; host: string; kind: "wled" | "other" },
): string {
  const existing = store.getState().project.controllers.find((c) => c.host === device.host);
  if (existing) {
    store.getState().select({ kind: "controller", id: existing.id });
    return existing.id;
  }
  const id = `ctl_${device.host.replace(/[^\w]/g, "_")}`;
  store.getState().apply(
    (p) =>
      cmd.addController(p, {
        id,
        name: device.name || device.host,
        host: device.host,
        kind: device.kind === "wled" ? "wled" : "generic",
      }),
    `Add ${device.name}`,
  );
  store.getState().select({ kind: "controller", id });
  return id;
}
