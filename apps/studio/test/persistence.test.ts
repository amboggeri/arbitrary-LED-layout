import { describe, expect, it, vi } from "vitest";
import { createProject } from "@ledlay/core";
import { downloadBlob, loadAutosave, modelFormat, readFileAsDataUrl, readFileAsText, safeFileName, saveAutosave, AUTOSAVE_KEY } from "../src/state/persistence";

describe("persistence", () => {
  it("autosaves and restores", () => {
    localStorage.clear();
    expect(loadAutosave()).toBeNull();
    const p = createProject({ name: "Saved" });
    expect(saveAutosave(p)).toBe(true);
    expect(loadAutosave()!.name).toBe("Saved");
    localStorage.setItem(AUTOSAVE_KEY, "{broken");
    expect(loadAutosave()).toBeNull();
  });

  it("survives storage failures", () => {
    const bad = { setItem: () => { throw new Error("quota"); }, getItem: () => { throw new Error("x"); } } as unknown as Storage;
    expect(saveAutosave(createProject(), bad)).toBe(false);
    expect(loadAutosave(bad)).toBeNull();
  });

  it("names files safely and detects model formats", () => {
    expect(safeFileName("  My Show / 2026! ")).toBe("My_Show_2026");
    expect(safeFileName("///")).toBe("untitled");
    expect(modelFormat("house.GLB")).toBe("glb");
    expect(modelFormat("a.gltf")).toBe("gltf");
    expect(modelFormat("a.fbx")).toBeNull();
  });

  it("downloads blobs via a temporary link", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    downloadBlob("hi", "a.txt");
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it("reads files", async () => {
    const f = new Blob(["hello"], { type: "text/plain" });
    expect(await readFileAsText(f)).toBe("hello");
    expect(await readFileAsDataUrl(f)).toMatch(/^data:text\/plain;base64,/);
  });
});
