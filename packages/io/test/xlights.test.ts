import { describe, expect, it } from "vitest";
import { parseXModel, toXModel } from "../src";

describe("parseXModel", () => {
  it("parses the classic CustomModel grid (row 0 = top)", () => {
    const xml = `<?xml version="1.0"?><custommodel name="Star &amp; Co" parm1="3" parm2="2" CustomModel="1,,2;,3," />`;
    const m = parseXModel(xml);
    expect(m).toMatchObject({ name: "Star & Co", width: 3, height: 2, depth: 1 });
    expect(m.points).toEqual([
      [0, 1, 0],
      [2, 1, 0],
      [1, 0, 0],
    ]);
  });

  it("parses 3D layers and compressed format", () => {
    expect(
      parseXModel(`<custommodel name="c" parm1="1" parm2="1" Depth="2" CustomModel="1|2"/>`).points,
    ).toEqual([
      [0, 0, 0],
      [0, 0, 1],
    ]);
    const c = parseXModel(
      `<custommodel name="c" parm1="2" parm2="2" CustomModelCompressed="2,0,1;1,1,0;3,0,0,1;bad"/>`,
    );
    expect(c.points).toEqual([
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 1],
    ]);
  });

  it("rejects non-models", () => {
    expect(() => parseXModel("<model/>")).toThrow(/Not an xLights/);
    expect(() => parseXModel(`<custommodel name="x" parm1="1" parm2="1"/>`)).toThrow(/no CustomModel/);
  });
});

describe("toXModel", () => {
  it("round-trips a grid", () => {
    const pts: [number, number, number][] = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
    ];
    const m = parseXModel(toXModel("A<B", pts, 2));
    expect(m.name).toBe("A<B");
    expect(m.width).toBe(2);
    expect(m.points).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ]);
  });

  it("resolves collisions and writes depth for 3D", () => {
    const m = parseXModel(
      toXModel(
        "c",
        [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 10],
        ],
        2,
      ),
    );
    expect(new Set(m.points.map((p) => p.join())).size).toBe(3);
    expect(m.depth).toBe(2);
    expect(parseXModel(toXModel("e", [], 10)).points).toEqual([]);
  });
});
