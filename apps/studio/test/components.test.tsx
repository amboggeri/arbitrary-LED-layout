import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createProject, type Project } from "@ledlay/core";
import * as cmd from "@ledlay/editor";
import { RuntimeProvider } from "../src/runtime/context";
import { StudioRuntime } from "../src/runtime/runtime";
import { studio } from "../src/state/store";
import { Inspector } from "../src/ui/Inspector";
import { IssuesPanel } from "../src/ui/IssuesPanel";
import { LayersPanel } from "../src/ui/LayersPanel";
import { Outliner } from "../src/ui/Outliner";
import { StatusBar } from "../src/ui/StatusBar";
import { TimelinePanel } from "../src/ui/TimelinePanel";
import { Toolbar } from "../src/ui/Toolbar";
import { Notices } from "../src/ui/Notices";
import type { ReactNode } from "react";

let runtime: StudioRuntime;

function base(): Project {
  let p = createProject({ name: "T" });
  p = cmd.addController(p, { id: "c", name: "Ctl", host: "10.0.0.2" });
  p = cmd.addFixture(p, { id: "a", name: "Alpha", geometry: { kind: "strip", count: 4, spacing: 1 } });
  p = cmd.addFixture(p, {
    id: "m",
    name: "Mat",
    geometry: { kind: "matrix", cols: 2, rows: 2, spacingX: 1, spacingY: 1 },
  });
  p = cmd.autoPatch(p, "c");
  p = cmd.addLayer(p, { id: "l1", name: "Base", effectId: "gradient" });
  p = cmd.addLayer(p, { id: "l2", name: "Top", effectId: "script" });
  return p;
}

function wrap(ui: ReactNode) {
  return render(<RuntimeProvider runtime={runtime}>{ui}</RuntimeProvider>);
}

const commit = (el: HTMLElement, value: string) => {
  fireEvent.change(el, { target: { value } });
  fireEvent.blur(el);
};

beforeEach(() => {
  runtime?.dispose();
  studio.getState().loadProject(base());
  studio.getState().setPlaying(false);
  runtime = new StudioRuntime(studio);
  runtime.start();
});

describe("Outliner", () => {
  it("lists fixtures and controllers, selects, and adds from templates", () => {
    wrap(<Outliner />);
    fireEvent.click(screen.getByText("Alpha"));
    expect(studio.getState().selection).toEqual({ kind: "fixture", ids: ["a"] });
    fireEvent.click(screen.getByText("Mat"), { shiftKey: true });
    expect(studio.getState().selection).toEqual({ kind: "fixture", ids: ["a", "m"] });
    fireEvent.click(screen.getByText("Mat"), { shiftKey: true });
    expect(studio.getState().selection).toEqual({ kind: "fixture", ids: ["a"] });
    fireEvent.click(screen.getByText("Ctl"));
    expect(studio.getState().selection).toEqual({ kind: "controller", id: "c" });
    fireEvent.change(screen.getByLabelText("add fixture"), { target: { value: "cube" } });
    expect(studio.getState().project.fixtures).toHaveLength(3);
    fireEvent.click(screen.getByText("＋ Add"));
    expect(studio.getState().project.controllers).toHaveLength(2);
  });
});

