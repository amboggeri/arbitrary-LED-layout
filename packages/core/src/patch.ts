/**
 * Patching: how fixtures map onto controller outputs and the controller's flat pixel space.
 * A controller's pixel space is its outputs concatenated in order (this matches WLED's
 * global LED index across buses and how DDP/E1.31 address a device).
 */
import { channelsFor } from "./color";
import { ledCount } from "./fixtures";
import type { Controller, Fixture, Project } from "./model";

export interface OutputRange {
  /** Index of this output on its controller. */
  output: number;
  /** First pixel of this output in the controller's flat pixel space. */
  offset: number;
  length: number;
  channelsPerPixel: 3 | 4;
}

export interface ControllerLayout {
  controllerId: string;
  outputs: OutputRange[];
  totalPixels: number;
  totalChannels: number;
}

export function computeControllerLayout(controller: Controller, fixtures: readonly Fixture[]): ControllerLayout {
  const outputs: OutputRange[] = [];
  let offset = 0;
  let totalChannels = 0;
  controller.outputs.forEach((out, idx) => {
    let length = out.pixelCount;
    if (length === 0) {
      for (const f of fixtures) {
        if (f.patch?.controllerId === controller.id && f.patch.output === idx) {
          length = Math.max(length, f.patch.startPixel + ledCount(f.geometry));
        }
      }
    }
    const channelsPerPixel = channelsFor(out.colorOrder);
    outputs.push({ output: idx, offset, length, channelsPerPixel });
    offset += length;
    totalChannels += length * channelsPerPixel;
  });
  return { controllerId: controller.id, outputs, totalPixels: offset, totalChannels };
}

export type IssueSeverity = "error" | "warning";

export interface PatchIssue {
  severity: IssueSeverity;
  message: string;
  fixtureId?: string;
  controllerId?: string;
}

/** Static checks a user should see before sending to hardware. */
export function validatePatch(project: Project): PatchIssue[] {
  const issues: PatchIssue[] = [];
  const controllers = new Map(project.controllers.map((c) => [c.id, c]));

  const seen = new Set<string>();
  for (const f of project.fixtures) {
    if (seen.has(f.id)) issues.push({ severity: "error", message: `Duplicate fixture id ${f.id}`, fixtureId: f.id });
    seen.add(f.id);
  }

  // Per controller-output occupied ranges.
  const ranges = new Map<string, { start: number; end: number; fixture: Fixture }[]>();
  for (const f of project.fixtures) {
    if (!f.patch) continue;
    const c = controllers.get(f.patch.controllerId);
    if (!c) {
      issues.push({ severity: "error", message: `${f.name}: patched to a missing controller`, fixtureId: f.id });
      continue;
    }
    const out = c.outputs[f.patch.output];
    if (!out) {
      issues.push({
        severity: "error",
        message: `${f.name}: output ${f.patch.output + 1} does not exist on ${c.name}`,
        fixtureId: f.id,
        controllerId: c.id,
      });
      continue;
    }
    const start = f.patch.startPixel;
    const end = start + ledCount(f.geometry);
    if (out.pixelCount > 0 && end > out.pixelCount) {
      issues.push({
        severity: "error",
        message: `${f.name}: needs pixels ${start}-${end - 1} but ${c.name} output ${f.patch.output + 1} has ${out.pixelCount}`,
        fixtureId: f.id,
        controllerId: c.id,
      });
    }
    const key = `${c.id}#${f.patch.output}`;
    const list = ranges.get(key) ?? [];
    for (const r of list) {
      if (start < r.end && r.start < end) {
        issues.push({
          severity: "warning",
          message: `${f.name} overlaps ${r.fixture.name} on ${c.name} output ${f.patch.output + 1}`,
          fixtureId: f.id,
          controllerId: c.id,
        });
      }
    }
    list.push({ start, end, fixture: f });
    ranges.set(key, list);
  }

  for (const c of project.controllers) {
    if (!c.enabled) continue;
    if (!c.host) issues.push({ severity: "warning", message: `${c.name}: no host/IP set`, controllerId: c.id });
    const layout = computeControllerLayout(c, project.fixtures);
    if (layout.totalPixels === 0) {
      issues.push({ severity: "warning", message: `${c.name}: no fixtures patched`, controllerId: c.id });
    }
    if (c.protocol !== "ddp") {
      const universes = Math.ceil(layout.totalChannels / c.channelsPerUniverse);
      const max = c.protocol === "e131" ? 63999 : 32767;
      if (c.universeStart + universes - 1 > max) {
        issues.push({ severity: "error", message: `${c.name}: universe range exceeds ${max}`, controllerId: c.id });
      }
    }
  }
  for (const f of project.fixtures) {
    if (!f.patch) issues.push({ severity: "warning", message: `${f.name}: not patched to a controller`, fixtureId: f.id });
  }
  return issues;
}

/**
 * Auto-patch: append every unpatched fixture to the end of the given controller output,
 * in project order. Returns a new fixtures array.
 */
export function autoPatch(project: Project, controllerId: string, output = 0): Fixture[] {
  const controller = project.controllers.find((c) => c.id === controllerId);
  if (!controller) throw new Error(`Unknown controller ${controllerId}`);
  let next = 0;
  for (const f of project.fixtures) {
    if (f.patch?.controllerId === controllerId && f.patch.output === output) {
      next = Math.max(next, f.patch.startPixel + ledCount(f.geometry));
    }
  }
  return project.fixtures.map((f) => {
    if (f.patch) return f;
    const patched = { ...f, patch: { controllerId, output, startPixel: next } };
    next += ledCount(f.geometry);
    return patched;
  });
}

export function totalLedCount(project: Project): number {
  return project.fixtures.reduce((n, f) => n + ledCount(f.geometry), 0);
}
