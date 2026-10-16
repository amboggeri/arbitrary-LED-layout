import { useEffect } from "react";
import { useRuntime } from "./runtime/context";
import { saveAutosave } from "./state/persistence";
import { studio, useStudio } from "./state/store";
import { Inspector } from "./ui/Inspector";
import { IssuesPanel } from "./ui/IssuesPanel";
import { LayersPanel } from "./ui/LayersPanel";
import { Notices } from "./ui/Notices";
import { Outliner } from "./ui/Outliner";
import { handleShortcut } from "./ui/shortcuts";
import { StatusBar } from "./ui/StatusBar";
import { TimelinePanel } from "./ui/TimelinePanel";
import { Toolbar } from "./ui/Toolbar";
import { ViewportView } from "./viewport/ViewportView";

export function App() {
  const runtime = useRuntime();
  const tab = useStudio((s) => s.bottomTab);
  const setTab = studio.getState().setBottomTab;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const frameAll = () =>
        (window as unknown as { __ledlayViewport?: { frameAll(): void } }).__ledlayViewport?.frameAll();
      if (handleShortcut(e, studio, runtime, frameAll)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runtime]);

  // Debounced autosave.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = studio.subscribe((s, prev) => {
      if (s.project === prev.project) return;
      clearTimeout(timer);
      timer = setTimeout(() => saveAutosave(s.project), 800);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <Outliner />
        <div className="center">
          <ViewportView />
          <div className="bottom">
            <div className="tabs" role="tablist">
              {(["layers", "timeline", "issues"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                >
                  {t[0]!.toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="tab-body">
              {tab === "layers" && <LayersPanel />}
              {tab === "timeline" && <TimelinePanel />}
              {tab === "issues" && <IssuesPanel />}
            </div>
          </div>
        </div>
        <Inspector />
      </div>
      <StatusBar />
      <Notices />
    </div>
  );
}
