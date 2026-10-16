import { describe, expect, it } from "vitest";
import { Player, systemClock, type Clock } from "../src";

class FakeClock implements Clock {
  t = 0;
  timers: { at: number; cb: () => void; id: number }[] = [];
  private nextId = 1;
  now() {
    return this.t;
  }
  setTimeout(cb: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, cb, id });
    return id;
  }
  clearTimeout(h: unknown) {
    this.timers = this.timers.filter((x) => x.id !== h);
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers[0];
      if (!next || next.at > end) break;
      this.timers.shift();
      this.t = next.at;
      next.cb();
    }
    this.t = end;
  }
}

describe("Player", () => {
  it("ticks at the configured fps without drift", () => {
    const clock = new FakeClock();
    const frames: number[] = [];
    const p = new Player({ fps: 10, clock, onFrame: (t) => frames.push(+t.toFixed(3)) });
    p.play();
    clock.advance(1000);
    expect(frames).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    expect(p.playing).toBe(true);
  });

  it("pauses, seeks and resumes from the right time", () => {
    const clock = new FakeClock();
    const frames: number[] = [];
    const p = new Player({ fps: 4, clock, onFrame: (t) => frames.push(t) });
    p.play();
    clock.advance(500);
    p.pause();
    expect(p.time).toBeCloseTo(0.5);
    clock.advance(10_000);
    expect(p.time).toBeCloseTo(0.5);
    expect(clock.timers).toHaveLength(0);
    p.seek(3);
    expect(frames.at(-1)).toBe(3);
    p.play();
    clock.advance(250);
    expect(frames.at(-1)).toBeCloseTo(3.25);
    p.play(); // idempotent
    p.pause();
    p.pause(); // idempotent
  });

  it("supports playback rate, fps changes and renderNow", () => {
    const clock = new FakeClock();
    const frames: number[] = [];
    const p = new Player({ fps: 1, clock, onFrame: (t) => frames.push(t) });
    p.rate = 2;
    p.fps = 0; // clamped to 1
    expect(p.fps).toBe(1);
    p.play();
    clock.advance(1000);
    expect(frames.at(-1)).toBeCloseTo(2);
    p.pause();
    p.renderNow();
    expect(frames.at(-1)).toBeCloseTo(2);
  });

  it("system clock works", () => {
    expect(typeof systemClock.now()).toBe("number");
    const h = systemClock.setTimeout(() => {}, 1000);
    systemClock.clearTimeout(h);
  });
});
