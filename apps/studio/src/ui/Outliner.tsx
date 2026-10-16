/** Left panel: fixtures, controllers and models in the project. */
import { ledCount } from "@ledlay/core";
import * as cmd from "@ledlay/editor";
import { FIXTURE_TEMPLATES } from "@ledlay/editor";
import { studio, useStudio } from "../state/store";

export function Outliner() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const select = studio.getState().select;
  const apply = studio.getState().apply;
  const isSel = (kind: string, id: string) =>
    selection?.kind === kind && ("ids" in selection ? selection.ids.includes(id) : selection.id === id);

  return (
    <nav className="outliner" data-testid="outliner">
      <section>
        <header>
          <h3>Fixtures</h3>
          <select
            aria-label="add fixture"
            className="add"
            value=""
            onChange={(e) => {
              const t = FIXTURE_TEMPLATES.find((x) => x.id === e.target.value);
              if (!t) return;
              const f = t.make();
              apply((p) => cmd.addFixture(p, f), `Add ${t.label}`);
              select({ kind: "fixture", ids: [f.id] });
            }}
          >
            <option value="">＋ Add…</option>
            {FIXTURE_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </header>
        <ul>
          {project.fixtures.map((f) => (
            <li
              key={f.id}
              className={isSel("fixture", f.id) ? "selected" : ""}
              onClick={(e) => {
                const cur = selection?.kind === "fixture" ? selection.ids : [];
                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                  const ids = cur.includes(f.id) ? cur.filter((x) => x !== f.id) : [...cur, f.id];
                  select(ids.length ? { kind: "fixture", ids } : null);
                } else select({ kind: "fixture", ids: [f.id] });
              }}
            >
              <span className={`dot ${f.patch ? "patched" : "unpatched"}`} title={f.patch ? "Patched" : "Not patched"} />
              <span className="name">{f.name}</span>
              <span className="meta">{ledCount(f.geometry)}</span>
            </li>
          ))}
          {project.fixtures.length === 0 && <li className="empty">No fixtures yet — add one above.</li>}
        </ul>
      </section>

      <section>
        <header>
          <h3>Controllers</h3>
          <button
            className="ghost add"
            onClick={() => {
              const id = `ctl_${Date.now().toString(36)}`;
              apply((p) => cmd.addController(p, { id, name: `WLED ${p.controllers.length + 1}` }), "Add controller");
              select({ kind: "controller", id });
            }}
          >
            ＋ Add
          </button>
        </header>
        <ul>
          {project.controllers.map((c) => (
            <li key={c.id} className={isSel("controller", c.id) ? "selected" : ""} onClick={() => select({ kind: "controller", id: c.id })}>
              <span className={`dot ${c.enabled && c.host ? "patched" : "unpatched"}`} />
              <span className="name">{c.name}</span>
              <span className="meta">{c.host || "no host"}</span>
            </li>
          ))}
          {project.controllers.length === 0 && <li className="empty">Add a controller to send data to hardware.</li>}
        </ul>
      </section>

      <section>
        <header>
          <h3>Models</h3>
        </header>
        <ul>
          {project.models.map((m) => (
            <li key={m.id} className={isSel("model", m.id) ? "selected" : ""} onClick={() => select({ kind: "model", id: m.id })}>
              <span className="name">{m.name}</span>
              <span className="meta">{m.format}</span>
            </li>
          ))}
          {project.models.length === 0 && <li className="empty">Import a 3D model (File ▸ Import model) to place LEDs on it.</li>}
        </ul>
      </section>
    </nav>
  );
}
