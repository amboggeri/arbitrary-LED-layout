/** Right-hand inspector: shows editable properties for the current selection. */
import { useState } from "react";
import {
  BLEND_MODES,
  COLOR_ORDERS,
  CONTROLLER_KINDS,
  LED_TYPES,
  PLAYBACK_MODES,
  PROTOCOLS,
  START_CORNERS,
  UNITS,
  WIRING_PATTERNS,
  computeControllerLayout,
  ledCount,
  validatePatch,
  type Controller,
  type Fixture,
  type FixtureGeometry,
  type Layer,
} from "@ledlay/core";
import * as cmd from "@ledlay/editor";
import { buildLedmap2D, buildWledConfigPatch, serializeLedmap, type WledInfo } from "@ledlay/targets";
import { useRuntime } from "../runtime/context";
import { studio, useStudio } from "../state/store";
import {
  Checkbox,
  Field,
  NumberInput,
  Section,
  Select,
  Slider,
  TagsInput,
  TextInput,
  Vec3Input,
  opts,
} from "./controls";
import { ParamEditor, type LayerLocator } from "./ParamEditor";

const apply = (...a: Parameters<ReturnType<typeof studio.getState>["apply"]>) =>
  studio.getState().apply(...a);

export function Inspector() {
  const selection = useStudio((s) => s.selection);
  const project = useStudio((s) => s.project);
  let body: React.ReactNode;
  if (!selection) body = <ProjectInspector />;
  else if (selection.kind === "fixture") {
    const fixtures = project.fixtures.filter((f) => selection.ids.includes(f.id));
    body =
      fixtures.length === 1 ? (
        <FixtureInspector fixture={fixtures[0]!} />
      ) : (
        <MultiFixtureInspector fixtures={fixtures} />
      );
  } else if (selection.kind === "controller") {
    const c = project.controllers.find((x) => x.id === selection.id);
    body = c ? <ControllerInspector controller={c} /> : null;
  } else if (selection.kind === "layer") {
    const l = project.layers.find((x) => x.id === selection.id);
    body = l ? <LayerInspector layer={l} locator={{ layerId: l.id }} /> : null;
  } else if (selection.kind === "clip") {
    body = <ClipInspector clipId={selection.id} />;
  } else if (selection.kind === "model") {
    body = <ModelInspector id={selection.id} />;
  }
  return (
    <aside className="inspector" data-testid="inspector">
      {body}
    </aside>
  );
}

// ------------------------------------------------------------------ project

function ProjectInspector() {
  const p = useStudio((s) => s.project);
  return (
    <Section title="Project">
      <Field label="Name">
        <TextInput
          ariaLabel="project name"
          value={p.name}
          onChange={(name) => apply((x) => cmd.setProjectMeta(x, { name }), "Rename project")}
        />
      </Field>
      <Field label="Units">
        <Select
          ariaLabel="units"
          value={p.units}
          options={opts(UNITS)}
          onChange={(units) => apply((x) => cmd.setProjectMeta(x, { units }), "Units")}
        />
      </Field>
      <Field label="Frame rate">
        <NumberInput
          ariaLabel="fps"
          value={p.fps}
          min={1}
          max={240}
          integer
          onChange={(fps) => apply((x) => cmd.setProjectMeta(x, { fps }), "FPS")}
        />
      </Field>
      <Field label="Playback">
        <Select
          ariaLabel="playback mode"
          value={p.playback}
          options={opts(PLAYBACK_MODES)}
          onChange={(playback) => apply((x) => cmd.setProjectMeta(x, { playback }), "Playback mode")}
        />
      </Field>
      <p className="muted">
        Select a fixture, controller, layer or clip to edit it. Shift-click LEDs to multi-select.
      </p>
    </Section>
  );
}

// ------------------------------------------------------------------ fixtures

