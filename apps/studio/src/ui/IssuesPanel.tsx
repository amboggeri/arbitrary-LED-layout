import { validatePatch } from "@ledlay/core";
import { studio, useStudio } from "../state/store";

export function IssuesPanel() {
  const project = useStudio((s) => s.project);
  const issues = validatePatch(project);
  const select = studio.getState().select;
  if (issues.length === 0) return <div className="issues empty">No problems found. 🎉</div>;
  return (
    <ul className="issues" data-testid="issues">
      {issues.map((i, k) => (
        <li
          key={k}
          className={`issue ${i.severity}`}
          onClick={() => {
            if (i.fixtureId) select({ kind: "fixture", ids: [i.fixtureId] });
            else if (i.controllerId) select({ kind: "controller", id: i.controllerId });
          }}
        >
          <b>{i.severity}</b> {i.message}
        </li>
      ))}
    </ul>
  );
}
