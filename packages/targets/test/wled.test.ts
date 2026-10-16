import { describe, expect, it } from "vitest";
import { createController, createFixture, createProject } from "@ledlay/core";
import { compileLayout } from "@ledlay/engine";
import {
  WledClient,
  WledError,
  buildLedmap2D,
  buildWledBusConfig,
  buildWledConfigPatch,
  serializeLedmap,
  type FetchLike,
} from "../src";

interface Call {
  url: string;
  init?: Parameters<FetchLike>[1];
}

function fakeFetch(responses: Record<string, unknown>, status = 200): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    const body = responses[path];
    return {
      ok: status < 400,
      status,
      json: async () => body,
      text: async () => (body === undefined ? "" : JSON.stringify(body)),
    };
  };
  return { fetch, calls };
}

describe("WledClient", () => {
  it("reads info and posts state/config as JSON", async () => {
    const { fetch, calls } = fakeFetch({ "/json/info": { ver: "0.15.0", name: "Tree", mac: "aa", leds: { count: 100 } } });
    const c = new WledClient("10.0.0.5", fetch);
    expect((await c.getInfo()).leds.count).toBe(100);
    await c.setState({ on: true });
    await c.setConfig({ hw: {} });
    await c.reboot();
    expect(calls.map((x) => x.url)).toEqual([
      "http://10.0.0.5/json/info",
      "http://10.0.0.5/json/state",
      "http://10.0.0.5/json/cfg",
      "http://10.0.0.5/json/state",
    ]);
    expect(calls[1]!.init).toMatchObject({ method: "POST", body: '{"on":true}' });
    expect(calls[3]!.init!.body).toBe('{"rb":true}');
    await c.getState();
    await c.getConfig();
  });

  it("accepts full URLs and surfaces HTTP errors", async () => {
    const { fetch, calls } = fakeFetch({}, 500);
    const c = new WledClient("http://wled.local/", fetch);
    await expect(c.getInfo()).rejects.toBeInstanceOf(WledError);
    expect(calls[0]!.url).toBe("http://wled.local/json/info");
  });

  it("times out", async () => {
    const never: FetchLike = () => new Promise(() => {});
    await expect(new WledClient("x", never, 10).getInfo()).rejects.toThrow(/Timed out/);
  });

  it("uploads files as multipart with a leading slash", async () => {
    const { fetch, calls } = fakeFetch({});
    await new WledClient("h", fetch).uploadFile("ledmap.json", "{}");
    expect(calls[0]!.url).toBe("http://h/upload");
    const form = calls[0]!.init!.body as FormData;
    const file = form.get("data") as File;
    expect(file.name).toBe("/ledmap.json");
    expect(await file.text()).toBe("{}");
    const bad = fakeFetch({}, 404);
    await expect(new WledClient("h", bad.fetch).uploadFile("/x", "")).rejects.toThrow(/HTTP 404/);
  });
});

describe("WLED config generation", () => {
  function project() {
    const ctl = createController({
      id: "c",
      name: "C",
      host: "h",
      outputs: [{ pin: 16 }, { pin: 17 }],
    });
    const a = createFixture({ id: "a", name: "A", geometry: { kind: "strip", count: 30, spacing: 1 } });
    a.patch = { controllerId: "c", output: 0, startPixel: 0 };
    const b = createFixture({ id: "b", name: "B", geometry: { kind: "strip", count: 10, spacing: 1 }, ledTypeId: "sk6812rgbw" });
    b.patch = { controllerId: "c", output: 1, startPixel: 0 };
    return createProject({ controllers: [ctl], fixtures: [a, b] });
  }

  it("maps outputs to buses with chip type and order", () => {
    const p = project();
    const cc = compileLayout(p).controllers[0]!;
    expect(buildWledBusConfig(cc, p.fixtures)).toEqual([
      { start: 0, len: 30, pin: [16], order: 0, rev: false, skip: 0, type: 22 },
      { start: 30, len: 10, pin: [17], order: 0, rev: false, skip: 0, type: 30 },
    ]);
  });

  it("builds a cfg patch with realtime settings", () => {
    const p = project();
    const patch = buildWledConfigPatch(compileLayout(p).controllers[0]!, p.fixtures) as {
      hw: { led: { total: number } };
      if: { live: Record<string, unknown> };
    };
    expect(patch.hw.led.total).toBe(40);
    expect(patch.if.live).toMatchObject({ en: true, "no-gc": true });
    expect(patch.if.live.dmx).toBeUndefined();
    p.controllers[0]!.protocol = "e131";
    const e = buildWledConfigPatch(compileLayout(p).controllers[0]!, p.fixtures) as { if: { live: { dmx: { uni: number } } } };
    expect(e.if.live.dmx.uni).toBe(1);
  });

  it("handles outputs without a pin or fixture", () => {
    const ctl = createController({ id: "c", name: "C", outputs: [{ pixelCount: 5 }] });
    const cc = compileLayout(createProject({ controllers: [ctl] })).controllers[0]!;
    expect(buildWledBusConfig(cc, [])[0]).toMatchObject({ pin: [], len: 5, type: 22 });
  });
});

describe("ledmap", () => {
  it("snaps a serpentine 3x2 matrix to a grid with top-left origin", () => {
    // physical order: (0,0) (1,0) (2,0) (2,1) (1,1) (0,1)
    const pos = [0, 0, 0, 1, 0, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0, 0, 1, 0];
    const m = buildLedmap2D(pos, [0, 1, 2, 3, 4, 5], 3, 2);
    expect(m.map).toEqual([5, 4, 3, 0, 1, 2]);
    expect(serializeLedmap(m)).toBe('{"n":"ledlay","width":3,"height":2,"map":[5,4,3,0,1,2]}');
  });

  it("leaves empty cells as -1 and keeps the first pixel on collisions", () => {
    const m = buildLedmap2D([0, 0, 0, 0, 0, 0], [7, 8], 2, 2);
    expect(m.map).toEqual([-1, -1, 7, -1]);
  });
});