function GeometryFields({ fixture }: { fixture: Fixture }) {
  const g = fixture.geometry;
  const set = (patch: Partial<FixtureGeometry>, live = false) => {
    apply(
      (p) => cmd.updateFixture(p, fixture.id, { geometry: { ...g, ...patch } as FixtureGeometry }),
      "Edit geometry",
      live ? `geom:${fixture.id}` : undefined,
    );
  };
  const num = (label: string, key: string, props: { min?: number; max?: number; integer?: boolean } = {}) => (
    <Field label={label}>
      <NumberInput
        ariaLabel={label}
        value={(g as unknown as Record<string, number>)[key]!}
        {...props}
        onChange={(v) => set({ [key]: v } as Partial<FixtureGeometry>)}
      />
    </Field>
  );
  switch (g.kind) {
    case "strip":
      return (
        <>
          {num("LED count", "count", { min: 1, integer: true })}
          {num("Spacing", "spacing", { min: 0.001 })}
        </>
      );
    case "ring":
      return (
        <>
          {num("LED count", "count", { min: 1, integer: true })}
          {num("Radius", "radius", { min: 0.001 })}
          {num("Start angle°", "startAngle")}
          {num("Sweep°", "sweep", { min: -360, max: 360 })}
        </>
      );
    case "matrix":
      return (
        <>
          {num("Columns", "cols", { min: 1, integer: true })}
          {num("Rows", "rows", { min: 1, integer: true })}
          {num("Spacing X", "spacingX", { min: 0.001 })}
          {num("Spacing Y", "spacingY", { min: 0.001 })}
          <Field label="Wiring">
            <Select
              ariaLabel="wiring"
              value={g.wiring}
              options={opts(WIRING_PATTERNS)}
              onChange={(wiring) => set({ wiring })}
            />
          </Field>
          <Field label="Start corner">
            <Select
              ariaLabel="start corner"
              value={g.start}
              options={opts(START_CORNERS)}
              onChange={(start) => set({ start })}
            />
          </Field>
          <Checkbox
            label="Columns first (vertical)"
            checked={g.vertical}
            onChange={(vertical) => set({ vertical })}
          />
        </>
      );
    case "cube":
      return (
        <>
          {num("X count", "nx", { min: 1, integer: true })}
          {num("Y count", "ny", { min: 1, integer: true })}
          {num("Z count", "nz", { min: 1, integer: true })}
          {num("Spacing", "spacing", { min: 0.001 })}
          <Field label="Wiring">
            <Select
              ariaLabel="wiring"
              value={g.wiring}
              options={opts(WIRING_PATTERNS)}
              onChange={(wiring) => set({ wiring })}
            />
          </Field>
        </>
      );
    case "polyline":
      return (
        <>
          {num("Spacing", "spacing", { min: 0.001 })}
          <Checkbox label="Closed loop" checked={g.closed} onChange={(closed) => set({ closed })} />
          <Field label="Vertices">
            <span className="muted">{g.points.length} — use the Draw tool (D) to add points</span>
          </Field>
          <button
            className="ghost"
            disabled={g.points.length <= 2}
            onClick={() => set({ points: g.points.slice(0, -1) })}
          >
            Remove last vertex
          </button>
        </>
      );
    case "points":
      return (
        <Field label="Points">
          <span className="muted">{g.points.length} imported positions</span>
        </Field>
      );
  }
}

function PatchFields({ fixture }: { fixture: Fixture }) {
  const controllers = useStudio((s) => s.project.controllers);
  const patch = fixture.patch;
  const setPatch = (p: Fixture["patch"]) => apply((x) => cmd.patchFixture(x, fixture.id, p), "Patch fixture");
  const ctl = controllers.find((c) => c.id === patch?.controllerId);
  return (
    <>
      <Field label="Controller">
        <Select
          ariaLabel="patch controller"
          value={patch?.controllerId ?? ""}
          options={[
            { value: "", label: "— not patched —" },
            ...controllers.map((c) => ({ value: c.id, label: c.name })),
          ]}
          onChange={(id) =>
            setPatch(id ? { controllerId: id, output: 0, startPixel: patch?.startPixel ?? 0 } : null)
          }
        />
      </Field>
      {patch && ctl && (
        <>
          <Field label="Output">
            <Select
              ariaLabel="patch output"
              value={String(patch.output)}
              options={ctl.outputs.map((_, i) => ({ value: String(i), label: `Output ${i + 1}` }))}
              onChange={(o) => setPatch({ ...patch, output: Number(o) })}
            />
          </Field>
          <Field label="Start pixel">
            <NumberInput
              ariaLabel="start pixel"
              value={patch.startPixel}
              min={0}
              integer
              onChange={(startPixel) => setPatch({ ...patch, startPixel })}
            />
          </Field>
        </>
      )}
    </>
  );
}

