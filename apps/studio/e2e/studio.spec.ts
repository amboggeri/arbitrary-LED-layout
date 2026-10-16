import { expect, test, type Page } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at app internals loosely */
type Win = Window & {
  __ledlay: {
    studio: { getState(): Record<string, any> };
    runtime: { compiled: { space: { count: number } }; currentFrame: Float32Array };
  };
  __ledlayViewport?: { ledCount: number };
};

async function state<T>(page: Page, fn: (s: Record<string, any>) => T): Promise<T> {
  return page.evaluate((src) => {
    const f = new Function("s", `return (${src})(s)`);
    return f((window as unknown as Win).__ledlay.studio.getState());
  }, fn.toString());
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
  await page.goto("/?demo");
  await expect(page.getByTestId("toolbar")).toBeVisible();
});

test("loads the demo and draws LEDs in the 3D view", async ({ page }) => {
  await expect(page.getByTestId("led-total")).toHaveText(/635 LEDs/);
  await expect(page.getByTestId("outliner").getByText("Tree", { exact: true })).toBeVisible();
  const drawn = await page.evaluate(() => (window as unknown as Win).__ledlayViewport?.ledCount ?? -1);
  expect(drawn).toBe(635);
});

test("adds a fixture from the outliner, edits it in the inspector, and undoes", async ({ page }) => {
  await page.getByLabel("add fixture").selectOption("ring");
  await expect(page.getByTestId("inspector").getByText("Fixture · ring")).toBeVisible();
  await expect(page.getByTestId("fixture-led-count")).toHaveText("24");
  const count = page.getByLabel("LED count");
  await count.fill("48");
  await count.press("Enter");
  await expect(page.getByTestId("fixture-led-count")).toHaveText("48");
  await expect(page.getByTestId("led-total")).toHaveText(/683 LEDs/);
  await page.getByLabel("undo").click();
  await expect(page.getByTestId("led-total")).toHaveText(/659 LEDs/);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("led-total")).toHaveText(/635 LEDs/);
});

test("plays and pauses with the space bar, advancing time and changing colors", async ({ page }) => {
  const before = await page.evaluate(() =>
    Array.from((window as unknown as Win).__ledlay.runtime.currentFrame.slice(0, 30)),
  );
  await page.locator("body").press("Space");
  await page.waitForTimeout(600);
  await page.locator("body").press("Space");
  const t = await state(page, (s) => s.time as number);
  expect(t).toBeGreaterThan(0.2);
  const after = await page.evaluate(() =>
    Array.from((window as unknown as Win).__ledlay.runtime.currentFrame.slice(0, 30)),
  );
  expect(after).not.toEqual(before);
  await expect(page.getByTestId("time")).not.toHaveText("0:00.00");
});

test("adds an effect layer and edits a parameter", async ({ page }) => {
  await page.getByLabel("add layer").selectOption("solid");
  await expect(page.getByTestId("inspector").getByRole("heading", { name: "Solid" })).toBeVisible();
  await page.getByLabel("opacity value").fill("0.5");
  await page.getByLabel("opacity value").press("Enter");
  const opacity = await state(page, (s) => s.project.layers.at(-1).opacity as number);
  expect(opacity).toBe(0.5);
  await page.getByLabel("keyframe Color").click();
  const animated = await state(page, (s) => "keyframes" in s.project.layers.at(-1).params.color);
  expect(animated).toBe(true);
});

test("timeline: add track and clip, switch to timeline mode", async ({ page }) => {
  await page.getByRole("tab", { name: "Timeline" }).click();
  await page.getByRole("button", { name: "＋ Track" }).click();
  await page.getByLabel("add clip to Track 1").selectOption("rainbow");
  await expect(page.locator(".clip")).toHaveCount(1);
  await expect(page.getByTestId("inspector").getByText("Clip")).toBeVisible();
  await page.getByRole("button", { name: "Switch to timeline" }).click();
  expect(await state(page, (s) => s.project.playback)).toBe("timeline");
  // scrub via ruler
  const ruler = page.getByTestId("ruler");
  const box = (await ruler.boundingBox())!;
  await page.mouse.click(box.x + 120, box.y + 5);
  expect(await state(page, (s) => s.time as number)).toBeGreaterThan(1);
});

test("controller inspector and issues panel", async ({ page }) => {
  await page.getByTestId("outliner").getByText("WLED").click();
  await expect(page.getByLabel("host")).toBeVisible();
  await page.getByLabel("host").fill("192.168.1.77");
  await page.getByLabel("host").press("Enter");
  expect(await state(page, (s) => s.project.controllers[0].host)).toBe("192.168.1.77");
  await page.getByRole("tab", { name: "Issues" }).click();
  await expect(page.getByText("No problems found")).toBeVisible();
});

test("draw tool creates a path fixture on the floor", async ({ page }) => {
  await page.keyboard.press("Escape");
  await page.getByLabel("Draw path on model").click();
  const canvas = page.getByTestId("viewport-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.85);
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.85);
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.7);
  const path = await state(page, (s) => s.project.fixtures.find((f: any) => f.name === "Path")?.geometry);
  expect(path?.kind).toBe("polyline");
  expect(path.points.length).toBe(3);
});

test("saves and restores through autosave on reload", async ({ page }) => {
  await page.getByLabel("project name").fill("Persisted Show");
  await page.getByLabel("project name").press("Enter");
  await page.waitForTimeout(1200);
  await page.goto("/");
  await expect(page.getByLabel("project name")).toHaveValue("Persisted Show");
});
