/**
 * Fixture geometry generators. Each returns LED positions in fixture-local space, in
 * *wiring order* (index 0 is the first pixel the data line reaches).
 */
import { applyMatrix, composeMatrix, distance, lerpVec3, type Vec3 } from "./math";
import type {
  CubeGeometry,
  Fixture,
  FixtureGeometry,
  MatrixGeometry,
  PolylineGeometry,
  RingGeometry,
  StripGeometry,
} from "./model";

/** Strip along +X starting at the origin. */
export function stripPoints(g: StripGeometry): Vec3[] {
  return Array.from({ length: g.count }, (_, i) => [i * g.spacing, 0, 0] as Vec3);
}

/** Ring in the XY plane, centered on the origin. A 360° sweep does not repeat the start point. */
export function ringPoints(g: RingGeometry): Vec3[] {
  const full = Math.abs(g.sweep) >= 360;
  const steps = full ? g.count : Math.max(1, g.count - 1);
  const step = g.count === 1 ? 0 : g.sweep / steps;
  return Array.from({ length: g.count }, (_, i) => {
    const a = ((g.startAngle + i * step) * Math.PI) / 180;
    return [Math.cos(a) * g.radius, Math.sin(a) * g.radius, 0] as Vec3;
  });
}

/** Matrix in the XY plane; LED (0,0) of the grid sits at the origin, +X right, +Y up. */
export function matrixPoints(g: MatrixGeometry): Vec3[] {
  const out: Vec3[] = [];
  const flipX = g.start.endsWith("right");
  const flipY = g.start.startsWith("top");
  const major = g.vertical ? g.cols : g.rows; // number of "runs"
  const minor = g.vertical ? g.rows : g.cols; // LEDs per run
  for (let run = 0; run < major; run++) {
    for (let k = 0; k < minor; k++) {
      const along = g.wiring === "serpentine" && run % 2 === 1 ? minor - 1 - k : k;
      let col = g.vertical ? run : along;
      let row = g.vertical ? along : run;
      if (flipX) col = g.cols - 1 - col;
      if (flipY) row = g.rows - 1 - row;
      out.push([col * g.spacingX, row * g.spacingY, 0]);
    }
  }
  return out;
}

/** 3D grid. X runs fastest, then Y, then Z. Serpentine snakes continuously through the volume. */
export function cubePoints(g: CubeGeometry): Vec3[] {
  const out: Vec3[] = [];
  let rowCounter = 0;
  for (let z = 0; z < g.nz; z++) {
    for (let yi = 0; yi < g.ny; yi++) {
      const y = g.wiring === "serpentine" && z % 2 === 1 ? g.ny - 1 - yi : yi;
      for (let xi = 0; xi < g.nx; xi++) {
        const x = g.wiring === "serpentine" && rowCounter % 2 === 1 ? g.nx - 1 - xi : xi;
        out.push([x * g.spacing, y * g.spacing, z * g.spacing]);
      }
      rowCounter++;
    }
  }
  return out;
}

/** Total path length of a polyline. */
export function polylineLength(points: readonly Vec3[], closed = false): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += distance(points[i - 1]!, points[i]!);
  if (closed && points.length > 2) len += distance(points[points.length - 1]!, points[0]!);
  return len;
}

/** Number of LEDs a polyline will hold at its spacing. */
export function polylineLedCount(g: PolylineGeometry): number {
  const len = polylineLength(g.points, g.closed);
  const eps = 1e-9 * Math.max(1, len);
  // Open paths include the start point and every full step; closed paths don't repeat the start.
  const n = Math.floor((len + eps) / g.spacing);
  return g.closed ? Math.max(1, n) : n + 1;
}

/** LEDs every `spacing` units along the path, starting exactly at the first vertex. */
export function polylinePoints(g: PolylineGeometry): Vec3[] {
  const verts = g.closed && g.points.length > 2 ? [...g.points, g.points[0]!] : g.points;
  const count = polylineLedCount(g);
  const out: Vec3[] = [];
  let seg = 0;
  let segStart = 0; // cumulative distance at verts[seg]
  let segLen = distance(verts[0]!, verts[1]!);
  for (let i = 0; i < count; i++) {
    const d = i * g.spacing;
    while (seg < verts.length - 2 && d > segStart + segLen) {
      segStart += segLen;
      seg++;
      segLen = distance(verts[seg]!, verts[seg + 1]!);
    }
    const t = segLen === 0 ? 0 : Math.min(1, (d - segStart) / segLen);
    out.push(lerpVec3(verts[seg]!, verts[seg + 1]!, t));
  }
  return out;
}

export function localPoints(g: FixtureGeometry): Vec3[] {
  switch (g.kind) {
    case "strip":
      return stripPoints(g);
    case "ring":
      return ringPoints(g);
    case "matrix":
      return matrixPoints(g);
    case "cube":
      return cubePoints(g);
    case "polyline":
      return polylinePoints(g);
    case "points":
      return g.points.map((p) => [p[0], p[1], p[2]] as Vec3);
  }
}

/** Number of LEDs without generating positions (cheap for most kinds). */
export function ledCount(g: FixtureGeometry): number {
  switch (g.kind) {
    case "strip":
    case "ring":
      return g.count;
    case "matrix":
      return g.cols * g.rows;
    case "cube":
      return g.nx * g.ny * g.nz;
    case "polyline":
      return polylineLedCount(g);
    case "points":
      return g.points.length;
  }
}

/** World-space LED positions in wiring order (honours `reversed`). */
export function fixtureWorldPoints(f: Fixture): Vec3[] {
  const m = composeMatrix(f.transform);
  const pts = localPoints(f.geometry).map((p) => applyMatrix(m, p));
  return f.reversed ? pts.reverse() : pts;
}
