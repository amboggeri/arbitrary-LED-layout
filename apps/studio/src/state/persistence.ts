/** Saving/loading projects: local autosave, file download, and file import helpers. */
import { parseProjectJson, serializeProject, type Project } from "@ledlay/core";

export const AUTOSAVE_KEY = "ledlay.autosave.v1";

export function saveAutosave(p: Project, storage: Storage | undefined = globalThis.localStorage): boolean {
  try {
    storage?.setItem(AUTOSAVE_KEY, serializeProject(p, false));
    return true;
  } catch {
    return false; // quota exceeded (large embedded models) or storage unavailable
  }
}

export function loadAutosave(storage: Storage | undefined = globalThis.localStorage): Project | null {
  try {
    const raw = storage?.getItem(AUTOSAVE_KEY);
    return raw ? parseProjectJson(raw) : null;
  } catch {
    return null;
  }
}

export function downloadBlob(data: string | Uint8Array, filename: string, mime = "application/octet-stream"): void {
  const part: BlobPart = typeof data === "string" ? data : new Uint8Array(data);
  const url = URL.createObjectURL(new Blob([part], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(name: string): string {
  return name.trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "untitled";
}

/** Prompt the user for a file. Resolves null when cancelled. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

export function readFileAsText(file: Blob): Promise<string> {
  return file.text();
}

/** Model format from a file name, or null if unsupported. */
export function modelFormat(name: string): "gltf" | "glb" | "obj" | "stl" | null {
  const ext = name.toLowerCase().split(".").pop();
  return ext === "gltf" || ext === "glb" || ext === "obj" || ext === "stl" ? ext : null;
}
