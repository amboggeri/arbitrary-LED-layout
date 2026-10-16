/** Fixed-rate playback clock with drift correction and an injectable time source. */

export interface Clock {
  /** Milliseconds, monotonic. */
  now(): number;
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: Clock = {
  now: () => globalThis.performance?.now() ?? Date.now(),
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface PlayerOptions {
  fps: number;
  onFrame: (showTime: number, frameNumber: number) => void;
  clock?: Clock;
}

export class Player {
  private clock: Clock;
  private handle: unknown = null;
  private startedAt = 0; // clock ms when time==offset
  private offset = 0; // show seconds at startedAt
  private frameNo = 0;
  private _fps: number;
  private _playing = false;
  rate = 1;

  constructor(private readonly opts: PlayerOptions) {
    this.clock = opts.clock ?? systemClock;
    this._fps = opts.fps;
  }

  get playing(): boolean {
    return this._playing;
  }

  get fps(): number {
    return this._fps;
  }

  set fps(v: number) {
    this._fps = Math.max(1, v);
  }

  /** Current show time in seconds. */
  get time(): number {
    if (!this._playing) return this.offset;
    return this.offset + ((this.clock.now() - this.startedAt) / 1000) * this.rate;
  }

  play(): void {
    if (this._playing) return;
    this._playing = true;
    this.startedAt = this.clock.now();
    this.tick();
  }

  pause(): void {
    if (!this._playing) return;
    this.offset = this.time;
    this._playing = false;
    if (this.handle !== null) this.clock.clearTimeout(this.handle);
    this.handle = null;
  }

  seek(t: number): void {
    this.offset = t;
    this.startedAt = this.clock.now();
    if (!this._playing) this.opts.onFrame(t, this.frameNo++);
  }

  /** Render once without scheduling (e.g. after edits while paused). */
  renderNow(): void {
    this.opts.onFrame(this.time, this.frameNo++);
  }

  private tick = (): void => {
    if (!this._playing) return;
    const period = 1000 / this._fps;
    this.opts.onFrame(this.time, this.frameNo++);
    // Schedule against the ideal grid to avoid accumulating drift.
    const elapsed = this.clock.now() - this.startedAt;
    const next = Math.ceil((elapsed + 0.001) / period) * period;
    this.handle = this.clock.setTimeout(this.tick, Math.max(0, next - elapsed));
  };
}
