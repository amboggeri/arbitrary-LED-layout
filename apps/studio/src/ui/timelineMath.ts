/** Pure helpers for the timeline view (unit-tested). */

export function timeToX(t: number, pxPerSec: number): number {
  return t * pxPerSec;
}

export function xToTime(x: number, pxPerSec: number): number {
  return Math.max(0, x / pxPerSec);
}

/** Snap to `step` seconds when within `tolerance` seconds; 0 step disables. */
export function snap(t: number, step: number, tolerance = step / 2): number {
  if (step <= 0) return t;
  const s = Math.round(t / step) * step;
  return Math.abs(s - t) <= tolerance ? +s.toFixed(6) : t;
}

/** Pick a "nice" ruler tick interval so labels are at least `minPx` apart. */
export function tickStep(pxPerSec: number, minPx = 60): number {
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return candidates.find((c) => c * pxPerSec >= minPx) ?? 600;
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

/** Snap down to the grid (used when inserting at the playhead so the clip covers it). */
export function snapDown(t: number, step: number): number {
  if (step <= 0) return t;
  return +(Math.floor(t / step + 1e-9) * step).toFixed(6);
}
