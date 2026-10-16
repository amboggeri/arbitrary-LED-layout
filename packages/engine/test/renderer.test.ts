import { describe, expect, it } from "vitest";
import { createLayer, createProject, timelineSchema } from "@ledlay/core";
import { createDefaultRegistry, defineEffect, EffectRegistry, solid } from "@ledlay/effects";
import { compileLayout, Renderer } from "../src";
import { twoStrips } from "./fixtures";

const registry = createDefaultRegistry();

describe("Renderer", () => {
  it("renders live layers", () => {
    const p = twoStrips();
    const r = new Renderer(registry, compileLayout(p));
    const out = r.renderProject(p, 0);
    expect(out.length).toBe(24);
    expect([...out.subarray(0, 3)]).toEqual([1, 0, 0]);
  });

  it("composites with blend modes, opacity, and masks", () => {
    const p = twoStrips();
    p.layers.push(
      createLayer({
        id: "l2",
        effectId: "solid",
        params: { color: "#0000ff" },
        blend: "add",
        mask: { fixtureIds: [], tags: ["right"], invert: false },
      }),
    );
    const out = new Renderer(registry, compileLayout(p)).renderProject(p, 0);
    expect([...out.subarray(0, 3)]).toEqual([1, 0, 0]);
    expect([...out.subarray(12, 15)]).toEqual([1, 0, 1]);
  });

  it("supports mask by fixture id, inverted masks and empty-inverted masks", () => {
    const p = twoStrips();
    const r = new Renderer(registry, compileLayout(p));
    expect([...r.maskFor({ fixtureIds: ["a"], tags: [], invert: false })!]).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
    expect([...r.maskFor({ fixtureIds: ["a"], tags: [], invert: true })!]).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect([...r.maskFor({ fixtureIds: [], tags: [], invert: true })!]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.maskFor(null)).toBeNull();
    expect(r.maskFor({ fixtureIds: ["a"], tags: [], invert: false })).toBe(r.maskFor({ fixtureIds: ["a"], tags: [], invert: false }));
  });

  it("skips disabled layers and reports unknown effects", () => {
    const p = twoStrips();
    p.layers[0]!.enabled = false;
    p.layers.push(createLayer({ id: "bad", effectId: "does-not-exist" }));
    const r = new Renderer(registry, compileLayout(p));
    expect(r.renderProject(p, 0).every((v) => v === 0)).toBe(true);
    expect(r.errors.get("bad")).toMatch(/Unknown effect/);
  });

  it("captures effect exceptions and script errors per layer", () => {
    const boom = defineEffect({
      id: "boom",
      name: "Boom",
      category: "custom",
      description: "throws",
      params: {},
      render() {
        throw new Error("kaboom");
      },
    });
    const reg = new EffectRegistry([solid, boom, registry.require("script")]);
    const p = twoStrips();
    p.layers = [
      createLayer({ id: "x", effectId: "boom" }),
      createLayer({ id: "s", effectId: "script", params: { code: "return (" } }),
    ];
    const r = new Renderer(reg, compileLayout(p));
    r.renderProject(p, 0);
    expect(r.errors.get("x")).toBe("kaboom");
    expect(r.errors.get("s")).toBeTruthy();
    p.layers[1]!.params.code = "return 1";
    r.renderProject(p, 0);
    expect(r.errors.has("s")).toBe(false);
  });

  it("passes dt and frame counters and keeps state per layer", () => {
    const seen: { dt: number; frame: number; time: number }[] = [];
    const probe = defineEffect({
      id: "probe",
      name: "Probe",
      category: "custom",
      description: "records",
      params: {},
      init: () => ({ inits: 1 }),
      render(ctx) {
        seen.push({ dt: ctx.dt, frame: ctx.frame, time: ctx.time });
      },
    });
    const p = twoStrips();
    p.layers = [createLayer({ id: "p", effectId: "probe", speed: 2 })];
    const r = new Renderer(new EffectRegistry([probe]), compileLayout(p));
    r.renderProject(p, 1);
    r.renderProject(p, 1.25);
    r.renderProject(p, 0); // backwards seek -> dt 0
    expect(seen).toEqual([
      { dt: 0, frame: 0, time: 2 },
      { dt: 0.5, frame: 1, time: 2.5 },
      { dt: 0, frame: 2, time: 0 },
    ]);
    r.prune([]);
    r.renderProject(p, 0);
    expect(seen.at(-1)!.frame).toBe(0);
  });

  it("renders timeline mode", () => {
    const p = twoStrips();
    p.playback = "timeline";
    p.timeline = timelineSchema.parse({
      duration: 4,
      tracks: [{ id: "t", clips: [{ id: "c", start: 1, duration: 2, layer: createLayer({ effectId: "solid", params: { color: "#00ff00" } }) }] }],
    });
    const r = new Renderer(registry, compileLayout(p));
    expect(r.renderProject(p, 0.5).every((v) => v === 0)).toBe(true);
    expect([...r.renderProject(p, 1.5).subarray(0, 3)]).toEqual([0, 1, 0]);
  });

  it("handles empty layouts and layout swaps", () => {
    const empty = createProject({ layers: [createLayer({ effectId: "solid" })] });
    const r = new Renderer(registry, compileLayout(empty));
    expect(r.renderProject(empty, 0)).toHaveLength(0);
    const p = twoStrips();
    r.setLayout(compileLayout(p));
    expect(r.compiled.space.count).toBe(8);
    expect(r.renderProject(p, 0)[0]).toBe(1);
  });
});
