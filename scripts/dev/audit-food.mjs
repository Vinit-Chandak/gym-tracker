// Production-build food audit. Uses only the dedicated loopback audit database.
import { chromium, webkit, devices, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const database =
  process.env.AUDIT_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_food";
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(database).hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(new URL(database).pathname) ||
  new URL(database).search ||
  new URL(database).hash
)
  throw new Error("Local audit only");
const engine = process.env.AUDIT_BROWSER ?? "chromium";
// A machine whose browsers predate this Playwright can point at its own Chromium.
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  executablePath: engine === "webkit" ? undefined : process.env.AUDIT_CHROMIUM_PATH,
});
let context, page;
const sql = postgres(database, { max: 1 });
const results = [];
const pageErrors = [];
let currentCheck = "setup";
// Client transitions do not reset Playwright's document load state. Track their
// requests too, so a later hard navigation cannot cancel a pending prefetch.
let network = { active: new Set(), changedAt: 0 };
async function freshPage() {
  // These are independent account scenarios. In-flight prefetches from a finished
  // scenario must not delay another account's setup or carry its browser state.
  if (context) await context.close();
  context = await browser.newContext({
    ...devices[engine === "webkit" ? "iPhone 13" : "Pixel 7"],
    baseURL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  const currentPage = page;
  currentPage.on("pageerror", (error) =>
    pageErrors.push({ check: currentCheck, url: currentPage.url(), message: error.message }),
  );
  const currentNetwork = { active: new Set(), changedAt: 0 };
  network = currentNetwork;
  currentPage.on("request", (request) => {
    currentNetwork.active.add(request);
    currentNetwork.changedAt = Date.now();
  });
  const requestFinished = (request) => {
    currentNetwork.active.delete(request);
    currentNetwork.changedAt = Date.now();
  };
  currentPage.on("requestfinished", requestFinished);
  currentPage.on("requestfailed", requestFinished);
}
async function settleRequests() {
  const deadline = Date.now() + 20_000;
  while (network.active.size || Date.now() - network.changedAt < 750) {
    if (Date.now() > deadline)
      throw new Error(
        `Page requests did not settle: ${[...network.active].map((request) => request.url()).join(", ")}`,
      );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const dir = `${process.env.AUDIT_OUTPUT_DIR ?? "output/food-audit"}/food-${engine}`;
await mkdir(dir, { recursive: true });
const [user] = await sql`select id from profiles where username='sam'`;
if (!user) throw new Error("Run audit:setup first");
let secondaryId;
// Reset only nutrition fixtures belonging to the designated local test account.
await sql`delete from food_entries where user_id=${user.id}`;
await sql`delete from foods where user_id=${user.id}`;
await sql`delete from saved_meals where user_id=${user.id}`;
await sql`delete from meals where user_id=${user.id}`;
await sql`delete from nutrition_targets where user_id=${user.id}`;
await sql`delete from food_submission_receipts where user_id=${user.id}`;
async function check(name, run) {
  currentCheck = name;
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
  await settleRequests();
  if (page.url() !== "about:blank") await page.waitForLoadState("networkidle");
  return page.goto(path, { ...options, waitUntil: "networkidle" });
}
async function login(name) {
  // Sign-out and account switching have their own account workflow coverage.
  await freshPage();
  await navigate("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill(`${name}@local.test`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/today");
}
/**
 * Waits out the transitions a palette change starts. Controls cross-fade their colours, and a
 * contrast check or screenshot taken mid-fade measures neither palette: the active tab dips
 * below 2:1 halfway through a fade whose ends are 4.9:1 and 6:1.
 */
async function settle() {
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}
const dialog = () => page.getByRole("dialog");
/** What a meal's page adds from: everything in My foods, in one list (ADR 0035). */
const myFoods = () => page.getByRole("list", { name: "Your foods and meals" });
/** Makes a food from a meal's page: only a search that finds nothing offers it. */
async function newFoodFrom(search) {
  await page.getByRole("searchbox").fill(search);
  await myFoods()
    .getByRole("button", { name: `New food “${search}”`, exact: true })
    .click();
}
const tab = (label) =>
  page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: label });
const selectedTab = () =>
  page.getByRole("navigation", { name: "Primary" }).locator('a[aria-current="page"]');
async function openMeal(label, slug) {
  await navigate("/food");
  await page.getByRole("link", { name: new RegExp(`^${label}`) }).click();
  await page.waitForURL(`**/food/${slug}`);
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
    await probe.goto(`${origin}/food`, { waitUntil: "domcontentloaded" });
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
    await tab("Food").click();
    await expect(page.getByRole("heading", { name: "Food", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Breakfast/ })).toBeVisible();
  });
  await login("sam");
  await check("the Food tab opens first-use food with the day's seven meals", async () => {
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveText([
      "Today",
      "Training",
      "Food",
      "Progress",
      "Profile",
    ]);
    // Today no longer carries a food card: Food is its own tab (ADR 0034).
    await expect(page.locator('main a[href^="/food"]')).toHaveCount(0);
    await tab("Food").click();
    await expect(page.getByRole("heading", { name: "No daily target yet" })).toBeVisible();
    await expect(selectedTab()).toHaveText("Food");
    const meals = page.getByRole("list", { name: "Meals" }).getByRole("link");
    await expect(meals).toHaveText([
      /^Breakfast/,
      /^Morning snack/,
      /^Lunch/,
      /^Afternoon snack/,
      /^Evening snack/,
      /^Dinner/,
      /^Late-night snack/,
    ]);
  });
  await check("targets are set on a screen of their own, from the goal's split", async () => {
    // Sam has no training goal and no body weight: 55 / 25 / 20, protein a fifth of the target.
    await page.getByRole("link", { name: "Set target", exact: true }).click();
    await page.waitForURL("**/food/targets");
    await expect(selectedTab()).toHaveText("Food");
    await expect(page.getByText("Not set", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Fat, % of daily target")).toHaveValue("25");
    await page.getByLabel("Daily target, kcal").fill("2400");
    await expect(page.getByText(/protein is 20% of the target until there is/)).toBeVisible();
    await expect(page.getByText("Carbs 330 g · Fat 67 g · Protein 120 g")).toBeVisible();
    await page.getByRole("button", { name: "Set target", exact: true }).click();
    // Saving goes back to where the targets were opened from.
    await page.waitForURL(/\/food$/);
    await expect(page.getByRole("heading", { name: "No daily target yet" })).toHaveCount(0);
    await expect(page.getByText("0 / 2,400 kcal", { exact: false })).toBeVisible();
    const [targets] = await sql`select daily_kcal, protein_per_kg::float8 as protein,
      fat_percent, macro_split from nutrition_targets where user_id=${user.id}`;
    expect(targets).toEqual({
      daily_kcal: 2400,
      protein: 1.8,
      fat_percent: 25,
      macro_split: "body_weight",
    });
    await settleRequests();
    await page.goBack();
    await page.waitForURL(/\/today$/);
    await tab("Food").click();
  });
  await check("a new food asks for its kcal, then is kept by being logged", async () => {
    await openMeal("Breakfast", "breakfast");
    // Nothing is in My foods yet, so nothing can be found, and New food is there at once.
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
    // With a food in My foods, New food waits for a search that finds nothing.
    await expect(myFoods().getByRole("button", { name: /^New food/ })).toHaveCount(0);
    await newFoodFrom("Milk");
    await expect(dialog().getByLabel("Name", { exact: true })).toHaveValue("Milk");
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
    await myFoods()
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
      // A meal's page only adds: foods are corrected in My foods (ADR 0035).
      await myFoods()
        .getByRole("button", { name: /^Oats 100 g/ })
        .click();
      await expect(dialog().getByRole("button", { name: /^Edit/ })).toHaveCount(0);
      await dialog().getByRole("button", { name: "Close sheet" }).click();
      await navigate("/food");
      await page.getByRole("link", { name: /^My foods/ }).click();
      await page.waitForURL("**/food/my-foods");
      await page
        .getByRole("list", { name: "Foods" })
        .getByRole("button", { name: /^Oats 100 g/ })
        .click();
      await expect(dialog().getByRole("heading", { name: "Edit food" })).toBeVisible();
      await dialog().getByLabel("kcal", { exact: true }).fill("379");
      await submit("Save food");
      const [saved] = await sql`select items from saved_meals where user_id=${user.id}`;
      expect(saved.items.find((item) => item.name === "Oats").kcal).toBe(389);
      const kcal = await sql`select distinct kcal::float8 as kcal from food_entries
      where user_id=${user.id} and name='Oats'`;
      expect(kcal).toEqual([{ kcal: 389 }]);
      await openMeal("Dinner", "dinner");
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
    await settleRequests();
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
      await page.route("**/food/afternoon-snack", async (route) => {
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
    await page.unroute("**/food/afternoon-snack");
    await submit("Add to Afternoon snack");
    expect((await entries("afternoon_snack")).length).toBe(1);
  });
  await check("My foods keeps foods and meals without logging anything", async () => {
    const before = await count("food_entries");
    await navigate("/food");
    await page.getByRole("link", { name: /^My foods/ }).click();
    await page.waitForURL("**/food/my-foods");
    await expect(selectedTab()).toHaveText("Food");
    await page.getByRole("button", { name: "New food", exact: true }).click();
    await expect(dialog().getByLabel("Amount eaten", { exact: true })).toHaveCount(0);
    await dialog().getByLabel("Name", { exact: true }).fill("Rice");
    await dialog().getByLabel("kcal", { exact: true }).fill("130");
    await dialog().getByLabel("Carbs g", { exact: true }).fill("28");
    await dialog().getByLabel("Protein g", { exact: true }).fill("2.7");
    await submit("Save food");
    await expect(
      page.getByRole("list", { name: "Foods" }).getByRole("button", { name: /^Rice 100 g/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: "New meal", exact: true }).click();
    await page.waitForURL("**/food/my-foods/meals/new");
    await page.getByLabel("Name", { exact: true }).fill("Rice bowl");
    await page.getByRole("button", { name: /^Rice 100 g/ }).click();
    await dialog().getByRole("button", { name: "200 g", exact: true }).click();
    await submit("Add to meal");
    await page.getByRole("button", { name: /^Oats 100 g/ }).click();
    await dialog().getByLabel("Amount", { exact: true }).fill("40");
    await submit("Add to meal");
    await expect(page.getByRole("list", { name: "In this meal" })).toContainText("260 kcal");
    await page.getByRole("button", { name: "Save meal", exact: true }).click();
    // Back to My foods, where the meal was made.
    await page.waitForURL(/\/food\/my-foods$/);
    await expect(page.getByRole("link", { name: /^Rice bowl 2 foods/ })).toBeVisible();
    const [meal] = await sql`select name, items from saved_meals
      where user_id=${user.id} and name='Rice bowl'`;
    expect(meal.items.map((item) => [item.name, item.amount])).toEqual([
      ["Rice", 200],
      ["Oats", 40],
    ]);
    expect(await count("food_entries")).toBe(before);
    // And it goes into any meal of the day in one tap, the late-night snack included.
    await openMeal("Late-night snack", "late-night-snack");
    await myFoods()
      .getByRole("button", { name: /^Rice bowl/ })
      .click();
    await submit("Add to Late-night snack");
    expect((await entries("late_night_snack")).map((entry) => entry.name)).toEqual([
      "Rice",
      "Oats",
    ]);
  });
  await check("each macronutrient opens what today's foods gave it", async () => {
    await navigate("/food");
    await page.getByRole("button", { name: /^Protein:/ }).click();
    const sheet = dialog();
    await expect(sheet.getByRole("heading", { name: "Protein" })).toBeVisible();
    const rows = sheet.getByRole("list", { name: "Protein by food" }).getByRole("listitem");
    // Oats was eaten in four meals: one row, added up, and it gave the most.
    await expect(rows.first()).toContainText("Oats");
    await expect(rows.first()).toContainText("Breakfast, Lunch, Dinner, Late-night snack");
    await expect(rows.filter({ hasText: "Milk" })).toContainText("—");
    // Grams only: where the day stands is said in words at the top, and no food has a share.
    await expect(sheet.getByText(/^\d+ g to go$|^Reached$/)).toBeVisible();
    await expect(sheet).not.toContainText("%");
    await sheet.getByRole("button", { name: "Close sheet" }).click();
    // The card says what is left beside its total, and no longer writes out the goal's range.
    await expect(page.getByText(/^[\d,.]+ left$|^Goal met$|^[\d,.]+ over$/)).toBeVisible();
    await expect(page.getByText(/Goal [\d,]+–/)).toHaveCount(0);
  });
  await check(
    "the Food tab agrees with the database, and a meal's page keeps it selected",
    async () => {
      const [{ kcal }] =
        await sql`select coalesce(sum(round(kcal * amount / portion_amount, 1)), 0)::float8 as kcal
      from food_entries where user_id=${user.id} and eaten_on = (
        select (now() at time zone time_zone)::date from profiles where id=${user.id})`;
      const total = kcal.toLocaleString("en-GB", { maximumFractionDigits: 1 });
      await tab("Food").click();
      await expect(page.getByText(`${total} / 2,400 kcal`, { exact: false })).toBeVisible();
      await page.getByRole("link", { name: /^Lunch/ }).click();
      await page.waitForURL("**/food/lunch");
      await expect(selectedTab()).toHaveText("Food");
      await page.getByRole("link", { name: "Back to Food" }).click();
      await page.waitForURL(/\/food$/);
    },
  );
  await check(
    "History is a section of Progress, and the old paths land where they went",
    async () => {
      await navigate("/today/food/breakfast");
      expect(new URL(page.url()).pathname).toBe("/food/breakfast");
      await navigate("/today/food");
      expect(new URL(page.url()).pathname).toBe("/food");
      await navigate("/history?kind=workout");
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(
        "/progress/history?kind=workout",
      );
      await expect(selectedTab()).toHaveText("Progress");
      await expect(page.getByRole("heading", { name: "Progress", exact: true })).toBeVisible();
      // The picker names the section; the filters beside it keep the kind from the old link.
      await expect(page.getByRole("button", { name: "Progress section: History" })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Filters/ })).toContainText("1");
      await page.getByRole("button", { name: "Progress section: History" }).click();
      await dialog().getByRole("link", { name: "Strength", exact: true }).click();
      await page.waitForURL("**/progress?kind=workout&view=strength");
      await expect(page.getByRole("button", { name: "Progress section: Strength" })).toBeVisible();
      // From the Progress page, History is loaded whole while the list is open, so choosing it
      // sends no request of its own.
      await tab("Today").click();
      await page.waitForURL(/\/today$/);
      await tab("Progress").click();
      await page.waitForURL(/\/progress$/);
      // The whole page arrives as one request without Next's prefetch header, after the one
      // for its route that carries it.
      const prefetched = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === "/progress/history" &&
          url.searchParams.has("_rsc") &&
          !response.request().headers()["next-router-prefetch"]
        );
      });
      await page.getByRole("button", { name: "Progress section: Overview" }).click();
      await prefetched;
      const requests = [];
      const record = (request) => {
        if (new URL(request.url()).pathname === "/progress/history") requests.push(request.url());
      };
      page.on("request", record);
      // Timed from the tap, once the sheet has risen: Playwright waits for moving targets.
      await settle();
      const started = Date.now();
      await dialog().getByRole("link", { name: "History", exact: true }).click();
      await expect(page.getByRole("button", { name: "Progress section: History" })).toBeVisible();
      const elapsed = Date.now() - started;
      page.off("request", record);
      expect(new URL(page.url()).pathname).toBe("/progress/history");
      expect(requests).toEqual([]);
      await expect(page.getByRole("status").filter({ hasText: /entr(y|ies)$/ })).toBeVisible();
      console.log(`  History from Progress's picker: ${elapsed} ms, no request`);
      // In Progress's place, as a section chosen in place is: Back leaves the tab.
      await settleRequests();
      await page.goBack();
      await page.waitForURL(/\/today$/);
    },
  );
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
        await settle();
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
          ),
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
          ["new-food", () => newFoodFrom("Granola"), "kcal", "Add to Breakfast"],
        ]) {
          await open();
          // The sheet rises and fades in; measure it once it has arrived.
          await settle();
          await dialog().getByLabel(field, { exact: true }).scrollIntoViewIfNeeded();
          await expect(dialog().getByLabel(field, { exact: true })).toBeInViewport();
          const primaryControl = dialog().getByRole("button", { name: primary, exact: true });
          if (height <= 320) {
            // A compact sheet must settle instead of switching layouts every frame.
            // WebKit previously moved this button hundreds of pixels while idle.
            const positions = await primaryControl.evaluate(async (element) => {
              const frames = [];
              for (let frame = 0; frame < 12; frame++) {
                await new Promise(requestAnimationFrame);
                const { x, y, width, height } = element.getBoundingClientRect();
                frames.push({ x, y, width, height });
              }
              return frames;
            });
            for (const dimension of ["x", "y", "width", "height"]) {
              const values = positions.map((position) => position[dimension]);
              expect(
                Math.max(...values) - Math.min(...values),
                `${name} ${primary}: stable ${dimension} at ${width}×${height}, ${font}px ${scheme}`,
              ).toBeLessThanOrEqual(1);
            }
          }
          await primaryControl.scrollIntoViewIfNeeded();
          await expect(primaryControl).toBeInViewport();
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
          await page.getByRole("searchbox").fill("");
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => (document.documentElement.style.fontSize = "16px"));
    for (const [path, name] of [
      ["/food", "food"],
      ["/food/targets", "targets"],
      ["/food/my-foods", "my-foods"],
      ["/food/my-foods/meals/new", "new-meal"],
      ["/progress/history", "history"],
    ]) {
      await navigate(path);
      for (const scheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme: scheme });
        await settle();
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(
          axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
        ).toEqual([]);
        await page.screenshot({ path: `${dir}/${name}-390-844-${scheme}.png`, fullPage: true });
      }
    }
    // A macronutrient's breakdown, in both palettes, with Axe.
    await navigate("/food");
    await page.getByRole("button", { name: /^Protein:/ }).click();
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await settle();
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
      await page.screenshot({ path: `${dir}/protein-sheet-390-844-${scheme}.png` });
    }
    await dialog().getByRole("button", { name: "Close sheet" }).click();
    // Progress's picker, with History among its sections.
    await navigate("/progress");
    await page.getByRole("button", { name: "Progress section: Overview" }).click();
    await settle();
    await page.screenshot({ path: `${dir}/progress-sections-390-844-dark.png` });
    await dialog().getByRole("button", { name: "Close sheet" }).click();
  });
  await check(
    "missing body weight, profile changes, over-budget targets and isolation",
    async () => {
      // The established personas now have 56 months of food and weight. Keep their
      // records intact while giving this scenario an actually empty second account.
      secondaryId = randomUUID();
      const username = `food${Date.now().toString(36)}${engine === "webkit" ? "w" : "c"}`;
      const salt = randomBytes(16).toString("hex");
      const password = `${salt}:${scryptSync("password123", salt, 32).toString("hex")}`;
      await sql`insert into auth.users (id, email, raw_user_meta_data, encrypted_password)
        values (${secondaryId}, ${`${username}@local.test`},
          ${sql.json({ username, display_name: "Food audit second account" })}, ${password})`;
      await sql`update profiles set onboarded_at=now() where id=${secondaryId}`;
      await login(username);
      await navigate("/food/breakfast");
      // Another account's foods are nobody else's.
      await expect(myFoods().getByRole("button", { name: /^Oats/ })).toHaveCount(0);
      await navigate("/food/targets");
      await page.getByLabel("Daily target, kcal").fill("2400");
      await expect(page.getByText(/There is no body weight/)).toBeVisible();
      await page.getByRole("button", { name: "Set target", exact: true }).click();
      await page.waitForURL(/\/food$/);
      await expect(
        page.getByRole("link", {
          name: /^Targets\s*Add your body weight for protein\s*2,400 kcal$/,
        }),
      ).toBeVisible();
      await navigate("/food/targets");
      await page.getByRole("link", { name: "Add it in your profile" }).click();
      await page.getByLabel("Body weight (kg)", { exact: true }).fill("80");
      await page.getByLabel("Height (cm)", { exact: true }).fill("180");
      await page.locator('[name="dateOfBirth"]').fill("1990-01-01");
      await page.getByLabel("Training goal", { exact: true }).selectOption("get_stronger");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Profile saved", { exact: true })).toHaveCount(1);
      await navigate("/food/targets");
      // The profile's goal is the one line Targets shows of it, and its split is offered.
      await expect(page.getByText("Get stronger", { exact: true })).toBeVisible();
      await expect(page.getByText("144 g at 80 kg", { exact: true })).toBeVisible();
      await page.getByLabel("Daily target, kcal").fill("500");
      await page.getByLabel("Protein, g per kg of body weight", { exact: true }).fill("4");
      await expect(page.getByText(/nothing left for carbs/)).toBeVisible();
      await page.getByRole("button", { name: "Save targets", exact: true }).click();
      await page.waitForURL(/\/food$/);
      await expect(
        page.getByRole("link", { name: /^Targets\s*Nothing left for carbs\s*500 kcal$/ }),
      ).toBeVisible();
      await settleRequests();
      await page.reload({ waitUntil: "networkidle" });
      await expect(
        page.getByRole("link", { name: /^Targets Nothing left for carbs/ }),
      ).toBeVisible();
      await navigate("/food/targets");
      await page.getByRole("button", { name: /^Use 55\s\/\s25\s\/\s20$/ }).click();
      // 20% of 500 kcal at 80 kg is 0.3 g/kg, kept to the bound of 0.5.
      await expect(page.getByLabel("Protein, g per kg of body weight")).toHaveValue("0.5");
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
        keys.some((k) =>
          ["/today", "/food", "/progress", "/api/", "/profile"].some((path) => k.startsWith(path)),
        ),
      ).toBe(false);
      if (engine === "chromium") {
        await settleRequests();
        await page.waitForLoadState("networkidle");
        await context.setOffline(true);
        await navigate("/food");
        await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
        await context.setOffline(false);
        await page.getByRole("link", { name: "Try again" }).click();
        await expect(tab("Food")).toBeVisible();
      } else await offlineNavigation();
    }
  });
  expect(pageErrors).toEqual([]);
} finally {
  await context?.setOffline(false);
  await browser.close();
  if (secondaryId) await sql`delete from auth.users where id=${secondaryId}`;
  await sql.end();
  await writeFile(`${dir}/results.json`, JSON.stringify({ results, pageErrors }, null, 2));
}
