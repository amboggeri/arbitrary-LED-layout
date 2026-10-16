import { hsv, sampleGradient, type RGB } from "@ledlay/core";
import { defineEffect } from "../effect";
import { fract, normalizeDir, setPixel, smoothstep, triangle } from "../helpers";
import { fbm3 } from "../noise";

export const rainbow = defineEffect({
  id: "rainbow",
  name: "Rainbow Wave",
  category: "spatial",
  description: "Hue rolls through 3D space along a direction.",
  params: {
    direction: { type: "vec3", label: "Direction", default: [0, 1, 0], min: -1, max: 1 },
    scale: { type: "number", label: "Cycles across layout", default: 1, min: 0.05, max: 20, step: 0.05 },
    speed: { type: "number", label: "Speed", default: 0.25, min: -5, max: 5, step: 0.01, unit: "cycles/s" },
    saturation: { type: "number", label: "Saturation", default: 1, min: 0, max: 1, step: 0.01 },
  },
  render({ params, space, time }, out) {
    const [dx, dy, dz] = normalizeDir(params.direction);
    const c: RGB = [0, 0, 0];
    for (let i = 0; i < space.count; i++) {
      const d =
        space.centered[i * 3]! * dx + space.centered[i * 3 + 1]! * dy + space.centered[i * 3 + 2]! * dz;
      hsv(d * 0.5 * params.scale - time * params.speed, params.saturation, 1, c);
      setPixel(out, i, c[0], c[1], c[2]);
    }
  },
});

export const planeSweep = defineEffect({
  id: "plane-sweep",
  name: "Plane Sweep",
  category: "spatial",
  description: "A slab of light sweeps through the volume along a direction.",
  params: {
    color: { type: "color", label: "Color", default: "#00e0ff" },
    background: { type: "color", label: "Background", default: "#000000" },
    direction: { type: "vec3", label: "Direction", default: [0, 1, 0], min: -1, max: 1 },
    width: { type: "number", label: "Width", default: 0.15, min: 0.01, max: 2, step: 0.01 },
    softness: { type: "number", label: "Softness", default: 0.5, min: 0, max: 1, step: 0.01 },
    speed: { type: "number", label: "Sweeps per second", default: 0.5, min: 0, max: 10, step: 0.01 },
    bounce: { type: "boolean", label: "Bounce", default: false },
  },
  init() {
    return { dir: [NaN, NaN, NaN] as number[], min: 0, max: 0 };
  },
  render({ params, space, time, state }, out) {
    const dir = normalizeDir(params.direction);
    if (dir.some((v, k) => v !== state.dir[k])) {
      // Cache projected extent for this direction.
      let mn = Infinity,
        mx = -Infinity;
      for (let i = 0; i < space.count; i++) {
        const d =
          space.centered[i * 3]! * dir[0] +
          space.centered[i * 3 + 1]! * dir[1] +
          space.centered[i * 3 + 2]! * dir[2];
        if (d < mn) mn = d;
        if (d > mx) mx = d;
      }
      state.dir = dir;
      state.min = Number.isFinite(mn) ? mn : 0;
      state.max = Number.isFinite(mx) ? mx : 0;
    }
    const w = params.width;
    const phase = params.bounce ? triangle(time * params.speed * 0.5) : fract(time * params.speed);
    const pos = state.min - w + phase * (state.max - state.min + 2 * w);
    const hard = w * (1 - params.softness);
    const fg = params.color,
      bg = params.background;
    for (let i = 0; i < space.count; i++) {
      const d =
        space.centered[i * 3]! * dir[0] +
        space.centered[i * 3 + 1]! * dir[1] +
        space.centered[i * 3 + 2]! * dir[2];
      const dist = Math.abs(d - pos);
      const k = dist <= hard ? 1 : 1 - smoothstep(hard, w, dist);
      setPixel(out, i, bg[0] + (fg[0] - bg[0]) * k, bg[1] + (fg[1] - bg[1]) * k, bg[2] + (fg[2] - bg[2]) * k);
    }
  },
});

