import { describe, expect, it } from "vitest";
import {
  applyMatrix,
  boundsCenter,
  boundsOf,
  boundsSize,
  composeMatrix,
  distance,
  identityTransform,
  mod,
  normalize,
  transformPoint,
  type Vec3,
} from "../src";

const close = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

describe("transforms", () => {
  it("identity leaves points unchanged", () => {
    close(transformPoint(identityTransform(), [1, 2, 3]), [1, 2, 3]);
  });

  it("applies scale, then rotation, then translation", () => {
    const t = { position: [10, 0, 0] as Vec3, rotation: [0, 0, 90] as Vec3, scale: [2, 2, 2] as Vec3 };
    // (1,0,0) * 2 = (2,0,0); rotate 90° about Z -> (0,2,0); translate -> (10,2,0)
    close(transformPoint(t, [1, 0, 0]), [10, 2, 0]);
  });

  it("rotates about X and Y with right-handed convention", () => {
    close(transformPoint({ ...identityTransform(), rotation: [90, 0, 0] }, [0, 1, 0]), [0, 0, 1]);
    close(transformPoint({ ...identityTransform(), rotation: [0, 90, 0] }, [0, 0, 1]), [1, 0, 0]);
  });

  it("matches three.js Euler 'XYZ' (R = Rx * Ry * Rz)", () => {
    const m = composeMatrix({ position: [0, 0, 0], rotation: [90, 0, 90], scale: [1, 1, 1] });
    // (0,1,0) -Rz-> (-1,0,0) -Rx-> (-1,0,0)
    close(applyMatrix(m, [0, 1, 0]), [-1, 0, 0]);
    // (1,0,0) -Rz-> (0,1,0) -Rx-> (0,0,1)
    close(applyMatrix(m, [1, 0, 0]), [0, 0, 1]);
  });
});

describe("helpers", () => {
  it("computes bounds, size and center", () => {
    const b = boundsOf([0, 0, 0, 2, -4, 6]);
    expect(b).toEqual({ min: [0, -4, 0], max: [2, 0, 6] });
    expect(boundsSize(b)).toEqual([2, 4, 6]);
    expect(boundsCenter(b)).toEqual([1, -2, 3]);
    expect(boundsOf([])).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
  });

  it("positive modulo and normalize", () => {
    expect(mod(-1, 5)).toBe(4);
    expect(mod(7, 5)).toBe(2);
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
    expect(distance(normalize([3, 4, 0]), [0.6, 0.8, 0])).toBeCloseTo(0);
  });
});
