/** Timeline evaluation: which clips are active at time t, with local time and fade envelope. */
import type { Clip, Layer, Timeline } from "@ledlay/core";

export interface ActiveClip {
  clip: Clip;
  /** Layer to render, opacity already multiplied by fade envelope. */
  layer: Layer;
  /** Time relative to the clip start, seconds. */
  localTime: number;
  trackIndex: number;
}

/** Map show time onto the timeline (looping or clamped). */
export function timelineTime(tl: Timeline, t: number): number {
  if (tl.loop) return ((t % tl.duration) + tl.duration) % tl.duration;
  return Math.min(Math.max(0, t), tl.duration);
}

export function fadeEnvelope(clip: Clip, local: number): number {
  let k = 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) k = Math.min(k, local / clip.fadeIn);
  const remaining = clip.duration - local;
  if (clip.fadeOut > 0 && remaining < clip.fadeOut) k = Math.min(k, remaining / clip.fadeOut);
  return Math.max(0, Math.min(1, k));
}

/** Active clips in compositing order (track 0 first, then by clip start within a track). */
export function activeClips(tl: Timeline, showTime: number): ActiveClip[] {
  const t = timelineTime(tl, showTime);
  const out: ActiveClip[] = [];
  tl.tracks.forEach((track, trackIndex) => {
    if (track.muted) return;
    const clips = [...track.clips].sort((a, b) => a.start - b.start);
    for (const clip of clips) {
      if (t < clip.start || t >= clip.start + clip.duration) continue;
      const localTime = t - clip.start;
      const env = fadeEnvelope(clip, localTime);
      out.push({ clip, layer: { ...clip.layer, opacity: clip.layer.opacity * env }, localTime, trackIndex });
    }
  });
  return out;
}
