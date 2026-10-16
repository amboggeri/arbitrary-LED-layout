import { describe, expect, it } from "vitest";
import { parsePointsCsv, pointsToCsv } from "../src";

describe("parsePointsCsv", () => {
  it("parses headerless xyz rows in order", () => {
    const r = parsePointsCsv("0,0,0\n1,2,3\n");
    expect(r.points).toEqual([
      [0, 0, 0],
      [1, 2, 3],
    ]);
    expect(r.warnings).toEqual([]);
  });

  it("parses xy-only rows with z = 0 via header", () => {
    expect(parsePointsCsv("x;y\n1;2\n").points).toEqual([[1, 2, 0]]);
  });

  it("parses Marimapper-style indexed output with extra columns, interpolating gaps", () => {
    const csv = "index,x,y,z,xn,yn,zn,error\n0,0,0,0,0,0,1,0.1\n3,3,0,0,0,0,1,0.1\n1,1,0,0,0,0,1,0.1\n";
    const r = parsePointsCsv(csv);
    expect(r.points).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    expect(r.missing).toEqual([2]);
    expect(r.warnings[0]).toMatch(/1 LED\(s\) missing.*interpolated/);
  });

  it("drops gaps, copies edge gaps, scales and converts Z-up", () => {
    expect(parsePointsCsv("index,x,y,z\n0,0,0,0\n2,1,1,1", { gaps: "drop" }).points).toHaveLength(2);
    // index 0 missing -> copied from nearest (1)
    expect(parsePointsCsv("index,x,y,z\n1,5,5,5").points).toEqual([
      [5, 5, 5],
      [5, 5, 5],
    ]);
    expect(parsePointsCsv("1,2,3", { scale: 10, zUp: true }).points).toEqual([[10, 30, -20]]);
  });

  it("treats 4 numeric columns as index,x,y,z and supports tabs/comments", () => {
    expect(parsePointsCsv("# comment\n1\t9\t9\t9\n0\t1\t1\t1").points).toEqual([
      [1, 1, 1],
      [9, 9, 9],
    ]);
  });

  it("warns on bad rows, duplicates and empty input", () => {
    const r = parsePointsCsv("index,x,y,z\n0,1,1,1\n0,2,2,2\nfoo,1,1,1\n1,a,b,c\n");
    expect(r.points).toEqual([[1, 1, 1]]);
    expect(r.warnings.join("\n")).toMatch(/Duplicate index 0/);
    expect(r.warnings.join("\n")).toMatch(/bad index/);
    expect(r.warnings.join("\n")).toMatch(/could not parse/);
    expect(parsePointsCsv("").warnings).toEqual(["File is empty"]);
    expect(parsePointsCsv("x,y\nq,w").points).toEqual([]);
    expect(() => parsePointsCsv("a,b,c\n1,2,3")).toThrow(/must include x and y/);
  });
});

describe("pointsToCsv", () => {
  it("round-trips", () => {
    const pts: [number, number, number][] = [
      [1.23456, 2, 3],
      [4, 5, 6],
    ];
    const csv = pointsToCsv(pts, 2);
    expect(csv).toBe("index,x,y,z\n0,1.23,2,3\n1,4,5,6\n");
    expect(parsePointsCsv(csv).points[1]).toEqual([4, 5, 6]);
  });
});
