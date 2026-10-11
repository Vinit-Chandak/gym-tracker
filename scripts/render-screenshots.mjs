// Captures the screenshots the manifest offers in Android's and desktop Chrome's install sheet
// (src/app/manifest.ts): Today and Progress, on a phone and on a larger screen.
//
//   AUDIT_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/render-screenshots.mjs \
//     [base URL] [email] [password]
//
// It signs in to a running copy of the app, by default the local audit with the year of
// synthetic data (docs/local-dev.md), as one of its made-up athletes. Never point it at
// production: the pictures are published with the app.

import { chromium } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [base = "http://localhost:3107", email = "sofia@local.test", password = "password123"] =
  process.argv.slice(2);

/** The sizes in the manifest, drawn at one pixel per point so each file is that size. */
const SHOTS = [
  { name: "narrow", viewport: { width: 390, height: 844 } },
  { name: "wide", viewport: { width: 1280, height: 800 } },
];
const SCREENS = ["today", "progress"];

const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROMIUM_PATH });
try {
  const context = await browser.newContext({
    viewport: SHOTS[0].viewport,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });

  for (const { name, viewport } of SHOTS) {
    await page.setViewportSize(viewport);
    for (const screen of SCREENS) {
      await page.goto(`${base}/${screen}`, { waitUntil: "networkidle", timeout: 120_000 });
      await page.evaluate(() => document.fonts.ready);
      const file = `public/screenshots/${screen}-${name}.png`;
      await page.screenshot({ path: join(root, file) });
      console.log(`${file} (${viewport.width}×${viewport.height})`);
    }
  }
} finally {
  await browser.close();
}
