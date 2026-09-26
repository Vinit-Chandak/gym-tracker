// Real form submissions against the local production build; no hosted data or mocked saves.
import { chromium, webkit, devices, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import postgres from "postgres";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const database =
  process.env.AUDIT_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/overload_audit";
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(database).hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(new URL(database).pathname)
)
  throw new Error("Local audit only.");
const device = process.env.AUDIT_DEVICE ?? "android";
const browser = await (device === "iphone" ? webkit : chromium).launch();
const context = await browser.newContext({
  ...devices[device === "iphone" ? "iPhone 13" : "Pixel 7"],
  baseURL,
});
const page = await context.newPage();
page.setDefaultTimeout(12_000);
const sql = postgres(database, { max: 1 });
const results = [],
  pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
// Energy is not asked any more; `energy` is read below only to show that nothing writes it.
const metrics = {
  sleepHours: "Sleep",
  sleepQuality: "Sleep quality",
  fatigue: "Fatigue",
  soreness: "Soreness",
};
const full = { sleepHours: 7.25, sleepQuality: 4, fatigue: 2, soreness: 1 };
const path = () => new URL(page.url()).pathname;
const go = (route) => page.goto(route, { waitUntil: "networkidle" });
const choose = (name, value) =>
  page.locator(`input[name="${name}"][value="${value}"]`).locator("..").click();
