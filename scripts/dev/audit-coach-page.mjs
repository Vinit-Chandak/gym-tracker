import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { launch } from "./audit-engines.mjs";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3110";
const database =
  process.env.AUDIT_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_coach";
const target = new URL(database);
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.search ||
  target.hash ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname)
)
  throw new Error("Local audit only.");
const output = process.env.AUDIT_OUTPUT_DIR ?? "output/audit-coach";
await mkdir(output, { recursive: true });
const sql = postgres(database, { max: 1 });
await promisify(execFile)(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "scripts/dev/seed-audit-coach.ts"],
  { env: { ...process.env, AUDIT_DATABASE_URL: database } },
);
const browser = await launch("chromium");
const results = [];
const errors = [];
const key = Date.now().toString(36);
let page;

async function snapshot(name) {
  await page.evaluate(() => document.fonts.ready);
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(sizes.document <= sizes.viewport + 1, `Horizontal overflow: ${JSON.stringify(sizes)}`);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
}
async function step(name, run) {
  try {
    await run();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      message: error.stack,
      url: page?.url(),
      text: await page
        ?.locator("body")
        .innerText()
        .catch(() => ""),
    });
    await page
      ?.screenshot({ path: `${output}/${name}-failure.png`, fullPage: true })
      .catch(() => {});
    throw error;
  }
}
const tab = (name) => page.getByRole("tab", { name });
const panel = (name) => page.getByRole("tabpanel", { name });
const note = () => page.getByLabel("Notes for the coach", { exact: true });

