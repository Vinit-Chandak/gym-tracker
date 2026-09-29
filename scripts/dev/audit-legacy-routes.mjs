// Read-only legacy-link regression: redirects must resolve before rendering the tab shell.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, webkit, devices, expect } from "@playwright/test";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const origin = new URL(baseURL);
if (
  !["localhost", "127.0.0.1"].includes(origin.hostname) ||
  !["http:", "https:"].includes(origin.protocol) ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password
)
  throw new Error("Legacy-route audit requires a loopback app origin.");
const output = process.env.AUDIT_OUTPUT_DIR ?? "output/audit-56-months";
const folder = `${output}/legacy-routes`;
await mkdir(folder, { recursive: true });
const fixtures = JSON.parse(await readFile(`${output}/fixtures.json`, "utf8"));
const owner = fixtures.people.find((person) => person.username === "vinit");
assert(owner, "Seed Vinit before the legacy-route audit.");
const run = fixtures.activities.find(
  (activity) => activity.userId === owner.id && activity.sport === "running",
);
const foreign = fixtures.activities.find(
  (activity) => activity.userId !== owner.id && activity.sport === "running",
);
assert(run && foreign, "Seed running activities for two different accounts.");
const missing = randomUUID();
const results = [];
const save = () => writeFile(`${folder}/results.json`, JSON.stringify(results, null, 2));

async function login(context, email) {
  const page = await context.newPage();
  try {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname !== "/login");
    await page.waitForLoadState("networkidle");
  } finally {
    await page.close();
  }
}

for (const [engine, type, device, repetitions] of [
  ["webkit", webkit, devices["iPhone 13"], 10],
  ["chromium", chromium, devices["Pixel 7"], 5],
]) {
  const browser = await type.launch({
    executablePath: engine === "chromium" ? process.env.AUDIT_CHROMIUM_PATH : undefined,
  });
  const context = await browser.newContext({ ...device, baseURL, deviceScaleFactor: 1 });
  const check = async (name, work, target = context) => {
    const page = await target.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const result = { engine, name, passed: false, errors };
    try {
      await work(page, result);
      expect(errors).toEqual([]);
      result.passed = true;
      console.log(`PASS ${engine}: ${name}`);
    } catch (error) {
      result.error = error.stack;
      result.url = page.url();
      await page
        .screenshot({ path: `${folder}/${engine}-failure-${results.length}.png` })
        .catch(() => {});
      console.error(`FAIL ${engine}: ${name}: ${error.message}`);
      process.exitCode = 1;
    } finally {
      results.push(result);
      await save();
      await page.close();
    }
  };
  try {
    await login(context, "vinit@local.test");
    for (let iteration = 1; iteration <= repetitions; iteration++) {
      for (const suffix of ["", "/edit"]) {
        const route = `/runs/${run.id}${suffix}`;
        const destination = `/training/activities/${run.id}${suffix}`;
        await check(`${iteration}: ${route} redirects before rendering`, async (page, result) => {
          const response = await context.request.get(route, { maxRedirects: 0 });
          result.status = response.status();
          result.location = response.headers().location;
          expect(response.status()).toBe(307);
          expect(new URL(response.headers().location, baseURL).href).toBe(
            new URL(destination, baseURL).href,
          );
          const redirects = [];
          page.on("response", (incoming) => {
            if (new URL(incoming.url()).pathname === route) redirects.push(incoming.status());
          });
          await page.goto(route, { waitUntil: "networkidle" });
          await page.waitForURL(new URL(destination, baseURL).href);
          await expect(page.locator("main h1")).toBeVisible();
          expect(redirects).toEqual([307]);
          result.url = page.url();
          result.heading = await page.locator("main h1").innerText();
        });
      }
    }

    for (const route of [
      `/runs/${missing}`,
      `/runs/${missing}/edit`,
      `/runs/${foreign.id}`,
      `/runs/${foreign.id}/edit`,
      `/runs/new?planned=${missing}`,
    ]) {
      await check(`${route} does not substitute another record`, async (page, result) => {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(
          page.getByRole("heading", { name: "Not available", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Go to Training", exact: true }),
        ).toHaveAttribute("href", "/training");
        await expect(page.getByRole("navigation")).toHaveCount(0);
        expect(page.url()).toBe(new URL(route, baseURL).href);
        result.url = page.url();
      });
    }
    await check("Malformed run identifier remains a useful 404", async (page, result) => {
      const response = await page.goto("/runs/not-a-uuid", { waitUntil: "networkidle" });
      result.status = response.status();
      expect(response.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Not found", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to Today", exact: true })).toHaveAttribute(
        "href",
        "/today",
      );
    });

    const guest = await browser.newContext({ ...device, baseURL });
    try {
      await check(
        "Expired session keeps the exact detail bookmark through sign-in",
        async (page) => {
          const route = `/runs/${run.id}`;
          await page.goto(route, { waitUntil: "networkidle" });
          const url = new URL(page.url());
          expect(url.pathname).toBe("/login");
          expect(url.searchParams.get("next")).toBe(route);
          await page.getByLabel("Email", { exact: true }).fill("vinit@local.test");
          await page.getByLabel("Password", { exact: true }).fill("password123");
          await page.getByRole("button", { name: "Sign in", exact: true }).click();
          await page.waitForURL(new URL(`/training/activities/${run.id}`, baseURL).href);
          await expect(page.locator("main h1")).toBeVisible();
          await page.waitForLoadState("networkidle");
        },
        guest,
      );
    } finally {
      await guest.close();
    }

    const unonboarded = await browser.newContext({ ...device, baseURL });
    try {
      await login(unonboarded, "taylor@local.test");
      for (const route of [
        `/runs/${run.id}`,
        `/runs/${run.id}/edit`,
        `/runs/new?planned=${missing}`,
      ]) {
        await check(
          `${route} retains the incomplete-onboarding gate`,
          async (page, result) => {
            const response = await unonboarded.request.get(route, { maxRedirects: 0 });
            result.status = response.status();
            result.location = response.headers().location;
            expect(response.status()).toBe(307);
            expect(new URL(response.headers().location, baseURL).pathname).toMatch(
              /^\/welcome(?:\/|$)/,
            );
            await page.goto(route, { waitUntil: "networkidle" });
            expect(new URL(page.url()).pathname).toMatch(/^\/welcome(?:\/|$)/);
            await expect(page.locator("h1")).toBeVisible();
          },
          unonboarded,
        );
      }
    } finally {
      await unonboarded.close();
    }
  } catch (error) {
    results.push({ engine, name: "Setup", passed: false, error: error.stack });
    process.exitCode = 1;
    await save();
  } finally {
    await browser.close();
  }
}
console.log(
  `${results.filter((result) => result.passed).length}/${results.length} legacy-route checks passed.`,
);
