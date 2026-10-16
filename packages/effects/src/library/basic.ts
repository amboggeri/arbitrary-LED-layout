import { hsv, sampleGradient, type RGB } from "@ledlay/core";
import { defineEffect } from "../effect";
import { AXIS_OPTIONS, axisCoord, fill, fract, setPixel, triangle } from "../helpers";
import { hash01 } from "../noise";

export const solid = defineEffect({
  id: "solid",
  name: "Solid",
  category: "basic",
  description: "Every pixel the same color.",
  params: { color: { type: "color", label: "Color", default: "#ffffff" } },
  render({ params }, out) {
    fill(out, params.color[0], params.color[1], params.color[2]);
  },
});

export const gradient = defineEffect({
  id: "gradient",
  name: "Gradient",
  category: "basic",
  description: "Map a color gradient along an axis, optionally scrolling.",
  params: {
    gradient: {
      type: "gradient",
      label: "Gradient",
      default: [
        { pos: 0, color: "#ff0040" },
        { pos: 0.5, color: "#ffb000" },
        { pos: 1, color: "#0040ff" },
      ],
    },
    axis: { type: "select", label: "Axis", default: "y", options: AXIS_OPTIONS },
    repeat: { type: "number", label: "Repeat", default: 1, min: 0.1, max: 20, step: 0.1 },
    speed: {
      type: "number",
      label: "Scroll speed",
      default: 0,
      min: -5,
      max: 5,
      step: 0.01,
      unit: "cycles/s",
    },
    mirror: { type: "boolean", label: "Mirror", default: false },
  },
  render({ params, space, time }, out) {
    const c: RGB = [0, 0, 0];
    for (let i = 0; i < space.count; i++) {
      const v = axisCoord(space, i, params.axis) * params.repeat - time * params.speed;
      sampleGradient(params.gradient, params.mirror ? triangle(v) : fract(v), c);
      setPixel(out, i, c[0], c[1], c[2]);
    }
  },
});

export const strobe = defineEffect({
  id: "strobe",
  name: "Strobe",
  category: "basic",
  description: "Flash all pixels at a fixed rate.",
  params: {
    color: { type: "color", label: "Color", default: "#ffffff" },
    rate: { type: "number", label: "Rate", default: 4, min: 0.1, max: 30, step: 0.1, unit: "Hz" },
    duty: { type: "number", label: "On fraction", default: 0.2, min: 0.01, max: 1, step: 0.01 },
  },
  render({ params, time }, out) {
    const on = fract(time * params.rate) < params.duty ? 1 : 0;
    fill(out, params.color[0] * on, params.color[1] * on, params.color[2] * on);
  },
});

export const twinkle = defineEffect({
  id: "twinkle",
  name: "Twinkle",
  category: "particle",
  description: "Random pixels sparkle and fade. Deterministic, so it scrubs and bakes cleanly.",
  params: {
    color: { type: "color", label: "Color", default: "#fff2d0" },
    randomHue: { type: "boolean", label: "Random hue", default: false },
    density: { type: "number", label: "Density", default: 0.15, min: 0, max: 1, step: 0.01 },
    period: {
      type: "number",
      label: "Twinkle time",
      default: 1.2,
      min: 0.05,
      max: 10,
      step: 0.05,
      unit: "s",
    },
    seed: { type: "number", label: "Seed", default: 1, min: 0, max: 9999, step: 1 },
  },
  render({ params, space, time }, out) {
    const c: RGB = [0, 0, 0];
    const seed = params.seed | 0;
    for (let i = 0; i < space.count; i++) {
      // Each pixel has a random phase so slots don't all roll over together.
      const local = time / params.period + hash01(i, seed + 7919);
      const slot = Math.floor(local);
      const phase = local - slot;
      const key = i * 7349 + slot;
      if (hash01(key, seed) < params.density) {
        // Fast attack, slow decay.
        const env = phase < 0.15 ? phase / 0.15 : Math.pow(1 - (phase - 0.15) / 0.85, 2);
        if (params.randomHue) hsv(hash01(key, seed + 1), 0.8, env, c);
        else {
          c[0] = params.color[0] * env;
          c[1] = params.color[1] * env;
          c[2] = params.color[2] * env;
        }
        setPixel(out, i, c[0], c[1], c[2]);
      } else setPixel(out, i, 0, 0, 0);
    }
  },
});
