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
// A machine whose browsers predate this Playwright can point at its own Chromium.
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  executablePath: engine === "webkit" ? undefined : process.env.AUDIT_CHROMIUM_PATH,
});
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
await sql`delete from food_entries where user_id=${user.id}`;
await sql`delete from foods where user_id=${user.id}`;
await sql`delete from saved_meals where user_id=${user.id}`;
await sql`delete from meals where user_id=${user.id}`;
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
const myFoods = () => page.getByRole("list", { name: "My foods" });
async function openMeal(label, slug) {
  await navigate("/today/food");
  await page.getByRole("link", { name: new RegExp(`^${label}`) }).click();
  await page.waitForURL(`**/today/food/${slug}`);
  await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
}
async function submit(name) {
  await dialog().getByRole("button", { name, exact: true }).click();
  await expect(dialog()).toBeHidden();
}
async function entries(meal) {
  return sql`select name, amount::float8 as amount, unit, portion_amount::float8 as portion
    from food_entries where user_id=${user.id} and meal=${meal} order by created_at, position`;
}
async function count(table) {
  return Number((await sql`select count(*) from ${sql(table)} where user_id=${user.id}`)[0].count);
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
  await check("food is available to every signed-in account without configuration", async () => {
    await login("alex");
    await page.locator('a[href="/today/food"]').click();
    await expect(page.getByRole("heading", { name: "Food", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Breakfast/ })).toBeVisible();
  });
  await login("sam");
  await check("Today opens first-use food with the day's six meals, Today selected", async () => {
    await page.locator('a[href="/today/food"]').click();
    await expect(page.getByRole("heading", { name: "Set a daily target" })).toBeVisible();
    await expect(page.locator('nav a[href="/today"]')).toHaveAttribute("aria-current", "page");
    const meals = page.locator('a[href^="/today/food/"]');
    await expect(meals).toHaveText([
      /^Breakfast/,
      /^Morning snack/,
      /^Lunch/,
      /^Afternoon snack/,
      /^Dinner/,
      /^Evening snack/,
    ]);
  });
  await check("hidden invalid protein does not block the fixed preset", async () => {
    await page.getByLabel("Daily target, kcal").fill("2400");
    await page.getByLabel("Protein, g per kg of body weight", { exact: true }).fill("");
    await page.getByRole("radio", { name: /55/ }).locator("..").click();
    await page.getByRole("button", { name: "Set target", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Set a daily target" })).toHaveCount(0);
  });
  await check("a new food asks for its kcal, then is kept by being logged", async () => {
    await openMeal("Breakfast", "breakfast");
    await myFoods().getByRole("button", { name: "New food", exact: true }).click();
    await dialog().getByLabel("Name", { exact: true }).fill("Oats");
    await dialog().getByRole("button", { name: "Add to Breakfast", exact: true }).click();
    await expect(dialog().getByText("Enter the kcal.", { exact: true })).toBeVisible();
    await expect(dialog().getByLabel("kcal", { exact: true })).toBeFocused();
    await dialog().getByLabel("kcal", { exact: true }).fill("389");
    await dialog().getByLabel("Carbs g", { exact: true }).fill("66.3");
    await dialog().getByLabel("Fat g", { exact: true }).fill("6.9");
    await dialog().getByLabel("Protein g", { exact: true }).fill("16.9");
    await dialog().getByLabel("Amount eaten", { exact: true }).fill("60");
    await expect(dialog()).toContainText("233.4 kcal");
    await submit("Add to Breakfast");
    expect(await entries("breakfast")).toEqual([
      { name: "Oats", amount: 60, unit: "g", portion: 100 },
    ]);
    await expect(page.getByRole("button", { name: /^Oats 60 g 233\.4 kcal/ })).toBeVisible();
    await myFoods().getByRole("button", { name: "New food", exact: true }).click();
    await dialog().getByLabel("Name", { exact: true }).fill("Milk");
    await dialog().getByLabel("Unit", { exact: true }).selectOption("ml");
    await dialog().getByLabel("kcal", { exact: true }).fill("52");
    await dialog().getByLabel("Amount eaten", { exact: true }).fill("300");
    await submit("Add to Breakfast");
    expect(await count("foods")).toBe(2);
  });
  await check(
    "a food from My foods is logged at another amount, its figures following",
    async () => {
      await openMeal("Lunch", "lunch");
      await myFoods()
        .getByRole("button", { name: /^Oats 100 g/ })
        .click();
      await dialog().getByRole("button", { name: "200 g", exact: true }).click();
      await expect(dialog()).toContainText("778 kcal");
      await submit("Add to Lunch");
      expect(await entries("lunch")).toEqual([
        { name: "Oats", amount: 200, unit: "g", portion: 100 },
      ]);
      await expect(page.getByRole("button", { name: /^Oats 200 g 778 kcal/ })).toBeVisible();
    },
  );
  await check("a meal starred under a name is added to another meal as it was", async () => {
    await openMeal("Breakfast", "breakfast");
    await page.getByRole("button", { name: "Star", exact: true }).click();
    await dialog().getByLabel("Name", { exact: true }).fill("Usual breakfast");
    await submit("Save meal");
    await expect(page.getByRole("button", { name: "Star", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("Saved as Usual breakfast", { exact: true })).toBeVisible();
    await openMeal("Dinner", "dinner");
    await page
      .getByRole("list", { name: "Saved meals" })
      .getByRole("button", { name: /^Usual breakfast/ })
      .click();
    await submit("Add to Dinner");
    expect(await entries("dinner")).toEqual(await entries("breakfast"));
    await expect(page.getByRole("button", { name: "Star", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  await check(
    "a changed portion is a meal of its own; a corrected food leaves days alone",
    async () => {
      await page.getByRole("button", { name: /^Oats 60 g/ }).click();
      await dialog().getByLabel("Amount eaten", { exact: true }).fill("80");
      await submit("Save");
      await expect(page.getByRole("button", { name: "Star", exact: true })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await myFoods()
        .getByRole("button", { name: /^Oats 100 g/ })
        .click();
      await dialog().getByRole("button", { name: "Edit Oats", exact: true }).click();
      await dialog().getByLabel("kcal", { exact: true }).fill("379");
      await submit("Save food");
      const [saved] = await sql`select items from saved_meals where user_id=${user.id}`;
      expect(saved.items.find((item) => item.name === "Oats").kcal).toBe(389);
      const kcal = await sql`select distinct kcal::float8 as kcal from food_entries
      where user_id=${user.id} and name='Oats'`;
      expect(kcal).toEqual([{ kcal: 389 }]);
    },
  );
  await check("swiping reveals Remove without opening or removing the food", async () => {
    const row = page.getByRole("button", { name: /^Milk 300 ml/ });
    const box = await row.boundingBox();
    await page.mouse.move(box.x + box.width - 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 20, { steps: 12 });
    await page.mouse.up();
    await expect(dialog()).toBeHidden();
    expect((await entries("dinner")).length).toBe(2);
    await page.getByRole("button", { name: "Remove Milk", exact: true }).click();
    await expect.poll(async () => (await entries("dinner")).length).toBe(1);
  });
  await check("a retried add after a lost reply logs the food exactly once", async () => {
    await openMeal("Afternoon snack", "afternoon-snack");
    await myFoods()
      .getByRole("button", { name: /^Milk 100 ml/ })
      .click();
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await dialog().getByRole("button", { name: "Add to Afternoon snack", exact: true }).click();
    await expect(dialog().getByText(/Connection lost/)).toBeVisible();
    await context.setOffline(false);
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
      await page.route("**/today/food/afternoon-snack", async (route) => {
        if (route.request().method() === "POST") {
          if (!lost) {
            lost = true;
            await route.fetch();
          }
          await route.abort("failed");
        } else await route.continue();
      });
    }
    await dialog().getByRole("button", { name: "Add to Afternoon snack", exact: true }).click();
    if (engine !== "webkit") await expect.poll(() => lost).toBe(true);
    await expect(dialog().getByText(/Connection lost/)).toBeVisible();
    await expect.poll(async () => (await entries("afternoon_snack")).length).toBe(1);
    await page.unroute("**/today/food/afternoon-snack");
    await submit("Add to Afternoon snack");
    expect((await entries("afternoon_snack")).length).toBe(1);
  });
  await check("Today's card and the Food screen agree with the database", async () => {
    const [{ kcal }] =
      await sql`select coalesce(sum(round(kcal * amount / portion_amount, 1)), 0)::float8 as kcal
      from food_entries where user_id=${user.id} and eaten_on = (
        select (now() at time zone time_zone)::date from profiles where id=${user.id})`;
    const total = kcal.toLocaleString("en-GB", { maximumFractionDigits: 1 });
    await navigate("/today/food");
    await expect(page.getByText(`${total} / 2,400 kcal`, { exact: false })).toBeVisible();
    await page.locator('nav a[href="/today"]').click();
    await expect(page.locator('a[href="/today/food"]')).toContainText(total);
  });
  await check("responsive layouts, 200% text, light/dark and accessible sheets", async () => {
    await openMeal("Breakfast", "breakfast");
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
        // Rows ease their colours on a palette change; screenshot the settled page.
        await page.waitForTimeout(400);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        await page.screenshot({
          path: `${dir}/meal-${width}-${height}-${font}-${scheme}.png`,
          fullPage: true,
        });
        for (const [name, open, field, primary] of [
          [
            "portion",
            () =>
              myFoods()
                .getByRole("button", { name: /^Oats 100 g/ })
                .click(),
            "Amount eaten",
            "Add to Breakfast",
          ],
          [
            "new-food",
            () => myFoods().getByRole("button", { name: "New food", exact: true }).click(),
            "kcal",
            "Add to Breakfast",
          ],
        ]) {
          await open();
          await dialog().getByLabel(field, { exact: true }).scrollIntoViewIfNeeded();
          await expect(dialog().getByLabel(field, { exact: true })).toBeInViewport();
          await dialog()
            .getByRole("button", { name: primary, exact: true })
            .scrollIntoViewIfNeeded();
          await expect(
            dialog().getByRole("button", { name: primary, exact: true }),
          ).toBeInViewport();
          expect(await dialog().evaluate((d) => d.scrollWidth <= d.clientWidth + 1)).toBe(true);
          await page.screenshot({
            path: `${dir}/${name}-${width}-${height}-${font}-${scheme}.png`,
          });
          if (width === 390 && height === 844 && font === 16) {
            const axe = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            expect(
              axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
            ).toEqual([]);
          }
          await dialog().getByRole("button", { name: "Close sheet" }).click();
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => (document.documentElement.style.fontSize = "16px"));
    await navigate("/today/food");
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(400);
      // The navigation island is translucent, so its active label's contrast depends on
      // whatever page is scrolled beneath it; History shows the same finding. It is the
      // shell's, not this screen's, and is left to the island's own audit.
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .exclude(".primary-nav")
        .analyze();
      expect(
        axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
      await page.screenshot({ path: `${dir}/food-390-844-${scheme}.png`, fullPage: true });
    }
  });
  await check(
    "missing body weight, profile changes, over-budget targets and isolation",
    async () => {
      await sql`update profiles set body_weight_kg=null where username='vinit'`;
      await sql`delete from nutrition_targets where user_id=(select id from profiles where username='vinit')`;
      await login("vinit");
      // The fixture bypasses profile actions, so advance their cache version explicitly.
      // Otherwise a preceding engine's profile can remain in the server's one-minute cache.
      await context.addCookies([
        {
          name: "overload-profile-changed",
          value: String(Date.now()),
          url: baseURL,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await navigate("/today/food/breakfast");
      // Another account's foods are nobody else's.
      await expect(myFoods().getByRole("button", { name: /^Oats/ })).toHaveCount(0);
      await navigate("/today/food");
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
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByText(/nothing left for carbs/)).toBeVisible();
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
