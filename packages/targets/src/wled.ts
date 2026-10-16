/**
 * WLED JSON API client + config generation.
 * Docs: https://kno.wled.ge/interfaces/json-api/
 */
import { getLedType, type Controller, type Fixture } from "@ledlay/core";
import type { CompiledController } from "@ledlay/engine";

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: unknown },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface WledInfo {
  ver: string;
  name: string;
  mac: string;
  leds: { count: number; rgbw?: boolean; maxpwr?: number; fps?: number };
  arch?: string;
  ip?: string;
  live?: boolean;
}

export class WledError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "WledError";
  }
}

export class WledClient {
  private readonly base: string;

  constructor(
    host: string,
    private readonly fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
    private readonly timeoutMs = 4000,
  ) {
    this.base = /^https?:\/\//.test(host) ? host.replace(/\/$/, "") : `http://${host}`;
  }

  private async request(path: string, init?: Parameters<FetchLike>[1]): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new WledError(`Timed out contacting ${this.base}`)), this.timeoutMs);
    });
    try {
      const res = await Promise.race([this.fetchImpl(this.base + path, init), timeout]);
      if (!res.ok) throw new WledError(`WLED ${path} failed with HTTP ${res.status}`, res.status);
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    } finally {
      clearTimeout(timer);
    }
  }

  getInfo(): Promise<WledInfo> {
    return this.request("/json/info") as Promise<WledInfo>;
  }

  getState(): Promise<Record<string, unknown>> {
    return this.request("/json/state") as Promise<Record<string, unknown>>;
  }

  setState(state: Record<string, unknown>): Promise<unknown> {
    return this.request("/json/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  }

  getConfig(): Promise<Record<string, unknown>> {
    return this.request("/json/cfg") as Promise<Record<string, unknown>>;
  }

  /** Partial config update. Hardware (LED bus) changes take effect after reboot. */
  setConfig(patch: Record<string, unknown>): Promise<unknown> {
    return this.request("/json/cfg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  reboot(): Promise<unknown> {
    return this.setState({ rb: true });
  }

  /** Upload a file to the device filesystem (e.g. "/ledmap.json"). */
  async uploadFile(path: string, content: string, mime = "application/json"): Promise<void> {
    const form = new FormData();
    form.append("data", new Blob([content], { type: mime }), path.startsWith("/") ? path : `/${path}`);
    const res = await this.fetchImpl(`${this.base}/upload`, { method: "POST", body: form });
    if (!res.ok) throw new WledError(`Upload of ${path} failed with HTTP ${res.status}`, res.status);
  }
}

/** WLED color order codes for hw.led.ins[].order. */
export const WLED_COLOR_ORDER: Record<string, number> = { GRB: 0, RGB: 1, BRG: 2, RBG: 3, BGR: 4, GBR: 5 };

export interface WledBusConfig {
  start: number;
  len: number;
  pin: number[];
  order: number;
  rev: boolean;
  skip: number;
  type: number;
}

/**
 * Generate hw.led.ins (LED bus) configuration for a WLED controller from the patch.
 * The physical chip order goes to WLED (WLED reorders), and we stream plain RGB(W).
 */
export function buildWledBusConfig(cc: CompiledController, fixtures: readonly Fixture[]): WledBusConfig[] {
  return cc.layout.outputs.map((o) => {
    const out = cc.controller.outputs[o.output]!;
    // Use the LED type of the first fixture patched to this output for chip type/order.
    const f = fixtures.find((x) => x.patch?.controllerId === cc.controller.id && x.patch.output === o.output);
    const lt = getLedType(f?.ledTypeId ?? "ws2812b");
    const rgbOrder = lt.nativeOrder.replace("W", "");
    return {
      start: o.offset,
      len: o.length,
      pin: out.pin === null ? [] : [out.pin],
      order: WLED_COLOR_ORDER[rgbOrder] ?? 0,
      rev: false,
      skip: 0,
      type: lt.wledType,
    };
  });
}

/** Full cfg patch: LED buses plus realtime (DDP/E1.31/Art-Net) receive settings. */
export function buildWledConfigPatch(
  cc: CompiledController,
  fixtures: readonly Fixture[],
): Record<string, unknown> {
  const c: Controller = cc.controller;
  // timeout is in 100ms units; "no-gc" disables WLED gamma so ledlay's gamma is authoritative.
  const live: Record<string, unknown> = { en: true, mso: false, timeout: 25, "no-gc": true };
  if (c.protocol !== "ddp") {
    live.dmx = { uni: c.universeStart, mode: 4 /* multi RGB */, addr: 1 };
  }
  return {
    hw: { led: { total: cc.layout.totalPixels, ins: buildWledBusConfig(cc, fixtures) } },
    if: { live },
  };
}

export interface Ledmap2D {
  width: number;
  height: number;
  map: number[];
}

/**
 * Build a WLED 2D ledmap for a controller's pixels by projecting their world positions onto
 * the XY plane and snapping to a grid. Index = logical (x + y*width, y=0 at top), value =
 * physical LED index, -1 = empty cell. Lets WLED's own 2D effects run on irregular layouts.
 */
export function buildLedmap2D(
  positions: ArrayLike<number>,
  physicalIndices: readonly number[],
  width: number,
  height: number,
): Ledmap2D {
  const n = physicalIndices.length;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3]!,
      y = positions[i * 3 + 1]!;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const map = new Array<number>(width * height).fill(-1);
  for (let i = 0; i < n; i++) {
    const fx = maxX > minX ? (positions[i * 3]! - minX) / (maxX - minX) : 0;
    const fy = maxY > minY ? (positions[i * 3 + 1]! - minY) / (maxY - minY) : 0;
    const gx = Math.round(fx * (width - 1));
    const gy = height - 1 - Math.round(fy * (height - 1));
    const cell = gy * width + gx;
    if (map[cell] === -1) map[cell] = physicalIndices[i]!;
  }
  return { width, height, map };
}

/** Serialise a ledmap the way WLED's (whitespace-sensitive) parser likes it: compact. */
export function serializeLedmap(m: Ledmap2D): string {
  return JSON.stringify({ n: "ledlay", width: m.width, height: m.height, map: m.map });
}
