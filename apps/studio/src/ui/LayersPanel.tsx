/** Live layer stack (top of list = top of the composite). */
import * as cmd from "@ledlay/editor";
import { useRuntime } from "../runtime/context";
import { studio, useStudio } from "../state/store";

export function LayersPanel() {
  const layers = useStudio((s) => s.project.layers);
  const selection = useStudio((s) => s.selection);
  const errors = useStudio((s) => s.layerErrors);
  const playback = useStudio((s) => s.project.playback);
  const runtime = useRuntime();
  const { apply, select } = studio.getState();
  const effects = runtime.registry.list();
  const display = [...layers].reverse();

  return (
    <div className="layers" data-testid="layers-panel">
      {playback === "timeline" && (
        <div className="banner">
          Playback is in <b>timeline</b> mode, so these live layers are not rendered.{" "}
          <button
            className="link"
            onClick={() => apply((p) => cmd.setProjectMeta(p, { playback: "live" }), "Live mode")}
          >
            Switch to live
          </button>
        </div>
      )}
      <div className="row">
        <select
          aria-label="add layer"
          value=""
          onChange={(e) => {
            const effect = runtime.registry.get(e.target.value);
            if (!effect) return;
            const id = `ly_${Date.now().toString(36)}`;
            apply(
              (p) => cmd.addLayer(p, { id, name: effect.name, effectId: effect.id }),
              `Add ${effect.name}`,
            );
            select({ kind: "layer", id });
          }}
        >
          <option value="">＋ Add effect layer…</option>
          {effects.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} — {e.category}
            </option>
          ))}
        </select>
      </div>
      <ul>
        {display.map((l) => {
          const idx = layers.indexOf(l);
          return (
            <li
              key={l.id}
              className={`${selection?.kind === "layer" && selection.id === l.id ? "selected" : ""} ${l.enabled ? "" : "disabled"}`}
              onClick={() => select({ kind: "layer", id: l.id })}
            >
              <input
                type="checkbox"
                aria-label={`enable ${l.name || l.effectId}`}
                checked={l.enabled}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  apply(
                    (p) => cmd.updateLayer(p, { layerId: l.id }, { enabled: e.target.checked }),
                    "Toggle layer",
                  )
                }
              />
              <span className="name">{l.name || runtime.registry.get(l.effectId)?.name || l.effectId}</span>
              <span className="meta">
                {l.blend} · {Math.round(l.opacity * 100)}%
              </span>
              {errors[l.id] && (
                <span className="err" title={errors[l.id]}>
                  ⚠
                </span>
              )}
              <button
                className="ghost"
                aria-label="move up"
                disabled={idx === layers.length - 1}
                onClick={(e) => (
                  e.stopPropagation(),
                  apply((p) => cmd.moveLayer(p, l.id, idx + 1), "Reorder layer")
                )}
              >
                ▲
              </button>
              <button
                className="ghost"
                aria-label="move down"
                disabled={idx === 0}
                onClick={(e) => (
                  e.stopPropagation(),
                  apply((p) => cmd.moveLayer(p, l.id, idx - 1), "Reorder layer")
                )}
              >
                ▼
              </button>
            </li>
          );
        })}
        {layers.length === 0 && <li className="empty">No layers. Add an effect to light things up.</li>}
      </ul>
    </div>
  );
}