try {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  await context.addInitScript(() => localStorage.setItem("overload:appearance", "light"));
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => errors.push({ url: page.url(), message: error.message }));
  const [person] = await sql`select id from profiles where username = 'vinit'`;
  assert.ok(person, "Seed the local audit personas first.");
  const programmes =
    await sql`select sport, name from programs where user_id=${person.id} and status='active' order by sport`;
  assert.equal(
    programmes.length,
    4,
    "This audit requires a local fixture with four active sport programmes.",
  );
  await step("login-and-overview", async () => {
    await page.goto("/login", { waitUntil: "networkidle", timeout: 120_000 });
    await page.getByLabel("Email", { exact: true }).fill("vinit@local.test");
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto("/profile/ai-coach", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: "AI coach" })).toBeVisible();
    for (const programme of programmes)
      await expect(
        panel("Overview").getByRole("heading", { name: programme.name, exact: true }),
      ).toBeVisible();
    await expect(panel("Overview")).toBeVisible();
    await expect(panel("Requests & changes")).toBeHidden();
    await snapshot("mobile-overview");
  });
  await step("mobile-request-and-memory-views", async () => {
    await tab("Requests & changes").click();
    await expect(
      panel("Requests & changes").getByText("Would Sunday morning or evening work best?", {
        exact: true,
      }),
    ).toBeVisible();
    await snapshot("mobile-requests");
    await tab("Notes & memory").click();
    await expect(page.getByRole("heading", { name: "What the coach remembers" })).toBeVisible();
    await snapshot("mobile-notes");
    const violations = (
      await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
    ).violations;
    assert.deepEqual(
      violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map((n) => n.target),
      })),
      [],
    );
  });
  await step("desktop-narrow-and-dark-layouts", async () => {
    await tab("Overview").click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await snapshot("desktop-overview");
    await tab("Requests & changes").click();
    await snapshot("desktop-requests");
    await page.setViewportSize({ width: 320, height: 740 });
    await snapshot("narrow-requests");
    await tab("Overview").click();
    await snapshot("narrow-overview");
    await page.setViewportSize({ width: 402, height: 874 });
    await page.evaluate(() => {
      localStorage.setItem("overload:appearance", "dark");
      document.documentElement.setAttribute("data-overload-mode", "dark");
    });
    await snapshot("mobile-dark-overview");
    await page.evaluate(() => {
      localStorage.setItem("overload:appearance", "light");
      document.documentElement.setAttribute("data-overload-mode", "light");
    });
  });
  const scopedText = `Audit ${key}: move only my running session to Sunday.`;
  await step("targeted-note-persists-and-stays-scoped", async () => {
    const runningName = programmes.find((p) => p.sport === "running").name;
    await page
      .locator("article.coach-programme")
      .filter({ has: page.getByRole("heading", { name: runningName, exact: true }) })
      .getByRole("button", { name: "Request a change", exact: true })
      .click();
    await expect(page.getByLabel("Which programme is this for?")).toHaveValue("running");
    await note().fill(scopedText);
    await tab("Notes & memory").click();
    await tab("Overview").click();
    await expect(note()).toHaveValue(scopedText);
    const power = page.getByRole("switch", { name: "AI coach", exact: true });
    await power.click();
    await expect(power).toHaveAttribute("aria-checked", "false");
    await expect(power).toBeEnabled();
    await expect(note()).toHaveValue(scopedText);
    await power.click();
    await expect(power).toHaveAttribute("aria-checked", "true");
    await expect(power).toBeEnabled();
    await expect(note()).toHaveValue(scopedText);
    const before =
      await sql`select sport, review_requested_at from sport_coach_preferences where user_id=${person.id} order by sport`;
    await page.getByRole("button", { name: "Send note", exact: true }).click();
    await expect(note()).toHaveValue("");
    await expect(page.getByText("Note sent.", { exact: true })).toBeVisible();
    const stored =
      await sql`select sport from coach_notes where user_id=${person.id} and text=${scopedText}`;
    assert.deepEqual(
      stored.map((n) => n.sport),
      ["running"],
    );
    const after =
      await sql`select sport, review_requested_at from sport_coach_preferences where user_id=${person.id} order by sport`;
    assert.ok(after.find((p) => p.sport === "running")?.review_requested_at);
    assert.deepEqual(
      after.filter((p) => p.sport !== "running"),
      before.filter((p) => p.sport !== "running"),
    );
    await tab("Notes & memory").click();
    await page.locator("#notes-scope").selectOption("running");
    await expect(page.getByText(scopedText, { exact: true })).toBeVisible();
    await page.locator("#notes-scope").selectOption("strength");
    await expect(page.getByText(scopedText, { exact: true })).toBeHidden();
  });
  await step("all-programmes-note-reaches-each-programme", async () => {
    const allText = `Audit ${key}: I have less training time next week.`;
    await tab("Overview").click();
    await page.getByLabel("Which programme is this for?").selectOption("all");
    await note().fill(allText);
    await page.getByRole("button", { name: "Send note", exact: true }).click();
    await expect(note()).toHaveValue("");
    const rows =
      await sql`select sport from coach_notes where user_id=${person.id} and text=${allText} order by sport`;
    assert.deepEqual(
      rows.map((row) => row.sport),
      ["strength", "running", "cycling", "swimming"],
    );
  });
  await step("question-answer-and-withdraw-stay-scoped", async () => {
    const answer = `Audit ${key}: Sunday morning works best.`;
    const [question] =
      await sql`select id from coach_program_requests where user_id=${person.id} and summary='Coach audit running question'`;
    const strength =
      await sql`select id,state from coach_program_requests where user_id=${person.id} and sport='strength' order by id`;
    await tab("Requests & changes").click();
    await page.locator("#requests-scope").selectOption("running");
    await page.getByLabel("your answer to the coach", { exact: true }).fill(answer);
    await page.getByRole("button", { name: "Send answer", exact: true }).click();
    await expect(
      page.getByText("Would Sunday morning or evening work best?", { exact: true }),
    ).toBeHidden();
    const [stored] =
      await sql`select sport, state from coach_program_requests where id=${question.id}`;
    assert.equal(stored.sport, "running");
    assert.equal(stored.state, "waiting");
    const notes =
      await sql`select sport from coach_notes where user_id=${person.id} and text like ${`%${answer}%`}`;
    assert.deepEqual(
      notes.map((n) => n.sport),
      ["running"],
    );
    assert.deepEqual(
      await sql`select id,state from coach_program_requests where user_id=${person.id} and sport='strength' order by id`,
      strength,
    );
    const withCoach = page
      .locator("details")
      .filter({ has: page.locator("summary").filter({ hasText: "With the coach" }) });
    if ((await withCoach.count()) && !(await withCoach.evaluate((element) => element.open))) {
      await withCoach.locator("summary").click();
    }
    await page.getByRole("button", { name: "Withdraw", exact: true }).click();
    await expect(page.getByRole("button", { name: "Withdraw", exact: true })).toHaveCount(0);
    const [withdrawn] = await sql`select state from coach_program_requests where id=${question.id}`;
    assert.equal(withdrawn.state, "withdrawn");
  });
  await step("proposal-and-creation-navigation", async () => {
    await page.locator("#requests-scope").selectOption("strength");
    const proposal = panel("Requests & changes").locator(".coach-change-row").first();
    await expect(proposal).toBeVisible();
    await proposal.click();
    await page.waitForURL(/\/plan\/drafts\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/profile/ai-coach", { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Add programme", exact: true }).click();
    await page.waitForURL(/\/training\/programmes\/new$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await snapshot("create-programme");
    await page.goto("/profile/ai-coach", { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Create a single session", exact: true }).click();
    await page.waitForURL(/\/training\/programmes\/new\?scope=session$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
  await step("keyboard-tab-navigation", async () => {
    await page.goto("/profile/ai-coach", { waitUntil: "networkidle" });
    await tab("Overview").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab("Requests & changes")).toHaveAttribute("aria-selected", "true");
    await expect(tab("Requests & changes")).toBeFocused();
    await page.keyboard.press("End");
    await expect(tab("Notes & memory")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(tab("Overview")).toBeFocused();
  });
  await step("no-programme-empty-state-and-general-note", async () => {
    await context.clearCookies();
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill("sam@local.test");
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto("/profile/ai-coach", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Start with a programme" })).toBeVisible();
    await expect(page.getByLabel("Which programme is this for?")).toHaveCount(0);
    await snapshot("mobile-empty-state");
    const text = `Audit ${key}: I want to build a consistent training habit.`;
    await note().fill(text);
    await page.getByRole("button", { name: "Send note", exact: true }).click();
    await expect(note()).toHaveValue("");
    const stored =
      await sql`select n.sport from coach_notes n join profiles p on p.id=n.user_id where p.username='sam' and n.text=${text}`;
    assert.deepEqual(
      stored.map((n) => n.sport),
      [null],
    );
    await tab("Notes & memory").click();
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  });
  assert.deepEqual(errors, [], "Browser runtime errors");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await writeFile(
    `${output}/coach-page-results.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
  await sql.end();
}
