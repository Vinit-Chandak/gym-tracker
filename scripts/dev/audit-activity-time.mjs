// Native date/time regression audit. Each browser uses a disposable local QA account.
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit, devices, expect } from "@playwright/test";
import postgres from "postgres";
import { fillActivityField } from "./audit-controls.mjs";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const database =
  process.env.AUDIT_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/overload_audit";
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(database).hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(new URL(database).pathname) ||
  new URL(database).search ||
  new URL(database).hash
)
  throw new Error("Local audit only");

const engines = process.env.AUDIT_BROWSER ? [process.env.AUDIT_BROWSER] : ["chromium", "webkit"];
if (engines.some((engine) => !["chromium", "webkit"].includes(engine)))
  throw new Error("AUDIT_BROWSER must be chromium or webkit");
const output = `${process.env.AUDIT_OUTPUT_DIR ?? "output/activity-audit"}/activity-time`;
await mkdir(output, { recursive: true });
const sql = postgres(database, { max: 1 });
const results = [];
const pageErrors = [];
const saveReport = () =>
  writeFile(`${output}/results.json`, JSON.stringify({ results, pageErrors }, null, 2));

async function run(engine) {
  const id = randomUUID();
  const username = `time${Date.now().toString(36)}${engine === "webkit" ? "w" : "c"}`;
  const salt = randomBytes(16).toString("hex");
  const password = `${salt}:${scryptSync("password123", salt, 32).toString("hex")}`;
  let browser;
  let page;
  const records = () => sql`select id, started_at, occurred_on::text as day,
    recorded_time_zone, notes from activities where user_id=${id} order by created_at, id`;
  const check = async (name, work) => {
    try {
      await work();
      results.push({ engine, name, passed: true });
      console.log(`PASS ${engine}: ${name}`);
    } catch (error) {
      results.push({ engine, name, passed: false, error: error.stack });
      await page
        ?.screenshot({ path: `${output}/${engine}-failure-${results.length}.png` })
        .catch(() => {});
      throw error;
    } finally {
      await saveReport();
    }
  };
  const fillRun = async (local, title) => {
    await fillActivityField(page, "startedAt", local);
    await page.locator('[name="distanceValue"]').fill("5");
    await fillActivityField(page, "minutes", 30);
    await page.locator('input[name="effort"][value="3"]').locator("..").click();
    await page.locator('[name="title"]').fill(title);
  };
  const saveActivity = async (label = "Save activity") => {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForURL(/\/training\/activities\/[a-f0-9-]+$/);
    await page.waitForLoadState("networkidle");
    return new URL(page.url()).pathname.split("/").at(-1);
  };

  try {
    await sql`insert into auth.users (id, email, raw_user_meta_data, encrypted_password)
      values (${id}, ${`${username}@local.test`},
        ${sql.json({ username, display_name: "Activity time audit" })}, ${password})`;
    await sql`update profiles set onboarded_at=now(), time_zone='America/New_York',
      body_weight_kg=75, height_cm=175, date_of_birth='1994-06-15', training_goal='get_stronger'
      where id=${id}`;
    browser = await (engine === "webkit" ? webkit : chromium).launch({
      executablePath: engine === "webkit" ? undefined : process.env.AUDIT_CHROMIUM_PATH,
    });
    const context = await browser.newContext({
      ...devices[engine === "webkit" ? "iPhone 13" : "Pixel 7"],
      baseURL,
      deviceScaleFactor: 1,
    });
    page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.on("pageerror", (error) =>
      pageErrors.push({ engine, url: page.url(), message: error.message }),
    );
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill(`${username}@local.test`);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/today");
    await page.waitForLoadState("networkidle");
    await page.goto("/training/new?sport=running", { waitUntil: "networkidle" });

    await check("Spring clock-change gap is rejected without losing the entered run", async () => {
      await fillRun("2026-03-08T02:30", "Spring gap");
      await expect(page.getByLabel("Which time?", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Save activity", exact: true }).click();
      await expect(
        page.getByText("Enter a valid date and time. This time must exist in your time zone.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('[name="startedAt"]')).toHaveValue("2026-03-08T02:30");
      await expect(page.locator('[name="distanceValue"]')).toHaveValue("5");
      expect(await records()).toHaveLength(0);
    });

    await check(
      "Repeated time requires a native choice and server rejects missing choice",
      async () => {
        await fillRun("2025-11-02T01:30", "First occurrence");
        const choice = page.getByLabel("Which time?", { exact: true });
        await expect(choice).toBeVisible();
        await expect(choice).toHaveAttribute("required", "");
        expect(await choice.evaluate((element) => element.tagName)).toBe("SELECT");
        expect(await choice.evaluate((element) => element.checkValidity())).toBe(false);
        await expect(choice.locator("option")).toHaveText([
          "Choose the first or second time",
          "First occurrence (UTC−04:00)",
          "Second occurrence (UTC−05:00)",
        ]);
        // A stale or tampered client must receive a field error too, not a guessed UTC instant.
        await choice.evaluate((element) => {
          element.required = false;
        });
        await page.getByRole("button", { name: "Save activity", exact: true }).click();
        await expect(
          page.getByText(
            "This time happens twice when clocks go back. Choose which time you started.",
            { exact: true },
          ),
        ).toBeVisible();
        expect(await records()).toHaveLength(0);
        await choice.evaluate((element) => {
          element.required = true;
        });
      },
    );

    let firstId;
    let secondId;
    await check("First repeated hour persists the selected exact UTC instant", async () => {
      await page.getByLabel("Which time?", { exact: true }).selectOption("-240");
      firstId = await saveActivity();
      expect(await records()).toEqual([
        expect.objectContaining({
          id: firstId,
          started_at: new Date("2025-11-02T05:30:00.000Z"),
          day: "2025-11-02",
          recorded_time_zone: "America/New_York",
        }),
      ]);
    });

    await check(
      "Second hour fits small phones and large text, and persists its distinct instant",
      async () => {
        await page.goto("/training/new?sport=running", { waitUntil: "networkidle" });
        await fillRun("2025-11-02T01:30", "Second occurrence");
        await page.getByLabel("Which time?", { exact: true }).selectOption("-300");
        for (const theme of ["light", "dark"]) {
          for (const font of [16, 32]) {
            await page.setViewportSize({ width: 320, height: 568 });
            await page.evaluate(
              ({ theme, font }) => {
                document.documentElement.setAttribute("data-overload-mode", theme);
                document.documentElement.style.fontSize = `${font}px`;
              },
              { theme, font },
            );
            await page.getByLabel("Which time?", { exact: true }).scrollIntoViewIfNeeded();
            const width = await page.evaluate(() => ({
              width: document.documentElement.clientWidth,
              content: document.documentElement.scrollWidth,
            }));
            expect(width.content).toBeLessThanOrEqual(width.width + 1);
            await page.screenshot({ path: `${output}/${engine}-${theme}-${font}.png` });
          }
        }
        secondId = await saveActivity();
        expect(await records()).toHaveLength(2);
        expect((await records()).find((record) => record.id === secondId)).toMatchObject({
          started_at: new Date("2025-11-02T06:30:00.000Z"),
          day: "2025-11-02",
          recorded_time_zone: "America/New_York",
        });
      },
    );

    await check(
      "Correction after travel retains the activity zone and original repeated hour",
      async () => {
        await page.goto("/profile/edit", { waitUntil: "networkidle" });
        await page.getByLabel("Time zone", { exact: true }).fill("America/Los_Angeles");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await expect(page.getByRole("status").filter({ hasText: "Profile saved" })).toHaveText(
          "Profile saved",
        );
        expect(await sql`select time_zone from profiles where id=${id}`).toEqual([
          { time_zone: "America/Los_Angeles" },
        ]);
        await page.goto(`/training/activities/${secondId}/edit`, { waitUntil: "networkidle" });
        await page.locator(".more-details-summary").click();
        await expect(
          page.getByText("Date and time in America/New_York.", { exact: true }),
        ).toBeVisible();
        await expect(page.locator('[name="startedAt"]')).toHaveValue("2025-11-02T01:30");
        await expect(page.getByLabel("Which time?", { exact: true })).toHaveValue("-300");
        await page.locator('[name="notes"]').fill("Corrected after travelling");
        await saveActivity("Save changes");
        expect((await records()).find((record) => record.id === secondId)).toMatchObject({
          started_at: new Date("2025-11-02T06:30:00.000Z"),
          day: "2025-11-02",
          recorded_time_zone: "America/New_York",
          notes: "Corrected after travelling",
        });
      },
    );

    await check(
      "An explicit change to the other repeated hour updates the UTC instant",
      async () => {
        await page.goto(`/training/activities/${secondId}/edit`, { waitUntil: "networkidle" });
        await page.locator(".more-details-summary").click();
        await page.getByLabel("Which time?", { exact: true }).selectOption("-240");
        await saveActivity("Save changes");
        expect((await records()).find((record) => record.id === secondId)).toMatchObject({
          started_at: new Date("2025-11-02T05:30:00.000Z"),
          day: "2025-11-02",
          recorded_time_zone: "America/New_York",
        });
        expect(await records()).toHaveLength(2);
      },
    );
    await check("No uncaught browser errors", async () => {
      expect(pageErrors.filter((error) => error.engine === engine)).toEqual([]);
    });
  } finally {
    await browser?.close();
    await sql`delete from auth.users where id=${id}`;
  }
}

try {
  for (const engine of engines) {
    try {
      await run(engine);
    } catch (error) {
      if (!results.some((result) => result.engine === engine && !result.passed))
        results.push({ engine, name: "Setup or cleanup", passed: false, error: error.stack });
      console.error(error);
      process.exitCode = 1;
    }
  }
} finally {
  await sql.end();
  await saveReport();
}
