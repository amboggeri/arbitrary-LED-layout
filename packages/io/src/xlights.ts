/**
 * xLights custom model (.xmodel) import/export.
 * The model is a grid (width x height x depth). Each cell holds a 1-based node number or is
 * empty. Formats:
 *   CustomModel="1,2,,3;4,,5|..."      rows ';', columns ',', layers '|'
 *   CustomModelCompressed="node,row,col[,layer];..."  (newer xLights, 1-based node, 0-based row/col)
 * Row 0 is the TOP of the model.
 */
import type { Vec3 } from "@ledlay/core";

export interface XModel {
  name: string;
  width: number;
  height: number;
  depth: number;
  /** Positions in wiring order (node 1 first), in grid units, Y up, origin bottom-left-back. */
  points: Vec3[];
}

function attr(xml: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(xml);
  return m ? m[1]! : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function parseXModel(xml: string): XModel {
  if (!/<custommodel\b/i.test(xml)) throw new Error("Not an xLights custom model (.xmodel)");
  const tag = /<custommodel\b[^>]*>/i.exec(xml)![0];
  const name = decodeEntities(attr(tag, "name") ?? "xLights model");
  const width = Number(attr(tag, "parm1") ?? 0);
  const height = Number(attr(tag, "parm2") ?? 0);
  const depth = Number(attr(tag, "Depth") ?? 1) || 1;
  const nodes = new Map<number, Vec3>();
  const place = (node: number, row: number, col: number, layer: number) => {
    if (!nodes.has(node)) nodes.set(node, [col, height - 1 - row, layer]);
  };

  const compressed = attr(tag, "CustomModelCompressed");
  const plain = attr(tag, "CustomModel");
  if (compressed !== null) {
    for (const entry of compressed.split(";").filter(Boolean)) {
      const [n, r, c, l] = entry.split(",").map(Number);
      if (Number.isFinite(n) && Number.isFinite(r) && Number.isFinite(c))
        place(n!, r!, c!, Number.isFinite(l) ? l! : 0);
    }
  } else if (plain !== null) {
    plain.split("|").forEach((layerStr, layer) => {
      layerStr.split(";").forEach((rowStr, row) => {
        rowStr.split(",").forEach((cell, col) => {
          const n = parseInt(cell, 10);
          if (Number.isFinite(n) && n > 0) place(n, row, col, layer);
        });
      });
    });
  } else throw new Error("xmodel has no CustomModel data");

  const ordered = [...nodes.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  return { name, width, height, depth, points: ordered };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Export points to an xmodel by snapping onto a grid with `resolution` cells across the
 * largest extent. Colliding pixels are nudged right to the next free cell in the same row
 * (widening the model if needed) so no node is lost.
 */
export function toXModel(name: string, points: readonly Vec3[], resolution = 100): string {
  const n = points.length;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[k]!);
      max[k] = Math.max(max[k]!, p[k]!);
    }
  const extent = Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) || 1;
  const cell = extent / Math.max(1, resolution - 1);
  const dims = [0, 1, 2].map((k) => (n ? Math.round((max[k]! - min[k]!) / cell) + 1 : 1));
  const [, h, d] = dims as [number, number, number];
  let w = dims[0]!;
  const used = new Set<string>();
  const entries: string[] = [];
  points.forEach((p, i) => {
    let col = Math.round((p[0] - min[0]!) / cell);
    const row = h - 1 - Math.round((p[1] - min[1]!) / cell);
    const layer = Math.round((p[2] - min[2]!) / cell);
    while (used.has(`${row},${col},${layer}`)) col++;
    used.add(`${row},${col},${layer}`);
    w = Math.max(w, col + 1);
    entries.push(d > 1 ? `${i + 1},${row},${col},${layer}` : `${i + 1},${row},${col}`);
  });
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<custommodel name="${esc(name)}" parm1="${w}" parm2="${h}" Depth="${d}" StringType="RGB Nodes" ` +
    `Transparency="0" PixelSize="2" ModelBrightness="" Antialias="1" StrandNames="" NodeNames="" ` +
    `CustomModelCompressed="${entries.join(";")}" SourceVersion="ledlay">\n</custommodel>\n`
  );
}
