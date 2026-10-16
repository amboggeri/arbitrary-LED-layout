/** Layer blending into a float RGB accumulator. */
import type { BlendMode } from "@ledlay/core";

/**
 * Blend `src` over `dst` in place: dst = mix(dst, f(dst, src), opacity), only where mask != 0.
 */
export function blendInto(
  dst: Float32Array,
  src: Float32Array,
  mode: BlendMode,
  opacity: number,
  mask: Uint8Array | null = null,
): void {
  if (opacity <= 0) return;
  const n = dst.length;
  for (let j = 0; j < n; j++) {
    if (mask && mask[(j / 3) | 0] === 0) continue;
    const d = dst[j]!;
    const s = src[j]!;
    let r: number;
    switch (mode) {
      case "normal":
        r = s;
        break;
      case "add":
        r = d + s;
        break;
      case "multiply":
        r = d * s;
        break;
      case "screen":
        r = 1 - (1 - d) * (1 - s);
        break;
      case "max":
        r = d > s ? d : s;
        break;
      case "min":
        r = d < s ? d : s;
        break;
      case "subtract":
        r = d - s;
        break;
    }
    r = r < 0 ? 0 : r > 1 ? 1 : r;
    dst[j] = d + (r - d) * opacity;
  }
}
