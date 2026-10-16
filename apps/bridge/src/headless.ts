/** Headless playback: render a project and stream it straight to controllers (e.g. on a Pi). */
import type { Project } from "@ledlay/core";
import type { EffectRegistry } from "@ledlay/effects";
import { compileLayout, ControllerEncoder, Player, Renderer, type Clock } from "@ledlay/engine";
import { FrameSender, type UdpTransport } from "@ledlay/targets";

export interface HeadlessOptions {
  transport: UdpTransport;
  registry: EffectRegistry;
  /** Only drive these controller ids (default: all enabled). */
  controllerIds?: string[];
  /** Stop after this many seconds (default: run until stopped). */
  duration?: number;
  brightness?: number;
  clock?: Clock;
  onFrame?: (t: number) => void;
}

export interface HeadlessRun {
  stop(): void;
  readonly done: Promise<void>;
  readonly sender: FrameSender;
}

export function playHeadless(project: Project, opts: HeadlessOptions): HeadlessRun {
  const compiled = compileLayout(project);
  const renderer = new Renderer(opts.registry, compiled);
  const targets = compiled.controllers
    .filter(
      (c) => c.controller.enabled && (!opts.controllerIds || opts.controllerIds.includes(c.controller.id)),
    )
    .map((c) => ({ cc: c, enc: new ControllerEncoder(c), cpp: c.layout.outputs[0]?.channelsPerPixel ?? 3 }));
  const sender = new FrameSender(opts.transport, { sourceName: `ledlay:${project.name}` });
  const frame = renderer.createFrame();
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  const player = new Player({
    fps: project.fps,
    clock: opts.clock,
    onFrame: (t) => {
      if (opts.duration !== undefined && t >= opts.duration) {
        stop();
        return;
      }
      renderer.renderProject(project, t, frame);
      for (const { cc, enc, cpp } of targets)
        void sender.send(cc.controller, enc.encode(frame, opts.brightness ?? 1).data, cpp);
      opts.onFrame?.(t);
    },
  });
  const stop = () => {
    player.pause();
    resolveDone();
  };
  player.play();
  return { stop, done, sender };
}