export const shockwave = defineEffect({
  id: "shockwave",
  name: "Shockwave",
  category: "spatial",
  description: "Spherical shells expand from a point in space.",
  params: {
    center: { type: "vec3", label: "Center (−1..1)", default: [0, 0, 0], min: -1.5, max: 1.5 },
    gradient: {
      type: "gradient",
      label: "Color by radius",
      default: [
        { pos: 0, color: "#ffffff" },
        { pos: 0.4, color: "#ff00aa" },
        { pos: 1, color: "#2200ff" },
      ],
    },
    rings: { type: "number", label: "Ring density", default: 2, min: 0.1, max: 20, step: 0.1 },
    width: { type: "number", label: "Ring width", default: 0.25, min: 0.01, max: 1, step: 0.01 },
    speed: { type: "number", label: "Speed", default: 0.8, min: -5, max: 5, step: 0.01 },
  },
  render({ params, space, time }, out) {
    const [cx, cy, cz] = params.center;
    const c: RGB = [0, 0, 0];
    for (let i = 0; i < space.count; i++) {
      const dx = space.centered[i * 3]! - cx,
        dy = space.centered[i * 3 + 1]! - cy,
        dz = space.centered[i * 3 + 2]! - cz;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const phase = fract(r * params.rings - time * params.speed);
      const k = phase < params.width ? 1 - phase / params.width : 0;
      sampleGradient(params.gradient, r / 2, c);
      setPixel(out, i, c[0] * k, c[1] * k, c[2] * k);
    }
  },
});

export const orb = defineEffect({
  id: "orb",
  name: "Orb",
  category: "spatial",
  description: "A glowing point light that can orbit. Keyframe its position to fly it through the scene.",
  params: {
    color: { type: "color", label: "Color", default: "#ffaa33" },
    position: { type: "vec3", label: "Position (−1..1)", default: [0, 0, 0], min: -1.5, max: 1.5 },
    radius: { type: "number", label: "Radius", default: 0.35, min: 0.01, max: 3, step: 0.01 },
    orbitRadius: { type: "number", label: "Orbit radius", default: 0.6, min: 0, max: 2, step: 0.01 },
    orbitSpeed: {
      type: "number",
      label: "Orbit speed",
      default: 0.25,
      min: -5,
      max: 5,
      step: 0.01,
      unit: "rev/s",
    },
    orbitAxis: {
      type: "select",
      label: "Orbit around",
      default: "y",
      options: [
        { value: "x", label: "X" },
        { value: "y", label: "Y" },
        { value: "z", label: "Z" },
      ],
    },
  },
  render({ params, space, time }, out) {
    const a = time * params.orbitSpeed * Math.PI * 2;
    const ca = Math.cos(a) * params.orbitRadius,
      sa = Math.sin(a) * params.orbitRadius;
    let [px, py, pz] = params.position;
    if (params.orbitAxis === "y") {
      px += ca;
      pz += sa;
    } else if (params.orbitAxis === "x") {
      py += ca;
      pz += sa;
    } else {
      px += ca;
      py += sa;
    }
    const r2 = params.radius * params.radius;
    const col = params.color;
    for (let i = 0; i < space.count; i++) {
      const dx = space.centered[i * 3]! - px,
        dy = space.centered[i * 3 + 1]! - py,
        dz = space.centered[i * 3 + 2]! - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      const k = d2 >= r2 ? 0 : Math.pow(1 - d2 / r2, 2);
      setPixel(out, i, col[0] * k, col[1] * k, col[2] * k);
    }
  },
});

export const spiral = defineEffect({
  id: "spiral",
  name: "Spiral",
  category: "spatial",
  description: "Rotating helix around the vertical axis — great on trees, columns and cylinders.",
  params: {
    gradient: {
      type: "gradient",
      label: "Gradient",
      default: [
        { pos: 0, color: "#ff0000" },
        { pos: 0.5, color: "#ffffff" },
        { pos: 1, color: "#ff0000" },
      ],
    },
    arms: { type: "number", label: "Arms", default: 2, min: 1, max: 12, step: 1 },
    twist: {
      type: "number",
      label: "Twist (turns over height)",
      default: 1.5,
      min: -10,
      max: 10,
      step: 0.05,
    },
    speed: { type: "number", label: "Speed", default: 0.3, min: -5, max: 5, step: 0.01, unit: "rev/s" },
  },
  render({ params, space, time }, out) {
    const c: RGB = [0, 0, 0];
    for (let i = 0; i < space.count; i++) {
      const x = space.centered[i * 3]!,
        z = space.centered[i * 3 + 2]!;
      const angle = Math.atan2(z, x) / (Math.PI * 2);
      const v = fract((angle + space.unit[i * 3 + 1]! * params.twist) * params.arms - time * params.speed);
      sampleGradient(params.gradient, v, c);
      setPixel(out, i, c[0], c[1], c[2]);
    }
  },
});

