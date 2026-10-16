/**
 * Studio application state (zustand). The project itself is immutable and edited only via
 * @ledlay/editor commands passed to `apply`, which records undo history.
 */
import { createStore, useStore } from "zustand";
import { createProject, type Project } from "@ledlay/core";
import { History } from "@ledlay/editor";
import type { BridgeStats, LinkStatus } from "@ledlay/link";

export type Selection =
  | { kind: "fixture"; ids: string[] }
  | { kind: "controller"; id: string }
  | { kind: "layer"; id: string }
  | { kind: "clip"; id: string }
  | { kind: "model"; id: string }
  | null;

export type Tool = "select" | "translate" | "rotate" | "scale" | "draw";
export type BottomTab = "layers" | "timeline" | "issues";

export interface Notice {
  id: number;
  kind: "info" | "error";
  text: string;
}

export interface StudioState {
  project: Project;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** Bumped whenever a file is opened/created (lets views reset camera etc). */
  documentVersion: number;
  selection: Selection;
  tool: Tool;
  bottomTab: BottomTab;
  playing: boolean;
  /** Show time in seconds (UI-rate updates). */
  time: number;
  output: { enabled: boolean; masterBrightness: number };
  bridge: { url: string; status: LinkStatus; stats: BridgeStats | null };
  layerErrors: Record<string, string>;
  notices: Notice[];
  fps: number;

  apply(fn: (p: Project) => Project, label?: string, coalesceKey?: string): void;
  seal(): void;
  undo(): void;
  redo(): void;
  loadProject(p: Project): void;
  select(sel: Selection): void;
  setTool(t: Tool): void;
  setBottomTab(t: BottomTab): void;
  setPlaying(v: boolean): void;
  setTime(t: number): void;
  setOutput(o: Partial<StudioState["output"]>): void;
  setBridge(b: Partial<StudioState["bridge"]>): void;
  setLayerErrors(e: Record<string, string>): void;
  setFps(fps: number): void;
  notify(kind: Notice["kind"], text: string): void;
  dismiss(id: number): void;
}

export type StudioStore = ReturnType<typeof createStudioStore>;

let noticeId = 1;

/** Drop selections that refer to things that no longer exist. */
export function pruneSelection(sel: Selection, p: Project): Selection {
  if (!sel) return sel;
  switch (sel.kind) {
    case "fixture": {
      const ids = sel.ids.filter((id) => p.fixtures.some((f) => f.id === id));
      return ids.length ? (ids.length === sel.ids.length ? sel : { kind: "fixture", ids }) : null;
    }
    case "controller":
      return p.controllers.some((c) => c.id === sel.id) ? sel : null;
    case "layer":
      return p.layers.some((l) => l.id === sel.id) ? sel : null;
    case "clip":
      return p.timeline.tracks.some((t) => t.clips.some((c) => c.id === sel.id)) ? sel : null;
    case "model":
      return p.models.some((m) => m.id === sel.id) ? sel : null;
  }
}

export function createStudioStore(initial: Project = createProject()) {
  const history = new History<Project>(initial);
  const syncHistory = () => ({
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoLabel: history.undoLabel,
    redoLabel: history.redoLabel,
  });

  return createStore<StudioState>()((set, get) => ({
    project: initial,
    ...syncHistory(),
    documentVersion: 0,
    selection: null,
    tool: "select",
    bottomTab: "layers",
    playing: false,
    time: 0,
    output: { enabled: false, masterBrightness: 1 },
    bridge: { url: "ws://127.0.0.1:8787", status: "closed", stats: null },
    layerErrors: {},
    notices: [],
    fps: 0,

    apply(fn, label = "Edit", coalesceKey) {
      const before = get().project;
      let next: Project;
      try {
        next = fn(before);
      } catch (e) {
        get().notify("error", (e as Error).message);
        return;
      }
      if (next === before) return;
      history.commit(next, label, coalesceKey ?? null);
      set({ project: next, selection: pruneSelection(get().selection, next), ...syncHistory() });
    },
    seal() {
      history.seal();
    },
    undo() {
      const p = history.undo();
      set({ project: p, selection: pruneSelection(get().selection, p), ...syncHistory() });
    },
    redo() {
      const p = history.redo();
      set({ project: p, selection: pruneSelection(get().selection, p), ...syncHistory() });
    },
    loadProject(p) {
      history.reset(p);
      set({ project: p, selection: null, time: 0, documentVersion: get().documentVersion + 1, ...syncHistory() });
    },
    select: (selection) => set({ selection }),
    setTool: (tool) => set({ tool }),
    setBottomTab: (bottomTab) => set({ bottomTab }),
    setPlaying: (playing) => set({ playing }),
    setTime: (time) => set({ time }),
    setOutput: (o) => set({ output: { ...get().output, ...o } }),
    setBridge: (b) => set({ bridge: { ...get().bridge, ...b } }),
    setLayerErrors: (layerErrors) => {
      const cur = get().layerErrors;
      const same =
        Object.keys(cur).length === Object.keys(layerErrors).length &&
        Object.entries(layerErrors).every(([k, v]) => cur[k] === v);
      if (!same) set({ layerErrors });
    },
    setFps: (fps) => set({ fps }),
    notify(kind, text) {
      const n = { id: noticeId++, kind, text };
      set({ notices: [...get().notices.slice(-4), n] });
    },
    dismiss: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),
  }));
}

/** The app-wide store instance. */
export const studio = createStudioStore();

export function useStudio<T>(selector: (s: StudioState) => T): T {
  return useStore(studio, selector);
}
