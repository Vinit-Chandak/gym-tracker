// Profile flows against the dedicated local audit database, with the production PWA running.
// Start it with scripts/dev/audit.mjs; no hosted account or data is accepted here.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import { devices, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { launch, skipDevice, skippedDevices } from "./audit-engines.mjs";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3104";
const database =
  process.env.AUDIT_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_profile_20261023";
const dbTarget = new URL(database);
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(dbTarget.hostname) ||
  dbTarget.search ||
  dbTarget.hash ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(dbTarget.pathname)
)
  throw new Error("Local audit only.");
const output = process.env.AUDIT_OUTPUT_DIR ?? "output/profile-audit-20261023/browser";
await mkdir(output, { recursive: true });
const sql = postgres(database, { max: 2 });
// Resume completed checks; list any affected steps in AUDIT_RECHECK after changing app code.
const previous =
  process.env.AUDIT_RESUME === "true"
    ? JSON.parse(await readFile(`${output}/results.json`, "utf8"))
    : null;
const recheck = (process.env.AUDIT_RECHECK ?? "").split(",");
const results =
  previous?.results.filter((result) => result.passed && !recheck.includes(result.name)) ?? [];
const runtimeErrors = [];
const a11y = previous?.accessibility ?? [];
const routes = [
  "/profile",
  "/profile/edit",
  "/profile/sports",
  "/profile/heart-rate",
  "/profile/units",
  "/profile/privacy",
  "/profile/password",
  "/profile/delete-account",
  "/profile/ai-coach",
  "/profile/coach",
  "/profile/friends",
  "/profile/friends/people",
  "/profile/friends/find",
  "/profile/friends/leaderboard",
  "/profile/friends/compare",
  "/gyms",
  "/exercises",
];
const button = (page, name) => page.getByRole("button", { name, exact: true });