describe("Inspector", () => {
  it("shows project settings with no selection", () => {
    wrap(<Inspector />);
    commit(screen.getByLabelText("project name"), "Renamed");
    expect(studio.getState().project.name).toBe("Renamed");
    fireEvent.change(screen.getByLabelText("playback mode"), { target: { value: "timeline" } });
    expect(studio.getState().project.playback).toBe("timeline");
    commit(screen.getByLabelText("fps"), "60");
    expect(studio.getState().project.fps).toBe(60);
  });

  it("edits fixture geometry, transform and patch", () => {
    act(() => studio.getState().select({ kind: "fixture", ids: ["m"] }));
    wrap(<Inspector />);
    expect(screen.getByTestId("fixture-led-count").textContent).toBe("4");
    commit(screen.getByLabelText("Columns"), "5");
    expect(screen.getByTestId("fixture-led-count").textContent).toBe("10");
    fireEvent.change(screen.getByLabelText("wiring"), { target: { value: "progressive" } });
    commit(screen.getByLabelText("position y"), "100");
    expect(studio.getState().project.fixtures[1]!.transform.position).toEqual([0, 100, 0]);
    commit(screen.getByLabelText("start pixel"), "50");
    expect(studio.getState().project.fixtures[1]!.patch!.startPixel).toBe(50);
    fireEvent.change(screen.getByLabelText("patch controller"), { target: { value: "" } });
    expect(studio.getState().project.fixtures[1]!.patch).toBeNull();
    commit(screen.getByLabelText("tags"), "roof, left");
    expect(studio.getState().project.fixtures[1]!.tags).toEqual(["roof", "left"]);
    fireEvent.click(screen.getByTitle("Duplicate"));
    expect(studio.getState().project.fixtures).toHaveLength(3);
  });

  it("handles multi-selection", () => {
    act(() => studio.getState().select({ kind: "fixture", ids: ["a", "m"] }));
    wrap(<Inspector />);
    expect(screen.getByText("2 fixtures")).toBeTruthy();
    commit(screen.getByLabelText("add tags"), "x");
    expect(studio.getState().project.fixtures.every((f) => f.tags.includes("x"))).toBe(true);
    fireEvent.click(screen.getByText("Delete"));
    expect(studio.getState().project.fixtures).toHaveLength(0);
  });

  it("edits controllers and outputs", () => {
    act(() => studio.getState().select({ kind: "controller", id: "c" }));
    wrap(<Inspector />);
    fireEvent.change(screen.getByLabelText("protocol"), { target: { value: "artnet" } });
    expect(screen.getByLabelText("start universe")).toBeTruthy();
    fireEvent.click(screen.getByText("+ output"));
    expect(studio.getState().project.controllers[0]!.outputs).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("output 2 order"), { target: { value: "GRBW" } });
    expect(studio.getState().project.controllers[0]!.outputs[1]!.colorOrder).toBe("GRBW");
    commit(screen.getByLabelText("output 1 pin"), "16");
    expect(studio.getState().project.controllers[0]!.outputs[0]!.pin).toBe(16);
    fireEvent.click(screen.getByLabelText("remove output 2"));
    expect(studio.getState().project.controllers[0]!.outputs).toHaveLength(1);
    expect(screen.getByText(/Connect to the bridge/)).toBeTruthy();
  });

  it("renders every param type for a layer and toggles keyframes", () => {
    act(() => studio.getState().select({ kind: "layer", id: "l1" }));
    wrap(<Inspector />);
    // gradient effect: gradient, select, numbers, boolean
    expect(screen.getByLabelText("stop 1 color")).toBeTruthy();
    fireEvent.click(screen.getByText("+ stop"));
    const layer = () => studio.getState().project.layers[0]!;
    expect((layer().params.gradient as unknown[]).length).toBe(4);
    fireEvent.change(screen.getByLabelText("Axis"), { target: { value: "x" } });
    expect(layer().params.axis).toBe("x");
    fireEvent.click(screen.getByLabelText("keyframe Repeat"));
    expect(layer().params.repeat).toEqual({ keyframes: [{ t: 0, v: 1, ease: "linear" }] });
    fireEvent.click(screen.getByLabelText("keyframe Repeat"));
    expect(layer().params.repeat).toBeUndefined();
    fireEvent.change(screen.getByLabelText("Repeat"), { target: { value: "3" } });
    expect(layer().params.repeat).toBe(3);
    fireEvent.change(screen.getByLabelText("effect"), { target: { value: "orb" } });
    expect(layer().effectId).toBe("orb");
    expect(screen.getByLabelText("Position (−1..1) x")).toBeTruthy();
  });

  it("shows script errors from the runtime", () => {
    act(() => {
      studio.getState().apply((p) => cmd.setLayerParam(p, { layerId: "l2" }, "code", "return ("));
      studio.getState().select({ kind: "layer", id: "l2" });
    });
    wrap(<Inspector />);
    expect(document.querySelector(".error-box")).toBeTruthy();
    const ta = screen.getByLabelText("Code") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "return 1" } });
    fireEvent.blur(ta);
    expect(studio.getState().project.layers[1]!.params.code).toBe("return 1");
  });

  it("edits clips and models", () => {
    act(() => {
      const t = cmd.addTrack(studio.getState().project);
      const c = cmd.addClip(t.project, t.trackId, { start: 1, duration: 2, layer: { effectId: "solid" } });
      studio.getState().apply(() => c.project);
      studio.getState().apply((p) =>
        cmd.addModel(p, {
          id: "mod",
          name: "House",
          format: "obj",
          uri: "data:,",
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          opacity: 0.3,
          visible: true,
        }),
      );
      studio.getState().select({ kind: "clip", id: c.clipId });
    });
    const { unmount } = wrap(<Inspector />);
    commit(screen.getByLabelText("clip duration"), "4");
    expect(studio.getState().project.timeline.tracks[0]!.clips[0]!.duration).toBe(4);
    unmount();
    act(() => studio.getState().select({ kind: "model", id: "mod" }));
    wrap(<Inspector />);
    commit(screen.getByLabelText("model scale x"), "1000");
    expect(studio.getState().project.models[0]!.transform.scale[0]).toBe(1000);
  });
});

