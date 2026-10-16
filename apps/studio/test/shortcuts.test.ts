import { describe, expect, it, vi } from "vitest";
import { createProject } from "@ledlay/core";
import * as cmd from "@ledlay/editor";
import { createStudioStore } from "../src/state/store";
import { handleShortcut } from "../src/ui/shortcuts";

function key(
  k: string,
  mods: Partial<KeyboardEvent> = {},
  target: EventTarget | null = document.body,
): KeyboardEvent {
  return { key: k, ctrlKey: false, metaKey: false, shiftKey: false, target, ...mods } as KeyboardEvent;
}

function setup() {
  let p = createProject();
  p = cmd.addFixture(p, { id: "a", name: "A", geometry: { kind: "strip", count: 2, spacing: 1 } });
  p = cmd.addController(p, { id: "c", name: "C" });
  p = cmd.addLayer(p, { id: "l", effectId: "solid" });
  const t = cmd.addTrack(p);
  const c = cmd.addClip(t.project, t.trackId, { start: 0, duration: 1, layer: { effectId: "solid" } });
  p = cmd.addModel(c.project, {
    id: "m",
    name: "m",
    format: "glb",
    uri: "",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    opacity: 1,
    visible: true,
  });
  const store = createStudioStore(p);
  const runtime = { seek: vi.fn() };
  return { store, runtime, clipId: c.clipId };
}

describe("keyboard shortcuts", () => {
  it("ignores keys while typing", () => {
    const { store, runtime } = setup();
    const input = document.createElement("input");
    expect(handleShortcut(key(" ", {}, input), store, runtime)).toBe(false);
    expect(handleShortcut(key(" ", {}, null), store, runtime)).toBe(true);
  });

  it("toggles play, seeks home, frames, switches tools, escapes", () => {
    const { store, runtime } = setup();
    const frame = vi.fn();
    handleShortcut(key(" "), store, runtime);
    expect(store.getState().playing).toBe(true);
    handleShortcut(key("Home"), store, runtime);
    expect(runtime.seek).toHaveBeenCalledWith(0);
    handleShortcut(key("f"), store, runtime, frame);
    expect(frame).toHaveBeenCalled();
    for (const [k, tool] of [
      ["w", "translate"],
      ["e", "rotate"],
      ["r", "scale"],
      ["d", "draw"],
      ["q", "select"],
    ] as const) {
      handleShortcut(key(k), store, runtime);
      expect(store.getState().tool).toBe(tool);
    }
    store.getState().select({ kind: "layer", id: "l" });
    handleShortcut(key("Escape"), store, runtime);
    expect(store.getState().selection).toBeNull();
    expect(handleShortcut(key("x"), store, runtime)).toBe(false);
    expect(handleShortcut(key("x", { ctrlKey: true }), store, runtime)).toBe(false);
  });

  it("undo/redo and duplicate", () => {
    const { store, runtime } = setup();
    store.getState().select({ kind: "fixture", ids: ["a"] });
    handleShortcut(key("d", { ctrlKey: true }), store, runtime);
    expect(store.getState().project.fixtures).toHaveLength(2);
    handleShortcut(key("z", { metaKey: true }), store, runtime);
    expect(store.getState().project.fixtures).toHaveLength(1);
    handleShortcut(key("z", { ctrlKey: true, shiftKey: true }), store, runtime);
    expect(store.getState().project.fixtures).toHaveLength(2);
    handleShortcut(key("z", { ctrlKey: true }), store, runtime);
    handleShortcut(key("y", { ctrlKey: true }), store, runtime);
    expect(store.getState().project.fixtures).toHaveLength(2);
  });

  it("deletes whatever is selected", () => {
    const { store, runtime, clipId } = setup();
    expect(handleShortcut(key("Delete"), store, runtime)).toBe(false);
    const del = (sel: Parameters<ReturnType<typeof store.getState>["select"]>[0]) => {
      store.getState().select(sel);
      handleShortcut(key("Delete"), store, runtime);
    };
    del({ kind: "fixture", ids: ["a"] });
    del({ kind: "controller", id: "c" });
    del({ kind: "layer", id: "l" });
    del({ kind: "clip", id: clipId });
    del({ kind: "model", id: "m" });
    const p = store.getState().project;
    expect([
      p.fixtures.length,
      p.controllers.length,
      p.layers.length,
      p.timeline.tracks[0]!.clips.length,
      p.models.length,
    ]).toEqual([0, 0, 0, 0, 0]);
  });
});
