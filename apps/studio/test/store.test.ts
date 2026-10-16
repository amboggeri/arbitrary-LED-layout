import { describe, expect, it } from "vitest";
import { createProject } from "@ledlay/core";
import * as cmd from "@ledlay/editor";
import { createStudioStore, pruneSelection } from "../src/state/store";

describe("studio store", () => {
  it("applies commands with undo/redo and labels", () => {
    const s = createStudioStore();
    s.getState().apply(
      (p) => cmd.addFixture(p, { id: "a", name: "A", geometry: { kind: "strip", count: 2, spacing: 1 } }),
      "Add A",
    );
    expect(s.getState().project.fixtures).toHaveLength(1);
    expect(s.getState().canUndo).toBe(true);
    expect(s.getState().undoLabel).toBe("Add A");
    s.getState().undo();
    expect(s.getState().project.fixtures).toHaveLength(0);
    expect(s.getState().redoLabel).toBe("Add A");
    s.getState().redo();
    expect(s.getState().project.fixtures).toHaveLength(1);
  });

  it("ignores no-op commands and reports thrown errors as notices", () => {
    const s = createStudioStore();
    s.getState().apply((p) => p);
    expect(s.getState().canUndo).toBe(false);
    s.getState().apply(() => {
      throw new Error("bad input");
    });
    expect(s.getState().notices.at(-1)).toMatchObject({ kind: "error", text: "bad input" });
    s.getState().dismiss(s.getState().notices.at(-1)!.id);
    expect(s.getState().notices).toHaveLength(0);
  });

  it("coalesces drags and seals", () => {
    const s = createStudioStore();
    s.getState().apply((p) =>
      cmd.addFixture(p, { id: "a", name: "A", geometry: { kind: "strip", count: 2, spacing: 1 } }),
    );
    for (let x = 1; x <= 5; x++)
      s.getState().apply((p) => cmd.setFixtureTransform(p, "a", { position: [x, 0, 0] }), "Move", "drag");
    s.getState().seal();
    s.getState().undo();
    expect(s.getState().project.fixtures[0]!.transform.position).toEqual([0, 0, 0]);
  });

  it("prunes selection when things are deleted and resets on load", () => {
    const s = createStudioStore();
    s.getState().apply((p) =>
      cmd.addFixture(p, { id: "a", name: "A", geometry: { kind: "strip", count: 2, spacing: 1 } }),
    );
    s.getState().select({ kind: "fixture", ids: ["a"] });
    s.getState().apply((p) => cmd.removeFixtures(p, ["a"]));
    expect(s.getState().selection).toBeNull();
    s.getState().select({ kind: "layer", id: "x" });
    const v = s.getState().documentVersion;
    s.getState().loadProject(createProject({ name: "Other" }));
    expect(s.getState().selection).toBeNull();
    expect(s.getState().documentVersion).toBe(v + 1);
    expect(s.getState().canUndo).toBe(false);
  });

  it("pruneSelection handles every kind", () => {
    let p = createProject();
    p = cmd.addFixture(p, { id: "a", name: "A", geometry: { kind: "strip", count: 1, spacing: 1 } });
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
    const sel = { kind: "fixture" as const, ids: ["a", "zz"] };
    expect(pruneSelection(sel, p)).toEqual({ kind: "fixture", ids: ["a"] });
    const keep = { kind: "fixture" as const, ids: ["a"] };
    expect(pruneSelection(keep, p)).toBe(keep);
    expect(pruneSelection({ kind: "controller", id: "c" }, p)).not.toBeNull();
    expect(pruneSelection({ kind: "controller", id: "x" }, p)).toBeNull();
    expect(pruneSelection({ kind: "layer", id: "l" }, p)).not.toBeNull();
    expect(pruneSelection({ kind: "clip", id: c.clipId }, p)).not.toBeNull();
    expect(pruneSelection({ kind: "clip", id: "nope" }, p)).toBeNull();
    expect(pruneSelection({ kind: "model", id: "m" }, p)).not.toBeNull();
    expect(pruneSelection(null, p)).toBeNull();
  });

  it("simple setters", () => {
    const s = createStudioStore();
    const st = s.getState();
    st.setTool("draw");
    st.setBottomTab("timeline");
    st.setOutput({ masterBrightness: 0.5 });
    st.setBridge({ url: "ws://x" });
    st.setFps(30);
    st.setLayerErrors({ a: "x" });
    const before = s.getState().layerErrors;
    s.getState().setLayerErrors({ a: "x" });
    expect(s.getState().layerErrors).toBe(before);
    for (let i = 0; i < 8; i++) s.getState().notify("info", `n${i}`);
    expect(s.getState().notices).toHaveLength(5);
    expect(s.getState()).toMatchObject({
      tool: "draw",
      bottomTab: "timeline",
      output: { enabled: false, masterBrightness: 0.5 },
      fps: 30,
    });
  });
});