describe("panels", () => {
  it("LayersPanel adds, toggles and reorders", () => {
    wrap(<LayersPanel />);
    fireEvent.change(screen.getByLabelText("add layer"), { target: { value: "plasma" } });
    expect(studio.getState().project.layers.at(-1)!.effectId).toBe("plasma");
    fireEvent.click(screen.getByLabelText("enable Base"));
    expect(studio.getState().project.layers[0]!.enabled).toBe(false);
    const items = screen.getAllByLabelText("move down");
    fireEvent.click(items[0]!); // top item (plasma) moves down
    expect(studio.getState().project.layers.map((l) => l.effectId)).toEqual(["gradient", "plasma", "script"]);
  });

  it("TimelinePanel adds tracks and clips", () => {
    wrap(<TimelinePanel />);
    fireEvent.click(screen.getByText("＋ Track"));
    fireEvent.change(screen.getByLabelText("add clip to Track 1"), { target: { value: "fire" } });
    expect(studio.getState().project.timeline.tracks[0]!.clips[0]!.layer.effectId).toBe("fire");
    fireEvent.click(screen.getByText("Switch to timeline"));
    expect(studio.getState().project.playback).toBe("timeline");
    fireEvent.click(screen.getByTitle("Mute"));
    expect(studio.getState().project.timeline.tracks[0]!.muted).toBe(true);
  });

  it("IssuesPanel lists problems and selects on click", () => {
    act(() =>
      studio
        .getState()
        .apply((p) =>
          cmd.addFixture(p, { id: "z", name: "Loose", geometry: { kind: "strip", count: 1, spacing: 1 } }),
        ),
    );
    wrap(<IssuesPanel />);
    fireEvent.click(screen.getByText(/Loose: not patched/));
    expect(studio.getState().selection).toEqual({ kind: "fixture", ids: ["z"] });
  });

  it("Toolbar toggles playback, tools and output", () => {
    wrap(<Toolbar />);
    fireEvent.click(screen.getByLabelText("play"));
    expect(studio.getState().playing).toBe(true);
    fireEvent.click(screen.getByLabelText("stop"));
    expect(studio.getState().playing).toBe(false);
    fireEvent.click(screen.getByLabelText("Rotate"));
    expect(studio.getState().tool).toBe("rotate");
    fireEvent.click(screen.getByLabelText("output enabled"));
    expect(studio.getState().output.enabled).toBe(true);
    fireEvent.click(screen.getByText("File ▾"));
    expect(within(screen.getByRole("menu")).getByText("Bake FSEQ for Ctl")).toBeTruthy();
    fireEvent.click(screen.getByText("Load demo"));
    expect(studio.getState().project.name).toBe("Demo");
  });

  it("StatusBar and Notices", () => {
    wrap(
      <>
        <StatusBar />
        <Notices />
      </>,
    );
    expect(screen.getByText("2 fixtures")).toBeTruthy();
    act(() => studio.getState().notify("error", "Boom"));
    expect(screen.getByRole("alert").textContent).toContain("Boom");
    fireEvent.click(screen.getByLabelText("dismiss"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
