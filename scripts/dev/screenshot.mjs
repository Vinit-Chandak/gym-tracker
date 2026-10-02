// Phone-sized screenshots of the running app, signed in as a seeded account.
//
//   node scripts/dev/screenshot.mjs <user> <light|dark|both> <prefix> <route> [route...]
//
// Captures the iPhone 17 canvas (402 x 874 CSS px at 2x) into output/screenshots/, for both
// palettes when asked, and prints a line per file with any horizontal overflow it found.
// Environment: BASE_URL (default http://127.0.0.1:3100, the audit app), WIDE=1 for a 1280 px
// desktop capture, FULL=1 for a full-page capture, CHROMIUM for the browser executable when
// the installed Playwright browsers do not match the package (see docs/local-dev.md).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const [user = "vinit", themes = "both", prefix = "shot", ...routes] = process.argv.slice(2);
if (routes.length === 0) {
  console.error(
    "Usage: node scripts/dev/screenshot.mjs <user> <light|dark|both> <prefix> <route>…",
  );
  process.exit(1);
}
const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const out = "output/screenshots/";
mkdirSync(out, { recursive: true });
const wide = process.env.WIDE === "1";
const fullPage = process.env.FULL === "1";

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
for (const theme of themes === "both" ? ["light", "dark"] : [themes]) {
  const context = await browser.newContext({
    viewport: wide ? { width: 1280, height: 860 } : { width: 402, height: 874 },
    deviceScaleFactor: 2,
    isMobile: !wide,
    hasTouch: !wide,
    colorScheme: theme,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', `${user}@local.test`);
  await page.fill('input[name="password"]', "password123");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }),
    page.click('button[type="submit"]'),
  ]);
  for (const route of routes) {
    const slug =
      route
        .replace(/^\//, "")
        .replace(/[/?=&]+/g, "-")
        .replace(/-+$/, "") || "root";
    await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 90_000 });
    // The development overlay is not part of the app.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    await page.waitForTimeout(400);
    const file = `${out}${prefix}-${slug}-${theme}${wide ? "-wide" : ""}.png`;
    await page.screenshot({ path: file, fullPage });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    console.log(`${file}${overflow > 0 ? `  !! horizontal overflow ${overflow}px` : ""}`);
  }
  if (errors.length) console.log(`[${theme}] errors:\n  ${[...new Set(errors)].join("\n  ")}`);
  await context.close();
}
await browser.close();
