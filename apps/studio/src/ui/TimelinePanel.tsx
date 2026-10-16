/** Multi-track timeline: clips are effect layers placed in time. */
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import * as cmd from "@ledlay/editor";
import { useRuntime } from "../runtime/context";
import { studio, useStudio } from "../state/store";
import { Checkbox, NumberInput } from "./controls";
import { formatTime, snap, tickStep, timeToX, xToTime } from "./timelineMath";

type DragKind = "move" | "resize";

export function TimelinePanel() {
  const tl = useStudio((s) => s.project.timeline);
  const playback = useStudio((s) => s.project.playback);
  const time = useStudio((s) => s.time);
  const selection = useStudio((s) => s.selection);
  const runtime = useRuntime();
  const [pxPerSec, setPxPerSec] = useState(40);
  const [snapOn, setSnapOn] = useState(true);
  const drag = useRef<{ kind: DragKind; clipId: string; startX: number; start: number; duration: number } | null>(null);
  const { apply, select, seal } = studio.getState();
  const width = timeToX(tl.duration, pxPerSec) + 200;
  const step = tickStep(pxPerSec);
  const snapStep = snapOn ? step / 4 : 0;

  const seekFromEvent = (e: RPointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    runtime.seek(snap(xToTime(e.clientX - rect.left, pxPerSec), snapStep));
  };

  const onClipPointerDown = (e: RPointerEvent<HTMLDivElement>, clipId: string, start: number, duration: number) => {
    e.stopPropagation();
    const kind: DragKind = (e.target as HTMLElement).classList.contains("handle") ? "resize" : "move";
    drag.current = { kind, clipId, startX: e.clientX, start, duration };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    select({ kind: "clip", id: clipId });
  };
  const onClipPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dt = (e.clientX - d.startX) / pxPerSec;
    if (d.kind === "move") apply((p) => cmd.updateClip(p, d.clipId, { start: snap(Math.max(0, d.start + dt), snapStep) }), "Move clip", `clip:${d.clipId}`);
    else apply((p) => cmd.updateClip(p, d.clipId, { duration: Math.max(0.05, snap(d.start + d.duration + dt, snapStep) - d.start) }), "Resize clip", `clip:${d.clipId}`);
  };
  const onClipPointerUp = () => {
    drag.current = null;
    seal();
  };

  const ticks: number[] = [];
  for (let t = 0; t <= tl.duration + 1e-9; t += step) ticks.push(+t.toFixed(6));

  return (
    <div className="timeline" data-testid="timeline-panel">
      {playback !== "timeline" && (
        <div className="banner">
          Playback is in <b>live</b> mode.{" "}
          <button className="link" onClick={() => apply((p) => cmd.setProjectMeta(p, { playback: "timeline" }), "Timeline mode")}>
            Switch to timeline
          </button>
        </div>
      )}
      <div className="timeline-toolbar row">
        <button
          onClick={() => {
            const r = cmd.addTrack(studio.getState().project, `Track ${tl.tracks.length + 1}`);
            apply(() => r.project, "Add track");
          }}
        >
          ＋ Track
        </button>
        <label>
          Duration <NumberInput ariaLabel="timeline duration" value={tl.duration} min={1} onChange={(duration) => apply((p) => cmd.setTimeline(p, { duration }), "Timeline duration")} />
        </label>
        <Checkbox label="Loop" checked={tl.loop} onChange={(loop) => apply((p) => cmd.setTimeline(p, { loop }), "Loop")} />
        <Checkbox label="Snap" checked={snapOn} onChange={setSnapOn} />
        <label>
          Zoom <input type="range" aria-label="zoom" min={5} max={400} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} />
        </label>
        <span className="mono">{formatTime(time)}</span>
      </div>
      <div className="timeline-body">
        <div className="track-headers">
          <div className="ruler-spacer" />
          {tl.tracks.map((t) => (
            <div className="track-header" key={t.id}>
              <span className="name">{t.name || "Track"}</span>
              <button className={`ghost ${t.muted ? "on" : ""}`} title="Mute" onClick={() => apply((p) => cmd.updateTrack(p, t.id, { muted: !t.muted }), "Mute track")}>
                M
              </button>
              <select
                aria-label={`add clip to ${t.name}`}
                value=""
                onChange={(e) => {
                  const effect = runtime.registry.get(e.target.value);
                  if (!effect) return;
                  const r = cmd.addClip(studio.getState().project, t.id, {
                    start: snap(time, snapStep),
                    duration: 5,
                    layer: { name: effect.name, effectId: effect.id },
                  });
                  apply(() => r.project, "Add clip");
                  select({ kind: "clip", id: r.clipId });
                }}
              >
                <option value="">＋ clip</option>
                {runtime.registry.list().map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button className="ghost danger" title="Delete track" onClick={() => apply((p) => cmd.removeTrack(p, t.id), "Delete track")}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="track-area">
          <div style={{ width }} className="track-area-inner">
            <div className="ruler" onPointerDown={seekFromEvent} data-testid="ruler">
              {ticks.map((t) => (
                <span key={t} className="tick" style={{ left: timeToX(t, pxPerSec) }}>
                  {formatTime(t)}
                </span>
              ))}
              <div className="end-marker" style={{ left: timeToX(tl.duration, pxPerSec) }} />
            </div>
            {tl.tracks.map((t) => (
              <div className={`track ${t.muted ? "muted" : ""}`} key={t.id} onPointerDown={seekFromEvent}>
                {t.clips.map((c) => (
                  <div
                    key={c.id}
                    className={`clip ${selection?.kind === "clip" && selection.id === c.id ? "selected" : ""}`}
                    style={{ left: timeToX(c.start, pxPerSec), width: Math.max(6, timeToX(c.duration, pxPerSec)) }}
                    onPointerDown={(e) => onClipPointerDown(e, c.id, c.start, c.duration)}
                    onPointerMove={onClipPointerMove}
                    onPointerUp={onClipPointerUp}
                    title={`${c.layer.name || c.layer.effectId} ${formatTime(c.start)} → ${formatTime(c.start + c.duration)}`}
                  >
                    {c.fadeIn > 0 && <span className="fade in" style={{ width: timeToX(c.fadeIn, pxPerSec) }} />}
                    <span className="label">{c.layer.name || c.layer.effectId}</span>
                    {c.fadeOut > 0 && <span className="fade out" style={{ width: timeToX(c.fadeOut, pxPerSec) }} />}
                    <span className="handle" />
                  </div>
                ))}
              </div>
            ))}
            <div className="playhead" style={{ left: timeToX(tl.loop ? time % tl.duration : Math.min(time, tl.duration), pxPerSec) }} />
          </div>
        </div>
      </div>
      {tl.tracks.length === 0 && <p className="muted pad">Add a track, then add clips at the playhead.</p>}
    </div>
  );
}
