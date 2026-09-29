// Real production UI states omitted by the route sweep. Drafts belong only to disposable users.
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { devices, expect, webkit } from "@playwright/test";
import postgres from "postgres";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3102";
const database =
  process.env.AUDIT_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_20260929";
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(database).hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(new URL(database).pathname) ||
  new URL(database).search ||
  new URL(database).hash
)
  throw new Error("Local audit targets only.");
const root = process.env.DESIGN_OUTPUT_DIR ?? "output/design-revamp-iphone17-2026-09-30";
const folder = `${root}/states`;
const fixturePath = process.env.DESIGN_FIXTURES ?? "output/audit-2026-09-29/fixtures.json";
const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));
const owner = fixtures.people.find((person) => person.username === "vinit").id;
const gym = fixtures.gyms.find((item) => item.userId === owner).id;
const results = [];
const pageErrors = [];
const cleanup = [];
const created = [];
const sql = postgres(database, { max: 1 });
await mkdir(folder, { recursive: true });
const browser = await webkit.launch();
const device = { ...devices["iPhone 17"], viewport: { width: 402, height: 874 } };
const save = () => writeFile(`${folder}/manifest.json`, JSON.stringify(results, null, 2));

try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ ...device, baseURL, colorScheme: theme });
    // Set the same device-local preference used by the Appearance control, before first paint.
    await context.addInitScript((mode) => localStorage.setItem("overload:appearance", mode), theme);
    let page;
    async function visit(route) {
      if (page) await page.close();
      page = await context.newPage();
      const current = page;
      current.setDefaultTimeout(12_000);
      current.setDefaultNavigationTimeout(25_000);
      current.on("pageerror", (error) =>
        pageErrors.push({ theme, url: current.url(), error: error.message }),
      );
      return current.goto(route, { waitUntil: "networkidle" });
    }
    async function login(username) {
      if (page) await page.close();
      page = null;
      await context.clearCookies();
      await visit("/login");
      await page.getByLabel("Email", { exact: true }).fill(`${username}@local.test`);
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL("**/today");
      await page.waitForLoadState("networkidle");
    }
    async function capture(name, title, persona, work, notes = "") {
      const row = {
        name,
        title,
        theme,
        persona,
        route: null,
        screenshot: null,
        passed: false,
        notes,
      };
      try {
        await work();
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("status").filter({ hasText: /^Saving…$/ })).toHaveCount(0);
        await page.evaluate(async () => {
          await document.fonts.ready;
          window.scrollTo(0, 0);
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        await expect(page.locator("html")).toHaveAttribute("data-overload-mode", theme);
        row.route = new URL(page.url()).pathname + new URL(page.url()).search;
        row.screenshot = `states/${theme}-${name}.png`;
        await page.screenshot({ path: `${root}/${row.screenshot}`, animations: "disabled" });
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        if (height * device.deviceScaleFactor < 32000) {
          row.fullPageScreenshot = `states/${theme}-${name}-full.png`;
          await page.screenshot({
            path: `${root}/${row.fullPageScreenshot}`,
            fullPage: true,
            animations: "disabled",
          });
        } else row.notes += " Full-page image omitted because it exceeds the browser bitmap limit.";
        row.passed = true;
      } catch (error) {
        row.error = error.message;
        row.route = page.url();
      }
      results.push(row);
      console.log(`${theme} ${name}: ${row.passed ? "captured" : row.error}`);
      await save();
    }

    await login("vinit");
    await capture("onboarding-equipment", "Onboarding · Machines", "vinit", async () => {
      await visit(`/welcome/equipment?gym=${gym}`);
      await expect(page.getByRole("heading", { name: /^What does .* have\?$/ })).toBeVisible();
    });
    await capture("reset-password-form", "Choose a new password · Signed in", "vinit", async () => {
      await visit("/reset-password");
      await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    });
    await capture("app-not-found", "Application · Page not found", "vinit", async () => {
      const response = await visit("/design-reference-missing-page");
      expect(response.status()).toBe(404);
      await expect(page.getByText(/page could not be found|not found/i).first()).toBeVisible();
    });
    for (const suffix of ["", "/coaching", "/food", "/headers", "/icons", "/logging"]) {
      const route = `/preview${suffix}`;
      const response = await page.request.get(route);
      results.push({
        name: `existing-design-previews${suffix || "/today"}`,
        title: `Existing design preview · ${suffix.slice(1) || "Today"}`,
        category: "existing-design-previews",
        route,
        theme,
        persona: "vinit",
        screenshot: null,
        passed: null,
        available: false,
        status: response.status(),
        notes:
          "Unavailable on the production build: the preview layout deliberately calls notFound(). No prototype or mocked screenshot was substituted.",
      });
    }
    await save();

    const id = randomUUID();
    const username = `design${Date.now().toString(36)}${theme[0]}`;
    const salt = randomBytes(16).toString("hex");
    const password = `${salt}:${scryptSync("password123", salt, 32).toString("hex")}`;
    await sql`insert into auth.users (id, email, raw_user_meta_data, encrypted_password)
      values (${id}, ${`${username}@local.test`},
        ${sql.json({ username, display_name: "Design reference" })}, ${password})`;
    created.push(id);
    await sql`update profiles set onboarded_at=now(), body_weight_kg=75, height_cm=175,
      date_of_birth='1994-06-15', training_goal='get_stronger' where id=${id}`;
    await login(username);
    await capture(
      "intake-choose-track",
      "Programme creation · Choose a track",
      "disposable",
      async () => {
        await visit("/profile/programme/create");
        await expect(page.getByRole("heading", { name: "Which sounds like you?" })).toBeVisible();
      },
    );
    await capture(
      "intake-guided-brief",
      "Programme creation · Beginner brief",
      "disposable",
      async () => {
        await page.getByRole("button", { name: "Start here", exact: true }).click();
        await expect(page.getByRole("heading", { name: "About you", exact: true })).toBeVisible();
      },
      "Generation is disabled on this local stack; the saved intake UI is real.",
    );
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Set it up in detail", exact: true }).click();
    const steps = [
      ["you", "You"],
      ["week", "Your week"],
      ["training", "Your training"],
      ["reports", "Starting point"],
      ["review", "Review"],
    ];
    for (const [index, [key, title]] of steps.entries())
      await capture(
        `intake-${key}`,
        `Programme creation · ${title}`,
        "disposable",
        async () => {
          await page
            .getByRole("button", { name: `Step ${index + 1} of 5: ${title}`, exact: true })
            .click();
          await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        },
        "Draft saves belong only to a disposable local account; no programme is generated.",
      );
    await context.close();
    await sql`delete from auth.users where id=${id} and email=${`${username}@local.test`}`;
    cleanup.push({
      id,
      removed: (await sql`select id from auth.users where id=${id}`).length === 0,
    });
  }
} finally {
  await browser.close();
  for (const id of created) {
    await sql`delete from auth.users where id=${id}`;
    if (!cleanup.some((item) => item.id === id)) cleanup.push({ id, removed: true });
  }
  await sql.end();
  await save();
  await writeFile(
    `${folder}/capture-info.json`,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        baseURL,
        device: "iPhone 17 · WebKit emulation",
        viewport: device.viewport,
        deviceScaleFactor: device.deviceScaleFactor,
        textSize: 16,
        pageErrors,
        cleanup,
        note: "Real app UI in the production build. This is not a physical iPhone screenshot or native iOS chrome capture.",
      },
      null,
      2,
    ),
  );
}
if (results.some((row) => row.passed === false) || pageErrors.length) process.exitCode = 1;
