/**
 * The project model. Zod schemas are the single source of truth: TS types are inferred
 * from them, and every project loaded from disk/network is validated through them.
 */
import { z } from "zod";
import { COLOR_ORDERS } from "./color";

export const PROJECT_FORMAT_VERSION = 1;

export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const transformSchema = z.object({
  position: vec3Schema.default([0, 0, 0]),
  rotation: vec3Schema.default([0, 0, 0]),
  scale: vec3Schema.default([1, 1, 1]),
});

export const colorOrderSchema = z.enum(COLOR_ORDERS);

// ---------------------------------------------------------------------------
// Fixture geometry: each kind describes LED positions in fixture-local space.
// ---------------------------------------------------------------------------

export const stripGeometrySchema = z.object({
  kind: z.literal("strip"),
  count: z.number().int().min(1),
  /** Distance between adjacent LEDs, in project units. */
  spacing: z.number().positive(),
});

export const ringGeometrySchema = z.object({
  kind: z.literal("ring"),
  count: z.number().int().min(1),
  radius: z.number().positive(),
  /** Degrees; 0 = +X axis. */
  startAngle: z.number().default(0),
  /** Arc covered by the LEDs in degrees (360 = full ring with no duplicated end point). */
  sweep: z.number().min(-360).max(360).default(360),
});

export const WIRING_PATTERNS = ["progressive", "serpentine"] as const;
export const START_CORNERS = ["bottom-left", "bottom-right", "top-left", "top-right"] as const;

export const matrixGeometrySchema = z.object({
  kind: z.literal("matrix"),
  cols: z.number().int().min(1),
  rows: z.number().int().min(1),
  spacingX: z.number().positive(),
  spacingY: z.number().positive(),
  wiring: z.enum(WIRING_PATTERNS).default("serpentine"),
  start: z.enum(START_CORNERS).default("bottom-left"),
  /** If true, wiring runs along columns first instead of rows. */
  vertical: z.boolean().default(false),
});

export const cubeGeometrySchema = z.object({
  kind: z.literal("cube"),
  nx: z.number().int().min(1),
  ny: z.number().int().min(1),
  nz: z.number().int().min(1),
  spacing: z.number().positive(),
  wiring: z.enum(WIRING_PATTERNS).default("serpentine"),
});

export const polylineGeometrySchema = z.object({
  kind: z.literal("polyline"),
  /** Path vertices in fixture-local space. */
  points: z.array(vec3Schema).min(2),
  /** LEDs are placed every `spacing` units along the path, starting at the first vertex. */
  spacing: z.number().positive(),
  closed: z.boolean().default(false),
});

export const pointsGeometrySchema = z.object({
  kind: z.literal("points"),
  /** Explicit LED positions in wiring order (e.g. from camera mapping or CSV import). */
  points: z.array(vec3Schema),
});

export const fixtureGeometrySchema = z.discriminatedUnion("kind", [
  stripGeometrySchema,
  ringGeometrySchema,
  matrixGeometrySchema,
  cubeGeometrySchema,
  polylineGeometrySchema,
  pointsGeometrySchema,
]);

export const FIXTURE_KINDS = ["strip", "ring", "matrix", "cube", "polyline", "points"] as const;

export const patchSchema = z.object({
  controllerId: z.string(),
  /** Index into the controller's `outputs`. */
  output: z.number().int().min(0).default(0),
  /** First pixel on that output used by this fixture. */
  startPixel: z.number().int().min(0).default(0),
});

