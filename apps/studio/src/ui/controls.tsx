/** Small, uncontrolled-while-typing form controls used throughout the inspector. */
import { useEffect, useId, useState, type ReactNode } from "react";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} title={hint}>
        {label}
      </label>
      <div className="field-control" id={id}>
        {children}
      </div>
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="section">
      <header>
        <h3>{title}</h3>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  integer?: boolean;
}

/** Number box that only commits valid numbers on blur/Enter (so typing "-" or "1." works). */
export function NumberInput({ value, onChange, min, max, step, ariaLabel, integer }: NumberInputProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    let v = Number(text);
    if (!Number.isFinite(v) || text.trim() === "") {
      setText(String(value));
      return;
    }
    if (integer) v = Math.round(v);
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    setText(String(v));
    if (v !== value) onChange(v);
  };
  return (
    <input
      className="num"
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      step={step}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setText(String(value));
      }}
    />
  );
}

/** Range slider + number box. `onChange` fires continuously while dragging; `onCommit` on release. */
export function Slider({
  value,
  onChange,
  onCommit,
  min,
  max,
  step = 0.01,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  min: number;
  max: number;
  step?: number;
  ariaLabel?: string;
}) {
  return (
    <div className="slider">
      <input
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
      <NumberInput
        value={value}
        min={min}
        max={max}
        step={step}
        ariaLabel={ariaLabel ? `${ariaLabel} value` : undefined}
        onChange={(v) => {
          onChange(v);
          onCommit?.();
        }}
      />
    </div>
  );
}

export function Vec3Input({
  value,
  onChange,
  step,
  ariaLabel = "vector",
}: {
  value: readonly [number, number, number];
  onChange: (v: [number, number, number]) => void;
  step?: number;
  ariaLabel?: string;
}) {
  const set = (i: number, v: number) => {
    const next = [...value] as [number, number, number];
    next[i] = v;
    onChange(next);
  };
  return (
    <div className="vec3">
      {(["x", "y", "z"] as const).map((axis, i) => (
        <span key={axis} className={`axis axis-${axis}`}>
          <NumberInput value={value[i]!} step={step} ariaLabel={`${ariaLabel} ${axis}`} onChange={(v) => set(i, v)} />
        </span>
      ))}
    </div>
  );
}

export function TextInput({ value, onChange, ariaLabel, placeholder }: { value: string; onChange: (v: string) => void; ariaLabel?: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onChange(text)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function ColorInput({ value, onChange, onCommit, ariaLabel }: { value: string; onChange: (v: string) => void; onCommit?: () => void; ariaLabel?: string }) {
  return (
    <input
      type="color"
      className="color"
      aria-label={ariaLabel}
      value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
    />
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function TagsInput({ value, onChange, ariaLabel }: { value: readonly string[]; onChange: (v: string[]) => void; ariaLabel?: string }) {
  return (
    <TextInput
      ariaLabel={ariaLabel}
      placeholder="comma, separated"
      value={value.join(", ")}
      onChange={(s) =>
        onChange(
          s
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

export function opts<T extends string>(values: readonly T[]): { value: T; label: string }[] {
  return values.map((v) => ({ value: v, label: v }));
}
