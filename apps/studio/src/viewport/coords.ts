import { composeMatrix, type TransformData, type Vec3 } from "@ledlay/core";

/** Convert a world point into the local space of a fixture transform (inverse of T·R·S). */
export function worldToLocal(t: TransformData, p: Vec3): Vec3 {
  const m = composeMatrix(t);
  const c0: Vec3 = [m[0]!, m[1]!, m[2]!];
  const c1: Vec3 = [m[4]!, m[5]!, m[6]!];
  const c2: Vec3 = [m[8]!, m[9]!, m[10]!];
  const det3 = (u: Vec3, v: Vec3, w: Vec3) =>
    u[0] * (v[1] * w[2] - v[2] * w[1]) - v[0] * (u[1] * w[2] - u[2] * w[1]) + w[0] * (u[1] * v[2] - u[2] * v[1]);
  const det = det3(c0, c1, c2);
  if (Math.abs(det) < 1e-12) return [...p];
  // Solve c0*u + c1*v + c2*w = p - translation with Cramer's rule.
  const r: Vec3 = [p[0] - m[12]!, p[1] - m[13]!, p[2] - m[14]!];
  return [det3(r, c1, c2) / det, det3(c0, r, c2) / det, det3(c0, c1, r) / det];
}
