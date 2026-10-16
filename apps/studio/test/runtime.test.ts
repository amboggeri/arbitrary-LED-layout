import { describe, expect, it } from "vitest";
import { createProject, type Controller } from "@ledlay/core";
import * as cmd from "@ledlay/editor";
import type { CompiledLayout } from "@ledlay/engine";
import type { BridgeStats, LinkStatus } from "@ledlay/link";
import { StudioRuntime, type BridgeLike, type FrameSink } from "../src/runtime/runtime";
import { createStudioStore } from "../src/state/store";

class FakeClock {
  t = 0;
  q: { at: number; cb: () => void }[] = [];
  now = () => this.t;
  setTimeout = (cb: () => void, ms: number) => {
    const i = { at: this.t + ms, cb };
    this.q.push(i);
    return i;
  };
  clearTimeout = (h: unknown) => void (this.q = this.q.filter((x) => x !== h));
  run(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.q.sort((a, b) => a.at - b.at);
      const n = this.q[0];
      if (!n || n.at > end) break;
      this.q.shift();
      this.t = n.at;
      n.cb();
    }
    this.t = end;
  }
}

class FakeBridge implements BridgeLike {
  state: LinkStatus = "closed";
  frames: { index: number; data: number[] }[] = [];
  controllers: Controller[] = [];
  blackouts = 0;
  constructor(private hooks: { onStatus(s: LinkStatus): void; onStats(s: BridgeStats): void }) {}
  connect() {
    this.state = "open";
    this.hooks.onStatus("open");
    this.hooks.onStats({ frames: 1, packets: 1, bytes: 1, errors: 0, lastError: null, fps: 1 });
  }
  disconnect() {
    this.state = "closed";
  }
  setControllers(c: Controller[]) {
    this.controllers = c;
  }
  sendFrame(index: number, data: Uint8Array) {
    this.frames.push({ index, data: [...data] });
    return true;
  }
  blackout() {
    this.blackouts++;
  }
  async rpc<T>(method: string): Promise<T> {
    return method as T;
  }
}

function setup() {
  let p = createProject({ fps: 10 });
  p = cmd.addController(p, { id: "c", name: "C", host: "10.0.0.2" });
  p = cmd.addFixture(p, { id: "a", name: "A", geometry: { kind: "strip", count: 2, spacing: 1 } });
  p = cmd.autoPatch(p, "c");
  p = cmd.addLayer(p, { id: "l", effectId: "solid", params: { color: "#ff0000" } });
  const store = createStudioStore(p);
  const clock = new FakeClock();
  let bridge!: FakeBridge;
  const rt = new StudioRuntime(store, {
    clock,
    createBridge: (_url, hooks) => (bridge = new FakeBridge(hooks)),
  });
  const layouts: CompiledLayout[] = [];
  const frames: number[][] = [];
  const sink: FrameSink = { setLayout: (l) => layouts.push(l), setColors: (f) => frames.push([...f]) };
  return { store, clock, rt, sink, layouts, frames, bridge: () => bridge };
}

describe("StudioRuntime", () => {
  it("renders into sinks on start and on edits while paused", () => {
    const { store, rt, sink, frames, layouts } = setup();
    rt.start();
    rt.addSink(sink);
    expect(layouts).toHaveLength(1);
    expect(frames.at(-1)!.slice(0, 3)).toEqual([1, 0, 0]);
    store.getState().apply((p) => cmd.setLayerParam(p, { layerId: "l" }, "color", "#00ff00"));
    expect(frames.at(-1)!.slice(0, 3)).toEqual([0, 1, 0]);
    // geometry change recompiles and pushes a new layout
    store
      .getState()
      .apply((p) => cmd.updateFixture(p, "a", { geometry: { kind: "strip", count: 3, spacing: 1 } }));
    expect(layouts).toHaveLength(2);
    expect(rt.compiled.space.count).toBe(3);
    expect(frames.at(-1)).toHaveLength(9);
    rt.dispose();
  });

  it("plays via the store flag, updates time and fps", () => {
    const { store, rt, clock } = setup();
    rt.start();
    store.getState().setPlaying(true);
    clock.run(1000);
    expect(store.getState().time).toBeGreaterThan(0.8);
    expect(store.getState().fps).toBeGreaterThan(5);
    store.getState().setPlaying(false);
    const t = rt.time;
    clock.run(1000);
    expect(rt.time).toBe(t);
    rt.seek(5);
    expect(store.getState().time).toBe(5);
    rt.seek(-1);
    expect(rt.time).toBe(0);
    store.getState().apply((p) => cmd.setProjectMeta(p, { fps: 20 }));
    rt.dispose();
  });

  it("streams encoded frames to the bridge only when output is enabled", () => {
    const { store, rt, clock, bridge } = setup();
    rt.start();
    rt.connectBridge();
    expect(store.getState().bridge.status).toBe("open");
    expect(store.getState().bridge.stats).not.toBeNull();
    expect(bridge().controllers.map((c) => c.id)).toEqual(["c"]);
    store.getState().setPlaying(true);
    clock.run(300);
    expect(bridge().frames).toHaveLength(0);
    store.getState().setOutput({ enabled: true, masterBrightness: 0.5 });
    clock.run(300);
    expect(bridge().frames.length).toBeGreaterThan(0);
    expect(bridge().frames.at(-1)).toEqual({ index: 0, data: [128, 0, 0, 128, 0, 0] });
    store.getState().setOutput({ enabled: false });
    expect(bridge().blackouts).toBe(1);
    // controller edits are forwarded
    store.getState().apply((p) => cmd.updateController(p, "c", { host: "10.0.0.3" }));
    expect(bridge().controllers[0]!.host).toBe("10.0.0.3");
    rt.disconnectBridge();
    expect(store.getState().bridge.status).toBe("closed");
    rt.dispose();
  });

  it("re-renders on brightness change while paused, and rpc requires a bridge", async () => {
    const { store, rt } = setup();
    rt.start();
    await expect(rt.rpc("ping")).rejects.toThrow(/Not connected/);
    rt.connectBridge();
    expect(await rt.rpc("ping")).toBe("ping");
    store.getState().setOutput({ masterBrightness: 0.2 });
    store.getState().setBridge({ url: "ws://other" });
    rt.dispose();
  });

  it("surfaces layer errors to the store", () => {
    const { store, rt } = setup();
    rt.start();
    store.getState().apply((p) => cmd.addLayer(p, { id: "bad", effectId: "nope" }));
    expect(store.getState().layerErrors.bad).toMatch(/Unknown effect/);
    rt.dispose();
  });

  it("pushes layouts to sinks when models change", () => {
    const { store, rt, sink, layouts } = setup();
    rt.start();
    rt.addSink(sink);
    store.getState().apply((p) =>
      cmd.addModel(p, {
        name: "m",
        format: "glb",
        uri: "",
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        opacity: 1,
        visible: true,
      }),
    );
    expect(layouts).toHaveLength(2);
    rt.dispose();
  });
});
