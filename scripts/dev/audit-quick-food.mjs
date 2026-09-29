// Quick-add regression audit. Creates and removes its own account in the loopback QA database.
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit, devices, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";

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

const engine =
  process.env.AUDIT_BROWSER ?? (process.env.AUDIT_DEVICE === "iphone" ? "webkit" : "chromium");
const output = `${process.env.AUDIT_OUTPUT_DIR ?? "output/food-audit"}/quick-food-${engine}`;
await mkdir(output, { recursive: true });
const sql = postgres(database, { max: 1 });
const id = randomUUID();
const username = `quick${Date.now().toString(36)}${engine === "webkit" ? "w" : "c"}`;
const salt = randomBytes(16).toString("hex");
const password = `${salt}:${scryptSync("password123", salt, 32).toString("hex")}`;
const results = [],
  pageErrors = [];
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  executablePath: engine === "webkit" ? undefined : process.env.AUDIT_CHROMIUM_PATH,
});
const context = await browser.newContext({
  ...devices[engine === "webkit" ? "iPhone 13" : "Pixel 7"],
  baseURL,
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);
page.on("pageerror", (error) => pageErrors.push({ url: page.url(), message: error.message }));
const dialog = () => page.getByRole("dialog");
const foods = () => page.getByRole("list", { name: "Your foods and meals" });
const entries = () => sql`select id, name, food_id, eaten_on::text as day, meal,
  kcal::float8 as kcal, carbs_g::float8 as carbs, fat_g::float8 as fat,
  protein_g::float8 as protein, amount::float8 as amount, unit
  from food_entries where user_id=${id} order by created_at, id`;
const check = async (name, work) => {
  try {
    await work();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.stack });
    await page.screenshot({ path: `${output}/failure-${results.length}.png` }).catch(() => {});
    throw error;
  } finally {
    await writeFile(`${output}/results.json`, JSON.stringify({ results, pageErrors }, null, 2));
  }
};
const submit = async () => {
  await dialog().getByRole("button", { name: "Add to Breakfast", exact: true }).click();
  await expect(dialog()).toBeHidden();
};

