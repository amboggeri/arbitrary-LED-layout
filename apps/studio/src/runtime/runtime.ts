/**
 * StudioRuntime: the non-React heart of the studio. Watches the store, recompiles the layout
 * when geometry/patching changes, drives the Player, renders frames for the 3D preview, and
 * streams encoded controller data to the bridge when output is enabled.
 */
import { channelsFor, type Controller, type Project } from "@ledlay/core";
import { createDefaultRegistry, type EffectRegistry } from "@ledlay/effects";
import { compileLayout, ControllerEncoder, Player, Renderer, type Clock, type CompiledLayout } from "@ledlay/engine";
import { BridgeClient, type BridgeStats, type LinkStatus, type RpcMethod } from "@ledlay/link";
import type { StudioStore } from "../state/store";

export interface FrameSink {
  setLayout(layout: CompiledLayout, project: Project): void;
  setColors(frame: Float32Array): void;
}

/** The subset of BridgeClient the runtime needs (lets tests inject a fake). */
export interface BridgeLike {
  readonly state: LinkStatus;
  connect(): void;
  disconnect(): void;
  setControllers(c: Controller[]): void;
  sendFrame(index: number, data: Uint8Array, cpp?: 3 | 4): boolean;
  blackout(): void;
  rpc<T = unknown>(method: RpcMethod, params?: Record<string, unknown>): Promise<T>;
}

export interface RuntimeOptions {
  registry?: EffectRegistry;
  clock?: Clock;
  createBridge?: (url: string, hooks: { onStatus(s: LinkStatus): void; onStats(s: BridgeStats): void }) => BridgeLike;
  /** How often store.time is refreshed while playing (ms). */
  uiIntervalMs?: number;
}

function cppFor(c: Controller): 3 | 4 {
  return c.outputs.every((o) => channelsFor(o.colorOrder) === 4) ? 4 : 3;
}

export class StudioRuntime {
  readonly registry: EffectRegistry;
  private compiledLayout: CompiledLayout;
  private renderer: Renderer;
  private encoders: ControllerEncoder[] = [];
  private frame: Float32Array;
  private sinks = new Set<FrameSink>();
  private player: Player;
  private bridge: BridgeLike | null = null;
  private unsubscribe: (() => void) | null = null;
  private lastUiUpdate = -Infinity;
  private frameTimes: number[] = [];
  private readonly clockNow: () => number;

  constructor(
    private readonly store: StudioStore,
    private readonly opts: RuntimeOptions = {},
  ) {
    this.registry = opts.registry ?? createDefaultRegistry();
    const project = store.getState().project;
    this.compiledLayout = compileLayout(project);
    this.renderer = new Renderer(this.registry, this.compiledLayout);
    this.frame = this.renderer.createFrame();
    this.rebuildEncoders();
    this.clockNow = opts.clock ? () => opts.clock!.now() : () => performance.now();
    this.player = new Player({ fps: project.fps, clock: opts.clock, onFrame: (t) => this.renderAt(t) });
  }

  get compiled(): CompiledLayout {
    return this.compiledLayout;
  }

  get time(): number {
    return this.player.time;
  }

  /** Latest rendered float frame (shared buffer). */
  get currentFrame(): Float32Array {
    return this.frame;
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.store.subscribe((s, prev) => {
      if (s.project !== prev.project) this.onProjectChange(s.project, prev.project);
      if (s.playing !== prev.playing) (s.playing ? this.player.play() : this.player.pause());
      if (s.output.enabled !== prev.output.enabled && !s.output.enabled) this.bridge?.blackout();
      if (s.bridge.url !== prev.bridge.url && this.bridge) this.connectBridge();
      if (s.output.masterBrightness !== prev.output.masterBrightness && !s.playing) this.renderAt(this.player.time);
    });
    this.renderAt(0);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.player.pause();
    this.bridge?.disconnect();
    this.bridge = null;
  }

  addSink(sink: FrameSink): () => void {
    this.sinks.add(sink);
    sink.setLayout(this.compiledLayout, this.store.getState().project);
    sink.setColors(this.frame);
    return () => this.sinks.delete(sink);
  }

  seek(t: number): void {
    const time = Math.max(0, t);
    this.player.seek(time);
    this.store.getState().setTime(time);
  }

  // ------------------------------------------------------------------ bridge

  connectBridge(): void {
    this.bridge?.disconnect();
    const s = this.store.getState();
    const hooks = {
      onStatus: (status: LinkStatus) => {
        this.store.getState().setBridge({ status });
        if (status === "open") this.bridge?.setControllers(this.compiledLayout.controllers.map((c) => c.controller));
      },
      onStats: (stats: BridgeStats) => this.store.getState().setBridge({ stats }),
    };
    this.bridge = this.opts.createBridge
      ? this.opts.createBridge(s.bridge.url, hooks)
      : new BridgeClient({ url: s.bridge.url, ...hooks });
    this.bridge.setControllers(this.compiledLayout.controllers.map((c) => c.controller));
    this.bridge.connect();
  }

  disconnectBridge(): void {
    this.bridge?.disconnect();
    this.bridge = null;
    this.store.getState().setBridge({ status: "closed", stats: null });
  }

  rpc<T = unknown>(method: RpcMethod, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.bridge) return Promise.reject(new Error("Not connected to a bridge. Start it with `pnpm bridge`."));
    return this.bridge.rpc<T>(method, params);
  }

  // ------------------------------------------------------------------ internals

  private rebuildEncoders() {
    this.encoders = this.compiledLayout.controllers.map((c) => new ControllerEncoder(c));
  }

  private onProjectChange(next: Project, prev: Project) {
    const layoutChanged = next.fixtures !== prev.fixtures || next.controllers !== prev.controllers;
    if (layoutChanged) {
      this.compiledLayout = compileLayout(next);
      this.renderer.setLayout(this.compiledLayout);
      this.frame = this.renderer.createFrame();
      this.rebuildEncoders();
      for (const s of this.sinks) s.setLayout(this.compiledLayout, next);
      if (next.controllers !== prev.controllers) this.bridge?.setControllers(next.controllers);
    } else if (next.models !== prev.models) {
      for (const s of this.sinks) s.setLayout(this.compiledLayout, next);
    }
    if (next.fps !== prev.fps) this.player.fps = next.fps;
    const live = [...next.layers.map((l) => l.id), ...next.timeline.tracks.flatMap((t) => t.clips.map((c) => c.layer.id))];
    this.renderer.prune(live);
    if (!this.store.getState().playing) this.renderAt(this.player.time);
  }

  private renderAt(t: number) {
    const state = this.store.getState();
    this.renderer.renderProject(state.project, t, this.frame);
    for (const s of this.sinks) s.setColors(this.frame);

    if (state.output.enabled && this.bridge?.state === "open") {
      this.encoders.forEach((enc, i) => {
        const c = enc.compiled.controller;
        if (!c.enabled || !c.host) return;
        const { data } = enc.encode(this.frame, state.output.masterBrightness);
        this.bridge!.sendFrame(i, data, cppFor(c));
      });
    }

    const now = this.clockNow();
    this.frameTimes.push(now);
    while (this.frameTimes.length > 0 && now - this.frameTimes[0]! > 1000) this.frameTimes.shift();
    if (now - this.lastUiUpdate >= (this.opts.uiIntervalMs ?? 100) || !state.playing) {
      this.lastUiUpdate = now;
      state.setTime(t);
      state.setFps(state.playing ? this.frameTimes.length : 0);
      state.setLayerErrors(Object.fromEntries(this.renderer.errors));
    }
  }
}
