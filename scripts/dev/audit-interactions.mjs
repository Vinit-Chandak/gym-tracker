// First-tap, hitbox and fixed-action checks against the actual production app.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, webkit, devices, expect } from "@playwright/test";
import { assertReadableText } from "./audit-text-readability.mjs";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3107";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
  throw new Error("Local audit only.");
const output = `${process.env.AUDIT_OUTPUT_DIR ?? "output/audit-2026-10-07"}/interactions`;
const fixtures = JSON.parse(await readFile(`${output}/../fixtures.json`, "utf8"));
await mkdir(output, { recursive: true });
const results = [];

for (const config of [
  { name: "android", engine: chromium, options: devices["Pixel 7"], size: 16 },
  { name: "iphone", engine: webkit, options: devices["iPhone 13"], size: 16 },
  {
    name: "narrow",
    engine: chromium,
    options: { ...devices["Pixel 7"], viewport: { width: 320, height: 740 } },
    size: 16,
  },
  {
    name: "narrow-large",
    engine: chromium,
    options: { ...devices["Pixel 7"], viewport: { width: 320, height: 740 } },
    size: 32,
  },
].filter((item) => !process.env.AUDIT_DEVICE || item.name === process.env.AUDIT_DEVICE)) {
  const browser = await config.engine.launch();
  const context = await browser.newContext({ ...config.options, baseURL });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  const requests = new Set();
  let changedAt = 0;
  page.on("request", (request) => {
    requests.add(request);
    changedAt = Date.now();
  });
  const finished = (request) => {
    requests.delete(request);
    changedAt = Date.now();
  };
  page.on("requestfinished", finished);
  page.on("requestfailed", finished);
  const settle = async () => {
    const deadline = Date.now() + 20_000;
    while (requests.size || Date.now() - changedAt < 750) {
      if (Date.now() > deadline) throw new Error("Page requests did not settle before navigation.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  page.on("pageerror", (error) => errors.push(error.message));
  const visit = async (path) => {
    await settle();
    await page.goto(path, { waitUntil: "networkidle" });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}px`;
    }, config.size);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(requestAnimationFrame);
    });
  };
  const login = async (username) => {
    await context.clearCookies();
    await visit("/login");
    await page.getByLabel("Email", { exact: true }).fill(`${username}@local.test`);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/today$/);
    await page.waitForLoadState("networkidle");
  };
  const check = async (name, work) => {
    const started = Date.now();
    const errorIndex = errors.length;
    try {
      await work();
      await settle();
      assert.deepEqual(errors.slice(errorIndex), [], "Uncaught browser errors");
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        ),
        "Horizontal overflow",
      );
      results.push({ device: config.name, name, passed: true, ms: Date.now() - started });
    } catch (error) {
      results.push({
        device: config.name,
        name,
        passed: false,
        error: error.stack,
        url: page.url(),
      });
      await page
        .screenshot({ path: `${output}/${config.name}-${name}-failure.png`, fullPage: true })
        .catch(() => {});
    }
    console.log(`${results.at(-1).passed ? "PASS" : "FAIL"} ${config.name}: ${name}`);
    await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  };
  const target = async (locator, { height = 44, width = 44 } = {}) => {
    await locator.scrollIntoViewIfNeeded();
    const measured = await locator.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const points = [
        [0.5, 0.5],
        [0.15, 0.2],
        [0.85, 0.2],
        [0.15, 0.8],
        [0.85, 0.8],
      ];
      return {
        width: r.width,
        height: r.height,
        text: element.textContent,
        visible:
          r.left >= -1 &&
          r.right <= document.documentElement.clientWidth + 1 &&
          r.top >= -1 &&
          r.bottom <= innerHeight + 1,
        painted: points.every(([x, y]) =>
          element.contains(document.elementFromPoint(r.left + r.width * x, r.top + r.height * y)),
        ),
      };
    });
    assert(
      measured.width >= width && measured.height >= height && measured.visible && measured.painted,
      JSON.stringify(measured),
    );
  };
  try {
    await login("vinit");
    await check("programme-heading-target-and-readable-text", async () => {
      await visit("/training");
      await target(page.locator(".cycle-name"));
      await assertReadableText(page.locator(".cycle-name, .cycle-count"));
      await page.locator(".cycle-name").tap();
      await page.waitForURL(/\/profile\/programme$/);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: "Programme", exact: true }).first(),
      ).toBeVisible();
    });
    await check("every-programme-tile-opens-on-the-first-tap", async () => {
      await visit("/training");
      const tiles = await page.locator(".cycle-day").evaluateAll((elements) =>
        elements.map((e) => ({
          href: e.getAttribute("href"),
          name: e.querySelector(".cycle-day-name > span")?.textContent,
        })),
      );
      assert(tiles.length >= 7, "Expected a complete programme cycle");
      for (const [index, tile] of tiles.entries()) {
        await visit("/training");
        const link = page.locator(`.cycle-day[href="${tile.href}"]`);
        await target(link);
        const box = await link.boundingBox();
        await link.tap({
          position: index % 2 ? { x: 8, y: 8 } : { x: box.width - 8, y: box.height - 8 },
        });
        await page.waitForURL(new URL(tile.href, baseURL).href);
        await page.waitForLoadState("networkidle");
        await expect(
          page.getByRole("heading", { level: 1, name: tile.name, exact: true }),
        ).toBeVisible();
      }
    });
    await check("programme-disclosures-open-across-their-full-row", async () => {
      await visit("/profile/programme");
      const summaries = page.locator("main details > summary");
      assert((await summaries.count()) > 0);
      for (let index = 0; index < (await summaries.count()); index++) {
        const summary = summaries.nth(index);
        await target(summary);
        await summary.tap({ position: { x: 8, y: 8 } });
        await expect(summary.locator("..")).toHaveAttribute("open", "");
        await summary.tap({ position: { x: 8, y: 8 } });
        await expect(summary.locator("..")).not.toHaveAttribute("open", "");
      }
    });
    await check("start-and-check-in-actions-clear-the-bottom-navigation", async () => {
      await visit("/training");
      await page.locator(".cycle-day").first().tap();
      await page.waitForURL(/\/training\/days\//);
      await page.waitForLoadState("networkidle");
      const start = page.getByRole("link", { name: "Start workout", exact: true });
      await target(start);
      await start.tap();
      await page.waitForURL(/\/workouts\/start\?/);
      await page.waitForLoadState("networkidle");
      await target(page.getByRole("button", { name: "Save and start", exact: true }));
      await target(page.getByRole("button", { name: "Skip check-in", exact: true }));
      const scales = page.getByRole("radiogroup");
      for (let index = 0; index < (await scales.count()); index++) {
        const labels = scales.nth(index).locator("label");
        for (let value = 0; value < (await labels.count()); value++)
          await target(labels.nth(value));
      }
    });
    await check("more-options-sheet-opens-and-closes-on-the-first-tap", async () => {
      await visit("/today");
      const more = page.getByRole("button", { name: /^More options:/ });
      for (let repeat = 0; repeat < 3; repeat++) {
        await target(more);
        await more.tap();
        const dialog = page.getByRole("dialog", { name: "More options", exact: true });
        await expect(dialog).toBeVisible();
        const close = dialog.getByRole("button", { name: "Close sheet", exact: true });
        await target(close);
        await close.tap();
        await expect(dialog).not.toBeVisible();
      }
    });
    await check("calendar-day-and-activity-open-and-return-on-the-first-tap", async () => {
      await visit("/progress");
      const calendar = page.getByRole("link", { name: "Calendar", exact: true });
      await target(calendar);
      await calendar.tap();
      await page.waitForURL(/\/progress\/calendar$/);
      await page.waitForLoadState("networkidle");
      const day = page
        .locator("a.month-day")
        .filter({ has: page.locator(".month-icons") })
        .first();
      await day.evaluate((element) => element.scrollIntoView({ block: "center" }));
      // Seven date columns fit narrow phones; each tile still exceeds the 24px minimum.
      await target(day, { width: 24 });
      const href = await day.getAttribute("href");
      await day.tap();
      await page.waitForURL(new URL(href, baseURL).href);
      await page.waitForLoadState("networkidle");
      const entry = page.locator("a.day-row").first();
      await target(entry);
      await entry.tap();
      await page.waitForURL(/\/(?:workouts|training\/activities)\/[0-9a-f-]+$/);
      await page.waitForLoadState("networkidle");
      await target(page.locator("a.back-link"));
      await page.locator("a.back-link").tap();
      await page.waitForURL(new URL(href, baseURL).href);
      await page.waitForLoadState("networkidle");
      await page.locator("a.back-link").tap();
      await page.waitForURL(/\/progress\/calendar$/);
      await page.waitForLoadState("networkidle");
      await page.locator("a.back-link").tap();
      await page.waitForURL(/\/progress$/);
    });
    if (config.name === "android" || config.name === "iphone") {
      await check("all-eight-populated-users-can-read-their-own-history", async () => {
        for (const username of fixtures.history.usernames) {
          await login(username);
          await visit(`/progress/history?from=${fixtures.history.from}&to=${fixtures.history.to}`);
          await expect(page.locator('a[href^="/workouts/"]').first()).toBeVisible();
          await visit("/profile/friends");
          await expect(page.getByRole("heading", { name: "Friends", exact: true })).toBeVisible();
        }
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }
}
console.log(
  JSON.stringify({ checks: results.length, failed: results.filter((r) => !r.passed).length }),
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
