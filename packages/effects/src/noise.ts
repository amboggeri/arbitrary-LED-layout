/** Deterministic noise + PRNG helpers for effects. */

/** Mulberry32: tiny, fast, seedable PRNG returning floats in [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash -> [0,1). Stateless, useful for per-pixel randomness keyed by index + time slot. */
export function hash01(n: number, seed = 0): number {
  let h = (n | 0) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Ken Perlin's improved noise (2002), 3D.
const P = new Uint8Array(512);
{
  const rand = mulberry32(1337);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j]!, perm[i]!];
  }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255]!;
}

function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** 3D gradient noise in roughly [-1, 1]. Hot path: no allocations or closures. */
export function noise3(x: number, y: number, z: number): number {
  const fx = Math.floor(x),
    fy = Math.floor(y),
    fz = Math.floor(z);
  const X = fx & 255,
    Y = fy & 255,
    Z = fz & 255;
  x -= fx;
  y -= fy;
  z -= fz;
  const u = x * x * x * (x * (x * 6 - 15) + 10);
  const v = y * y * y * (y * (y * 6 - 15) + 10);
  const w = z * z * z * (z * (z * 6 - 15) + 10);
  const A = P[X]! + Y,
    AA = P[A]! + Z,
    AB = P[A + 1]! + Z;
  const B = P[X + 1]! + Y,
    BA = P[B]! + Z,
    BB = P[B + 1]! + Z;
  const g000 = grad(P[AA]!, x, y, z),
    g100 = grad(P[BA]!, x - 1, y, z);
  const g010 = grad(P[AB]!, x, y - 1, z),
    g110 = grad(P[BB]!, x - 1, y - 1, z);
  const g001 = grad(P[AA + 1]!, x, y, z - 1),
    g101 = grad(P[BA + 1]!, x - 1, y, z - 1);
  const g011 = grad(P[AB + 1]!, x, y - 1, z - 1),
    g111 = grad(P[BB + 1]!, x - 1, y - 1, z - 1);
  const x00 = g000 + u * (g100 - g000),
    x10 = g010 + u * (g110 - g010);
  const x01 = g001 + u * (g101 - g001),
    x11 = g011 + u * (g111 - g011);
  const y0 = x00 + v * (x10 - x00),
    y1 = x01 + v * (x11 - x01);
  return y0 + w * (y1 - y0);
}

/** Fractal Brownian motion over noise3, normalised to roughly [0,1]. */
export function fbm3(x: number, y: number, z: number, octaves = 3): number {
  let amp = 0.5,
    freq = 1,
    sum = 0,
    norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return 0.5 + 0.5 * (sum / norm);
}
