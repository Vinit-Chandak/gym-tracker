// Focused theme checks on real pages, supplementing audit-browser's complete route inventory.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3101";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
  throw new Error("Theme checks only run against the local app.");
const output = `${process.env.AUDIT_OUTPUT_DIR ?? "output/audit-theme-2026-10-22"}/theme`;
await mkdir(output, { recursive: true });
const results = [];

function luminance(color) {
  if (/^#[a-f\d]{3}$/i.test(color))
    color = `#${[...color.slice(1)].map((channel) => channel + channel).join("")}`;
  const rgb = color.startsWith("#")
    ? color.match(/[a-f\d]{2}/gi).map((part) => parseInt(part, 16))
    : color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

const pairs = [];
for (const signal of ["danger", "success"]) {
  for (const background of ["ground", "panel", `${signal}-tint`]) {
    pairs.push([`${signal}-text`, background, 4.5]);
    pairs.push([`${signal}-glyph`, background, 3]);
    pairs.push([`${signal}-line`, background, 3]);
  }
}
for (const background of ["ground", "surface", "panel", "panel-tray"])
  for (const foreground of ["ink", "ink-2"]) pairs.push([foreground, background, 4.5]);
for (const sport of ["strength", "run", "ride", "swim", "mobility", "play"])
  for (const background of ["ground", "paper"]) pairs.push([`print-${sport}`, background, 3]);
pairs.push(["food-edge", "ground", 3], ["food-edge", "paper", 3], ["on-ink", "ink", 4.5]);

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  for (const mode of process.env.AUDIT_THEME ? [process.env.AUDIT_THEME] : ["light", "dark"]) {
    const context = await browser.newContext({
      baseURL,
      viewport: engine === webkit ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      colorScheme: mode,
      reducedMotion: "reduce",
    });
    await context.addInitScript((appearance) => {
      localStorage.setItem("overload:appearance", appearance);
    }, mode);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const capture = async (name) => {
      await page.evaluate(() => document.fonts.ready);
      const screenshot = `${engine.name()}-${mode}-${name}.png`;
      await page.screenshot({
        path: `${output}/${screenshot}`,
        fullPage: true,
        animations: "disabled",
      });
      results.push({
        engine: engine.name(),
        mode,
        name,
        screenshot,
        passed: true,
        url: page.url(),
      });
      console.log(`${engine.name()} ${mode} ${name}: PASS`);
    };
    try {
      await page.goto("/login");
      await expect(page.locator("html")).toHaveAttribute("data-overload-mode", mode);
      const tokens = await page.evaluate(
        (names) => {
          const style = getComputedStyle(document.documentElement);
          return Object.fromEntries(
            names.map((name) => [name, style.getPropertyValue(`--ov-${name}`).trim()]),
          );
        },
        [...new Set(pairs.flatMap(([a, b]) => [a, b]))],
      );
      const contrast = pairs.map(([foreground, background, minimum]) => {
        const a = luminance(tokens[foreground]),
          b = luminance(tokens[background]);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        return {
          foreground,
          background,
          minimum,
          ratio: Number(ratio.toFixed(3)),
          passed: ratio >= minimum,
        };
      });
      results.push({
        engine: engine.name(),
        mode,
        name: "contrast",
        contrast,
        passed: contrast.every((pair) => pair.passed),
      });
      assert.ok(
        contrast.every((pair) => pair.passed),
        JSON.stringify(contrast.filter((pair) => !pair.passed)),
      );

      // Sign-in uses the app's persistent inline validation rather than a browser bubble.
      await page.getByLabel("Email", { exact: true }).fill("invalid-email");
      await page.getByLabel("Password", { exact: true }).fill("wrong-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.locator('input[aria-invalid="true"]')).toHaveCount(1);
      const nativeStyle = await page.getByLabel("Email", { exact: true }).evaluate((input) => ({
        color: getComputedStyle(input).borderTopColor,
        background: getComputedStyle(input).backgroundColor,
        glyph: getComputedStyle(input.closest(".ov-field").querySelector(".field-invalid-glyph"))
          .display,
      }));
      assert.notEqual(nativeStyle.glyph, "none");
      await capture("email-refused");

      await page.getByLabel("Email", { exact: true }).fill("theme04@local.test");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("alert").first()).toBeVisible();
      await capture("sign-in-refused");
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL("**/today");
      // Required native controls also carry the same signal before an action is submitted.
      await page.goto("/gyms/new", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Create gym", exact: true }).click();
      await expect(page.locator("input:user-invalid")).toHaveCount(1);
      await expect(page.locator(".field-invalid-glyph").first()).toBeVisible();
      await capture("native-required-refused");
      for (const route of ["/today", "/profile", "/plan/strength", "/food", "/progress"]) {
        await page.goto(route, { waitUntil: "networkidle" });
        await capture(route.slice(1).replaceAll("/", "-"));
      }
      await page.goto("/profile", { waitUntil: "networkidle" });
      await context.setOffline(true);
      await expect(page.locator(".connectivity")).toBeVisible();
      await capture("offline-notice");
      await context.setOffline(false);
      await expect(page.locator(".connectivity")).toHaveCount(0);
      const missing = await page.goto("/theme-audit-missing-page", { waitUntil: "networkidle" });
      assert.equal(missing.status(), 404);
      await capture("not-found");
    } catch (error) {
      results.push({
        engine: engine.name(),
        mode,
        name: "failure",
        passed: false,
        error: error.message,
      });
      console.error(`${engine.name()} ${mode}: ${error.message}`);
    } finally {
      results.push({
        engine: engine.name(),
        mode,
        name: "client-errors",
        passed: pageErrors.length === 0,
        errors: pageErrors,
      });
      await context.close();
      await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
    }
  }
  await browser.close();
}
if (results.some((result) => !result.passed)) process.exitCode = 1;
