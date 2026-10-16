import { describe, expect, it } from "vitest";
import type { FetchLike } from "@ledlay/targets";
import { handleRpc, isPrivateHost } from "../src/rpc";

describe("isPrivateHost", () => {
  it.each([
    ["10.1.2.3", true],
    ["192.168.0.50", true],
    ["172.16.0.1", true],
    ["172.32.0.1", false],
    ["169.254.1.1", true],
    ["127.0.0.1:8080", true],
    ["wled-tree.local", true],
    ["http://192.168.1.5/", true],
    ["localhost", true],
    ["8.8.8.8", false],
    ["example.com", false],
  ])("%s -> %s", (h, ok) => expect(isPrivateHost(h)).toBe(ok));
});

describe("handleRpc", () => {
  const calls: { url: string; body?: unknown }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, body: init?.body });
    return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
  };

  it("applies config and optionally reboots", async () => {
    calls.length = 0;
    expect(
      await handleRpc("wled.applyConfig", { host: "10.0.0.2", config: { a: 1 }, reboot: true }, { fetch }),
    ).toEqual({
      applied: true,
      rebooting: true,
    });
    expect(calls.map((c) => c.url)).toEqual(["http://10.0.0.2/json/cfg", "http://10.0.0.2/json/state"]);
    await handleRpc("wled.applyConfig", { host: "10.0.0.2" }, { fetch });
  });

  it("sets state and uploads files", async () => {
    calls.length = 0;
    await handleRpc("wled.state", { host: "10.0.0.2", state: { on: false } }, { fetch });
    await handleRpc("wled.state", { host: "10.0.0.2" }, { fetch });
    expect(
      await handleRpc(
        "wled.uploadFile",
        { host: "10.0.0.2", path: "/ledmap.json", content: "{}" },
        { fetch },
      ),
    ).toEqual({
      uploaded: true,
    });
    expect(calls[0]!.body).toBe('{"on":false}');
    expect(calls[2]!.url).toBe("http://10.0.0.2/upload");
  });

  it("respects a custom host policy and missing discovery", async () => {
    await expect(
      handleRpc("wled.info", { host: "10.0.0.2" }, { fetch, isAllowedHost: () => false }),
    ).rejects.toThrow(/refusing/);
    await expect(handleRpc("discover", {}, {})).rejects.toThrow(/not available/);
    let seen = 0;
    await handleRpc("discover", { timeoutMs: 1e9 }, { discover: async (t) => ((seen = t), []) });
    expect(seen).toBe(10_000);
    await handleRpc("discover", {}, { discover: async (t) => ((seen = t), []) });
    expect(seen).toBe(2500);
  });
});
