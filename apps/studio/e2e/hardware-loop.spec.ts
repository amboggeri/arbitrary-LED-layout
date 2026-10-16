/**
 * Full loop: studio (browser) -> bridge (real Node process) -> UDP -> a fake WLED that
 * decodes DDP. Proves the GUI actually drives hardware end to end.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createSocket, type Socket } from "node:dgram";
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const bridgeBin = fileURLToPath(new URL("../../bridge/dist/ledlay.mjs", import.meta.url));
const BRIDGE_PORT = 18787;

let bridge: ChildProcess;
let rx: Socket;
let rxPort = 0;
const packets: Buffer[] = [];

test.beforeAll(async () => {
  test.skip(!existsSync(bridgeBin), "bridge not built (pnpm --filter @ledlay/bridge build)");
  rx = createSocket("udp4");
  rx.on("message", (m) => packets.push(m));
  await new Promise<void>((r) => rx.bind(0, "127.0.0.1", () => r()));
  rxPort = (rx.address() as AddressInfo).port;
  bridge = spawn(process.execPath, [bridgeBin, "serve", "--port", String(BRIDGE_PORT)], { stdio: "pipe" });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("bridge did not start")), 10_000);
    bridge.stdout!.on("data", (d: Buffer) => {
      if (d.toString().includes("listening")) {
        clearTimeout(t);
        resolve();
      }
    });
  });
});

test.afterAll(async () => {
  bridge?.kill();
  rx?.close();
});

test("GUI output reaches a UDP device through the bridge", async ({ page }) => {
  await page.goto(`/?demo&bridge=ws://127.0.0.1:${BRIDGE_PORT}`);
  // Point the demo controller at our fake device.
  await page.getByTestId("outliner").getByText("WLED", { exact: true }).click();
  await page.getByLabel("host").fill("127.0.0.1");
  await page.getByLabel("host").press("Tab");
  await page.getByLabel("port").fill(String(rxPort));
  await page.getByLabel("port").press("Tab");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByTestId("bridge-status")).toHaveText(/bridge/);
  await page.getByLabel("output enabled").check();
  await page.getByLabel("play").click();
  await expect.poll(() => packets.length, { timeout: 5000 }).toBeGreaterThan(5);
  await page.getByLabel("pause").click();

  // Decode one full DDP frame: 635 px * 3 bytes = 1905 bytes over 2 packets (1440 + 465).
  const first = packets.find((p) => p.readUInt32BE(4) === 0)!;
  expect(first[0]! & 0xc0).toBe(0x40); // DDP v1
  expect(first[2]).toBe(0x0b); // RGB 8-bit
  const pushPkts = packets.filter((p) => (p[0]! & 0x01) === 1);
  expect(pushPkts.length).toBeGreaterThan(0);
  const last = pushPkts[0]!;
  expect(last.readUInt32BE(4) + last.readUInt16BE(8)).toBe(635 * 3);
  // Some LEDs are lit.
  expect([...first.subarray(10)].some((b) => b > 0)).toBe(true);
});
