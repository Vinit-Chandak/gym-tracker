import assert from "node:assert/strict";
import { chromium, webkit, devices } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Read-only bookmarked activity navigation, including signing in after the session ends.
const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3101";
const address = new URL(baseURL);
if (
  !["localhost", "127.0.0.1"].includes(address.hostname) ||
  !["http:", "https:"].includes(address.protocol) ||
  address.pathname !== "/" ||
  address.search ||
  address.hash ||
  address.username ||
  address.password
)
  throw new Error("Bookmark audit requires a loopback app origin without URL overrides.");
const output = process.env.AUDIT_OUTPUT_DIR ?? "output/audit-56-months";
const folder = `${output}/bookmarks`;
const fixtures = JSON.parse(await readFile(`${output}/fixtures.json`, "utf8"));
const user = fixtures.people.find((person) => person.username === "vinit");
assert(user, "Seed the Vinit audit account first.");
const occurrence = fixtures.occurrences.find(
  (item) =>
    item.userId === user.id &&
    item.sport === "running" &&
    item.disposition === "pending" &&
    !item.familyId,
);
assert(occurrence, "Seed a pending standalone running occurrence for Vinit first.");
const cases = [
  { route: "/runs/new", destination: "/training/new?sport=running", heading: "Log a run" },
  {
    route: "/training/new?sport=cycling",
    destination: "/training/new?sport=cycling",
    heading: "Log a ride",
  },
  {
    route: `/training/new?occurrence=${occurrence.id}`,
    destination: `/training/new?occurrence=${occurrence.id}`,
    heading: "Log a run",
  },
  {
    route: "/training/new?sport=swimming&_rsc=audit-bookmark",
    destination: "/training/new?sport=swimming",
    heading: "Log a swim",
  },
];
const results = [];
await mkdir(folder, { recursive: true });
for (const [engine, browserType, device] of [
  ["chromium", chromium, devices["Pixel 7"]],
  ["webkit", webkit, devices["iPhone 13"]],
]) {
  const browser = await browserType.launch();
  try {
    for (const [index, testCase] of cases.entries()) {
      const context = await browser.newContext({ ...device, baseURL, colorScheme: "dark" });
      const page = await context.newPage();
      const errors = [];
      const failedRequests = [];
      const active = new Set();
      let changedAt = Date.now();
      page.on("pageerror", (error) => errors.push({ message: error.message, stack: error.stack }));
      page.on("request", (request) => {
        active.add(request);
        changedAt = Date.now();
      });
      const finished = (request) => {
        active.delete(request);
        changedAt = Date.now();
      };
      page.on("requestfinished", finished);
      page.on("requestfailed", (request) => {
        finished(request);
        failedRequests.push({ url: request.url(), failure: request.failure() });
      });
      const result = { engine, ...testCase };
      try {
        const response = await page.goto(testCase.route, { waitUntil: "networkidle" });
        assert.equal(response.status(), 200);
        const loginURL = new URL(page.url());
        result.loginURL = loginURL.href;
        assert.equal(loginURL.origin, address.origin);
        assert.equal(loginURL.pathname, "/login");
        assert.equal(loginURL.searchParams.get("next"), testCase.destination);
        await page.getByLabel("Email", { exact: true }).fill("vinit@local.test");
        await page.getByLabel("Password", { exact: true }).fill("password123");
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await page.waitForURL((url) => url.pathname !== "/login");
        await page.getByRole("heading", { name: testCase.heading, exact: true }).waitFor();
        assert.equal(page.url(), new URL(testCase.destination, baseURL).href);
        await page.evaluate(async () => {
          document.documentElement.style.fontSize = "32px";
          await document.fonts.ready;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        const deadline = Date.now() + 20_000;
        while (active.size || Date.now() - changedAt < 750) {
          if (Date.now() > deadline) throw new Error("Bookmark requests did not settle.");
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const fullPage = await page.evaluate(
          () => document.documentElement.scrollHeight * devicePixelRatio < 32000,
        );
        await page.screenshot({ path: `${folder}/${engine}-${index}.png`, fullPage });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
          ),
          false,
        );
        assert.deepEqual(errors, []);
        result.url = page.url();
        result.passed = true;
      } catch (error) {
        result.error = error.message;
        result.url = page.url();
        result.passed = false;
        process.exitCode = 1;
        await page.screenshot({ path: `${folder}/${engine}-${index}-failure.png` }).catch(() => {});
      }
      result.errors = [...errors];
      result.failedRequests = [...failedRequests];
      results.push(result);
      console.log(`${engine} ${testCase.route}: ${result.passed ? "PASS" : result.error}`);
      await writeFile(`${folder}/results.json`, JSON.stringify(results, null, 2));
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
