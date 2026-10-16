/** Linear undo/redo history over immutable snapshots, with optional coalescing. */

export interface HistoryOptions {
  limit?: number;
}

export class History<T> {
  private past: { state: T; label: string }[] = [];
  private future: { state: T; label: string }[] = [];
  private lastKey: string | null = null;
  private readonly limit: number;

  constructor(
    private current: T,
    opts: HistoryOptions = {},
  ) {
    this.limit = opts.limit ?? 200;
  }

  get present(): T {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string | null {
    return this.past.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.future.at(-1)?.label ?? null;
  }

  /**
   * Commit a new state. Consecutive commits with the same non-null `coalesceKey` merge into
   * one undo step (e.g. dragging a slider). Committing an identical reference is a no-op.
   */
  commit(next: T, label = "Edit", coalesceKey: string | null = null): void {
    if (next === this.current) return;
    if (!(coalesceKey !== null && coalesceKey === this.lastKey && this.past.length > 0)) {
      this.past.push({ state: this.current, label });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.current = next;
    this.future = [];
    this.lastKey = coalesceKey;
  }

  /** End any coalescing run (e.g. on pointer-up). */
  seal(): void {
    this.lastKey = null;
  }

  undo(): T {
    const prev = this.past.pop();
    if (prev) {
      this.future.push({ state: this.current, label: prev.label });
      this.current = prev.state;
    }
    this.lastKey = null;
    return this.current;
  }

  redo(): T {
    const next = this.future.pop();
    if (next) {
      this.past.push({ state: this.current, label: next.label });
      this.current = next.state;
    }
    this.lastKey = null;
    return this.current;
  }

  /** Replace everything (e.g. after opening a file). */
  reset(state: T): void {
    this.current = state;
    this.past = [];
    this.future = [];
    this.lastKey = null;
  }
}
