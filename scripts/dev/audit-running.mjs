// Running screens audit (ADR 0059), over the fixtures `seed-audit-running.ts` writes: a 5K block
// in kilometres for priya and a 10K block in miles for alex. Signs in as each, opens every screen
// a runner reads — Plan, the programme, a session, the log form with its laps, a logged run with
// laps and zones, the heart-rate zones and the programme editor — checks each says what the
// fixtures hold, and keeps a screenshot of each for a person to look at.
import { mkdir, writeFile } from "node:fs/promises";
import { devices, expect } from "@playwright/test";
import postgres from "postgres";
import { launch } from "./audit-engines.mjs";

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

const output = `${process.env.AUDIT_OUTPUT_DIR ?? "output/flow-audit"}/running`;
await mkdir(output, { recursive: true });
const sql = postgres(database, { max: 1 });
const results = [];
const pageErrors = [];

/** The persona's running programme, today's session in it and a logged run with laps. */
async function fixtures(username) {
  const [person] = await sql`select id, time_zone from profiles where username = ${username}`;
  if (!person) throw new Error(`Seed ${username} first.`);
  const [programme] = await sql`
    select id, family_id, name from programs
    where user_id = ${person.id} and sport = 'running' and status = 'active'`;
  if (!programme) throw new Error(`Run scripts/dev/seed-audit-running.ts for ${username} first.`);
  const sessions = await sql`
    select o.id, v.scheduled_on::text as on, v.prescription->>'title' as title,
           v.prescription->'running'->>'sessionType' as type
    from planned_occurrences o
    join occurrence_versions v on v.id = o.current_revision_id
    where o.user_id = ${person.id} and o.family_id = ${programme.family_id}
    order by v.scheduled_on`;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: person.time_zone });
  // The seed puts an intervals session on the day it runs; a day or two later that session is
  // still the one to read, so it is the latest intervals session of the past week, else the next
  // session to come.
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const upcoming =
    sessions.filter((s) => s.type === "intervals" && s.on >= weekAgo && s.on <= today).at(-1) ??
    sessions.find((session) => session.on >= today);
  const [logged] = await sql`
    select a.id from activities a
    join running_activity_details d on d.activity_id = a.id
    where a.user_id = ${person.id} and jsonb_array_length(d.laps) > 4
      and d.run_type = 'intervals'
    order by a.occurred_on desc limit 1`;
  const [treadmill] = await sql`
    select a.id from activities a
    join running_activity_details d on d.activity_id = a.id
    where a.user_id = ${person.id} and d.environment = 'treadmill' and a.occurrence_id is not null
    order by a.occurred_on desc limit 1`;
  return { programme, upcoming, logged, treadmill, today };
}