export const fixtureSchema = z.object({
  id: z.string(),
  name: z.string(),
  geometry: fixtureGeometrySchema,
  transform: transformSchema.default({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }),
  ledTypeId: z.string().default("ws2812b"),
  /** Reverse wiring direction (data enters at the other end). */
  reversed: z.boolean().default(false),
  patch: patchSchema.nullable().default(null),
  /** Free-form tags, usable as effect masks ("roof", "tree", ...). */
  tags: z.array(z.string()).default([]),
  visible: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Controllers / targets
// ---------------------------------------------------------------------------

export const PROTOCOLS = ["ddp", "e131", "artnet"] as const;
export const CONTROLLER_KINDS = ["wled", "generic"] as const;

export const controllerOutputSchema = z.object({
  /** Physical pin / port label; informational for generic controllers, used for WLED config. */
  pin: z.number().int().min(0).nullable().default(null),
  /** Number of pixels on this output. 0 = auto (derived from patched fixtures). */
  pixelCount: z.number().int().min(0).default(0),
  /** Byte order on the wire. Keep RGB for WLED (WLED reorders itself). */
  colorOrder: colorOrderSchema.default("RGB"),
});

export const controllerSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(CONTROLLER_KINDS).default("wled"),
  host: z.string().default(""),
  protocol: z.enum(PROTOCOLS).default("ddp"),
  /** 0 = protocol default port. */
  port: z.number().int().min(0).max(65535).default(0),
  /** First universe for E1.31 / Art-Net. */
  universeStart: z.number().int().min(0).max(32767).default(1),
  /** Channels used per universe (510 keeps RGB pixels from straddling universes). */
  channelsPerUniverse: z.number().int().min(3).max(512).default(510),
  outputs: z
    .array(controllerOutputSchema)
    .min(1)
    .default([{ pin: null, pixelCount: 0, colorOrder: "RGB" }]),
  /** Gamma applied before sending. WLED applies its own gamma, so 1.0 is the default. */
  gamma: z.number().min(0.1).max(5).default(1),
  /** Master brightness 0..1 for this controller. */
  brightness: z.number().min(0).max(1).default(1),
  /** Optional power budget in amps; 0 disables limiting. */
  maxAmps: z.number().min(0).default(0),
  enabled: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Effects, layers and timeline
// ---------------------------------------------------------------------------

export const EASINGS = ["linear", "step", "easeIn", "easeOut", "easeInOut"] as const;

export const gradientStopSchema = z.object({ pos: z.number().min(0).max(1), color: z.string() });

/** A literal parameter value. Colors are hex strings; vec3 are tuples; gradients are stop lists. */
export const paramValueSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  vec3Schema,
  z.array(gradientStopSchema),
]);

export const keyframeSchema = z.object({
  /** Seconds, relative to the start of the clip (or show time for live layers). */
  t: z.number(),
  v: paramValueSchema,
  ease: z.enum(EASINGS).default("linear"),
});

export const animatedParamSchema = z.object({ keyframes: z.array(keyframeSchema).min(1) });

export const LFO_SHAPES = ["sine", "triangle", "saw", "square", "random"] as const;

/** Low-frequency oscillator driving a numeric parameter between min and max. */
export const lfoSchema = z.object({
  shape: z.enum(LFO_SHAPES).default("sine"),
  /** Cycles per second. */
  rate: z.number().positive().default(0.5),
  min: z.number().default(0),
  max: z.number().default(1),
  /** Phase offset in cycles (0..1). */
  phase: z.number().default(0),
});

export const modulatedParamSchema = z.object({ lfo: lfoSchema });

export const paramSchema = z.union([paramValueSchema, animatedParamSchema, modulatedParamSchema]);

export const BLEND_MODES = ["normal", "add", "multiply", "screen", "max", "min", "subtract"] as const;

export const maskSchema = z.object({
  /** Restrict to these fixtures (empty = all). */
  fixtureIds: z.array(z.string()).default([]),
  /** Restrict to fixtures carrying any of these tags (empty = no tag filter). */
  tags: z.array(z.string()).default([]),
  invert: z.boolean().default(false),
});

export const layerSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  effectId: z.string(),
  params: z.record(z.string(), paramSchema).default({}),
  opacity: z.number().min(0).max(1).default(1),
  blend: z.enum(BLEND_MODES).default("normal"),
  enabled: z.boolean().default(true),
  mask: maskSchema.nullable().default(null),
  /** Playback speed multiplier for this layer's time. */
  speed: z.number().default(1),
});

export const clipSchema = z.object({
  id: z.string(),
  start: z.number().min(0),
  duration: z.number().positive(),
  fadeIn: z.number().min(0).default(0),
  fadeOut: z.number().min(0).default(0),
  layer: layerSchema,
});

export const trackSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  muted: z.boolean().default(false),
  clips: z.array(clipSchema).default([]),
});

