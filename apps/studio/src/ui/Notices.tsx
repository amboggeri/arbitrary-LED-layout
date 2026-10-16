import { useEffect } from "react";
import { studio, useStudio } from "../state/store";

export function Notices() {
  const notices = useStudio((s) => s.notices);
  useEffect(() => {
    const info = notices.filter((n) => n.kind === "info");
    if (info.length === 0) return;
    const t = setTimeout(() => studio.getState().dismiss(info[0]!.id), 5000);
    return () => clearTimeout(t);
  }, [notices]);
  return (
    <div className="notices" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice ${n.kind}`} role={n.kind === "error" ? "alert" : "status"}>
          <span>{n.text}</span>
          <button className="ghost" aria-label="dismiss" onClick={() => studio.getState().dismiss(n.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
