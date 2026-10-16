/**
 * Imperative three.js view of the layout: LEDs as glowing points, wiring paths, imported
 * reference models, selection, transform gizmo and surface drawing. React only mounts it
 * and forwards state; it never re-renders per frame.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { Project, SceneModel, TransformData, Vec3 } from "@ledlay/core";
import type { CompiledLayout } from "@ledlay/engine";
import type { FrameSink } from "../runtime/runtime";
import { loadModel } from "./loaders";

export type GizmoMode = "translate" | "rotate" | "scale" | null;

export interface ViewportCallbacks {
  /** Click on an LED (fixture id) or empty space (null). additive = shift held. */
  onPick(fixtureId: string | null, additive: boolean): void;
  /** Gizmo drag in progress / finished, with the fixture's new transform. */
  onTransform(fixtureId: string, t: TransformData, done: boolean): void;
  /** Draw tool: a world-space point on a model surface or the ground plane. */
  onDrawPoint(p: Vec3): void;
}

const DEG = 180 / Math.PI;

function makeDotTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Viewport3D implements FrameSink {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private orbit: OrbitControls;
  private gizmo: TransformControls;
  private gizmoProxy = new THREE.Object3D();
  private ledGeom = new THREE.BufferGeometry();
  private leds: THREE.Points;
  private glow: THREE.Points;
  private wires = new THREE.Group();
  private selectionGroup = new THREE.Group();
  private modelsGroup = new THREE.Group();
  private drawPreview: THREE.Line;
  private grid: THREE.GridHelper;
  private raycaster = new THREE.Raycaster();
  private layout: CompiledLayout | null = null;
  private project: Project | null = null;
  private colors = new Float32Array(0);
  private selected: string[] = [];
  private gizmoFixture: string | null = null;
  private drawing = false;
  private loadedModels = new Map<string, { uri: string; object: THREE.Object3D }>();
  private resizeObs: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private pointerDown: { x: number; y: number } | null = null;
  private ledSize = 10;
  /** Exposed for tests/e2e: number of LEDs currently drawn. */
  ledCount = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly cb: ViewportCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x0b0d12);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.dataset.testid = "viewport-canvas";

    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 200_000);
    this.camera.position.set(1500, 1200, 2500);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.addEventListener("change", () => (this.dirty = true));

    this.grid = new THREE.GridHelper(10_000, 100, 0x2a3140, 0x171b24);
    this.scene.add(this.grid);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(1, 2, 1.5);
    this.scene.add(sun);
    this.scene.add(new THREE.AxesHelper(300));

    const dot = makeDotTexture();
    this.leds = new THREE.Points(
      this.ledGeom,
      new THREE.PointsMaterial({
        size: 10,
        vertexColors: true,
        map: dot,
        transparent: true,
        alphaTest: 0.05,
        depthWrite: false,
      }),
    );
    this.glow = new THREE.Points(
      this.ledGeom,
      new THREE.PointsMaterial({
        size: 40,
        vertexColors: true,
        map: dot,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.leds.renderOrder = 2;
    this.glow.renderOrder = 3;
    this.scene.add(this.modelsGroup, this.wires, this.selectionGroup, this.leds, this.glow);

    this.drawPreview = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffd23d }),
    );
    this.scene.add(this.drawPreview);

    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.scene.add(this.gizmoProxy);
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener("dragging-changed", (e) => {
      this.orbit.enabled = !(e as unknown as { value: boolean }).value;
      if (!(e as unknown as { value: boolean }).value) this.emitTransform(true);
    });
    this.gizmo.addEventListener("objectChange", () => this.emitTransform(false));
    this.gizmo.addEventListener("change", () => (this.dirty = true));

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointerup", this.onPointerUp);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.loop();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.gizmo.detach();
    this.gizmo.dispose();
    this.orbit.dispose();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------------ FrameSink

  setLayout(layout: CompiledLayout, project: Project): void {
    this.layout = layout;
    this.project = project;
    const n = layout.space.count;
    this.ledCount = n;
    this.ledGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(layout.space.xyz), 3));
    this.colors = new Float32Array(n * 3);
    this.ledGeom.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.ledGeom.computeBoundingSphere();
    this.ledSize = this.estimateLedSize(layout);
    (this.leds.material as THREE.PointsMaterial).size = this.ledSize;
    (this.glow.material as THREE.PointsMaterial).size = this.ledSize * 4;
    this.rebuildWires();
    this.rebuildSelection();
    this.syncModels(project.models);
    this.syncGizmo();
    this.dirty = true;
  }

  setColors(frame: Float32Array): void {
    if (frame.length !== this.colors.length) return;
    // Lift dark-but-nonzero values a little so dim LEDs remain visible on screen.
    for (let i = 0; i < frame.length; i++) {
      const v = frame[i]!;
      this.colors[i] = v <= 0 ? 0.06 : Math.min(1, 0.06 + Math.pow(v, 0.8));
    }
    const attr = this.ledGeom.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (attr) attr.needsUpdate = true;
    this.dirty = true;
  }

  // ------------------------------------------------------------------ state from React

  setSelection(fixtureIds: string[]): void {
    this.selected = fixtureIds;
    this.rebuildSelection();
    this.syncGizmo();
  }

  setGizmoMode(mode: GizmoMode): void {
    if (mode) this.gizmo.setMode(mode);
    this.gizmoMode = mode;
    this.syncGizmo();
  }
  private gizmoMode: GizmoMode = null;

  setDrawing(on: boolean, previewWorld: Vec3[] = []): void {
    this.drawing = on;
    const g = new THREE.BufferGeometry().setFromPoints(previewWorld.map((p) => new THREE.Vector3(...p)));
    this.drawPreview.geometry.dispose();
    this.drawPreview.geometry = g;
    this.drawPreview.visible = on && previewWorld.length > 1;
    this.syncGizmo();
    this.dirty = true;
  }

  /** Fit the camera to all LEDs and models. */
  frameAll(): void {
    const box = new THREE.Box3();
    if (this.layout && this.layout.space.count > 0) {
      const b = this.layout.space.bounds;
      box.expandByPoint(new THREE.Vector3(...b.min)).expandByPoint(new THREE.Vector3(...b.max));
    }
    box.expandByObject(this.modelsGroup);
    if (box.isEmpty()) box.set(new THREE.Vector3(-500, 0, -500), new THREE.Vector3(500, 500, 500));
    const size = box.getSize(new THREE.Vector3()).length() || 1000;
    const center = box.getCenter(new THREE.Vector3());
    const dir = new THREE.Vector3(0.6, 0.45, 1).normalize();
    this.camera.position.copy(center).addScaledVector(dir, size * 1.2);
    this.camera.near = Math.max(0.1, size / 1000);
    this.camera.far = size * 100;
    this.camera.updateProjectionMatrix();
    this.orbit.target.copy(center);
    this.orbit.update();
    const span = Math.max(1000, size * 2);
    this.grid.scale.setScalar(span / 10_000);
    this.dirty = true;
  }

  // ------------------------------------------------------------------ internals

  private estimateLedSize(layout: CompiledLayout): number {
    // Median nearest-neighbour distance along wiring, a decent proxy for LED pitch.
    const xyz = layout.space.xyz;
    const d: number[] = [];
    for (const f of layout.fixtures) {
      for (let i = 1; i < Math.min(f.count, 50); i++) {
        const a = (f.offset + i - 1) * 3,
          b = (f.offset + i) * 3;
        d.push(Math.hypot(xyz[a]! - xyz[b]!, xyz[a + 1]! - xyz[b + 1]!, xyz[a + 2]! - xyz[b + 2]!));
      }
    }
    d.sort((x, y) => x - y);
    const med = d.length ? d[Math.floor(d.length / 2)]! : 20;
    return Math.max(2, med * 0.7);
  }

  private fixtureLine(fixtureIndex: number): THREE.Vector3[] {
    const f = this.layout!.fixtures[fixtureIndex]!;
    const xyz = this.layout!.space.xyz;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < f.count; i++) {
      const j = (f.offset + i) * 3;
      pts.push(new THREE.Vector3(xyz[j], xyz[j + 1], xyz[j + 2]));
    }
    return pts;
  }

  private clearGroup(g: THREE.Group) {
    for (const c of [...g.children]) {
      g.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
      const m = (c as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    }
  }

  private rebuildWires() {
    this.clearGroup(this.wires);
    if (!this.layout) return;
    const mat = new THREE.LineBasicMaterial({ color: 0x3a4455, transparent: true, opacity: 0.6 });
    this.layout.fixtures.forEach((_f, i) => {
      const pts = this.fixtureLine(i);
      if (pts.length > 1) this.wires.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      if (pts.length > 0) {
        // Data-in marker
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(this.ledSize * 0.6, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0x3dc8ff }),
        );
        m.position.copy(pts[0]!);
        this.wires.add(m);
      }
    });
  }

  private rebuildSelection() {
    this.clearGroup(this.selectionGroup);
    if (!this.layout) return;
    const mat = new THREE.LineBasicMaterial({ color: 0xffd23d });
    for (const id of this.selected) {
      const idx = this.layout.fixtureIndex.get(id);
      if (idx === undefined) continue;
      const pts = this.fixtureLine(idx);
      if (pts.length > 1)
        this.selectionGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      const box = new THREE.Box3().setFromPoints(pts);
      const helper = new THREE.Box3Helper(box.expandByScalar(this.ledSize), 0xffd23d);
      this.selectionGroup.add(helper);
    }
    this.dirty = true;
  }

  private syncGizmo() {
    const id = this.selected.length === 1 ? this.selected[0]! : null;
    const f = id ? this.project?.fixtures.find((x) => x.id === id) : undefined;
    if (!f || !this.gizmoMode || this.drawing) {
      this.gizmo.detach();
      this.gizmoFixture = null;
      this.dirty = true;
      return;
    }
    this.gizmoFixture = f.id;
    if (!this.gizmo.dragging) {
      this.gizmoProxy.position.set(...f.transform.position);
      this.gizmoProxy.rotation.set(
        f.transform.rotation[0] / DEG,
        f.transform.rotation[1] / DEG,
        f.transform.rotation[2] / DEG,
        "XYZ",
      );
      this.gizmoProxy.scale.set(...f.transform.scale);
    }
    this.gizmo.attach(this.gizmoProxy);
    this.dirty = true;
  }

  private emitTransform(done: boolean) {
    if (!this.gizmoFixture) return;
    const o = this.gizmoProxy;
    const r = (v: number) => Math.round(v * 1000) / 1000;
    this.cb.onTransform(
      this.gizmoFixture,
      {
        position: [r(o.position.x), r(o.position.y), r(o.position.z)],
        rotation: [r(o.rotation.x * DEG), r(o.rotation.y * DEG), r(o.rotation.z * DEG)],
        scale: [r(o.scale.x), r(o.scale.y), r(o.scale.z)],
      },
      done,
    );
  }

  private syncModels(models: readonly SceneModel[]) {
    const keep = new Set(models.map((m) => m.id));
    for (const [id, entry] of this.loadedModels) {
      if (!keep.has(id)) {
        this.modelsGroup.remove(entry.object);
        this.loadedModels.delete(id);
      }
    }
    for (const m of models) {
      const entry = this.loadedModels.get(m.id);
      if (entry && entry.uri === m.uri) {
        this.applyModelProps(entry.object, m);
        continue;
      }
      if (entry) this.modelsGroup.remove(entry.object);
      const placeholder = new THREE.Group();
      this.loadedModels.set(m.id, { uri: m.uri, object: placeholder });
      this.modelsGroup.add(placeholder);
      loadModel(m.format, m.uri)
        .then((obj) => {
          placeholder.add(obj);
          this.applyModelProps(placeholder, m);
          this.dirty = true;
        })
        .catch((e) => console.warn(`Failed to load model ${m.name}:`, e));
      this.applyModelProps(placeholder, m);
    }
  }

  private applyModelProps(obj: THREE.Object3D, m: SceneModel) {
    obj.position.set(...m.transform.position);
    obj.rotation.set(
      m.transform.rotation[0] / DEG,
      m.transform.rotation[1] / DEG,
      m.transform.rotation[2] / DEG,
      "XYZ",
    );
    obj.scale.set(...m.transform.scale);
    obj.visible = m.visible;
    obj.userData.modelId = m.id;
    obj.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        mat.transparent = m.opacity < 1;
        mat.opacity = m.opacity;
        mat.depthWrite = m.opacity >= 1;
      }
    });
    this.dirty = true;
  }

  private ndc(ev: PointerEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((ev.clientX - r.left) / r.width) * 2 - 1,
      -((ev.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  private onPointerDown = (ev: PointerEvent) => {
    this.pointerDown = { x: ev.clientX, y: ev.clientY };
  };

  private onPointerUp = (ev: PointerEvent) => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4) return; // was a drag
    if (this.gizmo.dragging) return;
    this.raycaster.setFromCamera(this.ndc(ev), this.camera);

    if (this.drawing) {
      const hits = this.raycaster.intersectObjects(this.modelsGroup.children, true);
      let p: THREE.Vector3 | null = hits[0]?.point ?? null;
      if (!p) {
        const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        p = this.raycaster.ray.intersectPlane(ground, new THREE.Vector3());
      }
      if (p) this.cb.onDrawPoint([p.x, p.y, p.z]);
      return;
    }

    this.raycaster.params.Points = { threshold: this.ledSize * 0.8 };
    const hit = this.raycaster.intersectObject(this.leds)[0];
    if (hit && hit.index !== undefined && this.layout) {
      const fi = this.layout.space.fixture[hit.index]!;
      this.cb.onPick(this.layout.fixtures[fi]?.id ?? null, ev.shiftKey);
    } else this.cb.onPick(null, ev.shiftKey);
  };

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.orbit.update();
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  };
}