// Playwright 1.63's WebKit offline flag rejects even responses served entirely by a worker
// (https://github.com/microsoft/playwright/issues/42775). A loopback proxy provides a real
// failed connection for that engine without changing the app or stopping its server.
async function localOutageProxy() {
  let unavailable = false;
  const server = createServer((incoming, outgoing) => {
    if (unavailable) return incoming.destroy();
    const upstream = request(
      new URL(incoming.url, baseURL),
      { method: incoming.method, headers: incoming.headers },
      (response) => {
        outgoing.writeHead(response.statusCode, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on("error", () => outgoing.destroy());
    incoming.pipe(upstream);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://localhost:${server.address().port}`,
    setUnavailable(value) {
      unavailable = value;
      if (value) server.closeAllConnections();
    },
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}

async function choose(page, name, value) {
  const input = page.locator(`input[name="${name}"][value="${value}"]`);
  await input.locator("..").click();
  await expect(input).toBeChecked();
}
async function go(page, route) {
  await page.waitForLoadState("networkidle");
  const response = await page.goto(route, { waitUntil: "networkidle" });
  assert.ok(response?.ok(), `${route}: HTTP ${response?.status()}`);
  await expect(page.locator("main h1")).toBeVisible();
}
async function width(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.content <= dimensions.viewport + 1,
    `Overflow: ${JSON.stringify(dimensions)}`,
  );
}
async function openSettings(page) {
  const settings = page
    .locator("details")
    .filter({ has: page.getByText("Settings", { exact: true }) });
  if ((await settings.getAttribute("open")) === null) await settings.locator("summary").click();
}
async function login(page) {
  await go(page, "/login");
  await page.getByLabel("Email", { exact: true }).fill("sam@local.test");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await button(page, "Sign in").click();
  await page.waitForURL(/\/today$/);
  await page.waitForLoadState("networkidle");
}
async function run(device, engine) {
  const browser = await launch(engine);
  const context = await browser.newContext({
    ...devices[device],
    baseURL,
    timezoneId: "Asia/Kolkata",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) =>
    runtimeErrors.push({ device, url: page.url(), error: error.message }),
  );
  async function step(name, work) {
    if (results.some((result) => result.device === device && result.name === name && result.passed))
      return;
    try {
      await work();
      await width(page);
      results.push({ device, name, passed: true });
      console.log(`PASS ${device}: ${name}`);
    } catch (error) {
      results.push({
        device,
        name,
        passed: false,
        error: error.stack,
        url: page.url(),
        text: await page
          .locator("body")
          .innerText()
          .catch(() => ""),
      });
      await page
        .screenshot({ path: `${output}/${engine}-${name}-failed.png`, fullPage: true })
        .catch(() => {});
      console.error(`FAIL ${device}: ${name}: ${error.message}`);
      throw error;
    }
  }
  try {
    await login(page);
    await step("screens-accessibility", async () => {
      for (const route of routes) {
        await go(page, route);
        await width(page);
        const report = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        a11y.push({
          device,
          route,
          violations: report.violations.map(({ id, impact, nodes }) => ({
            id,
            impact,
            nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
          })),
        });
        assert.equal(
          report.violations.length,
          0,
          `${route}: ${report.violations.map((v) => v.id).join(", ")}`,
        );
      }
    });
    await step("profile-errors-correction-save", async () => {
      await go(page, "/profile/units");
      await choose(page, "preferredUnit", "kg");
      await button(page, "Save").click();
      await expect(page.getByText("Units and time zone saved", { exact: true })).toBeVisible();
      await go(page, "/profile/edit");
      await page.getByLabel("Name", { exact: true }).fill("");
      await page.getByLabel("Height (cm)", { exact: true }).fill("");
      await page.getByLabel("Date of birth", { exact: true }).fill("");
      await button(page, "Save").click();
      await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(page.getByLabel("Height (cm)", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
      await page.getByLabel("Name", { exact: true }).fill("Sam Profile Audit");
      await page.getByLabel("Height (cm)", { exact: true }).fill("30");
      await expect(page.getByLabel("Height (cm)", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await page.getByLabel("Height (cm)", { exact: true }).fill("178,5");
      await expect(page.getByLabel("Height (cm)", { exact: true })).not.toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await page.getByLabel("Date of birth", { exact: true }).fill("1994-03-21");
      await page.getByLabel("Training goal", { exact: true }).selectOption("get_stronger");
      await choose(page, "sex", "");
      await page.getByLabel("Username", { exact: true }).fill("priya");
      await expect(page.getByText("That username is taken.", { exact: true })).toBeVisible();
      await button(page, "Save").click();
      await expect(page.getByLabel("Username", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Sam Profile Audit");
      await page.getByLabel("Username", { exact: true }).fill("sam");
      await button(page, "Save").click();
      await expect(page.getByText("Profile saved", { exact: true })).toBeVisible();
      const [stored] =
        await sql`select display_name, height_cm, sex, training_goal from profiles where username='sam'`;
      assert.equal(stored.display_name, "Sam Profile Audit");
      assert.equal(Number(stored.height_cm), 178.5);
      assert.equal(stored.sex, null);
      assert.equal(stored.training_goal, "get_stronger");
      await page.getByLabel("Name", { exact: true }).fill("Sam Unsubmitted");
      await expect(page.getByText("Profile saved", { exact: true })).toHaveCount(0);
      await go(page, "/profile");
      await expect(page.locator("h1")).toContainText("Sam Profile Audit");
      await page.getByRole("link", { name: "Edit profile", exact: true }).click();
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Sam Profile Audit");
    });
    await step("pending-save-locks-inputs", async () => {
      await go(page, "/profile/edit");
      await page.getByLabel("Name", { exact: true }).fill("Sam Profile Audit");
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      const holdAction = async (route) => {
        if (route.request().method() === "POST") await held;
        await route.continue();
      };
      await page.route("**/profile/edit", holdAction);
      try {
        await button(page, "Save").click();
        await expect(button(page, "Saving…")).toBeDisabled();
        await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
      } finally {
        release();
      }
      await expect(page.getByText("Profile saved", { exact: true })).toBeVisible();
      await page.unroute("**/profile/edit", holdAction);
    });
    await step("offline-profile-retry", async () => {
      await go(page, "/profile/edit");
      await page.getByLabel("Name", { exact: true }).fill("Sam Offline Retry");
      await page.waitForLoadState("networkidle");
      await context.setOffline(true);
      await button(page, "Save").click();
      await expect(page.getByRole("alert").filter({ hasText: "Connection lost" })).toBeVisible();
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Sam Offline Retry");
      const [before] = await sql`select display_name from profiles where username='sam'`;
      assert.equal(before.display_name, "Sam Profile Audit");
      await context.setOffline(false);
      await button(page, "Retry").click();
      await expect(page.getByText("Profile saved", { exact: true })).toBeVisible();
    });
    await step("sports-empty-success-offline", async () => {
      await go(page, "/profile/sports");
      for (const sport of ["Strength", "Running", "Cycling", "Swimming"]) {
        const box = page.getByRole("checkbox", { name: sport, exact: true });
        if ((await box.getAttribute("aria-checked")) === "true") await box.click();
      }
      await button(page, "Save").click();
      await expect(page.getByText("Choose at least one sport.", { exact: true })).toBeVisible();
      await page.getByRole("checkbox", { name: "Running", exact: true }).click();
      await page.getByRole("checkbox", { name: "Swimming", exact: true }).click();
      await button(page, "Retry").click();
      await expect(page.getByText("Sports saved", { exact: true })).toBeVisible();
      await page.getByRole("checkbox", { name: "Cycling", exact: true }).click();
      await expect(page.getByText("Sports saved", { exact: true })).toHaveCount(0);
      await page.waitForLoadState("networkidle");
      await context.setOffline(true);
      await button(page, "Save").click();
      await expect(page.getByRole("alert").filter({ hasText: "Connection lost" })).toBeVisible();
      await expect(page.getByRole("checkbox", { name: "Cycling", exact: true })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await context.setOffline(false);
      await button(page, "Retry").click();
      await expect(page.getByText("Sports saved", { exact: true })).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByRole("checkbox", { name: "Swimming", exact: true })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    });
    await step("units-imperial-and-height-validation", async () => {
      await go(page, "/profile/units");
      await choose(page, "preferredUnit", "lb");
      await choose(page, "distanceUnit", "km");
      await choose(page, "poolUnit", "m");
      await page.getByLabel("Time zone", { exact: true }).selectOption("Asia/Kolkata");
      await button(page, "Save").click();
      await expect(page.getByText("Units and time zone saved", { exact: true })).toBeVisible();
      await choose(page, "distanceUnit", "mi");
      await expect(page.getByText("Units and time zone saved", { exact: true })).toHaveCount(0);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator('input[name="distanceUnit"][value="km"]')).toBeChecked();
      await go(page, "/profile/edit");
      await page.getByLabel("Feet", { exact: true }).fill("5.5");
      await page.getByLabel("Inches", { exact: true }).fill("12");
      await button(page, "Save").click();
      await expect(page.getByLabel("Feet", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(page.getByLabel("Inches", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await page.getByLabel("Feet", { exact: true }).fill("5");
      await page.getByLabel("Inches", { exact: true }).fill("10.5");
      await button(page, "Save").click();
      await expect(page.getByText("Profile saved", { exact: true })).toBeVisible();
      const [stored] =
        await sql`select height_cm, preferred_unit, distance_unit, pool_unit, time_zone from profiles where username='sam'`;
      assert.equal(Number(stored.height_cm), 179.1);
      assert.equal(stored.preferred_unit, "lb");
      assert.equal(stored.distance_unit, "km");
      assert.equal(stored.pool_unit, "m");
      assert.equal(stored.time_zone, "Asia/Kolkata");
    });
    await step("heart-rate-custom-errors-persistence", async () => {
      await go(page, "/profile/heart-rate");
      await openSettings(page);
      await page.getByRole("textbox", { name: "Maximum heart rate", exact: true }).fill("190");
      await page.getByLabel("Resting heart rate", { exact: true }).fill("55");
      await choose(page, "zoneMethod", "custom");
      for (const [i, value] of [105, 120, 135, 150, 170].entries())
        await page.getByLabel(`Zone ${i + 1}`, { exact: true }).fill(String(value));
      await choose(page, "zoneMethod", "max");
      await choose(page, "zoneMethod", "custom");
      await expect(page.getByLabel("Zone 1", { exact: true })).toHaveValue("105");
      await page.getByLabel("Zone 3", { exact: true }).fill("");
      await button(page, "Save").click();
      await expect(page.getByLabel("Zone 3", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(page.getByLabel("Zone 1", { exact: true })).not.toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await page.getByLabel("Zone 3", { exact: true }).fill("135");
      await expect(page.getByLabel("Zone 3", { exact: true })).not.toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await button(page, "Save").click();
      await expect(page.getByText("Heart rate zones saved", { exact: true })).toBeVisible();
      const [stored] =
        await sql`select max_heart_rate, heart_rate_zone_floors from profiles where username='sam'`;
      assert.equal(stored.max_heart_rate, 190);
      assert.deepEqual(stored.heart_rate_zone_floors, [105, 120, 135, 150, 170]);
      await page.getByRole("switch", { name: "Raise it from my runs", exact: true }).click();
      await expect(page.getByText("Heart rate zones saved", { exact: true })).toHaveCount(0);
      await page.reload({ waitUntil: "networkidle" });
      await openSettings(page);
      await expect(page.getByLabel("Zone 3", { exact: true })).toHaveValue("135");
    });
    await step("rest-timer-and-privacy-rollback", async () => {
      for (const [route, label] of [
        ["/profile", "Rest timer"],
        ["/profile/privacy", "Share training with followers"],
        ["/profile/ai-coach", "AI coach"],
      ]) {
        await go(page, route);
        const control = page.getByRole("switch", { name: label, exact: true });
        const original = await control.getAttribute("aria-checked");
        await context.setOffline(true);
        await control.click();
        await expect(page.getByRole("alert").filter({ hasText: "Could not save" })).toBeVisible();
        await expect(control).toHaveAttribute("aria-checked", original);
        await context.setOffline(false);
        await control.click();
        if (label === "AI coach" && original === "false") {
          // This seeded account has no completed coach intake: enabling starts setup.
          await page.waitForURL(/\/plan\/new$/);
          await expect(page.locator("h1")).toHaveText("New programme");
          continue;
        }
        await expect(control).toBeEnabled();
        await page.reload({ waitUntil: "networkidle" });
        await expect(control).toHaveAttribute(
          "aria-checked",
          original === "true" ? "false" : "true",
        );
      }
    });
    await step("coach-note-and-token", async () => {
      await go(page, "/profile/ai-coach");
      const note = `Profile audit ${engine} ${Date.now()}`;
      await page
        .getByRole("textbox", { name: "Notes for every programme", exact: true })
        .fill(note);
      await button(page, "Send").click();
      await expect(page.getByText("Note sent.", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Notes for every programme", exact: true }),
      ).toHaveValue("");
      await go(page, "/profile/coach");
      await page.getByLabel("Name", { exact: true }).fill(`Profile audit ${engine}`);
      await page.getByLabel("Expires after", { exact: true }).selectOption("30");
      await button(page, "Create token").click();
      await expect(page.getByRole("textbox", { name: "New coach token" })).toBeVisible();
      const token = await page.getByRole("textbox", { name: "New coach token" }).inputValue();
      assert.ok(token.length > 20);
      await button(page, "Hide token").click();
      await expect(page.getByRole("textbox", { name: "New coach token" })).toHaveCount(0);
      const row = page
        .locator("li")
        .filter({ hasText: `Profile audit ${engine}` })
        .last();
      await row.getByRole("button", { name: "Revoke", exact: true }).click();
      await expect(row.getByText("Revoked", { exact: true })).toBeVisible();
    });
    await step("password-validation-and-offline", async () => {
      await go(page, "/profile/password");
      const password = page.getByLabel("New password", { exact: true });
      const confirmation = page.getByLabel("Confirm new password", { exact: true });
      await password.fill("short");
      await confirmation.fill("short");
      await button(page, "Save password").click();
      await expect(password).toHaveAttribute("aria-invalid", "true");
      await password.fill("x".repeat(73));
      await confirmation.fill("x".repeat(73));
      await button(page, "Save password").click();
      await expect(
        page.getByText("Passwords are limited to 72 characters.", { exact: true }),
      ).toBeVisible();
      await password.fill("UnsubmittedPassword123!");
      await confirmation.fill("DifferentPassword123!");
      await button(page, "Save password").click();
      await expect(confirmation).toHaveAttribute("aria-invalid", "true");
      await confirmation.fill("UnsubmittedPassword123!");
      await expect(confirmation).not.toHaveAttribute("aria-invalid", "true");
      await page.waitForLoadState("networkidle");
      await context.setOffline(true);
      try {
        await button(page, "Save password").click();
        await expect(page.getByRole("alert").filter({ hasText: "Connection lost" })).toBeVisible();
        await expect(password).toHaveValue("UnsubmittedPassword123!");
        await expect(confirmation).toHaveValue("UnsubmittedPassword123!");
      } finally {
        await context.setOffline(false);
      }
    });
    await step("delete-confirmation-and-offline", async () => {
      await go(page, "/profile/delete-account");
      const confirmation = page.getByLabel("Type DELETE to confirm", { exact: true });
      const remove = button(page, "Delete everything");
      await expect(remove).toBeDisabled();
      await confirmation.fill("delete");
      await expect(remove).toBeDisabled();
      await confirmation.fill("DELETE");
      await expect(remove).toBeEnabled();
      await context.setOffline(true);
      try {
        await remove.click();
        await expect(page.getByRole("alert").filter({ hasText: "Connection lost" })).toBeVisible();
        await expect(confirmation).toHaveValue("DELETE");
        const [stored] = await sql`select id from profiles where username='sam'`;
        assert.ok(stored);
      } finally {
        await context.setOffline(false);
      }
    });
    await step("coach-note-and-token-offline", async () => {
      await go(page, "/profile/ai-coach");
      await expect(button(page, "Send")).toBeDisabled();
      const note = page.getByRole("textbox", { name: "Notes for every programme", exact: true });
      await note.fill("Keep this unsent note on the device.");
      await context.setOffline(true);
      try {
        await button(page, "Send").click();
        await expect(page.getByRole("alert").filter({ hasText: "Connection lost" })).toBeVisible();
        await expect(note).toHaveValue("Keep this unsent note on the device.");
      } finally {
        await context.setOffline(false);
      }
      await go(page, "/profile/coach");
      const name = page.getByLabel("Name", { exact: true });
      await name.fill("   ");
      await button(page, "Create token").click();
      await expect(page.getByRole("alert").filter({ hasText: "Enter a name" })).toBeVisible();
      await name.fill("Unsubmitted offline token");
      await page.getByLabel("Expires after", { exact: true }).selectOption("365");
      await context.setOffline(true);
      try {
        await button(page, "Create token").click();
        await expect(page.getByRole("alert").filter({ hasText: "Connection lost" })).toBeVisible();
        await expect(name).toHaveValue("Unsubmitted offline token");
        await expect(page.getByLabel("Expires after", { exact: true })).toHaveValue("365");
        await expect(page.getByRole("textbox", { name: "New coach token" })).toHaveCount(0);
      } finally {
        await context.setOffline(false);
      }
    });
    await step("exercise-library-search-and-create", async () => {
      await go(page, "/exercises");
      const name = `Profile audit ${engine} ${Date.now()}`;
      await page.getByRole("searchbox", { name: "Search exercises" }).fill(name);
      await expect(page.getByText(`No exercises match “${name}”.`, { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Add your own exercise", exact: true }).click();
      await expect(page.locator("h1")).toHaveText("New exercise");
      await page.getByLabel("Exercise name", { exact: true }).fill(name);
      await page.getByLabel("Category", { exact: true }).selectOption("strength");
      await page.getByLabel("Equipment / movement type", { exact: true }).selectOption("machine");
      await page.getByLabel("How is one set measured?", { exact: true }).selectOption("reps");
      await button(page, "Save exercise").click();
      await expect(page.getByLabel("Machine", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await page
        .getByLabel("Equipment / movement type", { exact: true })
        .selectOption("bodyweight");
      await expect(page.getByLabel("Machine", { exact: true })).not.toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await page
        .getByLabel("Form notes", { exact: true })
        .fill("Created by the local profile audit.");
      await button(page, "Save exercise").click();
      await page.waitForURL(/\/exercises\/[a-f0-9-]{36}$/);
      await expect(page.locator("h1")).toHaveText(name);
      await go(page, "/exercises");
      await page.getByRole("searchbox", { name: "Search exercises" }).fill(name);
      await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    });
    await step("appearance-install-sheets", async () => {
      await go(page, "/profile");
      await page.getByRole("button", { name: /^Appearance:/ }).click();
      await expect(page.getByRole("dialog", { name: "Appearance" })).toBeVisible();
      await page.getByRole("radio", { name: "Dark", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Appearance" })).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: "Appearance: Dark", exact: true }),
      ).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await expect(
        page.getByRole("button", { name: "Appearance: Dark", exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: `${output}/${engine}-profile-dark.png`, fullPage: true });
      await page.getByRole("button", { name: /^Appearance:/ }).click();
      await page.getByRole("radio", { name: "Light", exact: true }).click();
      // A fresh headless context has no install prompt; the platform-specific sheet is the fallback.
      await button(page, "Install Overload").click();
      const sheet = page.getByRole("dialog", { name: "Install Overload" });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(engine === "webkit" ? "iPhone and iPad" : "Android");
      await page.keyboard.press("Escape");
      await expect(sheet).not.toBeVisible();
    });
    await step("narrow-large-text-and-desktop", async () => {
      for (const [viewport, textSize] of [
        [{ width: 320, height: 740 }, "16px"],
        [{ width: 320, height: 740 }, "32px"],
        [{ width: 1280, height: 900 }, "16px"],
      ]) {
        await page.setViewportSize(viewport);
        for (const route of [
          "/profile",
          "/profile/edit",
          "/profile/units",
          "/profile/sports",
          "/profile/heart-rate",
          "/profile/privacy",
          "/profile/password",
          "/profile/delete-account",
        ]) {
          await go(page, route);
          await page.evaluate((size) => (document.documentElement.style.fontSize = size), textSize);
          if (route === "/profile/heart-rate") await openSettings(page);
          await width(page);
          await page.screenshot({
            path: `${output}/${engine}-${route.split("/").at(-1)}-${viewport.width}-${textSize}.png`,
            fullPage: true,
          });
        }
      }
    });
    await step("large-text-controls-reachable", async () => {
      await page.setViewportSize({ width: 320, height: 740 });
      for (const route of [
        "/profile",
        "/profile/edit",
        "/profile/units",
        "/profile/sports",
        "/profile/heart-rate",
        "/profile/privacy",
        "/profile/password",
        "/profile/delete-account",
      ]) {
        await go(page, route);
        await page.evaluate(() => (document.documentElement.style.fontSize = "32px"));
        if (route === "/profile/heart-rate") await openSettings(page);
        const target =
          route === "/profile"
            ? page.getByRole("link", { name: "Delete account", exact: true })
            : route === "/profile/sports"
              ? page.getByRole("checkbox", { name: "Swimming", exact: true })
              : route === "/profile/privacy"
                ? page.getByRole("switch").last()
                : page
                    .locator(
                      'main form input:visible:not([type="hidden"]):not([type="radio"]), main form select:visible, main form textarea:visible',
                    )
                    .last();
        await target.evaluate((element) => element.scrollIntoView({ block: "center" }));
        await expect(target).toBeInViewport();
        assert.ok(
          await target.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            );
            return element === hit || element.contains(hit);
          }),
          `${route}: last control is covered by the fixed navigation or save actions`,
        );
        await page.screenshot({
          path: `${output}/${engine}-${route.split("/").at(-1)}-large-text-last-control.png`,
        });
      }
    });
    await step("pwa-offline-cache-and-recovery", async () => {
      const proxy = engine === "webkit" ? await localOutageProxy() : null;
      const pwaContext = proxy
        ? await browser.newContext({
            ...devices[device],
            baseURL: proxy.url,
            storageState: await context.storageState(),
          })
        : context;
      const pwaPage = proxy ? await pwaContext.newPage() : page;
      if (proxy)
        pwaPage.on("pageerror", (error) =>
          runtimeErrors.push({ device, url: pwaPage.url(), error: error.message }),
        );
      try {
        await go(pwaPage, "/profile");
        const manifestResponse = await pwaContext.request.get("/manifest.webmanifest");
        const manifest = await manifestResponse.json();
        assert.equal(manifest.display, "standalone");
        for (const icon of manifest.icons)
          assert.equal((await pwaContext.request.get(icon.src)).status(), 200);
        await pwaPage.evaluate(async () => {
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Service worker did not become ready")), 10_000),
            ),
          ]);
        });
        await pwaPage.reload({ waitUntil: "networkidle" });
        assert.ok(await pwaPage.evaluate(() => Boolean(navigator.serviceWorker.controller)));
        const cached = await pwaPage.evaluate(async () =>
          (
            await Promise.all(
              (await caches.keys()).map(async (name) =>
                (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname),
              ),
            )
          ).flat(),
        );
        assert.ok(
          !cached.some((path) => path.startsWith("/profile") || path.startsWith("/api")),
          "Private account pages must not be cached",
        );
        if (proxy) proxy.setUnavailable(true);
        else await pwaContext.setOffline(true);
        try {
          const fallback = await pwaPage.reload({ waitUntil: "domcontentloaded" });
          assert.equal(fallback?.status(), 200);
          await expect(pwaPage).toHaveTitle("Offline · Overload");
          await expect(
            pwaPage.getByRole("heading", { name: "You’re offline", exact: true }),
          ).toBeVisible();
          await expect(pwaPage.getByRole("link", { name: "Try again", exact: true })).toBeVisible();
          await pwaPage.screenshot({ path: `${output}/${engine}-offline.png`, fullPage: true });
        } finally {
          if (proxy) proxy.setUnavailable(false);
          else await pwaContext.setOffline(false);
        }
        await go(pwaPage, "/profile");
        await expect(
          pwaPage.getByRole("link", { name: "Edit profile", exact: true }),
        ).toBeVisible();
      } finally {
        if (proxy) {
          await pwaContext.close();
          await proxy.close();
        }
      }
    });
    await step("standalone-install-row-hidden", async () => {
      const installed = await browser.newContext({
        ...devices[device],
        baseURL,
        storageState: await context.storageState(),
      });
      await installed.addInitScript(() =>
        Object.defineProperty(navigator, "standalone", { get: () => true }),
      );
      const app = await installed.newPage();
      await go(app, "/profile");
      await expect(button(app, "Install Overload")).toHaveCount(0);
      await installed.close();
    });
  } finally {
    await context.setOffline(false).catch(() => {});
    await browser.close();
  }
}
try {
  for (const [device, engine] of [
    ["Pixel 7", "chromium"],
    ["iPhone 13", "webkit"],
  ]) {
    if (!skipDevice(device, engine)) await run(device, engine);
  }
  assert.equal(runtimeErrors.length, 0, JSON.stringify(runtimeErrors));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        results,
        runtimeErrors,
        accessibility: a11y,
        skipped: skippedDevices,
        pwaNetworkFailure: {
          chromium: "Browser offline emulation",
          webkit: "Local proxy disconnect; avoids Playwright issue 42775",
        },
      },
      null,
      2,
    ),
  );
}
