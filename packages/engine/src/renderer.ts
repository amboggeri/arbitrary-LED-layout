/** Renders layer stacks / timelines into a float RGB frame over the compiled pixel space. */
import type { Layer, Mask, Project } from "@ledlay/core";
import { resolveParams, type AnyEffect, type EffectRegistry } from "@ledlay/effects";
import { evaluateParams } from "./animate";
import { blendInto } from "./blend";
import type { CompiledLayout } from "./compile";
import { activeClips } from "./timeline";

interface LayerRuntime {
  effect: AnyEffect;
  state: unknown;
  lastTime: number;
  frame: number;
}

export interface RenderItem {
  layer: Layer;
  /** Time used for keyframes (seconds since layer/clip start). */
  localTime: number;
}

export class Renderer {
  private runtimes = new Map<string, LayerRuntime>();
  private masks = new Map<string, Uint8Array | null>();
  private scratch: Float32Array;
  /** Last error per layer id (unknown effect, script error...). */
  readonly errors = new Map<string, string>();

  constructor(
    readonly registry: EffectRegistry,
    private layout: CompiledLayout,
  ) {
    this.scratch = new Float32Array(layout.space.count * 3);
  }

  get compiled(): CompiledLayout {
    return this.layout;
  }

  /** Swap in a recompiled layout. Effect state is re-initialised lazily. */
  setLayout(layout: CompiledLayout): void {
    this.layout = layout;
    this.scratch = new Float32Array(layout.space.count * 3);
    this.runtimes.clear();
    this.masks.clear();
  }

  /** Drop runtime state for layers that no longer exist. */
  prune(liveIds: Iterable<string>): void {
    const keep = new Set(liveIds);
    for (const id of this.runtimes.keys()) if (!keep.has(id)) this.runtimes.delete(id);
  }

  createFrame(): Float32Array {
    return new Float32Array(this.layout.space.count * 3);
  }

  maskFor(mask: Mask | null): Uint8Array | null {
    if (!mask || (mask.fixtureIds.length === 0 && mask.tags.length === 0)) {
      return mask?.invert ? new Uint8Array(this.layout.space.count) : null;
    }
    const key = JSON.stringify(mask);
    if (this.masks.has(key)) return this.masks.get(key)!;
    const m = new Uint8Array(this.layout.space.count);
    const ids = new Set(mask.fixtureIds);
    for (const f of this.layout.fixtures) {
      const byId = ids.size === 0 || ids.has(f.id);
      const byTag = mask.tags.length === 0 || f.tags.some((t) => mask.tags.includes(t));
      let hit = byId && byTag;
      if (mask.invert) hit = !hit;
      if (hit) m.fill(1, f.offset, f.offset + f.count);
    }
    this.masks.set(key, m);
    return m;
  }

  private runtimeFor(layer: Layer): LayerRuntime | null {
    const effect = this.registry.get(layer.effectId);
    if (!effect) {
      this.errors.set(layer.id, `Unknown effect "${layer.effectId}"`);
      return null;
    }
    let rt = this.runtimes.get(layer.id);
    if (!rt || rt.effect !== effect) {
      const params = resolveParams(effect.params, evaluateParams(layer.params, 0));
      rt = { effect, state: effect.init?.(this.layout.space, params), lastTime: NaN, frame: 0 };
      this.runtimes.set(layer.id, rt);
    }
    return rt;
  }

  /** Composite items bottom-up into `out` (cleared to black first). */
  render(items: readonly RenderItem[], out: Float32Array = this.createFrame()): Float32Array {
    out.fill(0);
    const space = this.layout.space;
    if (space.count === 0) return out;
    for (const { layer, localTime } of items) {
      if (!layer.enabled || layer.opacity <= 0) continue;
      const rt = this.runtimeFor(layer);
      if (!rt) continue;
      const time = localTime * layer.speed;
      const dtRaw = time - rt.lastTime;
      const dt = Number.isFinite(dtRaw) && dtRaw >= 0 && dtRaw < 1 ? dtRaw : 0;
      const params = resolveParams(rt.effect.params, evaluateParams(layer.params, localTime));
      this.scratch.fill(0);
      try {
        rt.effect.render({ time, dt, frame: rt.frame, params, space, state: rt.state }, this.scratch);
        const stateErr = (rt.state as { error?: unknown } | undefined)?.error;
        if (typeof stateErr === "string" && stateErr) this.errors.set(layer.id, stateErr);
        else this.errors.delete(layer.id);
      } catch (e) {
        this.errors.set(layer.id, (e as Error).message);
        continue;
      }
      rt.lastTime = time;
      rt.frame++;
      blendInto(out, this.scratch, layer.blend, layer.opacity, this.maskFor(layer.mask));
    }
    return out;
  }

  /** Render live layers at show time t. */
  renderLayers(layers: readonly Layer[], t: number, out?: Float32Array): Float32Array {
    return this.render(
      layers.map((layer) => ({ layer, localTime: t })),
      out,
    );
  }

  /** Render a project in its current playback mode. */
  renderProject(project: Project, t: number, out?: Float32Array): Float32Array {
    if (project.playback === "timeline") {
      const items = activeClips(project.timeline, t).map((a) => ({ layer: a.layer, localTime: a.localTime }));
      return this.render(items, out);
    }
    return this.renderLayers(project.layers, t, out);
  }
}
