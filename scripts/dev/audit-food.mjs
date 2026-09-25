// Production-build food audit. Uses only the dedicated loopback audit database.
import { chromium, webkit, devices, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Readable } from "node:stream";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const database =
  process.env.AUDIT_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_food";
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(database).hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(new URL(database).pathname)
)
  throw new Error("Local audit only");
const engine = process.env.AUDIT_BROWSER ?? "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const context = await browser.newContext({
  ...devices[engine === "webkit" ? "iPhone 13" : "Pixel 7"],
  baseURL,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const sql = postgres(database, { max: 1 });
const results = [];
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
const dir = `output/food-audit/${engine}`;
await mkdir(dir, { recursive: true });
const [user] = await sql`select id from profiles where username='sam'`;
if (!user) throw new Error("Run audit:setup first");
// Reset only nutrition fixtures belonging to the designated local test account.
await sql`delete from meals where user_id=${user.id}`;
await sql`delete from saved_meals where user_id=${user.id}`;
await sql`delete from nutrition_targets where user_id=${user.id}`;
await sql`delete from food_submission_receipts where user_id=${user.id}`;
async function check(name, run) {
  try {
    await run();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.stack });
    console.log(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: `${dir}/failure-${results.length}.png` }).catch(() => {});
    throw error;
  } finally {
    await writeFile(`${dir}/results.json`, JSON.stringify({ results, pageErrors }, null, 2));
  }
}
// Complete the fully prefetched tabs before a test-driven document navigation or reload.
// Otherwise WebKit reports the intentionally cancelled RSC loads as access-control errors.
async function navigate(path, options = {}) {
  if (page.url() !== "about:blank") await page.waitForLoadState("networkidle");
  return page.goto(path, { ...options, waitUntil: "networkidle" });
}
async function reload() {
  await page.waitForLoadState("networkidle");
  return page.reload({ waitUntil: "networkidle" });
}
async function login(name) {
  if (page.url() !== "about:blank") {
    // Exercise the actual account switch; clearing cookies under in-flight prefetches
    // creates artificial auth failures that a normal sign-out avoids.
    await page.waitForLoadState("networkidle");
    await navigate("/profile", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL("**/login");
  } else await navigate("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill(`${name}@local.test`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/today");
}
const dialog = () => page.getByRole("dialog");
async function openNew(name) {
  await page.getByRole("button", { name: "Add meal", exact: true }).click();
  await dialog().getByLabel("Meal", { exact: true }).fill(name);
}
async function save() {
  await dialog().getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(dialog()).toBeHidden();
}
async function mealCount(count) {
  await expect
    .poll(async () =>
      Number((await sql`select count(*) from meals where user_id=${user.id}`)[0].count),
    )
    .toBe(count);
}
// WebKit may reject emulated offline navigation before the service worker runs.
// Disconnect an actual loopback proxy to exercise its real network-failure path.
async function offlineNavigation() {
  let disconnected = false;
  const proxy = createServer(async (request, response) => {
    if (disconnected) return request.socket.destroy();
    try {
      const upstream = await fetch(`${baseURL}${request.url}`, { redirect: "manual" });
      const headers = Object.fromEntries(upstream.headers);
      delete headers["content-encoding"];
      delete headers["content-length"];
      delete headers["transfer-encoding"];
      response.writeHead(upstream.status, headers);
      if (upstream.body) Readable.fromWeb(upstream.body).pipe(response);
      else response.end();
    } catch {
      request.socket.destroy();
    }
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${proxy.address().port}`;
  const probeContext = await browser.newContext();
  try {
    const probe = await probeContext.newPage();
    await probe.goto(`${origin}/login`, { waitUntil: "networkidle" });
    await probe.evaluate(() => navigator.serviceWorker.ready);
    await probe.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    disconnected = true;
    proxy.closeAllConnections();
    await probe.goto(`${origin}/today/food`, { waitUntil: "domcontentloaded" });
    await expect(probe.getByRole("heading", { name: "You’re offline" })).toBeVisible();
    await expect(probe.getByText(/meal drafts/)).toBeVisible();
    await probe.screenshot({ path: `${dir}/offline.png` });
    disconnected = false;
    await probe.goto(`${origin}/login`, { waitUntil: "networkidle" });
    await expect(probe.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  } finally {
    await probeContext.close();
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(resolve));
  }
}
try {
  await check("flag off hides the Today card and food route", async () => {
    await login("alex");
    await expect(page.locator('a[href="/today/food"]')).toHaveCount(0);
    await navigate("/today/food");
    await expect(page.getByText("Not found", { exact: true })).toBeVisible();
  });
  await login("sam");
  await check("Today opens first-use food and keeps Today selected", async () => {
    await page.locator('a[href="/today/food"]').click();
    await expect(page.getByRole("heading", { name: "Set a daily target" })).toBeVisible();
    await expect(page.locator('nav a[href="/today"]')).toHaveAttribute("aria-current", "page");
  });
  await check("hidden invalid protein does not block the fixed preset", async () => {
    await page.getByLabel("Daily target, kcal").fill("2400");
    await page.getByLabel("Protein, g per kg of body weight", { exact: true }).fill("");
    await page.getByRole("radio", { name: /55/ }).locator("..").click();
    await page.getByRole("button", { name: "Set target", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Set a daily target" })).toHaveCount(0);
  });
  await check("validation focuses missing kcal and preserves entered foods", async () => {
    await openNew("Audit breakfast");
    await dialog().getByLabel("Food 1 name", { exact: true }).fill("Oats");
    await dialog().getByRole("button", { name: "Save meal" }).click();
    await expect(dialog().getByText("Enter the kcal.", { exact: true })).toBeVisible();
    await expect(dialog().getByLabel("Food 1 kcal", { exact: true })).toBeFocused();
    await dialog().getByLabel("Food 1 kcal", { exact: true }).fill("400.5");
    await dialog().getByLabel("Food 1 Protein g", { exact: true }).fill("20");
    await dialog().getByRole("button", { name: "Add food" }).click();
    await dialog().getByLabel("Food 2 name", { exact: true }).fill("Milk");
    await dialog().getByLabel("Food 2 kcal", { exact: true }).fill("199.5");
    await dialog().getByRole("button", { name: "Star", exact: true }).click();
    await save();
    await mealCount(1);
  });
  await check("star chips copy a meal and editing a day leaves the saved copy intact", async () => {
    await page.getByRole("button", { name: "Audit breakfast 600 kcal", exact: true }).click();
    await mealCount(2);
    await page
      .getByRole("button", { name: /^Audit breakfast Starred/ })
      .first()
      .click();
    await dialog().getByLabel("Food 1 kcal", { exact: true }).fill("1960.5");
    await save();
    const [saved] = await sql`select items from saved_meals where user_id=${user.id}`;
    expect(saved.items[0].kcal).toBe(400.5);
    await expect(page.getByText("Over", { exact: true })).toBeVisible();
  });
  await check("delete in edit sheet updates the goal band and Today totals", async () => {
    await page
      .getByRole("button", { name: /^Audit breakfast Starred/ })
      .last()
      .click();
    await dialog().getByRole("button", { name: "Delete meal", exact: true }).click();
    await expect(dialog()).toBeHidden();
    await mealCount(1);
    await expect(page.getByText("Goal met", { exact: true })).toBeVisible();
    await page.locator('nav a[href="/today"]').click();
    await expect(page.locator('a[href="/today/food"]')).toContainText("2,160");
    await page.locator('a[href="/today/food"]').click();
  });
  await check(
    "offline draft survives reload and saves exactly once after a lost reply",
    async () => {
      await openNew("Offline lunch");
      await dialog().getByLabel("Food 1 kcal", { exact: true }).fill("500");
      await page.waitForLoadState("networkidle");
      await context.setOffline(true);
      await dialog().getByRole("button", { name: "Save meal", exact: true }).click();
      await expect(dialog().getByText(/Connection lost/)).toBeVisible();
      await context.setOffline(false);
      await reload();
      await page.getByRole("button", { name: "Resume draft", exact: true }).click();
      await expect(dialog().getByLabel("Food 1 kcal", { exact: true })).toHaveValue("500");
      let lost = false;
      if (engine === "webkit") {
        // WebKit routing cannot intercept this service-worker-controlled request.
        // Let the real server commit, then withhold its reply at the fetch boundary.
        await page.evaluate(() => {
          const original = window.fetch;
          window.fetch = async function (...args) {
            const response = await original.apply(this, args);
            if (args[1]?.method === "POST") {
              await response.arrayBuffer();
              window.fetch = original;
              throw new TypeError("Audit: committed save reply lost");
            }
            return response;
          };
        });
      } else {
        await page.route("**/today/food", async (route) => {
          if (route.request().method() === "POST") {
            if (!lost) {
              lost = true;
              await route.fetch();
            }
            await route.abort("failed");
          } else await route.continue();
        });
      }
      await dialog().getByRole("button", { name: "Save meal", exact: true }).click();
      if (engine !== "webkit") await expect.poll(() => lost).toBe(true);
      await expect(dialog().getByText(/Connection lost/)).toBeVisible();
      await mealCount(2);
      await page.unroute("**/today/food");
      await reload();
      await page.getByRole("button", { name: "Resume draft", exact: true }).click();
      await save();
      await mealCount(2);
      await expect(page.getByRole("button", { name: "Resume draft" })).toHaveCount(0);
      await page.waitForLoadState("networkidle");
    },
  );
  await check("a resumed draft retains its original day", async () => {
    await openNew("Yesterday dinner");
    await dialog().getByLabel("Food 1 kcal", { exact: true }).fill("300");
    const yesterday = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("overload:food-draft:"));
      const draft = JSON.parse(localStorage.getItem(key));
      const date = new Date(`${draft.eatenOn}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() - 1);
      draft.eatenOn = date.toISOString().slice(0, 10);
      localStorage.setItem(key, JSON.stringify(draft));
      return draft.eatenOn;
    });
    await reload();
    await page.getByRole("button", { name: "Resume draft", exact: true }).click();
    await expect(dialog().getByText(`Logging for ${yesterday}`, { exact: true })).toBeVisible();
    await save();
    const [meal] =
      await sql`select eaten_on::text as day from meals where user_id=${user.id} and name='Yesterday dinner'`;
    expect(meal.day).toBe(yesterday);
  });
  await check("unstarring removes only the saved copy", async () => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Unstar Audit breakfast", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Starred", exact: true })).toHaveCount(0);
    await mealCount(3);
  });
  await check("responsive layouts, 200% text, light/dark and accessible forms", async () => {
    await openNew("Long meal " + "x".repeat(70));
    await dialog()
      .getByLabel("Food 1 name", { exact: true })
      .fill("Food" + "y".repeat(76));
    await dialog().getByLabel("Food 1 kcal", { exact: true }).fill("10000");
    await dialog().getByLabel("Food 1 Protein g", { exact: true }).fill("1000");
    await save();
    for (const [width, height, font] of [
      [320, 568, 16],
      [390, 844, 16],
      [768, 1024, 16],
      [1440, 900, 16],
      [320, 568, 32],
      [568, 320, 32],
      [390, 300, 16],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((size) => (document.documentElement.style.fontSize = `${size}px`), font);
      for (const scheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        await page.screenshot({
          path: `${dir}/food-${width}-${height}-${font}-${scheme}.png`,
          fullPage: true,
        });
        await page.getByRole("button", { name: "Add meal", exact: true }).click();
        await dialog().getByLabel("Food 1 kcal", { exact: true }).scrollIntoViewIfNeeded();
        await expect(dialog().getByLabel("Food 1 kcal", { exact: true })).toBeInViewport();
        await dialog()
          .getByRole("button", { name: "Save meal", exact: true })
          .scrollIntoViewIfNeeded();
        await expect(
          dialog().getByRole("button", { name: "Save meal", exact: true }),
        ).toBeInViewport();
        expect(await dialog().evaluate((d) => d.scrollWidth <= d.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: `${dir}/sheet-${width}-${height}-${font}-${scheme}.png` });
        if (width === 390 && height === 844) {
          const axe = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          expect(
            axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          ).toEqual([]);
        }
        await dialog().getByRole("button", { name: "Close sheet" }).click();
        const targets = page.locator("summary").filter({ hasText: "Targets" });
        await targets.click();
        await expect(page.getByLabel("Daily target, kcal")).toBeVisible();
        expect(
          await targets.evaluate((summary) => {
            const [label, meta] = [...summary.querySelectorAll(":scope > span")].map((n) =>
              n.getBoundingClientRect(),
            );
            return !label || !meta || label.right <= meta.left + 1 || meta.top >= label.bottom - 1;
          }),
        ).toBe(true);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        await page.screenshot({
          path: `${dir}/targets-${width}-${height}-${font}-${scheme}.png`,
          fullPage: true,
        });
        await targets.click();
      }
    }
  });
  await check("swiping reveals deletion without opening or deleting the meal", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => (document.documentElement.style.fontSize = "16px"));
    const row = page.getByRole("button", { name: /^Offline lunch 500 kcal/ });
    await row.scrollIntoViewIfNeeded();
    const box = await row.boundingBox();
    await page.mouse.move(box.x + box.width - 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 20, { steps: 12 });
    await page.mouse.up();
    await expect(dialog()).toBeHidden();
    await mealCount(4);
    await page.getByRole("button", { name: "Delete Offline lunch", exact: true }).click();
    await mealCount(3);
  });
  await check(
    "missing body weight, profile changes, over-budget targets and account draft isolation",
    async () => {
      await openNew("Private draft");
      await dialog().getByLabel("Food 1 kcal", { exact: true }).fill("100");
      await dialog().getByRole("button", { name: "Close sheet" }).click();
      await sql`update profiles set body_weight_kg=null where username='vinit'`;
      await sql`delete from nutrition_targets where user_id=(select id from profiles where username='vinit')`;
      await login("vinit");
      await navigate("/today/food");
      await expect(page.getByText("Private draft", { exact: false })).toHaveCount(0);
      await page.getByLabel("Daily target, kcal").fill("2400");
      await page.getByRole("button", { name: "Set target", exact: true }).click();
      await expect(page.getByText(/There is no body weight/)).toBeVisible();
      await page.getByRole("link", { name: "Add it in your profile" }).click();
      await page.getByLabel("Body weight (kg)", { exact: true }).fill("80");
      await page.getByLabel("Height (cm)", { exact: true }).fill("180");
      await page.locator('[name="dateOfBirth"]').fill("1990-01-01");
      await page.getByLabel("Training goal", { exact: true }).selectOption("get_stronger");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Profile saved", { exact: true })).toHaveCount(1);
      await navigate("/today/food");
      await page.locator("summary").filter({ hasText: "Targets" }).click();
      await expect(page.getByText("144 g at 80 kg", { exact: true })).toBeVisible();
      await page.getByLabel("Daily target, kcal").fill("500");
      await page.getByLabel("Protein, g per kg of body weight", { exact: true }).fill("4");
      await page.getByRole("button", { name: "Save targets", exact: true }).click();
      await expect(page.getByText(/nothing left for carbs/)).toBeVisible();
      // The warning is a live preview; wait for the server-rendered value before reloading.
      await expect(page.locator("summary").filter({ hasText: "Targets" })).toContainText(
        "500 kcal",
      );
      await reload();
      await expect(page.getByText(/nothing left for carbs/)).toBeVisible();
      await login("sam");
      await navigate("/today/food");
      await page.getByRole("button", { name: "Resume draft", exact: true }).click();
      await expect(dialog().getByLabel("Meal", { exact: true })).toHaveValue("Private draft");
      await dialog().getByRole("button", { name: "Close sheet" }).click();
      await page.getByRole("button", { name: "Discard draft", exact: true }).click();
      await expect(page.getByRole("button", { name: "Resume draft" })).toHaveCount(0);
    },
  );
  await check(
    "install prompt survives navigation and manual instructions remain available",
    async () => {
      await navigate("/today", { waitUntil: "networkidle" });
      await expect
        .poll(() =>
          page.evaluate(() => {
            window.__auditPrompted = false;
            const event = new Event("beforeinstallprompt", { cancelable: true });
            event.prompt = async () => {
              window.__auditPrompted = true;
            };
            window.dispatchEvent(event);
            return event.defaultPrevented;
          }),
        )
        .toBe(true);
      await page.getByRole("link", { name: "Profile", exact: true }).click();
      await page.waitForURL("**/profile");
      await page.getByRole("button", { name: /^Install / }).click();
      expect(await page.evaluate(() => window.__auditPrompted)).toBe(true);
      await page.getByRole("button", { name: /^Install / }).click();
      await expect(page.getByText("iPhone and iPad", { exact: true })).toBeVisible();
      await dialog().getByRole("button", { name: "Close sheet" }).click();
    },
  );
  await check("PWA manifest, service worker and private cache boundaries", async () => {
    const manifest = await (await page.request.get("/manifest.webmanifest")).json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBe("any");
    expect(manifest.start_url).toBe("/today");
    for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);
    if (process.env.AUDIT_PRODUCTION === "true") {
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      const keys = await page.evaluate(async () =>
        (
          await Promise.all(
            (await caches.keys()).map(async (k) =>
              (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname),
            ),
          )
        ).flat(),
      );
      expect(
        keys.some(
          (k) => k.startsWith("/today") || k.startsWith("/api/") || k.startsWith("/profile"),
        ),
      ).toBe(false);
      if (engine === "chromium") {
        await page.waitForLoadState("networkidle");
        await context.setOffline(true);
        await navigate("/today/food");
        await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
        await context.setOffline(false);
        await page.getByRole("link", { name: "Try again" }).click();
        await expect(page.locator('a[href="/today/food"]')).toBeVisible();
      } else await offlineNavigation();
    }
  });
  expect(pageErrors).toEqual([]);
} finally {
  await context.setOffline(false);
  await browser.close();
  await sql.end();
  await writeFile(`${dir}/results.json`, JSON.stringify({ results, pageErrors }, null, 2));
}
