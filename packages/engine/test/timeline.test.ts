import { describe, expect, it } from "vitest";
import { createLayer, timelineSchema, type Timeline } from "@ledlay/core";
import { activeClips, fadeEnvelope, timelineTime } from "../src";

function tl(loop = true): Timeline {
  return timelineSchema.parse({
    duration: 10,
    loop,
    tracks: [
      {
        id: "t0",
        clips: [
          { id: "b", start: 5, duration: 5, layer: createLayer({ id: "lb", effectId: "solid" }) },
          {
            id: "a",
            start: 0,
            duration: 6,
            fadeIn: 2,
            fadeOut: 2,
            layer: createLayer({ id: "la", effectId: "solid" }),
          },
        ],
      },
      {
        id: "t1",
        muted: true,
        clips: [{ id: "m", start: 0, duration: 10, layer: createLayer({ effectId: "solid" }) }],
      },
      {
        id: "t2",
        clips: [
          {
            id: "c",
            start: 1,
            duration: 2,
            layer: createLayer({ id: "lc", effectId: "solid", opacity: 0.5 }),
          },
        ],
      },
    ],
  });
}

describe("timeline", () => {
  it("wraps or clamps show time", () => {
    expect(timelineTime(tl(), 12)).toBe(2);
    expect(timelineTime(tl(), -1)).toBe(9);
    expect(timelineTime(tl(false), 12)).toBe(10);
    expect(timelineTime(tl(false), -3)).toBe(0);
  });

  it("finds active clips in compositing order, skipping muted tracks", () => {
    const a = activeClips(tl(), 1.5);
    expect(a.map((x) => x.clip.id)).toEqual(["a", "c"]);
    expect(a[0]!.localTime).toBe(1.5);
    expect(a[0]!.layer.opacity).toBeCloseTo(0.75); // fade-in
    expect(a[1]!.layer.opacity).toBeCloseTo(0.5);
    expect(activeClips(tl(), 5.5).map((x) => x.clip.id)).toEqual(["a", "b"]);
    expect(activeClips(tl(), 6).map((x) => x.clip.id)).toEqual(["b"]); // end is exclusive
  });

  it("computes fade envelopes", () => {
    const clip = tl().tracks[0]!.clips[1]!;
    expect(fadeEnvelope(clip, 0)).toBe(0);
    expect(fadeEnvelope(clip, 3)).toBe(1);
    expect(fadeEnvelope(clip, 5)).toBeCloseTo(0.5);
    expect(fadeEnvelope(tl().tracks[0]!.clips[0]!, 1)).toBe(1);
  });
});
