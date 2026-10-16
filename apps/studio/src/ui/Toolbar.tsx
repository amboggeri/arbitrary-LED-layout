/** Top toolbar: file menu, undo/redo, tools, transport, output and bridge controls. */
import { useState } from "react";
import { totalLedCount } from "@ledlay/core";
import { demoProject } from "@ledlay/editor";
import { useRuntime } from "../runtime/context";
import * as actions from "../state/actions";
import { downloadBlob, safeFileName } from "../state/persistence";
import { studio, useStudio, type Tool } from "../state/store";
import { formatTime } from "./timelineMath";

const TOOLS: { id: Tool; label: string; key: string; title: string }[] = [
  { id: "select", label: "↖", key: "Q", title: "Select" },
  { id: "translate", label: "✥", key: "W", title: "Move" },
  { id: "rotate", label: "⟳", key: "E", title: "Rotate" },
  { id: "scale", label: "⤡", key: "R", title: "Scale" },
  { id: "draw", label: "✎", key: "D", title: "Draw path on model" },
];

function useGuard() {
  const notify = studio.getState().notify;
  return (fn: () => unknown | Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (e) {
      notify("error", (e as Error).message);
    }
  };
}

function FileMenu() {
  const [open, setOpen] = useState(false);
  const runtime = useRuntime();
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const guard = useGuard();
  const selectedIds = selection?.kind === "fixture" ? selection.ids : undefined;
  const item = (label: string, fn: () => unknown, disabled = false) => (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        setOpen(false);
        void guard(fn)();
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="menu" onMouseLeave={() => setOpen(false)}>
      <button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        File ▾
      </button>
      {open && (
        <div className="menu-items" role="menu">
          {item("New project", () => actions.newProject(studio))}
          {item("Open…", () => actions.pickAndOpenProject(studio))}
          {item("Save (download)", () => actions.saveProject(project))}
          {item("Load demo", () => studio.getState().loadProject(demoProject()))}
          <hr />
          {item("Import 3D model (glb/gltf/obj/stl)…", () => actions.pickAndImportModel(studio))}
          {item("Import LED points (CSV / Marimapper / xLights .xmodel)…", () =>
            actions.pickAndImportPoints(studio),
          )}
          <hr />
          {item("Export LED points CSV", () =>
            downloadBlob(
              actions.exportPointsCsv(project, selectedIds),
              `${safeFileName(project.name)}-points.csv`,
              "text/csv",
            ),
          )}
          {item("Export xLights model (.xmodel)", () =>
            downloadBlob(
              actions.exportXModel(project, selectedIds),
              `${safeFileName(project.name)}.xmodel`,
              "application/xml",
            ),
          )}
          {project.controllers.map((c) => (
            <span key={c.id}>
              {item(`Bake FSEQ for ${c.name}`, () => {
                const data = actions.exportFseq(project, runtime.registry, c.id);
                downloadBlob(data, `${safeFileName(project.name)}-${safeFileName(c.name)}.fseq`);
              })}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toolbar() {
  const s = useStudio((x) => x);
  const runtime = useRuntime();
  const leds = totalLedCount(s.project);
  return (
    <header className="toolbar" data-testid="toolbar">
      <div className="brand">
        <span className="logo">●●●</span> ledlay
      </div>
      <FileMenu />
      <div className="group">
        <button
          aria-label="undo"
          title={s.undoLabel ? `Undo ${s.undoLabel} (Ctrl+Z)` : "Undo"}
          disabled={!s.canUndo}
          onClick={s.undo}
        >
          ↶
        </button>
        <button
          aria-label="redo"
          title={s.redoLabel ? `Redo ${s.redoLabel} (Ctrl+Shift+Z)` : "Redo"}
          disabled={!s.canRedo}
          onClick={s.redo}
        >
          ↷
        </button>
      </div>
      <div className="group" role="radiogroup" aria-label="tool">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={s.tool === t.id}
            aria-label={t.title}
            className={s.tool === t.id ? "active" : ""}
            title={`${t.title} (${t.key})`}
            onClick={() => s.setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="group transport">
        <button
          aria-label={s.playing ? "pause" : "play"}
          className="play"
          onClick={() => s.setPlaying(!s.playing)}
          title="Play/Pause (Space)"
        >
          {s.playing ? "❚❚" : "▶"}
        </button>
        <button
          aria-label="stop"
          onClick={() => {
            s.setPlaying(false);
            runtime.seek(0);
          }}
          title="Stop and rewind"
        >
          ■
        </button>
        <span className="mono time" data-testid="time">
          {formatTime(s.time)}
        </span>
      </div>
      <div className="spacer" />
      <div className="group">
        <span className="muted small" data-testid="led-total">
          {leds} LEDs
        </span>
      </div>
      <div className="group output">
        <label
          className={`toggle ${s.output.enabled ? "on" : ""}`}
          title="Send frames to hardware through the bridge"
        >
          <input
            type="checkbox"
            aria-label="output enabled"
            checked={s.output.enabled}
            onChange={(e) => s.setOutput({ enabled: e.target.checked })}
          />
          Output
        </label>
        <input
          type="range"
          aria-label="master brightness"
          title="Master brightness"
          min={0}
          max={1}
          step={0.01}
          value={s.output.masterBrightness}
          onChange={(e) => s.setOutput({ masterBrightness: Number(e.target.value) })}
        />
      </div>
      <div className="group bridge">
        <span
          className={`status ${s.bridge.status}`}
          title={`Bridge ${s.bridge.url}`}
          data-testid="bridge-status"
        >
          ● {s.bridge.status === "open" ? "bridge" : s.bridge.status}
        </span>
        {s.bridge.status === "closed" ? (
          <button onClick={() => runtime.connectBridge()}>Connect</button>
        ) : (
          <button onClick={() => runtime.disconnectBridge()}>Disconnect</button>
        )}
      </div>
    </header>
  );
}
