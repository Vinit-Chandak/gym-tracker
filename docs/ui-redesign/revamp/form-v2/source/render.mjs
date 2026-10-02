// Screenshots every board in ../canvas into ../screenshots at its canvas size, and the signature
// moment at a few points of its loop. Fonts load from Google Fonts, so run it online.
// Usage: node docs/ui-redesign/revamp/form-v2/source/render.mjs [--scale=2] [--measure] [name ...]
//   --scale=N   device pixel ratio of the PNGs (default 2; the tall boards always render at 1)
//   --measure   write the rendered height of the scrolling boards to heights.json, then rebuild
//   name ...    only boards whose file name contains one of these
// Set CHROMIUM_PATH to use a browser other than Playwright's own.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CANVAS = path.resolve(HERE, "..", "canvas");
const OUT = process.env.OUT_DIR || path.resolve(HERE, "..", "screenshots");
const args = process.argv.slice(2);
const scale = Number((args.find((a) => a.startsWith("--scale=")) || "--scale=2").split("=")[1]);
const measure = args.includes("--measure");
const filters = args.filter((a) => !a.startsWith("--"));
const { boards, order } = JSON.parse(readFileSync(path.join(CANVAS, "canvas.json"), "utf8"));
// Boards drawn as a whole scroll, whose height is measured rather than set.
const TALL = new Set([
  "Form-System.dc.html",
  "Form-About.dc.html",
  "Form-Alphabet.dc.html",
  "Form-Coach.dc.html",
  "Form-Log-Large.dc.html",
  "Form-Log-320.dc.html",
  "Form-Food-320.dc.html",
]);
// The signature moment, at the points of its 8 s loop that show each step.
const MOMENT_AT = [500, 1450, 1780, 1960, 2400];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const heights = {};
for (const file of order.filter((f) => !filters.length || filters.some((x) => f.includes(x)))) {
  const b = boards[file],
    name = file.replace(".dc.html", "");
  const dpr = TALL.has(file) && b.w > 402 ? 1 : scale;
  const page = await browser.newPage({
    viewport: { width: b.w, height: b.h },
    deviceScaleFactor: dpr,
  });
  await page.goto(pathToFileURL(path.join(CANVAS, file)).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  if (measure && TALL.has(file)) {
    heights[file] = await page.evaluate(() =>
      Math.ceil(document.querySelector("x-dc > div").getBoundingClientRect().height),
    );
  }
  const clip = { x: 0, y: 0, width: b.w, height: b.h };
  if (name === "Form-Moment") {
    for (const ms of MOMENT_AT) {
      await page.evaluate((t) => {
        for (const a of document.getAnimations()) {
          a.pause();
          a.currentTime = t;
        }
      }, ms);
      await page.waitForTimeout(60);
      await page.screenshot({ path: path.join(OUT, `${name}@${ms}ms.png`), clip });
    }
    await page.evaluate(() => {
      for (const a of document.getAnimations()) a.currentTime = 500;
    });
  }
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip });
  await page.close();
  console.log("rendered", name);
}
await browser.close();
if (measure) {
  const file = path.join(HERE, "heights.json");
  const all = { ...JSON.parse(readFileSync(file, "utf8")), ...heights };
  writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
  console.log("heights", heights, "- rebuild with build.mjs, then render again");
}