function FixtureInspector({ fixture }: { fixture: Fixture }) {
  const f = fixture;
  const set = (changes: Partial<Fixture>, label = "Edit fixture") =>
    apply((p) => cmd.updateFixture(p, f.id, changes), label);
  const setT = (t: Partial<Fixture["transform"]>) =>
    apply((p) => cmd.setFixtureTransform(p, f.id, t), "Transform fixture");
  return (
    <>
      <Section
        title={`Fixture · ${f.geometry.kind}`}
        actions={
          <>
            <button
              className="ghost"
              title="Duplicate"
              onClick={() => {
                const r = cmd.duplicateFixtures(studio.getState().project, [f.id], [50, 0, 0]);
                apply(() => r.project, "Duplicate fixture");
                studio.getState().select({ kind: "fixture", ids: r.newIds });
              }}
            >
              ⧉
            </button>
            <button
              className="ghost danger"
              title="Delete"
              onClick={() => apply((p) => cmd.removeFixtures(p, [f.id]), "Delete fixture")}
            >
              🗑
            </button>
          </>
        }
      >
        <Field label="Name">
          <TextInput
            ariaLabel="fixture name"
            value={f.name}
            onChange={(name) => set({ name }, "Rename fixture")}
          />
        </Field>
        <Field label="LEDs">
          <span data-testid="fixture-led-count">{ledCount(f.geometry)}</span>
        </Field>
        <Field label="LED type">
          <Select
            ariaLabel="led type"
            value={f.ledTypeId}
            options={LED_TYPES.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(ledTypeId) => set({ ledTypeId })}
          />
        </Field>
        <Field label="Tags">
          <TagsInput ariaLabel="tags" value={f.tags} onChange={(tags) => set({ tags })} />
        </Field>
        <Checkbox
          label="Reverse wiring direction"
          checked={f.reversed}
          onChange={(reversed) => set({ reversed })}
        />
      </Section>
      <Section title="Geometry">
        <GeometryFields fixture={f} />
      </Section>
      <Section title="Transform">
        <Field label="Position">
          <Vec3Input
            ariaLabel="position"
            value={f.transform.position}
            onChange={(position) => setT({ position })}
          />
        </Field>
        <Field label="Rotation°">
          <Vec3Input
            ariaLabel="rotation"
            value={f.transform.rotation}
            onChange={(rotation) => setT({ rotation })}
          />
        </Field>
        <Field label="Scale">
          <Vec3Input ariaLabel="scale" value={f.transform.scale} onChange={(scale) => setT({ scale })} />
        </Field>
      </Section>
      <Section title="Patch">
        <PatchFields fixture={f} />
      </Section>
    </>
  );
}

