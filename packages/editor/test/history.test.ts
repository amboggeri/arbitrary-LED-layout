import { describe, expect, it } from "vitest";
import { History } from "../src";

describe("History", () => {
  it("undoes and redoes", () => {
    const h = new History(0);
    h.commit(1, "one");
    h.commit(2, "two");
    expect(h.undoLabel).toBe("two");
    expect(h.undo()).toBe(1);
    expect(h.redoLabel).toBe("two");
    expect(h.undo()).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.undo()).toBe(0);
    expect(h.redo()).toBe(1);
    expect(h.redo()).toBe(2);
    expect(h.canRedo).toBe(false);
    expect(h.redo()).toBe(2);
  });

  it("clears redo on new commits and ignores identical states", () => {
    const h = new History(0);
    h.commit(1);
    h.undo();
    h.commit(5);
    expect(h.canRedo).toBe(false);
    h.commit(5);
    h.undo();
    expect(h.present).toBe(0);
  });

  it("coalesces consecutive commits with the same key until sealed", () => {
    const h = new History(0);
    h.commit(1, "drag", "slider");
    h.commit(2, "drag", "slider");
    h.commit(3, "drag", "slider");
    h.seal();
    h.commit(4, "drag", "slider");
    expect(h.undo()).toBe(3);
    expect(h.undo()).toBe(0);
  });

  it("enforces a limit and resets", () => {
    const h = new History(0, { limit: 2 });
    for (let i = 1; i <= 5; i++) h.commit(i);
    h.undo();
    h.undo();
    expect(h.canUndo).toBe(false);
    expect(h.present).toBe(3);
    h.reset(42);
    expect(h.present).toBe(42);
    expect(h.canRedo).toBe(false);
    expect(h.undoLabel).toBeNull();
    expect(h.redoLabel).toBeNull();
  });
});