async function check(name, work) {
  try {
    await work();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error.stack,
      url: page.url(),
      text: await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    });
    await page.screenshot({
      path: `output/flow-audit/recovery-${device}-failure.png`,
      fullPage: true,
    });
    throw error;
  } finally {
    await writeFile(`output/flow-audit/recovery-${device}.json`, JSON.stringify(results, null, 2));
  }
}
async function login(username) {
  await context.clearCookies();
  await go("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${username}@local.test`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}
async function start(username) {
  const [open] =
    await sql`select w.id from workout_sessions w join profiles p on p.id=w.user_id where p.username=${username} and w.completed_at is null`;
  if (open) return open.id;
  await go("/today");
  const adHoc = page.getByRole("button", { name: "Ad hoc session", exact: true });
  if (await adHoc.isVisible()) await adHoc.click();
  else {
    await page.getByRole("button", { name: "More options", exact: true }).click();
    await page.getByRole("button", { name: "Start an ad hoc session", exact: true }).click();
  }
  await page.waitForURL(/\/workouts\/[^/]+\/check-in$/);
  return path().split("/")[2];
}
async function submit(id, values) {
  await go(`/workouts/${id}/check-in`);
  for (const [field, value] of Object.entries(values)) {
    if (field === "sleepHours") await page.locator('[name="sleepHours"]').fill(String(value));
    else await choose(field, value);
  }
  await page.getByRole("button", { name: "Save and start", exact: true }).click();
  await page.waitForURL(`**/workouts/${id}`);
}
async function recovery() {
  await page.getByRole("link", { name: "Progress", exact: true }).click();
  await page.getByRole("button", { name: "Progress section: Overview" }).click();
  await page.getByRole("button", { name: "Recovery", exact: true }).click();
  await expect(page).toHaveURL(/view=recovery/);
}
async function metric(key) {
  await choose("recovery-metric", key);
  await expect(page.getByRole("radio", { name: metrics[key], exact: true })).toBeChecked();
}
async function values() {
  const details = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "View values" }) });
  if (!(await details.evaluate((element) => element.open)))
    await details.locator("summary").click();
  return page.getByRole("table").getByRole("cell");
}
async function dates(from, to) {
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByLabel("From", { exact: true }).fill(from);
  await page.getByLabel("To", { exact: true }).fill(to);
  await page.getByRole("button", { name: "Apply dates", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function finish(id) {
  await go(`/workouts/${id}/finish`);
  await page.getByRole("button", { name: "Finish session", exact: true }).click();
  await page.waitForURL(`**/workouts/${id}`);
}
await mkdir("output/flow-audit", { recursive: true });
try {
  await login("alex");
  const id = await start("alex");
  await check(
    "All four answers save through the check-in form before workout completion",
    async () => {
      await go(`/workouts/${id}/check-in`);
      await expect(page.locator('[name="energy"]')).toHaveCount(0);
      await submit(id, full);
      const [saved] =
        await sql`select sleep_hours, sleep_quality, energy, fatigue, soreness, completed_at from workout_sessions where id=${id}`;
      expect(saved).toMatchObject({
        sleep_hours: "7.25",
        sleep_quality: 4,
        energy: null,
        fatigue: 2,
        soreness: 1,
        completed_at: null,
      });
    },
  );
  await check(
    "Every metric shows the exact saved value in its graph and accessible table",
    async () => {
      await recovery();
      await expect(page.getByRole("radio", { name: "Energy", exact: true })).toHaveCount(0);
      for (const [key, value] of Object.entries(full)) {
        await metric(key);
        await expect(
          page.getByRole("img", { name: new RegExp(`^${metrics[key]},`) }),
        ).toBeVisible();
        await expect((await values()).first()).toHaveText(String(value));
      }
    },
  );
  await check(
    "Editing fatigue updates the same check-in without clearing the other answers",
    async () => {
      await submit(id, { fatigue: 4 });
      const [saved] =
        await sql`select sleep_hours, sleep_quality, energy, fatigue, soreness from workout_sessions where id=${id}`;
      expect(saved).toEqual({
        sleep_hours: "7.25",
        sleep_quality: 4,
        energy: null,
        fatigue: 4,
        soreness: 1,
      });
      await recovery();
      await metric("fatigue");
      await expect((await values()).first()).toHaveText("4");
    },
  );
  await check(
    "An energy answer given before the question was retired survives an edit",
    async () => {
      // Written the way the check-in wrote it while it still asked, then edited through the
      // form that no longer does.
      await sql`update workout_sessions set energy = 2 where id=${id}`;
      await submit(id, { soreness: 2 });
      const [saved] =
        await sql`select energy, fatigue, soreness from workout_sessions where id=${id}`;
      expect(saved).toEqual({ energy: 2, fatigue: 4, soreness: 2 });
      await recovery();
      await metric("fatigue");
    },
  );
  await check("Recovery selection survives refresh and Back from its source workout", async () => {
    const returnTo = page.url();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("radio", { name: "Fatigue", exact: true })).toBeChecked();
    await page.locator(`main a[href="/workouts/${id}"]`).click();
    await page.waitForURL(`**/workouts/${id}`);
    await page.getByRole("link", { name: /^Back/ }).click();
    await expect(page).toHaveURL(returnTo);
    await expect(page.getByRole("img", { name: /^Fatigue,/ })).toBeVisible();
  });
  await check("Completing the workout retains every check-in value and chart", async () => {
    await finish(id);
    const [saved] =
      await sql`select energy, fatigue, sleep_hours, completed_at from workout_sessions where id=${id}`;
    expect(saved.completed_at).not.toBeNull();
    expect(saved.energy).toBe(2);
    expect(saved.fatigue).toBe(4);
    expect(saved.sleep_hours).toBe("7.25");
    await recovery();
    await metric("fatigue");
    await expect((await values()).first()).toHaveText("4");
  });
  await check(
    "Date filters show an honest empty range and restore the selected metric",
    async () => {
      const current = new Date().toISOString().slice(0, 10);
      await dates("2020-01-01", "2020-01-01");
      await expect(page.getByText("No check-ins in this range")).toBeVisible();
      await expect(page.getByRole("button", { name: "Progress section: Recovery" })).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByText("No check-ins in this range")).toBeVisible();
      const from = new Date(Date.now() - 80 * 86_400_000).toISOString().slice(0, 10);
      await dates(from, current);
      await expect(page.getByRole("radio", { name: "Fatigue", exact: true })).toBeChecked();
      await expect(page.getByRole("img", { name: /^Fatigue,/ })).toBeVisible();
    },
  );
  await check(
    "Recovery fits mobile and narrow screens in both themes with accessible controls",
    async () => {
      const original = page.viewportSize();
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        for (const width of [original.width, 320]) {
          await page.setViewportSize({ width, height: original.height });
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(requestAnimationFrame);
            await Promise.all(
              document
                .getAnimations()
                .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
                .map((animation) => animation.finished.catch(() => {})),
            );
          });
          // ResizeObserver applies the SVG's new measured width on the next render.
          await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), {
              message: `${colorScheme} at ${width}px`,
              timeout: 3000,
            })
            .toBe(true);
          const violations = (await new AxeBuilder({ page }).analyze()).violations;
          await writeFile(
            `output/flow-audit/recovery-${device}-${colorScheme}-${width}-axe.json`,
            JSON.stringify(violations, null, 2),
          );
          expect(
            violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.length })),
            `${colorScheme} at ${width}px`,
          ).toEqual([]);
          await page.screenshot({
            path: `output/flow-audit/recovery-${device}-${colorScheme}-${width}.png`,
            fullPage: true,
          });
        }
      }
      await page.setViewportSize(original);
    },
  );
  await login("sam");
  const [gym] =
    await sql`select g.id from gyms g join profiles p on p.id=g.user_id where p.username='sam' and g.is_active limit 1`;
  if (!gym) {
    await go("/gyms/new");
    await page.getByLabel("Name", { exact: true }).fill("Recovery audit gym");
    await page.getByRole("button", { name: "Create gym", exact: true }).click();
    await page.waitForURL(
      (url) => /^\/gyms\/[^/]+$/.test(url.pathname) && url.pathname !== "/gyms/new",
    );
  }
  const partialId = await start("sam");
  await check(
    "A fatigue-only check-in leaves optional answers null and opens a populated graph",
    async () => {
      await submit(partialId, { fatigue: 4 });
      const [saved] =
        await sql`select sleep_hours, sleep_quality, energy, fatigue, soreness from workout_sessions where id=${partialId}`;
      expect(saved).toEqual({
        sleep_hours: null,
        sleep_quality: null,
        energy: null,
        fatigue: 4,
        soreness: null,
      });
      await recovery();
      await expect(page.getByRole("radio", { name: "Fatigue", exact: true })).toBeChecked();
      await expect(page.getByRole("img", { name: /^Fatigue,/ })).toBeVisible();
    },
  );
  await check(
    "Switching from unanswered sleep back to fatigue draws the graph, including after reload",
    async () => {
      await metric("sleepHours");
      await expect(page.getByText(/Sleep was not recorded/)).toBeVisible();
      await metric("fatigue");
      await expect(page.getByRole("img", { name: /^Fatigue,/ })).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByRole("img", { name: /^Fatigue,/ })).toBeVisible();
      expect(await (await values()).allTextContents()).not.toContain("0");
    },
  );
  await check("Invalid hours cannot erase a previously saved fatigue reading", async () => {
    await go(`/workouts/${partialId}/check-in`);
    await page.locator('[name="sleepHours"]').fill("25");
    await page.getByRole("button", { name: "Save and start", exact: true }).click();
    await expect(page.getByText("Enter a value from 0 to 24.")).toBeVisible();
    expect(
      (await sql`select sleep_hours, fatigue from workout_sessions where id=${partialId}`)[0],
    ).toEqual({ sleep_hours: null, fatigue: 4 });
    await page.locator('[name="sleepHours"]').fill("");
    await page.getByRole("button", { name: "Save and start", exact: true }).click();
    await page.waitForURL(`**/workouts/${partialId}`);
    await finish(partialId);
  });
  await check("No browser runtime errors", async () => {
    expect(pageErrors).toEqual([]);
  });
} finally {
  await browser.close();
  await sql.end();
}
