/**
 * PixelSpace: everything an effect may know about the pixels it paints, as flat typed
 * arrays for speed. Built once per layout change, shared by all effects.
 */
import { boundsOf, type Bounds, type Vec3 } from "@ledlay/core";

export interface PixelSpace {
  count: number;
  /** World positions (project units), xyz interleaved. */
  xyz: Float32Array;
  /** Per-axis stretched coordinates in [0,1] across the layout bounds (flat axes = 0.5). */
  unit: Float32Array;
  /** Aspect-preserving coordinates centered on the layout, largest half-extent mapped to [-1,1]. */
  centered: Float32Array;
  /** Position along the pixel's fixture in wiring order, [0,1]. */
  u: Float32Array;
  /** Index of the pixel within its fixture. */
  indexInFixture: Uint32Array;
  /** Index of the fixture the pixel belongs to. */
  fixture: Uint32Array;
  fixtureCount: number;
  bounds: Bounds;
  center: Vec3;
  /** Half of the largest bounds extent (world units). */
  halfExtent: number;
}

export interface PixelSpaceInput {
  xyz: ArrayLike<number>;
  /** Per-pixel fixture index; defaults to all-zero (one fixture). */
  fixture?: ArrayLike<number>;
  /** Per-pixel index within fixture; defaults to global index. */
  indexInFixture?: ArrayLike<number>;
}

export function createPixelSpace(input: PixelSpaceInput): PixelSpace {
  const count = Math.floor(input.xyz.length / 3);
  const xyz = Float32Array.from(input.xyz);
  const fixture = input.fixture ? Uint32Array.from(input.fixture) : new Uint32Array(count);
  const indexInFixture = input.indexInFixture
    ? Uint32Array.from(input.indexInFixture)
    : Uint32Array.from({ length: count }, (_, i) => i);
  const bounds = boundsOf(xyz);
  const size: Vec3 = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
  const center: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const halfExtent = Math.max(size[0], size[1], size[2]) / 2 || 1;
  const unit = new Float32Array(count * 3);
  const centered = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      const v = xyz[i * 3 + k]!;
      unit[i * 3 + k] = size[k]! > 0 ? (v - bounds.min[k]!) / size[k]! : 0.5;
      centered[i * 3 + k] = (v - center[k]!) / halfExtent;
    }
  }
  // u along fixture: needs per-fixture counts.
  let fixtureCount = 0;
  const perFixture = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const f = fixture[i]!;
    fixtureCount = Math.max(fixtureCount, f + 1);
    perFixture.set(f, Math.max(perFixture.get(f) ?? 0, indexInFixture[i]! + 1));
  }
  const u = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const n = perFixture.get(fixture[i]!)!;
    u[i] = n > 1 ? indexInFixture[i]! / (n - 1) : 0;
  }
  return { count, xyz, unit, centered, u, indexInFixture, fixture, fixtureCount, bounds, center, halfExtent };
}
