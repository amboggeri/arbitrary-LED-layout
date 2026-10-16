import { describe, expect, it } from "vitest";
import { formatTime, snap, snapDown, tickStep, timeToX, xToTime } from "../src/ui/timelineMath";

describe("timeline math", () => {
  it("converts between px and seconds", () => {
    expect(timeToX(2, 40)).toBe(80);
    expect(xToTime(80, 40)).toBe(2);
    expect(xToTime(-5, 40)).toBe(0);
  });
  it("snaps within tolerance", () => {
    expect(snap(1.97, 0.5)).toBe(2);
    expect(snap(1.7, 0.5, 0.1)).toBe(1.7);
    expect(snap(1.23, 0)).toBe(1.23);
    expect(snapDown(1.95, 0.5)).toBe(1.5);
    expect(snapDown(2, 0.5)).toBe(2);
    expect(snapDown(1.95, 0)).toBe(1.95);
  });
  it("chooses readable tick steps", () => {
    expect(tickStep(40)).toBe(2);
    expect(tickStep(400)).toBe(0.25);
    expect(tickStep(0.01)).toBe(600);
  });
  it("formats time", () => {
    expect(formatTime(0)).toBe("0:00.00");
    expect(formatTime(75.5)).toBe("1:15.50");
  });
});
