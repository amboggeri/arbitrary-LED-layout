/** React host for Viewport3D: wires store state and runtime frames into the imperative view. */
import { useEffect, useRef, useState } from "react";
import { applyMatrix, composeMatrix } from "@ledlay/core";
import * as cmd from "@ledlay/editor";
import { useRuntime } from "../runtime/context";
import { studio, useStudio } from "../state/store";
import { worldToLocal } from "./coords";
import { Viewport3D, type GizmoMode } from "./Viewport3D";



export function ViewportView() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<Viewport3D | null>(null);
  const runtime = useRuntime();
  const [error, setError] = useState<string | null>(null);
  const selection = useStudio((s) => s.selection);
  const tool = useStudio((s) => s.tool);
  const documentVersion = useStudio((s) => s.documentVersion);
  const project = useStudio((s) => s.project);

  useEffect(() => {
    if (!host.current) return;
    let v: Viewport3D;
    try {
      v = new Viewport3D(host.current, {
        onPick(fixtureId, additive) {
          const s = studio.getState();
          if (!fixtureId) {
            if (!additive) s.select(null);
            return;
          }
          const cur = s.selection?.kind === "fixture" ? s.selection.ids : [];
          if (additive) {
            const ids = cur.includes(fixtureId) ? cur.filter((x) => x !== fixtureId) : [...cur, fixtureId];
            s.select(ids.length ? { kind: "fixture", ids } : null);
          } else s.select({ kind: "fixture", ids: [fixtureId] });
        },
        onTransform(fixtureId, t, done) {
          const s = studio.getState();
          s.apply((p) => cmd.setFixtureTransform(p, fixtureId, t), "Transform fixture", `gizmo:${fixtureId}`);
          if (done) s.seal();
        },
        onDrawPoint(world) {
          const s = studio.getState();
          const sel = s.selection;
          const f =
            sel?.kind === "fixture" && sel.ids.length === 1
              ? s.project.fixtures.find((x) => x.id === sel.ids[0])
              : undefined;
          if (f && f.geometry.kind === "polyline") {
            const g = f.geometry;
            const local = worldToLocal(f.transform, world);
            // A freshly started path holds two identical points (schema needs >= 2): replace the second.
            const fresh = g.points.length === 2 && g.points[0]!.every((c, i) => c === g.points[1]![i]);
            const points = fresh ? [g.points[0]!, local] : [...g.points, local];
            s.apply((p) => cmd.updateFixture(p, f.id, { geometry: { ...g, points } }), "Draw path point");
          } else {
            // Start a new path fixture at the clicked point.
            const id = `fx_path_${Date.now().toString(36)}`;
            s.apply(
              (p) =>
                cmd.addFixture(p, {
                  id,
                  name: "Path",
                  geometry: { kind: "polyline", points: [world, world], spacing: 16.667 },
                }),
              "New path",
            );
            s.select({ kind: "fixture", ids: [id] });
          }
        },
      });
    } catch (e) {
      setError(`3D view unavailable: ${(e as Error).message}`);
      return;
    }
    view.current = v;
    (window as unknown as { __ledlayViewport?: Viewport3D }).__ledlayViewport = v;
    const remove = runtime.addSink(v);
    v.frameAll();
    return () => {
      remove();
      v.dispose();
      view.current = null;
    };
  }, [runtime]);

  useEffect(() => {
    view.current?.setSelection(selection?.kind === "fixture" ? selection.ids : []);
  }, [selection, project.fixtures]);

  useEffect(() => {
    const mode: GizmoMode = tool === "translate" || tool === "rotate" || tool === "scale" ? tool : null;
    view.current?.setGizmoMode(mode);
  }, [tool]);

  useEffect(() => {
    const sel = selection;
    const f =
      sel?.kind === "fixture" && sel.ids.length === 1
        ? project.fixtures.find((x) => x.id === sel.ids[0])
        : undefined;
    const preview =
      f && f.geometry.kind === "polyline"
        ? f.geometry.points.map((p) => applyMatrix(composeMatrix(f.transform), p))
        : [];
    view.current?.setDrawing(tool === "draw", preview);
  }, [tool, selection, project.fixtures]);

  useEffect(() => {
    view.current?.frameAll();
  }, [documentVersion]);

  return (
    <div className="viewport" ref={host} data-testid="viewport">
      {error && <div className="viewport-error">{error}</div>}
      <div className="viewport-hud">
        <button className="ghost" title="Frame all (F)" onClick={() => view.current?.frameAll()}>
          ⤢ Frame
        </button>
        {tool === "draw" && (
          <span className="hint">
            Click on a model or the floor to add path points to the selected path (or start a new one).
          </span>
        )}
      </div>
    </div>
  );
}
