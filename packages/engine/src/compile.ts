/**
 * Compile a project into flat lookup structures for rendering and output.
 * Recompile whenever fixtures/controllers change; reuse between frames.
 */
import {
  channelsFor,
  computeControllerLayout,
  fixtureWorldPoints,
  getLedType,
  type Controller,
  type ControllerLayout,
  type Project,
} from "@ledlay/core";
import { createPixelSpace, type PixelSpace } from "@ledlay/effects";

export interface CompiledFixture {
  id: string;
  /** First global pixel index of this fixture. */
  offset: number;
  count: number;
  tags: readonly string[];
}

export interface CompiledController {
  controller: Controller;
  layout: ControllerLayout;
  /** For each controller pixel slot, the global pixel index feeding it (or -1 = unpatched/black). */
  route: Int32Array;
  /** Per slot: index of the output it belongs to. */
  slotOutput: Uint16Array;
  /** Per slot: mA per channel at full brightness (for power limiting). */
  slotMa: Float32Array;
}

export interface CompiledLayout {
  space: PixelSpace;
  fixtures: CompiledFixture[];
  fixtureIndex: Map<string, number>;
  controllers: CompiledController[];
}

export function compileLayout(project: Project): CompiledLayout {
  const xyz: number[] = [];
  const fixtureOf: number[] = [];
  const indexIn: number[] = [];
  const fixtures: CompiledFixture[] = [];
  const fixtureIndex = new Map<string, number>();

  project.fixtures.forEach((f, fi) => {
    const pts = fixtureWorldPoints(f);
    fixtures.push({ id: f.id, offset: xyz.length / 3, count: pts.length, tags: f.tags });
    fixtureIndex.set(f.id, fi);
    pts.forEach((p, i) => {
      xyz.push(p[0], p[1], p[2]);
      fixtureOf.push(fi);
      indexIn.push(i);
    });
  });
  const space = createPixelSpace({ xyz, fixture: fixtureOf, indexInFixture: indexIn });

  const controllers: CompiledController[] = project.controllers.map((controller) => {
    const layout = computeControllerLayout(controller, project.fixtures);
    const route = new Int32Array(layout.totalPixels).fill(-1);
    const slotOutput = new Uint16Array(layout.totalPixels);
    const slotMa = new Float32Array(layout.totalPixels);
    for (const o of layout.outputs) slotOutput.fill(o.output, o.offset, o.offset + o.length);
    project.fixtures.forEach((f, fi) => {
      const patch = f.patch;
      if (!patch || patch.controllerId !== controller.id) return;
      const out = layout.outputs[patch.output];
      if (!out) return;
      const cf = fixtures[fi]!;
      const ma = getLedType(f.ledTypeId).maPerChannel;
      for (let i = 0; i < cf.count; i++) {
        const slotInOutput: number = patch.startPixel + i;
        if (slotInOutput >= out.length) break; // overflow: validatePatch reports it
        const slot = out.offset + slotInOutput;
        route[slot] = cf.offset + i;
        slotMa[slot] = ma;
      }
    });
    return { controller, layout, route, slotOutput, slotMa };
  });

  return { space, fixtures, fixtureIndex, controllers };
}

/** Channel count for a compiled controller's byte buffer. */
export function controllerChannelCount(c: CompiledController): number {
  return c.layout.outputs.reduce((n, o) => n + o.length * channelsFor(c.controller.outputs[o.output]!.colorOrder), 0);
}
