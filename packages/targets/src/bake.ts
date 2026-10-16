/** Offline rendering ("baking") of a project into sequences for standalone playback. */
import type { Project } from "@ledlay/core";
import type { EffectRegistry } from "@ledlay/effects";
import {
  compileLayout,
  ControllerEncoder,
  controllerChannelCount,
  Renderer,
  timelineTime,
} from "@ledlay/engine";
import { FseqWriter } from "./fseq";

export interface BakeOptions {
  /** Controller to bake. FSEQ files are per-controller (each device plays its own). */
  controllerId: string;
  /** Seconds. Defaults to timeline duration (timeline mode) or 10s (live mode). */
  duration?: number;
  /** Defaults to project fps (step time is rounded to whole ms). */
  fps?: number;
  mediaFile?: string;
  onProgress?: (done: number, total: number) => void;
}

export function bakeFseq(project: Project, registry: EffectRegistry, opts: BakeOptions): Uint8Array {
  const compiled = compileLayout(project);
  const cc = compiled.controllers.find((c) => c.controller.id === opts.controllerId);
  if (!cc) throw new Error(`Unknown controller ${opts.controllerId}`);
  const renderer = new Renderer(registry, compiled);
  const encoder = new ControllerEncoder(cc);
  const fps = opts.fps ?? project.fps;
  const stepTimeMs = Math.max(1, Math.min(255, Math.round(1000 / fps)));
  const duration = opts.duration ?? (project.playback === "timeline" ? project.timeline.duration : 10);
  const frames = Math.max(1, Math.round((duration * 1000) / stepTimeMs));
  const vh = [{ code: "sp", value: "ledlay" }];
  if (opts.mediaFile) vh.push({ code: "mf", value: opts.mediaFile });
  const writer = new FseqWriter({
    channelCount: controllerChannelCount(cc),
    stepTimeMs,
    variableHeaders: vh,
  });
  const frame = renderer.createFrame();
  for (let i = 0; i < frames; i++) {
    let t = (i * stepTimeMs) / 1000;
    if (project.playback === "timeline") t = timelineTime({ ...project.timeline, loop: false }, t);
    renderer.renderProject(project, t, frame);
    writer.addFrame(encoder.encode(frame).data);
    opts.onProgress?.(i + 1, frames);
  }
  return writer.finish();
}
