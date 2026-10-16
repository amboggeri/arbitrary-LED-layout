import { describe, expect, it } from "vitest";
import {
  PROJECT_FORMAT_VERSION,
  ProjectValidationError,
  createController,
  createFixture,
  createLayer,
  createProject,
  isAnimated,
  newId,
  parseProject,
  parseProjectJson,
  serializeProject,
} from "../src";

describe("project parsing", () => {
  it("fills defaults on an empty object", () => {
    const p = createProject();
    expect(p.format).toBe("ledlay-project");
    expect(p.version).toBe(PROJECT_FORMAT_VERSION);
    expect(p.fixtures).toEqual([]);
    expect(p.timeline.tracks).toEqual([]);
    expect(p.fps).toBe(40);
  });

  it("round-trips through JSON", () => {
    const p = createProject({
      name: "Tree",
      fixtures: [createFixture({ name: "A", geometry: { kind: "strip", count: 10, spacing: 16.6 } })],
      controllers: [createController({ name: "WLED", host: "10.0.0.5" })],
      layers: [createLayer({ effectId: "rainbow", params: { speed: { keyframes: [{ t: 0, v: 1 }] } } })],
    });
    const back = parseProjectJson(serializeProject(p));
    expect(back).toEqual(p);
  });

  it("reports readable validation errors", () => {
    try {
      parseProject({
        fixtures: [{ id: "x", name: "bad", geometry: { kind: "strip", count: 0, spacing: 1 } }],
      });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectValidationError);
      const err = e as ProjectValidationError;
      expect(err.issues[0]!.path).toBe("fixtures.0.geometry.count");
      expect(err.message).toContain("fixtures.0.geometry.count");
    }
  });

  it("rejects bad JSON and future versions", () => {
    expect(() => parseProjectJson("{nope")).toThrow(/not valid JSON/);
    expect(() => parseProject({ version: 999 })).toThrow(/newer than supported/);
  });

  it("rejects unknown geometry kinds", () => {
    expect(() => parseProject({ fixtures: [{ id: "a", name: "a", geometry: { kind: "blob" } }] })).toThrow(
      ProjectValidationError,
    );
  });
});

describe("factories", () => {
  it("generate ids and defaults", () => {
    const f = createFixture({
      name: "m",
      geometry: { kind: "matrix", cols: 2, rows: 2, spacingX: 1, spacingY: 1 },
    });
    expect(f.id).toMatch(/^fx_[0-9a-z]{10}$/);
    expect(f.geometry).toMatchObject({ wiring: "serpentine", start: "bottom-left" });
    expect(f.patch).toBeNull();
    const c = createController({ name: "c" });
    expect(c.protocol).toBe("ddp");
    expect(c.outputs).toHaveLength(1);
    expect(() => createController({ name: "c", port: 70000 })).toThrow(ProjectValidationError);
    expect(() => createLayer({ effectId: "x", opacity: 2 })).toThrow(ProjectValidationError);
  });
  it("ids are unique-ish", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });
  it("isAnimated discriminates", () => {
    expect(isAnimated({ keyframes: [{ t: 0, v: 1, ease: "linear" }] })).toBe(true);
    expect(isAnimated(1)).toBe(false);
    expect(isAnimated([1, 2, 3])).toBe(false);
    expect(isAnimated([{ pos: 0, color: "#000" }])).toBe(false);
  });
});