async function audit(username, checks) {
  const browser = await launch("chromium");
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL,
    serviceWorkers: "block",
  });
  await context.addInitScript(() => localStorage.setItem("overload:appearance", "light"));
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) =>
    pageErrors.push({ username, url: page.url(), message: error.message }),
  );
  const shot = async (name) => {
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${output}/${username}-${name}.png`, fullPage: true });
  };
  const step = async (name, run) => {
    try {
      if ((await run()) === SKIPPED) {
        results.push({ username, name, status: "skipped" });
        return;
      }
      await shot(name);
      results.push({ username, name, status: "passed" });
    } catch (error) {
      await shot(`${name}-failed`).catch(() => {});
      results.push({ username, name, status: "failed", error: String(error?.message ?? error) });
    }
  };
  try {
    await page.goto("/login", { waitUntil: "networkidle", timeout: 120_000 });
    await page.getByLabel("Email", { exact: true }).fill(`${username}@local.test`);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await checks({ page, step, data: await fixtures(username) });
  } finally {
    await browser.close();
  }
}

/** A check that cannot run on this day (the seed's session is not today's). */
const SKIPPED = Symbol("skipped");

/** What the page says, as read: no-break spaces as spaces and the invisible joiners gone. */
async function says(page, ...texts) {
  const text = (await page.locator("main").innerText())
    .replace(/\u2060/g, "")
    .replace(/\u00a0/g, " ");
  for (const expected of texts)
    if (!text.includes(expected)) throw new Error(`The page does not say "${expected}".`);
}

await audit("priya", async ({ page, step, data }) => {
  await step("plan", async () => {
    await page.goto("/plan", { waitUntil: "networkidle" });
    await expect(page.getByText(data.programme.name).first()).toBeVisible();
  });
  await step("today", async () => {
    if (data.upcoming.on !== data.today) return SKIPPED;
    await page.goto("/today", { waitUntil: "networkidle" });
    // Named for the kind of run where its name only repeats its figure.
    await expect(page.locator(".activity-card-title", { hasText: /^Intervals$/ })).toBeVisible();
    await says(page, data.upcoming.title);
  });
  await step("programme", async () => {
    await page.goto("/plan/running", { waitUntil: "networkidle" });
    await expect(page.getByText(data.programme.name).first()).toBeVisible();
    // The week under way is open, each run named with its kind and its main work; a week reads
    // as its distance and the time of what is run by time, kept apart.
    await says(
      page,
      "Intervals",
      "Easy run with strides",
      "Tempo 20 min",
      "Long run 10 km",
      "4 runs · 24.2 km + 68 min · 19 Oct",
      "1 missed",
    );
  });
  await step("session", async () => {
    await page.goto(`/plan/sessions/${data.upcoming.id}`, {
      waitUntil: "networkidle",
    });
    // Named as Today names it: a title that only repeats its figure gives way to the kind of run.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Intervals");
    await says(
      page,
      "Running · Week 3 · ",
      "Run 800 m @ 4:55–5:05 /km · Zones 4–5 (163–191 bpm)",
      "Jog 400 m · Zones 1–2 (122–148 bpm) — Jog, never walk",
    );
    // The steps stand in a column beside what each line is.
    const lead = page.locator(".plan-structure-lead").first();
    const parts = page.locator(".plan-structure-parts").first();
    const [leadBox, partsBox] = [await lead.boundingBox(), await parts.boundingBox()];
    if (!leadBox || !partsBox || partsBox.x < leadBox.x + leadBox.width)
      throw new Error("A step's words run into what the line is.");
  });
  await step("log-form", async () => {
    await page.goto(`/today/log/new?sport=running&occurrence=${data.upcoming.id}`, {
      waitUntil: "networkidle",
    });
    await expect(page.getByLabel("Kind of run")).toHaveValue("intervals");
    // The plan's steps are a fold under the session's figure.
    await page.locator("summary").filter({ hasText: "The plan" }).click();
    await says(page, "Warm-up: Run 2 km · Zones 1–2 (122–148 bpm)");
    await page.locator("summary").filter({ hasText: "Laps and intervals" }).click();
    // Warm-up, six reps and six jogs, cool-down: the plan's laps, empty for the watch's figures.
    await page.getByRole("button", { name: "Lay out the plan’s 14 laps" }).click();
    await expect(page.locator(".lap-row")).toHaveCount(14);
    await expect(page.locator(".lap-row input[inputmode=decimal]").nth(1)).toHaveValue("");
    await page.getByRole("button", { name: "Fill in the planned distances and times" }).click();
    await expect(page.locator(".lap-row input[inputmode=decimal]").nth(1)).toHaveValue("800");
  });
  await step("logged-run", async () => {
    await page.goto(`/progress/activities/${data.logged.id}`, { waitUntil: "networkidle" });
    await says(page, "Laps", "Pace /km", "Time in zones", "Zone 5 · Maximum");
    // Five columns fit the phone without scrolling sideways.
    const scroll = page.locator(".run-laps-scroll");
    const fits = await scroll.evaluate((box) => box.scrollWidth <= box.clientWidth + 1);
    if (!fits) throw new Error("The laps table is wider than the phone.");
  });
  await step("heart-rate", async () => {
    await page.goto("/profile/heart-rate", { waitUntil: "networkidle" });
    // The method stands at the end of the Settings fold's row.
    await says(page, "Highest from your runs", "191", "% of reserve");
  });
  await step("treadmill-run", async () => {
    await page.goto(`/progress/activities/${data.treadmill.id}`, { waitUntil: "networkidle" });
    await says(page, "Treadmill", "Long run", "Incline");
  });
});

await audit("alex", async ({ page, step, data }) => {
  await step("programme", async () => {
    await page.goto("/plan/running", { waitUntil: "networkidle" });
    await expect(page.getByText(data.programme.name).first()).toBeVisible();
    await says(page, "6 × 2 min in zone 4", "Intervals", "Tempo 2 mi", "Long run 4.5 mi");
  });
  await step("session", async () => {
    await page.goto(`/plan/sessions/${data.upcoming.id}`, {
      waitUntil: "networkidle",
    });
    await says(
      page,
      "Running · Week 2 · ",
      "Run 2 min · Zone 4 (158–170 bpm)",
      "Walk 2 min · Zone 1 (105–124 bpm)",
    );
  });
  await step("logged-run", async () => {
    await page.goto(`/progress/activities/${data.logged.id}`, { waitUntil: "networkidle" });
    await says(page, "Laps", "Pace /mi");
  });
  await step("heart-rate", async () => {
    await page.goto("/profile/heart-rate", { waitUntil: "networkidle" });
    await says(page, "185", "158–170");
  });
  await step("editor", async () => {
    await page.goto("/plan/running", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Edit programme" }).click();
    await page.waitForURL(/\/plan\/running\/edit\?draft=/);
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Kind of run")).toHaveValue("intervals");
    await expect(page.getByRole("heading", { name: "Steps" })).toBeVisible();
    await says(page, "2. Repeat 6 times");
    await page.locator("summary").filter({ hasText: "Pace, zone and note" }).nth(1).click();
  });
});

await writeFile(`${output}/report.json`, JSON.stringify({ results, pageErrors }, null, 2));
await sql.end();
for (const result of results)
  console.log(
    `${result.status.padEnd(6)} ${result.username} ${result.name}${result.error ? `: ${result.error.split("\n")[0]}` : ""}`,
  );
if (pageErrors.length) console.log(JSON.stringify(pageErrors, null, 2));
if (results.some((result) => result.status === "failed") || pageErrors.length) process.exitCode = 1;
