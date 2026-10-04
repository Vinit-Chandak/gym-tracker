// Screenshots every board in ../canvas into ../screenshots at its canvas size, and the signature
// moment at the points of its loop that show each step.
// Usage: node docs/ui-redesign/revamp/form-v2/source/render.mjs [--scale=2] [--measure] [name ...]
//   --scale=N   device pixel ratio of the phone boards (default 2; the wide boards render at 1)
//   --measure   write the rendered height of the whole-scroll boards to heights.json, then build
//               again and render again
//   name ...    only boards whose file name contains one of these
// Uses Playwright's own Chromium, or CHROMIUM_PATH. The fonts come from Google Fonts: they are
// fetched by Node (which honours the proxy and its certificates, with NODE_USE_ENV_PROXY=1 where a
// proxy is in use) and handed to the page.
import { chromium } from "@playwright/test";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
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
const HFILE = path.join(HERE, "heights.json");
const TALL = existsSync(HFILE) ? JSON.parse(readFileSync(HFILE, "utf8")) : {};
// the signature moment, at armed, saving, landing, saved and the next set (ms into its 8 s loop)
const MOMENT_AT = [500, 1600, 2150, 2400, 2800];

mkdirSync(OUT, { recursive: true });
if (!filters.length && !measure)
  for (const f of readdirSync(OUT))
    if (f.endsWith(".png") && !order.includes(f.replace(/(@\d+ms)?\.png$/, ".dc.html")))
      unlinkSync(path.join(OUT, f));
const executablePath =
  process.env.CHROMIUM_PATH ||
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const fontCache = new Map();
const heights = {};
for (const file of order.filter((f) => !filters.length || filters.some((x) => f.includes(x)))) {
  const b = boards[file],
    name = file.replace(".dc.html", "");
  const page = await browser.newPage({
    viewport: { width: b.w, height: b.h },
    deviceScaleFactor: b.w > 440 ? 1 : scale,
  });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const url = route.request().url();
    if (!fontCache.has(url)) {
      const res = await fetch(url, {
        headers: { "user-agent": await page.evaluate(() => navigator.userAgent) },
      });
      fontCache.set(url, {
        status: res.status,
        type: res.headers.get("content-type") || "",
        body: Buffer.from(await res.arrayBuffer()),
      });
    }
    const c = fontCache.get(url);
    await route.fulfill({
      status: c.status,
      headers: { "content-type": c.type, "access-control-allow-origin": "*" },
      body: c.body,
    });
  });
  await page.goto(pathToFileURL(path.join(CANVAS, file)).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const drawn = await page.evaluate(() =>
    Math.ceil(document.querySelector("x-dc > div").getBoundingClientRect().height),
  );
  if (measure && TALL[file] !== undefined) heights[file] = drawn;
  // a board must never run past its own frame: say so, and fail, unless this run measures it
  else if (drawn > b.h + 1) {
    console.error(`${name}: drawn ${drawn} pt in a ${b.h} pt frame; run --measure ${name}`);
    process.exitCode = 1;
  }
  const clip = { x: 0, y: 0, width: b.w, height: b.h };
  if (name === "Moment") {
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
  writeFileSync(HFILE, JSON.stringify({ ...TALL, ...heights }, null, 2) + "\n");
  console.log("heights", heights, "- build again, then render again");
}
