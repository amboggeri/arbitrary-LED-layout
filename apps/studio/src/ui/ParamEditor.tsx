/** Edits an effect layer's parameters, including keyframing at the current time. */
import {
  LFO_SHAPES,
  isAnimated,
  isModulated,
  type GradientStop,
  type Layer,
  type Lfo,
  type Param,
  type ParamValue,
  type Vec3,
} from "@ledlay/core";
import * as cmd from "@ledlay/editor";
import { defaultParamValues, type AnyEffect, type ParamSpec } from "@ledlay/effects";
import { evaluateParam } from "@ledlay/engine";
import { studio } from "../state/store";
import { Checkbox, ColorInput, Field, NumberInput, Select, Slider, Vec3Input, opts } from "./controls";

export type LayerLocator = { layerId: string } | { clipId: string };

interface Props {
  layer: Layer;
  effect: AnyEffect;
  locator: LayerLocator;
  /** Time used for keyframing (layer-local seconds). */
  localTime: number;
  error?: string;
}

const EPS = 1e-3;

function keyAt(p: Param | undefined, t: number): boolean {
  return !!p && isAnimated(p) && p.keyframes.some((k) => Math.abs(k.t - t) < EPS);
}

export function ParamEditor({ layer, effect, locator, localTime, error }: Props) {
  const defaults = defaultParamValues(effect.params);
  const coalesce = (key: string) => `param:${"layerId" in locator ? locator.layerId : locator.clipId}:${key}`;

  const valueOf = (key: string): ParamValue => {
    const raw = layer.params[key];
    return raw === undefined ? (defaults[key] as ParamValue) : evaluateParam(raw, localTime);
  };

  /** Set a value: animated params get a keyframe at the current time (auto-key). */
  const set = (key: string, v: ParamValue, live = false) => {
    const raw = layer.params[key];
    const s = studio.getState();
    s.apply(
      (p) =>
        raw !== undefined && isAnimated(raw)
          ? cmd.setKeyframe(p, locator, key, localTime, v)
          : cmd.setLayerParam(p, locator, key, v),
      `Change ${key}`,
      live ? coalesce(key) : undefined,
    );
    if (!live) s.seal();
  };

  const toggleKey = (key: string) => {
    const raw = layer.params[key];
    studio
      .getState()
      .apply(
        (p) =>
          keyAt(raw, localTime)
            ? cmd.removeKeyframe(p, locator, key, localTime)
            : cmd.setKeyframe(p, locator, key, localTime, valueOf(key)),
        "Toggle keyframe",
      );
  };

  const toggleLfo = (key: string, spec: ParamSpec) => {
    if (spec.type !== "number") return;
    const raw = layer.params[key];
    const cur = valueOf(key) as number;
    const span = (spec.max - spec.min) * 0.25;
    studio.getState().apply(
      (p) =>
        raw !== undefined && isModulated(raw)
          ? cmd.setLfo(p, locator, key, null, raw.lfo.min)
          : cmd.setLfo(p, locator, key, {
              shape: "sine",
              rate: 0.5,
              min: cur,
              max: Math.min(spec.max, cur + span),
              phase: 0,
            }),
      "Toggle LFO",
    );
  };

  return (
    <div className="params">
      {Object.entries(effect.params as Record<string, ParamSpec>).map(([key, spec]) => {
        const raw = layer.params[key];
        const animated = raw !== undefined && isAnimated(raw);
        const modulated = raw !== undefined && isModulated(raw);
        const v = valueOf(key);
        const canKey = spec.type !== "code" && !modulated;
        return (
          <div className="param" key={key}>
            <Field label={spec.label} hint={spec.description}>
              {modulated && spec.type === "number" ? (
                <LfoControls
                  name={spec.label}
                  lfo={raw.lfo}
                  min={spec.min}
                  max={spec.max}
                  onChange={(lfo) =>
                    studio.getState().apply((p) => cmd.setLfo(p, locator, key, lfo), "Edit LFO")
                  }
                />
              ) : (
                <ParamControl
                  spec={spec}
                  value={v}
                  name={spec.label}
                  onChange={(nv, live) => set(key, nv, live)}
                />
              )}
            </Field>
            {spec.type === "number" && !animated && (
              <button
                className={`key lfo ${modulated ? "on" : ""}`}
                title={modulated ? "Remove LFO" : "Modulate with an LFO"}
                aria-label={`lfo ${spec.label}`}
                onClick={() => toggleLfo(key, spec)}
              >
                ∿
              </button>
            )}
            {canKey && (
              <button
                className={`key ${keyAt(raw, localTime) ? "on" : animated ? "animated" : ""}`}
                title={
                  animated
                    ? `${(raw as { keyframes: unknown[] }).keyframes.length} keyframes — click to toggle a key here`
                    : "Add keyframe at playhead"
                }
                aria-label={`keyframe ${spec.label}`}
                onClick={() => toggleKey(key)}
              >
                ◆
              </button>
            )}
          </div>
        );
      })}
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}

function LfoControls({
  lfo,
  min,
  max,
  name,
  onChange,
}: {
  lfo: Lfo;
  min: number;
  max: number;
  name: string;
  onChange: (l: Lfo) => void;
}) {
  return (
    <div className="lfo-controls">
      <Select
        ariaLabel={`${name} lfo shape`}
        value={lfo.shape}
        options={opts(LFO_SHAPES)}
        onChange={(shape) => onChange({ ...lfo, shape })}
      />
      <label>
        Hz
        <NumberInput
          ariaLabel={`${name} lfo rate`}
          value={lfo.rate}
          min={0.001}
          max={50}
          onChange={(rate) => onChange({ ...lfo, rate })}
        />
      </label>
      <label>
        min
        <NumberInput
          ariaLabel={`${name} lfo min`}
          value={lfo.min}
          min={min}
          max={max}
          onChange={(v) => onChange({ ...lfo, min: v })}
        />
      </label>
      <label>
        max
        <NumberInput
          ariaLabel={`${name} lfo max`}
          value={lfo.max}
          min={min}
          max={max}
          onChange={(v) => onChange({ ...lfo, max: v })}
        />
      </label>
    </div>
  );
}

function ParamControl({
  spec,
  value,
  name,
  onChange,
}: {
  spec: ParamSpec;
  value: ParamValue;
  name: string;
  onChange: (v: ParamValue, live?: boolean) => void;
}) {
  switch (spec.type) {
    case "number":
      return (
        <Slider
          ariaLabel={name}
          value={typeof value === "number" ? value : spec.default}
          min={spec.min}
          max={spec.max}
          step={spec.step ?? (spec.max - spec.min) / 200}
          onChange={(v) => onChange(v, true)}
          onCommit={() => studio.getState().seal()}
        />
      );
    case "color":
      return (
        <ColorInput
          ariaLabel={name}
          value={typeof value === "string" ? value : spec.default}
          onChange={(v) => onChange(v, true)}
          onCommit={() => studio.getState().seal()}
        />
      );
    case "boolean":
      return (
        <Checkbox
          label=""
          checked={typeof value === "boolean" ? value : spec.default}
          onChange={(v) => onChange(v)}
        />
      );
    case "select":
      return (
        <Select
          ariaLabel={name}
          value={typeof value === "string" ? value : spec.default}
          options={spec.options}
          onChange={(v) => onChange(v)}
        />
      );
    case "vec3":
      return (
        <Vec3Input
          ariaLabel={name}
          value={Array.isArray(value) && value.length === 3 ? (value as Vec3) : spec.default}
          step={0.05}
          onChange={(v) => onChange(v)}
        />
      );
    case "gradient":
      return (
        <GradientEditor
          stops={
            Array.isArray(value) && typeof value[0] === "object" ? (value as GradientStop[]) : spec.default
          }
          onChange={(v) => onChange(v)}
        />
      );
    case "code":
      return (
        <textarea
          className="code"
          aria-label={name}
          spellCheck={false}
          rows={8}
          defaultValue={typeof value === "string" ? value : spec.default}
          onBlur={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter")
              onChange((e.target as HTMLTextAreaElement).value);
          }}
        />
      );
  }
}

