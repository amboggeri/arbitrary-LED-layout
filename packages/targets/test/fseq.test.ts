import { describe, expect, it } from "vitest";
import { createController, createFixture, createLayer, createProject, timelineSchema } from "@ledlay/core";
import { createDefaultRegistry } from "@ledlay/effects";
import { FseqWriter, bakeFseq, readFseqFrame, readFseqHeader } from "../src";

describe("FSEQ v2", () => {
  it("writes a header FPP can parse and round-trips frames", () => {
    const w = new FseqWriter({
      channelCount: 6,
      stepTimeMs: 25,
      uniqueId: 42n,
      variableHeaders: [
        { code: "mf", value: "song.mp3" },
        { code: "sp", value: "ledlay" },
      ],
    });
    w.addFrame(new Uint8Array([1, 2, 3, 4, 5, 6]));
    w.addFrame(new Uint8Array([9, 9])); // short frames are zero-padded
    expect(w.frameCount).toBe(2);
    const buf = w.finish();
    expect(String.fromCharCode(...buf.subarray(0, 4))).toBe("PSEQ");
    const h = readFseqHeader(buf);
    expect(h).toMatchObject({
      majorVersion: 2,
      minorVersion: 0,
      channelCount: 6,
      frameCount: 2,
      stepTimeMs: 25,
      compression: 0,
      uniqueId: 42n,
    });
    expect(h.channelDataOffset % 4).toBe(0);
    expect(h.variableHeaders).toEqual([
      { code: "mf", value: "song.mp3" },
      { code: "sp", value: "ledlay" },
    ]);
    expect([...readFseqFrame(buf, h, 1)]).toEqual([9, 9, 0, 0, 0, 0]);
    expect(buf.length).toBe(h.channelDataOffset + 12);
  });

  it("validates input", () => {
    expect(() => new FseqWriter({ channelCount: 3, stepTimeMs: 0 })).toThrow();
    const w = new FseqWriter({ channelCount: 1, stepTimeMs: 50 });
    expect(() => w.addFrame(new Uint8Array(2))).toThrow();
    expect(() => readFseqHeader(new Uint8Array(4))).toThrow(/too short/);
    expect(() => readFseqHeader(new Uint8Array(40))).toThrow(/Not an FSEQ/);
    const buf = w.finish();
    const h = readFseqHeader(buf);
    expect(() => readFseqFrame(buf, h, 0)).toThrow(/out of range/);
    expect(() => readFseqFrame(buf, { ...h, compression: 1 }, 0)).toThrow(/Compressed/);
    const v1 = buf.slice();
    v1[7] = 1;
    expect(() => readFseqHeader(v1)).toThrow(/major version/);
    expect(() => new FseqWriter({ channelCount: 1, stepTimeMs: 50, variableHeaders: [{ code: "x", value: "" }] }).finish()).toThrow();
  });
});

describe("bakeFseq", () => {
  function project() {
    const f = createFixture({ id: "a", name: "A", geometry: { kind: "strip", count: 2, spacing: 1 } });
    f.patch = { controllerId: "c", output: 0, startPixel: 0 };
    return createProject({
      fps: 20,
      fixtures: [f],
      controllers: [createController({ id: "c", name: "C", host: "h" })],
      layers: [createLayer({ effectId: "solid", params: { color: "#ff0000" } })],
    });
  }

  it("renders live mode for the requested duration", () => {
    let progress = 0;
    const buf = bakeFseq(project(), createDefaultRegistry(), {
      controllerId: "c",
      duration: 1,
      mediaFile: "a.mp3",
      onProgress: (d) => (progress = d),
    });
    const h = readFseqHeader(buf);
    expect(h.frameCount).toBe(20);
    expect(h.stepTimeMs).toBe(50);
    expect(h.channelCount).toBe(6);
    expect(progress).toBe(20);
    expect(h.variableHeaders.map((v) => v.code)).toEqual(["sp", "mf"]);
    expect([...readFseqFrame(buf, h, 5)]).toEqual([255, 0, 0, 255, 0, 0]);
  });

  it("uses timeline duration and timing in timeline mode", () => {
    const p = project();
    p.playback = "timeline";
    p.timeline = timelineSchema.parse({
      duration: 2,
      tracks: [{ id: "t", clips: [{ id: "k", start: 1, duration: 1, layer: createLayer({ effectId: "solid", params: { color: "#00ff00" } }) }] }],
    });
    const buf = bakeFseq(p, createDefaultRegistry(), { controllerId: "c" });
    const h = readFseqHeader(buf);
    expect(h.frameCount).toBe(40);
    expect([...readFseqFrame(buf, h, 0)]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([...readFseqFrame(buf, h, 30)]).toEqual([0, 255, 0, 0, 255, 0]);
    expect(() => bakeFseq(p, createDefaultRegistry(), { controllerId: "missing" })).toThrow();
  });
});
