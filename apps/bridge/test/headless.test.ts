import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createController, createFixture, createLayer, createProject, serializeProject } from "@ledlay/core";
import { createDefaultRegistry } from "@ledlay/effects";
import { decodeDdpPacket } from "@ledlay/protocols";
import { MemoryTransport, readFseqHeader } from "@ledlay/targets";
import { runCli } from "../src/cli";
import { playHeadless } from "../src/headless";

function project() {
  const f = createFixture({ id: "a", name: "A", geometry: { kind: "strip", count: 3, spacing: 1 } });
  f.patch = { controllerId: "c", output: 0, startPixel: 0 };
  return createProject({
    name: "Test Show",
    fps: 10,
    fixtures: [f],
    controllers: [
      createController({ id: "c", name: "C", host: "10.0.0.9" }),
      createController({ id: "off", name: "Off", host: "10.0.0.10", enabled: false }),
    ],
    layers: [createLayer({ effectId: "solid", params: { color: "#ff0000" } })],
  });
}

class FakeClock {
  t = 0;
  q: { at: number; cb: () => void }[] = [];
  now = () => this.t;
  setTimeout = (cb: () => void, ms: number) => {
    const item = { at: this.t + ms, cb };
    this.q.push(item);
    return item;
  };
  clearTimeout = (h: unknown) => {
    this.q = this.q.filter((x) => x !== h);
  };
  run(ms: number) {
    const end = this.t + ms;
    while (this.q.length) {
      this.q.sort((a, b) => a.at - b.at);
      if (this.q[0]!.at > end) break;
      const n = this.q.shift()!;
      this.t = n.at;
      n.cb();
    }
    this.t = end;
  }
}

describe("playHeadless", () => {
  it("streams frames to enabled controllers and stops after duration", async () => {
    const transport = new MemoryTransport();
    const clock = new FakeClock();
    const times: number[] = [];
    const run = playHeadless(project(), {
      transport,
      registry: createDefaultRegistry(),
      duration: 0.5,
      brightness: 0.5,
      clock,
      onFrame: (t) => times.push(t),
    });
    clock.run(1000);
    await run.done;
    expect(times).toHaveLength(5);
    await new Promise((r) => setTimeout(r, 0));
    expect(transport.sent.every((p) => p.host === "10.0.0.9")).toBe(true);
    const pkt = decodeDdpPacket(transport.sent[0]!.data);
    expect([...pkt.data]).toEqual([128, 0, 0, 128, 0, 0, 128, 0, 0]);
  });

  it("can be restricted to specific controllers and stopped manually", async () => {
    const transport = new MemoryTransport();
    const clock = new FakeClock();
    const run = playHeadless(project(), {
      transport,
      registry: createDefaultRegistry(),
      controllerIds: ["nope"],
      clock,
    });
    clock.run(300);
    run.stop();
    await run.done;
    expect(transport.sent).toHaveLength(0);
  });
});

describe("CLI", () => {
  async function tmpProject() {
    const dir = await mkdtemp(join(tmpdir(), "ledlay-"));
    const file = join(dir, "show.json");
    await writeFile(file, serializeProject(project()));
    return { dir, file };
  }
  function io() {
    const out: string[] = [];
    const err: string[] = [];
    return { io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) }, out, err };
  }

  it("validates projects", async () => {
    const { file } = await tmpProject();
    const { io: i, out } = io();
    expect(await runCli(["validate", file], i)).toBe(0);
    expect(out.join("\n")).toMatch(/1 fixtures, 3 LEDs, 2 controllers/);
    // disabled controllers are not checked
    expect(out.join("\n")).not.toMatch(/Off:/);
  });

  it("returns 1 for projects with errors", async () => {
    const { dir } = await tmpProject();
    const p = project();
    p.fixtures[0]!.patch = { controllerId: "ghost", output: 0, startPixel: 0 };
    const file = join(dir, "bad.json");
    await writeFile(file, serializeProject(p));
    expect(await runCli(["validate", file], io().io)).toBe(1);
  });

  it("bakes FSEQ files", async () => {
    const { dir, file } = await tmpProject();
    const out = join(dir, "out.fseq");
    const { io: i, out: lines } = io();
    expect(await runCli(["bake", file, "--controller", "c", "--duration", "1", "-o", out], i)).toBe(0);
    const h = readFseqHeader(new Uint8Array(await readFile(out)));
    expect(h.frameCount).toBe(10);
    expect(h.channelCount).toBe(9);
    expect(lines[0]).toMatch(/Wrote/);
    await expect(runCli(["bake", file], i)).rejects.toThrow(/--controller is required/);
  });

  it("prints usage and errors", async () => {
    const { io: i, err } = io();
    expect(await runCli([], i)).toBe(0);
    expect(await runCli(["frobnicate"], i)).toBe(2);
    expect(err[0]).toMatch(/Usage/);
    await expect(runCli(["validate"], i)).rejects.toThrow(/Missing project/);
    await expect(runCli(["wled-info"], i)).rejects.toThrow(/Missing host/);
  });
});
