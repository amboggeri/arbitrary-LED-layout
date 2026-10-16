/**
 * Point-list CSV import/export. Accepts:
 *   x,y,z                       (row order = wiring order)
 *   index,x,y,z[,...]           (explicit LED index; Marimapper output uses this)
 * Headers are optional and detected by name (index/led/id/i, x, y, z). Delimiters: , ; tab.
 */
import type { Vec3 } from "@ledlay/core";

export type GapMode = "interpolate" | "drop";

export interface PointImport {
  points: Vec3[];
  /** LED indices that were missing in the input (filled or dropped per gap mode). */
  missing: number[];
  warnings: string[];
}

export interface CsvImportOptions {
  /** How to handle indices missing from an indexed file (camera mapping gaps). */
  gaps?: GapMode;
  /** Multiply all coordinates (e.g. 1000 to convert m -> mm). */
  scale?: number;
  /** Swap Y and Z (many tools use Z-up; ledlay uses Y-up). */
  zUp?: boolean;
}

function splitLine(line: string): string[] {
  const delim = line.includes("\t") ? "\t" : line.includes(";") && !line.includes(",") ? ";" : ",";
  return line.split(delim).map((s) => s.trim());
}

export function parsePointsCsv(text: string, opts: CsvImportOptions = {}): PointImport {
  const scale = opts.scale ?? 1;
  const warnings: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) return { points: [], missing: [], warnings: ["File is empty"] };

  let col = { i: -1, x: 0, y: 1, z: 2 };
  let start = 0;
  const head = splitLine(lines[0]!).map((h) => h.toLowerCase());
  if (head.some((h) => h !== "" && Number.isNaN(Number(h)))) {
    const find = (...names: string[]) => head.findIndex((h) => names.includes(h));
    col = { i: find("index", "led", "id", "i", "led_id"), x: find("x"), y: find("y"), z: find("z") };
    if (col.x < 0 || col.y < 0)
      throw new Error(`CSV header must include x and y columns (got: ${head.join(", ")})`);
    start = 1;
  } else if (head.length >= 4) {
    col = { i: 0, x: 1, y: 2, z: 3 };
  }

  const rows: { index: number; p: Vec3 }[] = [];
  for (let li = start; li < lines.length; li++) {
    const cells = splitLine(lines[li]!);
    const x = Number(cells[col.x]),
      y = Number(cells[col.y]),
      z = col.z >= 0 && cells[col.z] !== undefined ? Number(cells[col.z]) : 0;
    if (![x, y, z].every(Number.isFinite)) {
      warnings.push(`Line ${li + 1}: could not parse coordinates, skipped`);
      continue;
    }
    const index = col.i >= 0 ? Number(cells[col.i]) : rows.length;
    if (!Number.isInteger(index) || index < 0) {
      warnings.push(`Line ${li + 1}: bad index "${cells[col.i]}", skipped`);
      continue;
    }
    const p: Vec3 = opts.zUp ? [x * scale, z * scale, -y * scale] : [x * scale, y * scale, z * scale];
    rows.push({ index, p });
  }
  if (rows.length === 0) return { points: [], missing: [], warnings };

  const byIndex = new Map<number, Vec3>();
  for (const r of rows) {
    if (byIndex.has(r.index)) warnings.push(`Duplicate index ${r.index}, keeping the first`);
    else byIndex.set(r.index, r.p);
  }
  const maxIndex = Math.max(...byIndex.keys());
  const missing: number[] = [];
  for (let i = 0; i <= maxIndex; i++) if (!byIndex.has(i)) missing.push(i);

  const points: Vec3[] = [];
  const gaps = opts.gaps ?? "interpolate";
  for (let i = 0; i <= maxIndex; i++) {
    const p = byIndex.get(i);
    if (p) {
      points.push(p);
      continue;
    }
    if (gaps === "drop") continue;
    // Linear interpolation between nearest known neighbours (or copy the one that exists).
    let lo = i - 1;
    while (lo >= 0 && !byIndex.has(lo)) lo--;
    let hi = i + 1;
    while (hi <= maxIndex && !byIndex.has(hi)) hi++;
    const a = byIndex.get(lo),
      b = byIndex.get(hi);
    if (a && b) {
      const t = (i - lo) / (hi - lo);
      points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    } else points.push([...(a ?? b)!] as Vec3);
  }
  if (missing.length)
    warnings.push(
      `${missing.length} LED(s) missing from the file (${gaps === "drop" ? "dropped" : "interpolated"})`,
    );
  return { points, missing, warnings };
}

export function pointsToCsv(points: readonly Vec3[], precision = 4): string {
  const f = (v: number) => +v.toFixed(precision);
  return ["index,x,y,z", ...points.map((p, i) => `${i},${f(p[0])},${f(p[1])},${f(p[2])}`)].join("\n") + "\n";
}
