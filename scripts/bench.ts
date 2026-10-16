/** Render-speed benchmark: every built-in effect on a 22³ (10,648 px) cube. Run: pnpm bench */
import { createController, createFixture, createLayer, createProject } from "../packages/core/src/index.ts";
import { createDefaultRegistry } from "../packages/effects/src/index.ts";
import { compileLayout, ControllerEncoder, Renderer } from "../packages/engine/src/index.ts";
const f = createFixture({
  id: "cube",
  name: "c",
  geometry: { kind: "cube", nx: 22, ny: 22, nz: 22, spacing: 10 },
});
f.patch = { controllerId: "c", output: 0, startPixel: 0 };
const reg = createDefaultRegistry();
for (const id of reg.list().map((e) => e.id)) {
  const p = createProject({
    fixtures: [f],
    controllers: [createController({ id: "c", name: "c", host: "x" })],
    layers: [createLayer({ effectId: id })],
  });
  const c = compileLayout(p);
  const r = new Renderer(reg, c);
  const enc = new ControllerEncoder(c.controllers[0]!);
  const frame = r.createFrame();
  for (let i = 0; i < 5; i++) r.renderProject(p, i / 40, frame);
  const t0 = performance.now();
  const N = 40;
  for (let i = 0; i < N; i++) {
    r.renderProject(p, i / 40, frame);
    enc.encode(frame);
  }
  console.log(id.padEnd(14), ((performance.now() - t0) / N).toFixed(2), "ms/frame for", c.space.count, "px");
}
