import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createProject } from "@ledlay/core";
import * as cmd from "@ledlay/editor";
import type { LinkStatus } from "@ledlay/link";
import { RuntimeProvider } from "../src/runtime/context";
import { StudioRuntime, type BridgeLike } from "../src/runtime/runtime";
import { addDiscoveredController } from "../src/state/actions";
import { createStudioStore, studio } from "../src/state/store";
import { DiscoverButton } from "../src/ui/DiscoverButton";

describe("addDiscoveredController", () => {
  it("adds once per host and selects", () => {
    const s = createStudioStore(
      cmd.addController(createProject(), { id: "x", name: "Old", host: "10.0.0.9" }),
    );
    const id = addDiscoveredController(s, { name: "Tree", host: "10.0.0.5", kind: "wled" });
    expect(s.getState().project.controllers.find((c) => c.id === id)).toMatchObject({
      name: "Tree",
      host: "10.0.0.5",
      kind: "wled",
    });
    expect(addDiscoveredController(s, { name: "Dup", host: "10.0.0.5", kind: "wled" })).toBe(id);
    expect(addDiscoveredController(s, { name: "", host: "10.0.0.9", kind: "other" })).toBe("x");
    const g = addDiscoveredController(s, { name: "", host: "10.0.0.7", kind: "other" });
    expect(s.getState().project.controllers.find((c) => c.id === g)).toMatchObject({
      name: "10.0.0.7",
      kind: "generic",
    });
    expect(s.getState().selection).toEqual({ kind: "controller", id: g });
  });
});

describe("DiscoverButton", () => {
  it("scans through the bridge and adds a device", async () => {
    studio.getState().loadProject(createProject());
    const fake: BridgeLike = {
      state: "open" as LinkStatus,
      connect() {},
      disconnect() {},
      setControllers() {},
      sendFrame: () => true,
      blackout() {},
      rpc: async <T,>() => [{ name: "Porch", host: "192.168.1.40", port: 80, kind: "wled" }] as T,
    };
    const runtime = new StudioRuntime(studio, { createBridge: () => fake });
    runtime.start();
    runtime.connectBridge();
    act(() => studio.getState().setBridge({ status: "open" }));
    render(
      <RuntimeProvider runtime={runtime}>
        <DiscoverButton />
      </RuntimeProvider>,
    );
    await act(async () => fireEvent.click(screen.getByText("⌕ Scan")));
    fireEvent.click(await screen.findByText("Porch"));
    expect(studio.getState().project.controllers[0]).toMatchObject({ host: "192.168.1.40" });
    runtime.dispose();
  });

  it("reports scan failures", async () => {
    studio.getState().loadProject(createProject());
    const runtime = new StudioRuntime(studio);
    act(() => studio.getState().setBridge({ status: "open" }));
    render(
      <RuntimeProvider runtime={runtime}>
        <DiscoverButton />
      </RuntimeProvider>,
    );
    await act(async () => fireEvent.click(screen.getByText("⌕ Scan")));
    expect(studio.getState().notices.at(-1)!.text).toMatch(/Scan failed/);
  });
});
