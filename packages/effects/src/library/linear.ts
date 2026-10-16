/** Effects that work along each fixture's wiring (1D), regardless of 3D placement. */
import { defineEffect } from "../effect";
import { fract, setPixel, triangle } from "../helpers";

export const chase = defineEffect({
  id: "chase",
  name: "Chase",
  category: "pattern",
  description: "Comets running along every fixture in wiring order.",
  params: {
    color: { type: "color", label: "Color", default: "#ffffff" },
    background: { type: "color", label: "Background", default: "#000000" },
    count: { type: "number", label: "Heads per fixture", default: 1, min: 1, max: 50, step: 1 },
    tail: { type: "number", label: "Tail length", default: 0.3, min: 0.01, max: 1, step: 0.01 },
    speed: { type: "number", label: "Speed", default: 0.5, min: -10, max: 10, step: 0.01, unit: "laps/s" },
  },
  render({ params, space, time }, out) {
    const fg = params.color,
      bg = params.background;
    for (let i = 0; i < space.count; i++) {
      // Distance behind the head, in fractions of the spacing between heads.
      const behind = fract(time * params.speed * params.count - space.u[i]! * params.count);
      const k = behind < params.tail ? Math.pow(1 - behind / params.tail, 2) : 0;
      setPixel(out, i, bg[0] + (fg[0] - bg[0]) * k, bg[1] + (fg[1] - bg[1]) * k, bg[2] + (fg[2] - bg[2]) * k);
    }
  },
});

export const scanner = defineEffect({
  id: "scanner",
  name: "Scanner",
  category: "pattern",
  description: "A bouncing eye (Larson scanner) on each fixture.",
  params: {
    color: { type: "color", label: "Color", default: "#ff0000" },
    width: { type: "number", label: "Width", default: 0.12, min: 0.01, max: 1, step: 0.01 },
    speed: { type: "number", label: "Speed", default: 0.5, min: 0.01, max: 10, step: 0.01, unit: "cycles/s" },
  },
  render({ params, space, time }, out) {
    const pos = triangle(time * params.speed);
    const col = params.color;
    for (let i = 0; i < space.count; i++) {
      const d = Math.abs(space.u[i]! - pos);
      const k = d < params.width ? 1 - d / params.width : 0;
      setPixel(out, i, col[0] * k, col[1] * k, col[2] * k);
    }
  },
});