function MultiFixtureInspector({ fixtures }: { fixtures: Fixture[] }) {
  const ids = fixtures.map((f) => f.id);
  return (
    <Section title={`${fixtures.length} fixtures`}>
      <p className="muted">{fixtures.reduce((n, f) => n + ledCount(f.geometry), 0)} LEDs selected.</p>
      <Field label="Tags (add)">
        <TagsInput
          ariaLabel="add tags"
          value={[]}
          onChange={(tags) =>
            apply(
              (p) =>
                fixtures.reduce(
                  (acc, f) => cmd.updateFixture(acc, f.id, { tags: [...new Set([...f.tags, ...tags])] }),
                  p,
                ),
              "Tag fixtures",
            )
          }
        />
      </Field>
      <div className="row">
        <button
          onClick={() => {
            const r = cmd.duplicateFixtures(studio.getState().project, ids, [50, 0, 0]);
            apply(() => r.project, "Duplicate fixtures");
            studio.getState().select({ kind: "fixture", ids: r.newIds });
          }}
        >
          Duplicate
        </button>
        <button
          className="danger"
          onClick={() => apply((p) => cmd.removeFixtures(p, ids), "Delete fixtures")}
        >
          Delete
        </button>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ controllers

function ControllerInspector({ controller }: { controller: Controller }) {
  const c = controller;
  const project = useStudio((s) => s.project);
  const bridgeStatus = useStudio((s) => s.bridge.status);
  const runtime = useRuntime();
  const [info, setInfo] = useState<WledInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (changes: Partial<Controller>, live = false) =>
    apply((p) => cmd.updateController(p, c.id, changes), "Edit controller", live ? `ctl:${c.id}` : undefined);
  const layout = computeControllerLayout(c, project.fixtures);
  const issues = validatePatch(project).filter((i) => i.controllerId === c.id);
  const notify = studio.getState().notify;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify("error", `${label}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const compiled = () => runtime.compiled.controllers.find((x) => x.controller.id === c.id)!;

  return (
    <>
      <Section
        title="Controller"
        actions={
          <button
            className="ghost danger"
            title="Delete controller"
            onClick={() => apply((p) => cmd.removeController(p, c.id), "Delete controller")}
          >
            🗑
          </button>
        }
      >
        <Field label="Name">
          <TextInput ariaLabel="controller name" value={c.name} onChange={(name) => set({ name })} />
        </Field>
        <Field label="Kind">
          <Select
            ariaLabel="controller kind"
            value={c.kind}
            options={opts(CONTROLLER_KINDS)}
            onChange={(kind) => set({ kind })}
          />
        </Field>
        <Field label="Host / IP">
          <TextInput
            ariaLabel="host"
            placeholder="192.168.1.50"
            value={c.host}
            onChange={(host) => set({ host })}
          />
        </Field>
        <Field label="Protocol">
          <Select
            ariaLabel="protocol"
            value={c.protocol}
            options={PROTOCOLS.map((p) => ({
              value: p,
              label: p === "ddp" ? "DDP (recommended for WLED)" : p === "e131" ? "E1.31 / sACN" : "Art-Net",
            }))}
            onChange={(protocol) => set({ protocol })}
          />
        </Field>
        <Field label="Port" hint="0 = protocol default">
          <NumberInput
            ariaLabel="port"
            value={c.port}
            min={0}
            max={65535}
            integer
            onChange={(port) => set({ port })}
          />
        </Field>
        {c.protocol !== "ddp" && (
          <>
            <Field label="Start universe">
              <NumberInput
                ariaLabel="start universe"
                value={c.universeStart}
                min={0}
                integer
                onChange={(universeStart) => set({ universeStart })}
              />
            </Field>
            <Field label="Channels/universe">
              <NumberInput
                ariaLabel="channels per universe"
                value={c.channelsPerUniverse}
                min={3}
                max={512}
                integer
                onChange={(channelsPerUniverse) => set({ channelsPerUniverse })}
              />
            </Field>
          </>
        )}
        <Checkbox label="Enabled" checked={c.enabled} onChange={(enabled) => set({ enabled })} />
      </Section>

      <Section title="Output processing">
        <Field label="Brightness">
          <Slider
            ariaLabel="controller brightness"
            value={c.brightness}
            min={0}
            max={1}
            onChange={(brightness) => set({ brightness }, true)}
            onCommit={() => studio.getState().seal()}
          />
        </Field>
        <Field label="Gamma" hint="WLED applies its own gamma; leave at 1 for WLED.">
          <NumberInput
            ariaLabel="gamma"
            value={c.gamma}
            min={0.1}
            max={5}
            onChange={(gamma) => set({ gamma })}
          />
        </Field>
        <Field label="Power limit (A)" hint="0 = unlimited">
          <NumberInput
            ariaLabel="max amps"
            value={c.maxAmps}
            min={0}
            onChange={(maxAmps) => set({ maxAmps })}
          />
        </Field>
      </Section>

      <Section
        title={`Outputs · ${layout.totalPixels} px`}
        actions={
          <button
            className="ghost"
            onClick={() => set({ outputs: [...c.outputs, { pin: null, pixelCount: 0, colorOrder: "RGB" }] })}
          >
            + output
          </button>
        }
      >
        <table className="outputs">
          <thead>
            <tr>
              <th>#</th>
              <th>Pin</th>
              <th title="0 = auto from patch">Pixels</th>
              <th>Order</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {c.outputs.map((o, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <NumberInput
                    ariaLabel={`output ${i + 1} pin`}
                    value={o.pin ?? -1}
                    min={-1}
                    integer
                    onChange={(pin) =>
                      set({
                        outputs: c.outputs.map((x, j) => (j === i ? { ...x, pin: pin < 0 ? null : pin } : x)),
                      })
                    }
                  />
                </td>
                <td>
                  <NumberInput
                    ariaLabel={`output ${i + 1} pixels`}
                    value={o.pixelCount}
                    min={0}
                    integer
                    onChange={(pixelCount) =>
                      set({ outputs: c.outputs.map((x, j) => (j === i ? { ...x, pixelCount } : x)) })
                    }
                  />
                  <span className="muted small"> ({layout.outputs[i]?.length ?? 0})</span>
                </td>
                <td>
                  <Select
                    ariaLabel={`output ${i + 1} order`}
                    value={o.colorOrder}
                    options={opts(COLOR_ORDERS)}
                    onChange={(colorOrder) =>
                      set({ outputs: c.outputs.map((x, j) => (j === i ? { ...x, colorOrder } : x)) })
                    }
                  />
                </td>
                <td>
                  <button
                    className="ghost"
                    disabled={c.outputs.length <= 1}
                    aria-label={`remove output ${i + 1}`}
                    onClick={() => set({ outputs: c.outputs.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button onClick={() => apply((p) => cmd.autoPatch(p, c.id), "Auto-patch")}>
            Auto-patch unpatched fixtures
          </button>
        </div>
        {issues.map((i, k) => (
          <div key={k} className={`issue ${i.severity}`}>
            {i.message}
          </div>
        ))}
      </Section>

      {c.kind === "wled" && (
        <Section title="WLED">
          {bridgeStatus !== "open" && (
            <p className="muted">Connect to the bridge (toolbar) to talk to devices.</p>
          )}
          <div className="row wrap">
            <button
              disabled={busy || bridgeStatus !== "open" || !c.host}
              onClick={() =>
                run("Read info", async () =>
                  setInfo(await runtime.rpc<WledInfo>("wled.info", { host: c.host })),
                )
              }
            >
              Read info
            </button>
            <button
              disabled={busy || bridgeStatus !== "open" || !c.host}
              title="Writes LED outputs (pins, counts, chip type) and enables realtime receive; reboots the device."
              onClick={() =>
                run("Push config", async () => {
                  if (!window.confirm(`Overwrite LED hardware settings on ${c.host} and reboot it?`)) return;
                  await runtime.rpc("wled.applyConfig", {
                    host: c.host,
                    config: buildWledConfigPatch(compiled(), project.fixtures),
                    reboot: true,
                  });
                  notify("info", `Config pushed to ${c.name}; device is rebooting.`);
                })
              }
            >
              Push LED config
            </button>
            <button
              disabled={busy || bridgeStatus !== "open" || !c.host}
              title="Upload a 2D ledmap so WLED's built-in 2D effects follow your physical layout (for standalone use)."
              onClick={() =>
                run("Upload ledmap", async () => {
                  const cc = compiled();
                  const xyz: number[] = [];
                  const phys: number[] = [];
                  cc.route.forEach((g, slot) => {
                    if (g < 0) return;
                    xyz.push(...runtime.compiled.space.xyz.subarray(g * 3, g * 3 + 3));
                    phys.push(slot);
                  });
                  const side = Math.max(8, Math.ceil(Math.sqrt(phys.length) * 1.5));
                  const map = buildLedmap2D(xyz, phys, side, side);
                  await runtime.rpc("wled.uploadFile", {
                    host: c.host,
                    path: "/ledmap.json",
                    content: serializeLedmap(map),
                  });
                  notify(
                    "info",
                    `ledmap.json (${side}×${side}) uploaded to ${c.name}. Reboot WLED to apply.`,
                  );
                })
              }
            >
              Upload ledmap
            </button>
          </div>
          {info && (
            <dl className="info">
              <dt>Name</dt>
              <dd>{info.name}</dd>
              <dt>Version</dt>
              <dd>{info.ver}</dd>
              <dt>LEDs</dt>
              <dd>
                {info.leds.count}
                {info.leds.count !== layout.totalPixels && (
                  <span className="warn"> (layout has {layout.totalPixels})</span>
                )}
              </dd>
              <dt>MAC</dt>
              <dd>{info.mac}</dd>
            </dl>
          )}
        </Section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ layers / clips

function MaskFields({ layer, locator }: { layer: Layer; locator: LayerLocator }) {
  const fixtures = useStudio((s) => s.project.fixtures);
  const mask = layer.mask ?? { fixtureIds: [], tags: [], invert: false };
  const set = (m: Partial<typeof mask>) => {
    const next = { ...mask, ...m };
    const empty = next.fixtureIds.length === 0 && next.tags.length === 0 && !next.invert;
    apply((p) => cmd.updateLayer(p, locator, { mask: empty ? null : next }), "Edit mask");
  };
  return (
    <>
      <Field label="Only tags">
        <TagsInput ariaLabel="mask tags" value={mask.tags} onChange={(tags) => set({ tags })} />
      </Field>
      <Field label="Only fixtures">
        <select
          multiple
          aria-label="mask fixtures"
          value={mask.fixtureIds}
          onChange={(e) => set({ fixtureIds: [...e.target.selectedOptions].map((o) => o.value) })}
        >
          {fixtures.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      <Checkbox label="Invert mask" checked={mask.invert} onChange={(invert) => set({ invert })} />
    </>
  );
}

export function LayerInspector({
  layer,
  locator,
  localTime,
}: {
  layer: Layer;
  locator: LayerLocator;
  localTime?: number;
}) {
  const runtime = useRuntime();
  const time = useStudio((s) => s.time);
  const error = useStudio((s) => s.layerErrors[layer.id]);
  const effect = runtime.registry.get(layer.effectId);
  const set = (changes: Partial<Layer>, live = false) =>
    apply((p) => cmd.updateLayer(p, locator, changes), "Edit layer", live ? `layer:${layer.id}` : undefined);
  return (
    <>
      <Section
        title="Layer"
        actions={
          "layerId" in locator ? (
            <button
              className="ghost danger"
              title="Delete layer"
              onClick={() => apply((p) => cmd.removeLayer(p, layer.id), "Delete layer")}
            >
              🗑
            </button>
          ) : undefined
        }
      >
        <Field label="Name">
          <TextInput
            ariaLabel="layer name"
            value={layer.name}
            placeholder={effect?.name}
            onChange={(name) => set({ name })}
          />
        </Field>
        <Field label="Effect">
          <Select
            ariaLabel="effect"
            value={layer.effectId}
            options={runtime.registry
              .list()
              .map((e) => ({ value: e.id, label: `${e.name} (${e.category})` }))}
            onChange={(effectId) => set({ effectId, params: {} })}
          />
        </Field>
        <Field label="Opacity">
          <Slider
            ariaLabel="opacity"
            value={layer.opacity}
            min={0}
            max={1}
            onChange={(opacity) => set({ opacity }, true)}
            onCommit={() => studio.getState().seal()}
          />
        </Field>
        <Field label="Blend">
          <Select
            ariaLabel="blend"
            value={layer.blend}
            options={opts(BLEND_MODES)}
            onChange={(blend) => set({ blend })}
          />
        </Field>
        <Field label="Speed">
          <Slider
            ariaLabel="speed"
            value={layer.speed}
            min={-4}
            max={4}
            onChange={(speed) => set({ speed }, true)}
            onCommit={() => studio.getState().seal()}
          />
        </Field>
        <Checkbox label="Enabled" checked={layer.enabled} onChange={(enabled) => set({ enabled })} />
      </Section>
      {effect ? (
        <Section title={effect.name}>
          <p className="muted small">{effect.description}</p>
          <ParamEditor
            layer={layer}
            effect={effect}
            locator={locator}
            localTime={localTime ?? time}
            error={error}
          />
        </Section>
      ) : (
        <div className="error-box">Unknown effect “{layer.effectId}”</div>
      )}
      <Section title="Mask">
        <MaskFields layer={layer} locator={locator} />
      </Section>
    </>
  );
}

function ClipInspector({ clipId }: { clipId: string }) {
  const project = useStudio((s) => s.project);
  const time = useStudio((s) => s.time);
  const clip = project.timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
  if (!clip) return null;
  const set = (changes: Parameters<typeof cmd.updateClip>[2]) =>
    apply((p) => cmd.updateClip(p, clipId, changes), "Edit clip");
  return (
    <>
      <Section
        title="Clip"
        actions={
          <button
            className="ghost danger"
            title="Delete clip"
            onClick={() => apply((p) => cmd.removeClip(p, clipId), "Delete clip")}
          >
            🗑
          </button>
        }
      >
        <Field label="Start (s)">
          <NumberInput
            ariaLabel="clip start"
            value={clip.start}
            min={0}
            onChange={(start) => set({ start })}
          />
        </Field>
        <Field label="Duration (s)">
          <NumberInput
            ariaLabel="clip duration"
            value={clip.duration}
            min={0.01}
            onChange={(duration) => set({ duration })}
          />
        </Field>
        <Field label="Fade in (s)">
          <NumberInput
            ariaLabel="fade in"
            value={clip.fadeIn}
            min={0}
            onChange={(fadeIn) => set({ fadeIn })}
          />
        </Field>
        <Field label="Fade out (s)">
          <NumberInput
            ariaLabel="fade out"
            value={clip.fadeOut}
            min={0}
            onChange={(fadeOut) => set({ fadeOut })}
          />
        </Field>
      </Section>
      <LayerInspector
        layer={clip.layer}
        locator={{ clipId }}
        localTime={Math.max(0, Math.min(clip.duration, time - clip.start))}
      />
    </>
  );
}

function ModelInspector({ id }: { id: string }) {
  const m = useStudio((s) => s.project.models.find((x) => x.id === id));
  if (!m) return null;
  const set = (changes: Parameters<typeof cmd.updateModel>[2], live = false) =>
    apply((p) => cmd.updateModel(p, id, changes), "Edit model", live ? `model:${id}` : undefined);
  return (
    <Section
      title={`Model · ${m.format}`}
      actions={
        <button
          className="ghost danger"
          title="Remove model"
          onClick={() => apply((p) => cmd.removeModel(p, id), "Remove model")}
        >
          🗑
        </button>
      }
    >
      <Field label="Name">
        <TextInput ariaLabel="model name" value={m.name} onChange={(name) => set({ name })} />
      </Field>
      <Field label="Position">
        <Vec3Input
          ariaLabel="model position"
          value={m.transform.position}
          onChange={(position) => set({ transform: { ...m.transform, position } })}
        />
      </Field>
      <Field label="Rotation°">
        <Vec3Input
          ariaLabel="model rotation"
          value={m.transform.rotation}
          onChange={(rotation) => set({ transform: { ...m.transform, rotation } })}
        />
      </Field>
      <Field label="Scale">
        <Vec3Input
          ariaLabel="model scale"
          value={m.transform.scale}
          onChange={(scale) => set({ transform: { ...m.transform, scale } })}
        />
      </Field>
      <Field label="Opacity">
        <Slider
          ariaLabel="model opacity"
          value={m.opacity}
          min={0}
          max={1}
          onChange={(opacity) => set({ opacity }, true)}
          onCommit={() => studio.getState().seal()}
        />
      </Field>
      <Checkbox label="Visible" checked={m.visible} onChange={(visible) => set({ visible })} />
      <p className="muted small">Tip: models in meters? Set scale to 1000 for a mm project.</p>
    </Section>
  );
}
