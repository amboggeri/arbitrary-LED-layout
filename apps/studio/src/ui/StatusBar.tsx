import { useStudio } from "../state/store";

export function StatusBar() {
  const fps = useStudio((s) => s.fps);
  const stats = useStudio((s) => s.bridge.stats);
  const status = useStudio((s) => s.bridge.status);
  const fixtures = useStudio((s) => s.project.fixtures.length);
  const playback = useStudio((s) => s.project.playback);
  return (
    <footer className="statusbar">
      <span>{fixtures} fixtures</span>
      <span>mode: {playback}</span>
      <span>{fps ? `${fps} fps` : "paused"}</span>
      {status === "open" && stats && (
        <span>
          bridge: {stats.fps.toFixed(0)} fps · {stats.packets} pkts · {(stats.bytes / 1e6).toFixed(1)} MB
          {stats.errors > 0 && <span className="warn"> · {stats.errors} errors ({stats.lastError})</span>}
        </span>
      )}
      <span className="spacer" />
      <span className="muted">Space play · Q/W/E/R/D tools · F frame · Del delete · Ctrl+Z undo</span>
    </footer>
  );
}