export const timelineSchema = z.object({
  duration: z.number().positive().default(60),
  loop: z.boolean().default(true),
  /** Tracks are composited bottom-up: tracks[0] is the base. */
  tracks: z.array(trackSchema).default([]),
});

// ---------------------------------------------------------------------------
// Scene assets (imported reference geometry)
// ---------------------------------------------------------------------------

export const ASSET_FORMATS = ["gltf", "glb", "obj", "stl"] as const;

export const sceneModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  format: z.enum(ASSET_FORMATS),
  /** Data URI or URL. Embedded data URIs keep project files self-contained. */
  uri: z.string(),
  transform: transformSchema.default({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }),
  opacity: z.number().min(0).max(1).default(0.35),
  visible: z.boolean().default(true),
});

export const UNITS = ["mm", "cm", "m", "in"] as const;
export const PLAYBACK_MODES = ["live", "timeline"] as const;

export const projectSchema = z.object({
  format: z.literal("ledlay-project").default("ledlay-project"),
  version: z.literal(PROJECT_FORMAT_VERSION).default(PROJECT_FORMAT_VERSION),
  name: z.string().default("Untitled"),
  units: z.enum(UNITS).default("mm"),
  fps: z.number().int().min(1).max(240).default(40),
  fixtures: z.array(fixtureSchema).default([]),
  controllers: z.array(controllerSchema).default([]),
  models: z.array(sceneModelSchema).default([]),
  /** Layers used in live mode (no timeline). Bottom-up compositing order. */
  layers: z.array(layerSchema).default([]),
  timeline: timelineSchema.default({ duration: 60, loop: true, tracks: [] }),
  playback: z.enum(PLAYBACK_MODES).default("live"),
});

export type Vec3Tuple = z.infer<typeof vec3Schema>;
export type TransformData = z.infer<typeof transformSchema>;
export type FixtureGeometry = z.infer<typeof fixtureGeometrySchema>;
export type FixtureKind = FixtureGeometry["kind"];
export type StripGeometry = z.infer<typeof stripGeometrySchema>;
export type RingGeometry = z.infer<typeof ringGeometrySchema>;
export type MatrixGeometry = z.infer<typeof matrixGeometrySchema>;
export type CubeGeometry = z.infer<typeof cubeGeometrySchema>;
export type PolylineGeometry = z.infer<typeof polylineGeometrySchema>;
export type PointsGeometry = z.infer<typeof pointsGeometrySchema>;
export type Patch = z.infer<typeof patchSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
export type ControllerOutput = z.infer<typeof controllerOutputSchema>;
export type Controller = z.infer<typeof controllerSchema>;
export type Protocol = (typeof PROTOCOLS)[number];
export type Easing = (typeof EASINGS)[number];
export type ParamValue = z.infer<typeof paramValueSchema>;
export type Keyframe = z.infer<typeof keyframeSchema>;
export type AnimatedParam = z.infer<typeof animatedParamSchema>;
export type Lfo = z.infer<typeof lfoSchema>;
export type ModulatedParam = z.infer<typeof modulatedParamSchema>;
export type Param = z.infer<typeof paramSchema>;
export type BlendMode = (typeof BLEND_MODES)[number];
export type Mask = z.infer<typeof maskSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Track = z.infer<typeof trackSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
export type SceneModel = z.infer<typeof sceneModelSchema>;
export type Units = (typeof UNITS)[number];
export type Project = z.infer<typeof projectSchema>;

/** Input shapes (before defaults are applied) — convenient for constructing objects in code. */
export type FixtureInput = z.input<typeof fixtureSchema>;
export type ControllerInput = z.input<typeof controllerSchema>;
export type LayerInput = z.input<typeof layerSchema>;
export type ProjectInput = z.input<typeof projectSchema>;

export function isAnimated(p: Param): p is AnimatedParam {
  return typeof p === "object" && p !== null && !Array.isArray(p) && "keyframes" in p;
}

export function isModulated(p: Param): p is ModulatedParam {
  return typeof p === "object" && p !== null && !Array.isArray(p) && "lfo" in p;
}

/** True for plain values (neither keyframed nor modulated). */
export function isStaticParam(p: Param): p is ParamValue {
  return !isAnimated(p) && !isModulated(p);
}