try {
  await sql`insert into auth.users (id, email, raw_user_meta_data, encrypted_password)
    values (${id}, ${`${username}@local.test`},
      ${sql.json({ username, display_name: "Quick food audit" })}, ${password})`;
  await sql`update profiles set onboarded_at=now() where id=${id}`;
  const [{ yesterday }] =
    await sql`select ((now() at time zone time_zone)::date - 1)::text as yesterday
    from profiles where id=${id}`;
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill(`${username}@local.test`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/today");
  await page.waitForLoadState("networkidle");
  await page.goto(`/food/breakfast?day=${yesterday}`, { waitUntil: "networkidle" });

  await check(
    "Quick add validates calories, retains input and logs unnamed food on the selected day",
    async () => {
      await foods()
        .getByRole("button", { name: "Quick add Calories and macros, just this once" })
        .click();
      await expect(dialog().getByRole("heading", { name: "Quick add", exact: true })).toBeVisible();
      await expect(dialog().getByLabel("Nutrition per")).toHaveCount(0);
      await expect(dialog().getByLabel("Amount eaten")).toHaveCount(0);
      await dialog().getByLabel("Protein g", { exact: true }).fill("12,5");
      await dialog().getByRole("button", { name: "Add to Breakfast", exact: true }).click();
      await expect(dialog().getByLabel("kcal", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(dialog().getByLabel("kcal", { exact: true })).toBeFocused();
      await expect(dialog().getByLabel("Protein g", { exact: true })).toHaveValue("12.5");
      await dialog().getByLabel("kcal", { exact: true }).fill("235,5");
      await submit();
      expect(await entries()).toEqual([
        expect.objectContaining({
          name: "Quick add",
          food_id: null,
          day: yesterday,
          meal: "breakfast",
          kcal: 235.5,
          carbs: null,
          fat: null,
          protein: 12.5,
          amount: 1,
          unit: "serving",
        }),
      ]);
      expect(await sql`select id from foods where user_id=${id}`).toHaveLength(0);
    },
  );

  await check(
    "Named quick add survives a lost committed reply and retry creates exactly one entry",
    async () => {
      await page.getByRole("searchbox").fill("Meal out");
      await foods()
        .getByRole("button", { name: /^Quick add “Meal out”/ })
        .click();
      await expect(dialog().getByLabel("Name (optional)", { exact: true })).toHaveValue("Meal out");
      await dialog().getByLabel("kcal", { exact: true }).fill("640");
      await dialog().getByLabel("Carbs g", { exact: true }).fill("75");
      await page.waitForLoadState("networkidle");
      // Withhold the first actual action response after the server commits, on either engine.
      await page.evaluate(() => {
        const original = window.fetch;
        window.fetch = async function (...args) {
          const response = await original.apply(this, args);
          if (args[1]?.method === "POST") {
            await response.arrayBuffer();
            window.fetch = original;
            throw new TypeError("Audit: committed quick add response lost");
          }
          return response;
        };
      });
      await dialog().getByRole("button", { name: "Add to Breakfast", exact: true }).click();
      await expect(dialog().getByText(/Connection lost/)).toBeVisible();
      expect((await entries()).filter((entry) => entry.name === "Meal out")).toHaveLength(1);
      await expect(dialog().getByLabel("kcal", { exact: true })).toHaveValue("640");
      await submit();
      expect((await entries()).filter((entry) => entry.name === "Meal out")).toHaveLength(1);
      expect(await sql`select id from foods where user_id=${id}`).toHaveLength(0);
      await expect(page.getByRole("searchbox")).toHaveValue("");
    },
  );

  await check(
    "Quick entries support portion corrections and removal without creating saved foods",
    async () => {
      await page
        .getByRole("list", { name: "In breakfast" })
        .getByRole("button", { name: /^Meal out / })
        .click();
      await dialog().getByLabel("Amount eaten", { exact: true }).fill("0.5");
      await dialog().getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog()).toBeHidden();
      expect((await entries()).find((entry) => entry.name === "Meal out").amount).toBe(0.5);
      await expect(
        page
          .getByRole("list", { name: "In breakfast" })
          .getByRole("button", { name: /^Meal out / }),
      ).toContainText("320 kcal");
      await page
        .getByRole("list", { name: "In breakfast" })
        .getByRole("button", { name: /^Meal out / })
        .click();
      await dialog().getByRole("button", { name: "Remove from meal", exact: true }).click();
      await expect(dialog()).toBeHidden();
      expect((await entries()).map((entry) => entry.name)).toEqual(["Quick add"]);
    },
  );

  await check(
    "Quick add dialog fits narrow phones and enlarged text in light and dark themes",
    async () => {
      await foods()
        .getByRole("button", { name: "Quick add Calories and macros, just this once" })
        .click();
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
          await page.evaluate(async () => {
            await new Promise(requestAnimationFrame);
            await Promise.all(
              document
                .getAnimations()
                .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
                .map((animation) => animation.finished.catch(() => {})),
            );
          });
          const width = await dialog().evaluate((element) => ({
            width: element.clientWidth,
            content: element.scrollWidth,
          }));
          expect(width.content).toBeLessThanOrEqual(width.width + 1);
          // At enlarged text the sheet deliberately becomes one scrolling region so that
          // its title and footer cannot squeeze the form's editable area out of existence.
          await dialog()
            .getByRole("button", { name: "Add to Breakfast", exact: true })
            .scrollIntoViewIfNeeded();
          await expect(
            dialog().getByRole("button", { name: "Add to Breakfast", exact: true }),
          ).toBeInViewport();
          const accessibility = await new AxeBuilder({ page }).include("dialog").analyze();
          expect(accessibility.violations).toEqual([]);
          await page.screenshot({ path: `${output}/quick-${theme}-${font}.png` });
        }
      }
      await dialog().getByRole("button", { name: "Close sheet", exact: true }).click();
    },
  );
  expect(pageErrors).toEqual([]);
} finally {
  await browser.close();
  await sql`delete from auth.users where id=${id}`;
  await sql.end();
  await writeFile(`${output}/results.json`, JSON.stringify({ results, pageErrors }, null, 2));
}