export function GradientEditor({
  stops,
  onChange,
}: {
  stops: GradientStop[];
  onChange: (s: GradientStop[]) => void;
}) {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  const css = `linear-gradient(90deg, ${sorted.map((s) => `${s.color} ${Math.round(s.pos * 100)}%`).join(", ")})`;
  const update = (i: number, s: Partial<GradientStop>) =>
    onChange(sorted.map((x, j) => (j === i ? { ...x, ...s } : x)));
  return (
    <div className="gradient">
      <div className="gradient-bar" style={{ background: css }} />
      {sorted.map((s, i) => (
        <div className="gradient-stop" key={i}>
          <ColorInput
            ariaLabel={`stop ${i + 1} color`}
            value={s.color}
            onChange={(c) => update(i, { color: c })}
          />
          <NumberInput
            ariaLabel={`stop ${i + 1} position`}
            value={s.pos}
            min={0}
            max={1}
            step={0.01}
            onChange={(pos) => update(i, { pos })}
          />
          <button
            className="ghost"
            aria-label={`remove stop ${i + 1}`}
            disabled={sorted.length <= 1}
            onClick={() => onChange(sorted.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="ghost"
        onClick={() => {
          const last = sorted.at(-1);
          onChange([
            ...sorted,
            { pos: last ? Math.min(1, last.pos + 0.1) : 0, color: last?.color ?? "#ffffff" },
          ]);
        }}
      >
        + stop
      </button>
    </div>
  );
}