export const plasma = defineEffect({
  id: "plasma",
  name: "Plasma",
  category: "pattern",
  description: "Classic sine-sum plasma evaluated in 3D.",
  params: {
    scale: { type: "number", label: "Scale", default: 3, min: 0.1, max: 20, step: 0.1 },
    speed: { type: "number", label: "Speed", default: 0.6, min: 0, max: 5, step: 0.01 },
    saturation: { type: "number", label: "Saturation", default: 1, min: 0, max: 1, step: 0.01 },
  },
  render({ params, space, time }, out) {
    const s = params.scale,
      t = time * params.speed;
    const c: RGB = [0, 0, 0];
    for (let i = 0; i < space.count; i++) {
      const x = space.centered[i * 3]!,
        y = space.centered[i * 3 + 1]!,
        z = space.centered[i * 3 + 2]!;
      const v =
        Math.sin(x * s + t) +
        Math.sin(y * s * 1.3 - t * 1.1) +
        Math.sin(z * s * 0.7 + t * 0.7) +
        Math.sin(Math.sqrt(x * x + y * y + z * z) * s * 1.5 - t * 1.7);
      hsv(v / 8 + t * 0.05, params.saturation, 1, c);
      setPixel(out, i, c[0], c[1], c[2]);
    }
  },
});

export const clouds = defineEffect({
  id: "clouds",
  name: "Noise Clouds",
  category: "pattern",
  description: "Drifting 3D fractal noise mapped through a gradient.",
  params: {
    gradient: {
      type: "gradient",
      label: "Gradient",
      default: [
        { pos: 0, color: "#000010" },
        { pos: 0.45, color: "#0030a0" },
        { pos: 0.7, color: "#00c0ff" },
        { pos: 1, color: "#ffffff" },
      ],
    },
    scale: { type: "number", label: "Scale", default: 2, min: 0.1, max: 20, step: 0.1 },
    speed: { type: "number", label: "Speed", default: 0.2, min: 0, max: 5, step: 0.01 },
    octaves: { type: "number", label: "Detail", default: 3, min: 1, max: 6, step: 1 },
    contrast: { type: "number", label: "Contrast", default: 1.6, min: 0.2, max: 5, step: 0.05 },
  },
  render({ params, space, time }, out) {
    const s = params.scale,
      t = time * params.speed;
    const c: RGB = [0, 0, 0];
    for (let i = 0; i < space.count; i++) {
      const n = fbm3(
        space.centered[i * 3]! * s + t,
        space.centered[i * 3 + 1]! * s,
        space.centered[i * 3 + 2]! * s - t * 0.7,
        params.octaves,
      );
      sampleGradient(params.gradient, 0.5 + (n - 0.5) * params.contrast, c);
      setPixel(out, i, c[0], c[1], c[2]);
    }
  },
});

export const fire = defineEffect({
  id: "fire",
  name: "Fire",
  category: "pattern",
  description: "Rising flames: noise scrolling upward, fading with height.",
  params: {
    gradient: {
      type: "gradient",
      label: "Gradient",
      default: [
        { pos: 0, color: "#000000" },
        { pos: 0.35, color: "#a00000" },
        { pos: 0.6, color: "#ff5000" },
        { pos: 0.85, color: "#ffc020" },
        { pos: 1, color: "#fff8e0" },
      ],
    },
    height: { type: "number", label: "Flame height", default: 0.8, min: 0.05, max: 2, step: 0.01 },
    speed: { type: "number", label: "Speed", default: 1.2, min: 0, max: 6, step: 0.01 },
    scale: { type: "number", label: "Turbulence", default: 3, min: 0.2, max: 15, step: 0.1 },
  },
  render({ params, space, time }, out) {
    const s = params.scale;
    const c: RGB = [0, 0, 0];
    for (let i = 0; i < space.count; i++) {
      const y = space.unit[i * 3 + 1]!;
      const n = fbm3(
        space.centered[i * 3]! * s,
        y * s - time * params.speed,
        space.centered[i * 3 + 2]! * s,
        3,
      );
      const heat = Math.max(0, n * 1.6 - y / params.height);
      sampleGradient(params.gradient, heat, c);
      setPixel(out, i, c[0], c[1], c[2]);
    }
  },
});
