import { describe, expect, it, vi } from "vitest";
import { createProject, serializeProject } from "@ledlay/core";
import * as cmd from "@ledlay/editor";
import { createDefaultRegistry } from "@ledlay/effects";
import { readFseqHeader } from "@ledlay/targets";
import * as actions from "../src/state/actions";
import { createStudioStore } from "../src/state/store";

describe("file actions", () => {
  it("creates a new project with a starter layer", () => {
    const s = createStudioStore();
    actions.newProject(s);
    expect(s.getState().project.layers[0]!.effectId).toBe("rainbow");
  });

  it("opens project JSON and rejects garbage", () => {
    const s = createStudioStore();
    actions.openProjectText(s, serializeProject(createProject({ name: "Opened" })));
    expect(s.getState().project.name).toBe("Opened");
    expect(() => actions.openProjectText(s, "nope")).toThrow();
  });

  it("imports CSV points as a fixture and reports warnings", () => {
    const s = createStudioStore();
    const warnings = actions.importCsvText(s, "cam", "index,x,y,z\n0,0,0,0\n2,2,0,0\n");
    const f = s.getState().project.fixtures[0]!;
    expect(f.geometry).toEqual({
      kind: "points",
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ],
    });
    expect(s.getState().selection).toEqual({ kind: "fixture", ids: [f.id] });
    expect(warnings[0]).toMatch(/missing/);
    expect(() => actions.importCsvText(s, "x", "")).toThrow(/empty/);
  });

  it("imports xLights models scaled into project units", () => {
    const s = createStudioStore();
    actions.importXModelText(s, `<custommodel name="Arch" parm1="2" parm2="1" CustomModel="1,2"/>`, 5);
    expect(s.getState().project.fixtures[0]).toMatchObject({
      name: "Arch",
      geometry: {
        points: [
          [0, 0, 0],
          [5, 0, 0],
        ],
      },
    });
  });

  it("exports points, xmodel and fseq", () => {
    let p = createProject();
    p = cmd.addController(p, { id: "c", name: "C", host: "h" });
    p = cmd.addFixture(p, { id: "a", name: "A", geometry: { kind: "strip", count: 2, spacing: 10 } });
    p = cmd.addFixture(p, { id: "b", name: "B", geometry: { kind: "strip", count: 1, spacing: 10 } });
    p = cmd.autoPatch(p, "c");
    p = cmd.addLayer(p, { effectId: "solid" });
    expect(actions.exportPointsCsv(p, ["a"])).toBe("index,x,y,z\n0,0,0,0\n1,10,0,0\n");
    expect(actions.exportPointsCsv(p).split("\n")).toHaveLength(5);
    expect(actions.exportXModel(p, ["a"])).toMatch(/name="A"/);
    expect(actions.exportXModel(p)).toMatch(/name="Untitled"/);
    const fseq = actions.exportFseq(p, createDefaultRegistry(), "c", 0.5);
    expect(readFseqHeader(fseq).channelCount).toBe(9);
  });

  it("saves via download", async () => {
    const persistence = await import("../src/state/persistence");
    const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    actions.saveProject(createProject({ name: "My Show" }));
    expect(spy).toHaveBeenCalled();
    expect(persistence.safeFileName("My Show")).toBe("My_Show");
    spy.mockRestore();
  });
});
