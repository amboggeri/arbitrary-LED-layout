/** Splitting a flat channel buffer into DMX-style universes (shared by E1.31 and Art-Net). */

export interface UniverseChunk {
  universe: number;
  data: Uint8Array;
}

/**
 * Slice `data` into consecutive universes of `channelsPerUniverse` slots starting at
 * `universeStart`. Use 510 for RGB (170 px) or 512 for RGBW (128 px) so pixels never straddle.
 */
export function splitUniverses(data: Uint8Array, universeStart: number, channelsPerUniverse = 510): UniverseChunk[] {
  if (channelsPerUniverse < 1 || channelsPerUniverse > 512) throw new RangeError("channelsPerUniverse must be 1..512");
  const out: UniverseChunk[] = [];
  for (let i = 0, u = universeStart; i < data.length; i += channelsPerUniverse, u++) {
    out.push({ universe: u, data: data.subarray(i, Math.min(data.length, i + channelsPerUniverse)) });
  }
  return out;
}

export function universeCount(channels: number, channelsPerUniverse = 510): number {
  return Math.ceil(channels / channelsPerUniverse);
}
