/** Minimal, allocation-conscious 3D math. Kept dependency-free so core runs anywhere. */

export type Vec3 = [number, number, number];

/** Euler rotation in degrees, applied in X, then Y, then Z order (intrinsic XYZ, same as three.js "XYZ"). */
export interface Transform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

/** Column-major 4x4 matrix (same memory layout as three.js / WebGL). */
export type Mat4 = Float64Array;

export const DEG2RAD = Math.PI / 180;

export function identityTransform(): Transform {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l === 0 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Positive modulo: always returns a value in [0, m). */
export function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}

/** Compose a transform into a matrix: M = T * Rz * Ry * Rx * S. */
export function composeMatrix(t: Transform): Mat4 {
  const [px, py, pz] = t.position;
  const [sx, sy, sz] = t.scale;
  const x = t.rotation[0] * DEG2RAD;
  const y = t.rotation[1] * DEG2RAD;
  const z = t.rotation[2] * DEG2RAD;
  const a = Math.cos(x),
    b = Math.sin(x);
  const c = Math.cos(y),
    d = Math.sin(y);
  const e = Math.cos(z),
    f = Math.sin(z);
  // Rotation matrix for intrinsic XYZ (matches three.js Euler order "XYZ").
  const ae = a * e,
    af = a * f,
    be = b * e,
    bf = b * f;
  const r00 = c * e;
  const r01 = -c * f;
  const r02 = d;
  const r10 = af + be * d;
  const r11 = ae - bf * d;
  const r12 = -b * c;
  const r20 = bf - ae * d;
  const r21 = be + af * d;
  const r22 = a * c;
  const m = new Float64Array(16);
  m[0] = r00 * sx;
  m[1] = r10 * sx;
  m[2] = r20 * sx;
  m[4] = r01 * sy;
  m[5] = r11 * sy;
  m[6] = r21 * sy;
  m[8] = r02 * sz;
  m[9] = r12 * sz;
  m[10] = r22 * sz;
  m[12] = px;
  m[13] = py;
  m[14] = pz;
  m[15] = 1;
  return m;
}

export function applyMatrix(m: Mat4, p: Vec3): Vec3 {
  const [x, y, z] = p;
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

export function transformPoint(t: Transform, p: Vec3): Vec3 {
  return applyMatrix(composeMatrix(t), p);
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** Axis-aligned bounds of a flat xyz array. Empty input yields a zero box at the origin. */
export function boundsOf(xyz: ArrayLike<number>): Bounds {
  if (xyz.length < 3) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < xyz.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = xyz[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }
  return { min, max };
}

export function boundsSize(b: Bounds): Vec3 {
  return sub(b.max, b.min);
}

export function boundsCenter(b: Bounds): Vec3 {
  return scale(add(b.min, b.max), 0.5);
}
