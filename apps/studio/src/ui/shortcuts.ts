/** Global keyboard shortcuts. Returns a disposer. */
import * as cmd from "@ledlay/editor";
import type { StudioRuntime } from "../runtime/runtime";
import type { StudioStore, Tool } from "../state/store";

const TOOL_KEYS: Record<string, Tool> = { q: "select", w: "translate", e: "rotate", r: "scale", d: "draw" };

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function handleShortcut(e: KeyboardEvent, store: StudioStore, runtime: Pick<StudioRuntime, "seek">, frameAll?: () => void): boolean {
  if (isTyping(e.target)) return false;
  const s = store.getState();
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (mod && k === "z") {
    if (e.shiftKey) s.redo();
    else s.undo();
    return true;
  }
  if (mod && k === "y") {
    s.redo();
    return true;
  }
  if (mod && k === "d" && s.selection?.kind === "fixture") {
    const r = cmd.duplicateFixtures(s.project, s.selection.ids, [50, 0, 0]);
    s.apply(() => r.project, "Duplicate");
    s.select({ kind: "fixture", ids: r.newIds });
    return true;
  }
  if (mod) return false;
  if (k === " ") {
    s.setPlaying(!s.playing);
    return true;
  }
  if (k === "home") {
    runtime.seek(0);
    return true;
  }
  if (k === "escape") {
    s.select(null);
    s.setTool("select");
    return true;
  }
  if (k === "f") {
    frameAll?.();
    return true;
  }
  if (TOOL_KEYS[k]) {
    s.setTool(TOOL_KEYS[k]!);
    return true;
  }
  if (k === "delete" || k === "backspace") {
    const sel = s.selection;
    if (!sel) return false;
    switch (sel.kind) {
      case "fixture":
        s.apply((p) => cmd.removeFixtures(p, sel.ids), "Delete");
        break;
      case "controller":
        s.apply((p) => cmd.removeController(p, sel.id), "Delete controller");
        break;
      case "layer":
        s.apply((p) => cmd.removeLayer(p, sel.id), "Delete layer");
        break;
      case "clip":
        s.apply((p) => cmd.removeClip(p, sel.id), "Delete clip");
        break;
      case "model":
        s.apply((p) => cmd.removeModel(p, sel.id), "Remove model");
        break;
    }
    return true;
  }
  return false;
}
