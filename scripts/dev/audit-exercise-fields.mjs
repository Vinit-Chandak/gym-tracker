// Field-level logging audit against the isolated stack created by audit.mjs setup.
// AUDIT_CASE filters cases without repeating previously passed work. Each case has its own browser context.
// AUDIT_RESUME_SESSION resumes only the finish step of a partially completed retrospective case.
import { mkdir, writeFile } from "node:fs/promises";
import { devices, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { launch } from "./audit-engines.mjs";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3103";
const database = process.env.AUDIT_DATABASE_URL;
if (!database) throw new Error("Set AUDIT_DATABASE_URL to the isolated local audit database.");
const target = new URL(database);
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname) ||
  target.search ||
  target.hash
)
  throw new Error("Local audit only.");
const engine = process.env.AUDIT_BROWSER ?? "chromium";
const output = `${process.env.AUDIT_OUTPUT_DIR ?? "output/flow-audit"}/fields-${engine}`;
await mkdir(output, { recursive: true });
const browser = await launch(engine);
const sql = postgres(database, { max: 1 });
const results = [];
const filter = new RegExp(process.env.AUDIT_CASE ?? ".");
const prefix = `Field audit ${engine} ${Date.now()}`;
const artifacts = {};
async function go(page, path) {
  // Let the previous screen's prefetches settle before a full document navigation. WebKit
  // otherwise reports the cancelled fetches as access-control errors during page teardown.
  if (page.url() !== "about:blank") await page.waitForLoadState("networkidle");
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(page.locator("main")).not.toContainText("Loading page…");
}
async function check(name, username, task, contextOptions = {}) {
  if (!filter.test(name)) return;
  const context = await browser.newContext({
    ...devices[engine === "webkit" ? "iPhone 13" : "Pixel 7"],
    baseURL,
    serviceWorkers: "block",
    ...contextOptions,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const [user] = await sql`select u.id, p.time_zone from auth.users u
    join profiles p on p.id=u.id where u.email=${`${username}@local.test`}`;
  try {
    await go(page, "/login");
    await page.getByLabel("Email", { exact: true }).fill(`${username}@local.test`);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    const trainingDate = new Intl.DateTimeFormat("en-CA", { timeZone: user.time_zone }).format(
      new Date(Date.now() - 86_400_000),
    );
    await task(page, user.id, trainingDate);
    expect(errors).toEqual([]);
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error.stack,
      errors,
      url: page.url(),
      text: await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    });
    await page
      .screenshot({ path: `${output}/${name.replace(/\W+/g, "-")}-failure.png`, fullPage: true })
      .catch(() => {});
    console.log(`FAIL ${name}: ${error.message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
  await writeFile(
    `${output}/results-${process.env.AUDIT_RUN ?? "main"}.json`,
    JSON.stringify({ results, artifacts }, null, 2),
  );
}
const choose = async (page, name, value) => {
  const input = page.locator(`input[type=radio][name="${name}"][value="${value}"]`);
  await input.locator("..").click();
  await expect(input).toBeChecked();
};
const field = (page, label, value) => page.getByLabel(label, { exact: true }).fill(value);
async function details(page) {
  const fold = page
    .locator("details.more-details")
    .filter({ hasText: "Date, notes, heart rate, more" });
  if (!(await fold.getAttribute("open"))) {
    if (!(await fold.evaluate((e) => e.open))) await fold.locator("summary").click();
  }
}
async function fresh(page, sport) {
  await go(page, `/today/log/new?sport=${sport}`);
  await page.getByRole("button", { name: /^Save (run|ride|swim)$/ }).waitFor();
}
async function save(page) {
  await page.getByRole("button", { name: /^Save (run|ride|swim|changes)$/ }).click();
  await page.waitForURL(/\/progress\/activities\/[0-9a-f-]+(?:\?|$)/);
  await page.locator(".activity-stat-label").first().waitFor();
  return new URL(page.url()).pathname.split("/").at(-1);
}
async function record(sport, id) {
  const [activity] = await sql`select * from activities where id=${id}`;
  const [actual] =
    await sql`select * from ${sql(`${sport}_activity_details`)} where activity_id=${id}`;
  return { activity, actual };
}
async function edit(page, id) {
  await go(page, `/progress/activities/${id}/edit`);
  await page.getByRole("button", { name: /^Save/ }).waitFor();
}

await check("running-all-fields", "priya", async (page, _userId, trainingDate) => {
  await fresh(page, "running");
  await details(page);
  await expect(page.getByLabel("Incline %", { exact: true })).toBeHidden();
  await choose(page, "environment", "treadmill");
  await field(page, "Incline %", "-2.5");
  await choose(page, "environment", "outdoor");
  await expect(page.getByLabel("Incline %", { exact: true })).toBeHidden();
  await choose(page, "environment", "treadmill");
  await expect(page.getByLabel("Incline %", { exact: true })).toHaveValue("-2.5");
  for (const option of await page
    .getByLabel("Kind of run", { exact: true })
    .locator("option")
    .evaluateAll((es) => es.map((e) => e.value))) {
    await page.getByLabel("Kind of run", { exact: true }).selectOption(option);
    await expect(page.getByLabel("Kind of run", { exact: true })).toHaveValue(option);
  }
  await page.getByLabel("Kind of run", { exact: true }).selectOption("easy");
  await field(page, "Distance", "5.25");
  await field(page, "Duration", "3150");
  for (const answer of ["1", "2", "3", "4", "5", "unsure", "3"])
    await choose(page, "effort", answer);
  await field(page, "When", `${trainingDate}T06:35`);
  await field(page, "Surface", "Track");
  await field(page, "Elevation gain m", "12.5");
  await field(page, "Cadence steps/min", "172.5");
  await field(page, "Average heart rate", "145");
  await field(page, "Maximum heart rate", "180");
  await field(page, "Title", `${prefix} run`);
  await field(page, "Notes", "All run fields, including a downhill treadmill.");
  const id = await save(page);
  const { activity, actual } = await record("running", id);
  expect(activity).toMatchObject({
    duration_ms: 1910000,
    notes: "All run fields, including a downhill treadmill.",
    effort_status: "reported",
  });
  expect(activity.occurred_on.toISOString().slice(0, 10)).toBe(trainingDate);
  expect(actual).toMatchObject({
    environment: "treadmill",
    run_type: "easy",
    surface: "Track",
    average_heart_rate: 145,
    max_heart_rate: 180,
  });
  expect(Number(actual.distance_metres)).toBe(5250);
  expect(Number(actual.treadmill_incline_percent)).toBe(-2.5);
  expect(Number(actual.cadence_steps_per_minute)).toBe(172.5);
  expect(Number(actual.elevation_gain_metres)).toBe(12.5);
  await edit(page, id);
  await details(page);
  await choose(page, "environment", "outdoor");
  for (const name of [
    "Surface",
    "Elevation gain m",
    "Cadence steps/min",
    "Average heart rate",
    "Maximum heart rate",
    "Notes",
  ])
    await field(page, name, "");
  await choose(page, "effort", "unsure");
  expect(await save(page)).toBe(id);
  const corrected = await record("running", id);
  expect(corrected.activity).toMatchObject({ revision: 2, effort_status: "unknown", notes: null });
  expect(corrected.actual).toMatchObject({
    environment: "outdoor",
    treadmill_incline_percent: null,
    surface: null,
    elevation_gain_metres: null,
    cadence_steps_per_minute: null,
    average_heart_rate: null,
    max_heart_rate: null,
  });
  await go(page, `/progress/history?from=${trainingDate}&to=${trainingDate}`);
  await expect(page.locator(`a[href*="${id}"]`).first()).toBeVisible();
  artifacts.running = id;
});

await check("cycling-all-fields-and-unknown-distance", "alex", async (page) => {
  await fresh(page, "cycling");
  await field(page, "Duration", "10530");
  await field(page, "Distance", "15.25");
  for (const answer of ["unknown", "unassisted", "assisted"])
    await choose(page, "assistance", answer);
  await choose(page, "environment", "indoor");
  await expect(page.getByRole("radiogroup", { name: "Assistance" })).toBeHidden();
  await choose(page, "environment", "outdoor");
  await expect(page.locator("input[name=assistance][value=assisted]")).toBeChecked();
  await choose(page, "effort", "4");
  await details(page);
  await field(page, "Average power W", "220.5");
  await field(page, "Average cadence rpm", "85.5");
  await field(page, "Elevation gain ft", "1000");
  await field(page, "Average heart rate", "150");
  await field(page, "Maximum heart rate", "180");
  await field(page, "Title", `${prefix} ride`);
  await field(page, "Notes", "Imperial ride");
  const id = await save(page);
  const { activity, actual } = await record("cycling", id);
  expect(activity.duration_ms).toBe(3930000);
  expect(actual).toMatchObject({
    environment: "outdoor",
    assistance: "assisted",
    distance_native_unit: "mi",
    average_heart_rate: 150,
    max_heart_rate: 180,
  });
  expect(Number(actual.distance_native_value)).toBe(15.25);
  expect(Number(actual.distance_metres)).toBeCloseTo(15.25 * 1609.344, 3);
  expect(Number(actual.average_power_watts)).toBe(220.5);
  expect(Number(actual.average_cadence_rpm)).toBe(85.5);
  expect(Number(actual.elevation_gain_metres)).toBe(304.8);
  await edit(page, id);
  await choose(page, "environment", "indoor");
  await field(page, "Distance, after the point", "");
  await field(page, "Distance", "");
  await details(page);
  for (const name of [
    "Average power W",
    "Average cadence rpm",
    "Elevation gain ft",
    "Average heart rate",
    "Maximum heart rate",
    "Notes",
  ])
    await field(page, name, "");
  expect(await save(page)).toBe(id);
  const unknown = await record("cycling", id);
  expect(unknown.actual).toMatchObject({
    distance_metres: null,
    distance_native_value: null,
    average_power_watts: null,
    average_cadence_rpm: null,
    elevation_gain_metres: null,
  });
  await edit(page, id);
  await field(page, "Distance", "0");
  await save(page);
  expect(Number((await record("cycling", id)).actual.distance_metres)).toBe(0);
  artifacts.cycling = id;
});

await check("swimming-all-fields-and-methods", "priya", async (page) => {
  await fresh(page, "swimming");
  await field(page, "Elapsed time", "3000");
  await choose(page, "distanceMethod", "lengths");
  await field(page, "Pool length", "25");
  await page.getByRole("button", { name: /^Pool length in m/ }).click();
  await field(page, "Lengths", "40");
  await expect(page.getByRole("status").filter({ hasText: /1,000.*yd/ })).toBeVisible();
  await choose(page, "distanceMethod", "manual");
  await field(page, "Distance", "1500");
  await choose(page, "distanceMethod", "lengths");
  await expect(page.getByLabel("Lengths", { exact: true })).toHaveValue("40");
  await choose(page, "effort", "2");
  await details(page);
  await field(page, "Minutes", "20");
  await field(page, "Seconds", "30,5");
  await expect(page.getByRole("status").filter({ hasText: "per 100 yd" })).toHaveText(
    "2:03.1 per 100 yd",
  );
  for (const option of await page
    .getByLabel("Stroke", { exact: true })
    .locator("option")
    .evaluateAll((es) => es.map((e) => e.value))) {
    await page.getByLabel("Stroke", { exact: true }).selectOption(option);
    await expect(page.getByLabel("Stroke", { exact: true })).toHaveValue(option);
  }
  await page.getByLabel("Stroke", { exact: true }).selectOption("breaststroke");
  await field(page, "Strokes taken", "500");
  await field(page, "Average heart rate", "130");
  await field(page, "Maximum heart rate", "160");
  await field(page, "Title", `${prefix} swim`);
  await field(page, "Notes", "Yard pool and fractional swimming time");
  const id = await save(page);
  const { activity, actual } = await record("swimming", id);
  expect(activity.duration_ms).toBe(1800000);
  expect(actual).toMatchObject({
    active_ms: 1230500,
    distance_method: "lengths",
    pool_length_unit: "yd",
    lengths: 40,
    stroke: "breaststroke",
    stroke_count: 500,
    average_heart_rate: 130,
    max_heart_rate: 160,
  });
  expect(Number(actual.pool_length_metres) * actual.lengths).toBe(914.4);
  await edit(page, id);
  await choose(page, "environment", "open_water");
  await expect(page.getByRole("radio", { name: "Count lengths" })).toHaveCount(0);
  await choose(page, "distanceMethod", "manual");
  await field(page, "Distance", "1500");
  await details(page);
  for (const name of [
    "Minutes",
    "Seconds",
    "Strokes taken",
    "Average heart rate",
    "Maximum heart rate",
    "Notes",
  ])
    await field(page, name, "");
  expect(await save(page)).toBe(id);
  const open = await record("swimming", id);
  expect(open.actual).toMatchObject({
    environment: "open_water",
    distance_method: "manual",
    pool_length_native: null,
    lengths: null,
    active_ms: null,
    stroke_count: null,
  });
  expect(Number(open.actual.distance_metres)).toBe(1500);
  await edit(page, id);
  await choose(page, "distanceMethod", "unknown");
  await save(page);
  expect((await record("swimming", id)).actual.distance_metres).toBeNull();
  artifacts.swimming = id;
});

for (const sport of ["running", "cycling", "swimming"]) {
  await check(`${sport}-validation-drafts-confirmation`, "sam", async (page, userId) => {
    await fresh(page, sport);
    const submit = page.getByRole("button", { name: /^Save (run|ride|swim)$/ });
    await submit.click();
    await expect(page.getByRole("alert").filter({ hasText: /Rate the effort/ })).toBeVisible();
    await choose(page, "effort", "unsure");
    await field(page, sport === "swimming" ? "Elapsed time" : "Duration", "3000");
    if (sport === "swimming") await choose(page, "distanceMethod", "manual");
    await field(
      page,
      "Distance",
      sport === "swimming" ? "21000" : sport === "cycling" ? "501" : "101",
    );
    await details(page);
    await field(page, "Average heart rate", "180");
    await field(page, "Maximum heart rate", "120");
    await field(page, "Title", `${prefix} ${sport} confirmed`);
    await field(page, "Notes", "Draft and validation retention");
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText(/Draft restored/).first()).toBeVisible();
    await details(page);
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
      "Draft and validation retention",
    );
    await submit.click();
    // Large entries ask for confirmation before the domain checks all measurements.
    const confirm = page.getByRole("checkbox", { name: "Yes, that is right." });
    await expect(confirm).toBeVisible();
    await confirm.check();
    await expect(confirm).toBeChecked();
    await confirm.uncheck();
    await submit.click();
    await expect(confirm).not.toBeChecked();
    expect(
      await sql`select id from activities where user_id=${userId} and title=${`${prefix} ${sport} confirmed`}`,
    ).toHaveLength(0);
    await confirm.check();
    await submit.click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /maximum.*(?:below|less|lower)|maximum.*average/i }),
    ).toBeVisible();
    await field(page, "Maximum heart rate", "190");
    await submit.click();
    await expect(confirm).toBeVisible();
    await confirm.check();
    const id = await save(page);
    expect((await record(sport, id)).actual.max_heart_rate).toBe(190);
    expect(
      await sql`select id from activities where user_id=${userId} and title=${`${prefix} ${sport} confirmed`}`,
    ).toHaveLength(1);
  });
}

await check("swimming-validation-targets", "priya", async (page) => {
  await fresh(page, "swimming");
  await field(page, "Elapsed time", "3000");
  await choose(page, "effort", "3");
  await choose(page, "distanceMethod", "lengths");
  await field(page, "Pool length", "1000");
  await field(page, "Lengths", "2000");
  await page.getByRole("button", { name: "Save swim", exact: true }).click();
  await page.getByRole("checkbox", { name: "Yes, that is right." }).check();
  await page.getByRole("button", { name: "Save swim", exact: true }).click();
  await expect(
    page.getByText("That swim distance is beyond 1,000 km.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Lengths", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await field(page, "Pool length", "25.1234567");
  await choose(page, "distanceMethod", "manual");
  await field(page, "Distance", "1000");
  await page.getByRole("button", { name: "Save swim", exact: true }).click();
  await expect(page.getByLabel("Pool length", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Pool length", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await field(page, "Pool length", "25");
  await details(page);
  await field(page, "Minutes", "40");
  await expect(page.getByRole("status").filter({ hasText: /per 100/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Save swim", exact: true }).click();
  await expect(
    page.getByText("Swimming time cannot be longer than the elapsed time.", { exact: true }),
  ).toBeVisible();
  await field(page, "Minutes", "20");
  await save(page);
});

await check("strength-fields-checkboxes-and-finish", "priya", async (page, userId) => {
  const abandoned =
    await sql`select id from workout_sessions where user_id=${userId} and completed_at is null`;
  // Resume a failed audit's own session; keep the already-verified check-in and continue.
  if (abandoned.length) {
    await go(page, `/workouts/${abandoned[0].id}`);
  } else {
    await go(page, "/today/log?sport=strength&counts=unplanned");
    await page.getByRole("button", { name: "Start workout", exact: true }).click();
    await field(page, "Hours last night", "7.5");
    for (const [name, value] of [
      ["Quality", "4"],
      ["General fatigue", "2"],
      ["Soreness", "3"],
    ]) {
      const group = page.getByRole("radiogroup", { name, exact: true });
      await group.getByRole("radio", { name: value, exact: true }).locator("..").click();
      await expect(group.getByRole("radio", { name: value, exact: true })).toBeChecked();
      await group.getByRole("radio", { name: value, exact: true }).locator("..").click();
      await expect(group.getByRole("radio", { name: value, exact: true })).not.toBeChecked();
      await group.getByRole("radio", { name: value, exact: true }).locator("..").click();
    }
    await page.getByRole("button", { name: "Save and start", exact: true }).click();
    await page.waitForURL(/\/workouts\/[0-9a-f-]+$/);
  }
  const sessionId = new URL(page.url()).pathname.split("/").at(-1);
  artifacts.strength = sessionId;
  const [session] =
    await sql`select * from workout_sessions where id=${sessionId} and user_id=${userId}`;
  expect(Number(session.sleep_hours)).toBe(7.5);
  expect(session).toMatchObject({ sleep_quality: 4, fatigue: 2, soreness: 3 });
  await page.getByRole("link", { name: "Add exercise", exact: true }).click();
  const names = ["Push-up", "Plank", "Farmer's carry"];
  for (const name of names) {
    await page.getByRole("searchbox", { name: "Search exercises", exact: true }).fill(name);
    const box = page.getByRole("checkbox", { name: new RegExp(`^${name}\\b`) });
    await box.locator("..").click();
    await expect(box).toBeChecked();
    await box.locator("..").click();
    await expect(box).not.toBeChecked();
    await box.locator("..").click();
  }
  await page.getByRole("searchbox", { name: "Search exercises", exact: true }).fill("Push-up");
  await expect(page.getByRole("checkbox", { name: /^Push-up\b/ })).toBeChecked();
  await page.getByRole("button", { name: /3 selected.*Review/ }).click();
  const review = page.getByRole("dialog", { name: "Selected exercises" });
  await expect(review.getByRole("button", { name: "Remove Plank", exact: true })).toBeVisible();
  const machine = review.getByRole("combobox");
  if (await machine.count()) await machine.selectOption({ label: "Dumbbells" });
  await review.getByRole("button", { name: "Add 3 exercises", exact: true }).click();
  await page.waitForURL(`/workouts/${sessionId}`);
  const exercises =
    await sql`select w.id,e.name from workout_exercises w join exercises e on e.id=w.exercise_id where w.workout_session_id=${sessionId} order by w.order_index`;
  expect(exercises.map((e) => e.name)).toEqual(names);
  await page.getByRole("button", { name: "Superset", exact: true }).click();
  const superset = page.getByRole("dialog", { name: "Superset", exact: true });
  const first = superset.getByRole("checkbox", { name: "Push-up", exact: true });
  const second = superset.getByRole("checkbox", { name: "Plank", exact: true });
  await first.check();
  await second.check();
  await second.uncheck();
  await expect(superset.getByRole("button", { name: "Create superset" })).toBeDisabled();
  await second.check();
  await superset.getByRole("button", { name: "Create superset" }).click();
  await expect(superset).toHaveCount(0);
  const grouped =
    await sql`select superset_group from workout_exercises where workout_session_id=${sessionId} and id in ${sql(exercises.slice(0, 2).map((e) => e.id))}`;
  expect(grouped[0].superset_group).toBeTruthy();
  expect(grouped[0].superset_group).toBe(grouped[1].superset_group);
  for (const [index, name] of names.entries()) {
    await page.getByRole("button", { name: new RegExp(`^${name}\\b`) }).click();
    await page.locator(".entry").waitFor();
    await page
      .getByRole("button", { name: "Set options: add a set, type, remove", exact: true })
      .click();
    await page.getByRole("dialog").getByLabel("Type", { exact: true }).selectOption("working");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close sheet", exact: true })
      .click();
    if (!(await page.locator(".entry input").count()))
      await page.locator('.entry [data-field="load"] button.stepper-figure').click();
    await page.getByLabel(/^Load in /).fill(index === 2 ? "20" : "0");
    const measure = index === 0 ? "Reps" : index === 1 ? "Seconds" : "Metres";
    await field(page, measure, index === 0 ? "12" : index === 1 ? "45" : "30");
    await page
      .getByRole("textbox", { name: index === 0 ? "RIR" : "RPE", exact: true })
      .fill(index === 0 ? "2" : "7");
    await page.locator(".entry").getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Set 1 saved:/ })).toBeAttached();
    const [set] =
      await sql`select * from set_logs where workout_exercise_id=${exercises[index].id}`;
    expect(
      Number(index === 0 ? set.reps : index === 1 ? set.duration_seconds : set.distance_meters),
    ).toBe(index === 0 ? 12 : index === 1 ? 45 : 30);
    expect(Number(index === 0 ? set.rir : set.rpe)).toBe(index === 0 ? 2 : 7);
    await page.getByRole("button", { name: /^Set 1:.*\. Edit$/ }).click();
    const editor = page.getByRole("dialog", { name: "Set 1", exact: true });
    await editor.getByLabel("Type", { exact: true }).selectOption("backoff");
    await editor.getByRole("button", { name: "Update", exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect
      .poll(async () => (await sql`select set_type from set_logs where id=${set.id}`)[0].set_type)
      .toBe("backoff");
    await page
      .getByRole("button", { name: "Complete, skip, superset, substitute", exact: true })
      .click();
    await page.getByRole("dialog").getByRole("button", { name: "Complete", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await sql`select completed_at from workout_exercises where id=${exercises[index].id}`)[0]
            .completed_at,
      )
      .not.toBeNull();
    await page.locator(".session-back").click();
  }
  await page.getByRole("link", { name: "Finish", exact: true }).click();
  await field(page, "Body weight (kg)", "72.5");
  await field(page, "Notes", `${prefix} strength`);
  await page.getByRole("button", { name: "Finish session", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/finish"));
  await go(page, `/workouts/${sessionId}`);
  await page.getByRole("button", { name: "Session details", exact: true }).click();
  await expect(page.getByText(`${prefix} strength`, { exact: true })).toBeVisible();
  const [finished] = await sql`select * from workout_sessions where id=${sessionId}`;
  expect(finished.completed_at).not.toBeNull();
  expect(Number(finished.body_weight_kg)).toBe(72.5);
  expect(
    await sql`select id from set_logs where workout_exercise_id in ${sql(exercises.map((e) => e.id))}`,
  ).toHaveLength(3);
});

await check("strength-finished-readback", "priya", async (page, userId) => {
  const [session] = await sql`select * from workout_sessions where user_id=${userId}
    and notes like 'Field audit % strength' and completed_at is not null order by completed_at desc limit 1`;
  expect(session).toBeTruthy();
  await go(page, `/workouts/${session.id}`);
  await page.getByRole("button", { name: "Session details", exact: true }).click();
  await expect(page.getByText(session.notes, { exact: true })).toBeVisible();
  expect(Number(session.body_weight_kg)).toBe(72.5);
  const sets =
    await sql`select s.* from set_logs s join workout_exercises e on e.id=s.workout_exercise_id where e.workout_session_id=${session.id}`;
  expect(sets).toHaveLength(3);
  expect(sets.every((set) => set.set_type === "backoff")).toBe(true);
  artifacts.finishedStrength = session.id;
});

await check(
  "strength-substitution-and-backdated-finish",
  "vinit",
  async (page, userId, trainingDate) => {
    let sessionId = process.env.AUDIT_RESUME_SESSION;
    if (sessionId) {
      const [session] = await sql`select id from workout_sessions where id=${sessionId}
        and user_id=${userId} and logged_retrospectively=true and completed_at is null`;
      expect(session).toBeTruthy();
      await go(page, `/workouts/${sessionId}`);
    } else {
      // A planned rep slot may be replaced by a hold or a carry. Both must use their own measure.
      await page.goto("/today/log?sport=strength", { waitUntil: "domcontentloaded" });
      await page
        .getByRole("link", { name: /Next in your programme/ })
        .first()
        .click();
      await page.getByText("Done earlier", { exact: true }).click();
      await field(page, "Date", trainingDate);
      await field(page, "Started at", "07:00");
      await page.getByRole("button", { name: "Log this workout", exact: true }).click();
      await page.getByRole("button", { name: "Skip check-in", exact: true }).click();
      await page.waitForURL(/\/workouts\/[0-9a-f-]+$/);
      sessionId = new URL(page.url()).pathname.split("/").at(-1);
      const slots = await sql`select w.id,w.planned_program_exercise_id,e.name,s.gym_id
    from workout_exercises w join exercises e on e.id=w.exercise_id
    join workout_sessions s on s.id=w.workout_session_id
    join program_exercises p on p.id=w.planned_program_exercise_id
    where w.workout_session_id=${sessionId} and p.prescription_type='reps' order by w.order_index limit 2`;
      expect(slots).toHaveLength(2);
      for (const [index, replacement] of ["Plank", "Farmer's carry"].entries()) {
        const slot = slots[index];
        const fallbacks = () => sql`select id,fallback_exercise_id from program_exercise_fallbacks
      where user_id=${userId} and program_exercise_id=${slot.planned_program_exercise_id} and gym_id=${slot.gym_id}`;
        const before = await fallbacks();
        await page
          .getByRole("button", {
            name: new RegExp(`^${slot.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
          })
          .click();
        await page
          .getByRole("button", { name: "Complete, skip, superset, substitute", exact: true })
          .click();
        await page.getByRole("link", { name: "Swap the exercise", exact: true }).click();
        await page.getByRole("searchbox").fill(replacement);
        await page
          .getByRole("radio", { name: new RegExp(`^${replacement}\\b`) })
          .locator("..")
          .click();
        const remember = page.getByRole("checkbox", { name: "Remember for this gym", exact: true });
        await expect(remember).toBeChecked();
        await remember.uncheck();
        await expect(remember).not.toBeChecked();
        if (index === 1) await remember.check();
        const machine = page.getByRole("combobox");
        if (await machine.count()) await machine.selectOption({ label: "Dumbbells" });
        await page.getByRole("button", { name: "Use this instead", exact: true }).click();
        await page.getByRole("button", { name: new RegExp(`^${replacement}\\b`) }).click();
        await page.locator(".entry").waitFor();
        await page
          .getByRole("button", { name: "Set options: add a set, type, remove", exact: true })
          .click();
        await page.getByRole("dialog").getByLabel("Type", { exact: true }).selectOption("working");
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Close sheet", exact: true })
          .click();
        const [swapped] = await sql`select exercise_id from workout_exercises where id=${slot.id}`;
        const after = await fallbacks();
        if (index === 0) expect(after).toEqual(before);
        else
          expect(after.some((entry) => entry.fallback_exercise_id === swapped.exercise_id)).toBe(
            true,
          );
        if (!(await page.locator(".entry input").count()))
          await page.locator('.entry [data-field="load"] button.stepper-figure').click();
        await page.getByLabel(/^Load in /).fill(index === 0 ? "0" : "20");
        await field(page, index === 0 ? "Seconds" : "Metres", index === 0 ? "45" : "30");
        await page.getByRole("textbox", { name: "RPE", exact: true }).fill("7");
        await page.locator(".entry").getByRole("button", { name: "Save", exact: true }).click();
        await expect(page.getByRole("status").filter({ hasText: /^Set 1 saved:/ })).toBeAttached();
        const [set] = await sql`select * from set_logs where workout_exercise_id=${slot.id}`;
        expect(set.reps).toBeNull();
        expect(set.rir).toBeNull();
        expect(Number(set.rpe)).toBe(7);
        expect(Number(index === 0 ? set.duration_seconds : set.distance_meters)).toBe(
          index === 0 ? 45 : 30,
        );
        await page.locator(".session-back").click();
      }
    }
    await page.getByRole("link", { name: "Finish", exact: true }).click();
    await expect(page.getByLabel("Finished at", { exact: true })).toHaveValue("");
    await page.getByRole("button", { name: "Finish session", exact: true }).click();
    expect(
      await page.getByLabel("Finished at", { exact: true }).evaluate((e) => e.checkValidity()),
    ).toBe(false);
    await field(page, "Finished at", `${trainingDate}T06:30`);
    await page.getByRole("button", { name: "Finish session", exact: true }).click();
    // WebKit on this host renders datetime-local as text; its server validation must still
    // reject an end before the start. Chromium catches the same entry in native validation.
    if (await page.getByLabel("Finished at", { exact: true }).evaluate((e) => e.checkValidity()))
      await expect(
        page.getByText("The finish must be after this workout started and no later than now.", {
          exact: true,
        }),
      ).toBeVisible();
    expect(
      (await sql`select completed_at from workout_sessions where id=${sessionId}`)[0].completed_at,
    ).toBeNull();
    await field(page, "Finished at", `${trainingDate}T07:45`);
    await field(page, "Notes", `${prefix} retrospective`);
    await page.getByRole("button", { name: "Finish session", exact: true }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("/finish"));
    const [finished] = await sql`select * from workout_sessions where id=${sessionId}`;
    expect(finished.logged_retrospectively).toBe(true);
    expect(finished.completed_at.getTime() - finished.started_at.getTime()).toBe(45 * 60 * 1000);
    expect(finished.notes).toBe(`${prefix} retrospective`);
    artifacts.retrospectiveStrength = sessionId;
  },
);

await check("running-lap-validation-and-reload", "sam", async (page, userId) => {
  await fresh(page, "running");
  await page.getByText("Laps and intervals", { exact: true }).click();
  await page.getByRole("button", { name: "+ Rep", exact: true }).click();
  const lap = page.locator("li.lap-row").first();
  await lap.getByLabel("Distance", { exact: true }).fill("400");
  await lap.getByLabel("Time", { exact: true }).fill("200");
  await lap.getByLabel("Avg HR", { exact: true }).fill("oops");
  await lap.getByLabel("Max HR", { exact: true }).fill("180.5");
  await choose(page, "effort", "3");
  const [before] = await sql`select count(*)::int as count from activities where user_id=${userId}`;
  await page.getByRole("button", { name: "Save run", exact: true }).click();
  expect(await lap.getByLabel("Avg HR", { exact: true }).evaluate((e) => e.checkValidity())).toBe(
    false,
  );
  await page.reload({ waitUntil: "networkidle" });
  await expect(lap.getByLabel("Avg HR", { exact: true })).toHaveValue("oops");
  await expect(lap.getByLabel("Max HR", { exact: true })).toHaveValue("180.5");
  const [after] = await sql`select count(*)::int as count from activities where user_id=${userId}`;
  expect(after.count).toBe(before.count);
  await lap.getByLabel("Avg HR", { exact: true }).fill("150");
  await lap.getByLabel("Max HR", { exact: true }).fill("180");
  await page.getByRole("button", { name: "+ Recovery", exact: true }).click();
  await page.locator("li.lap-row").last().getByLabel("Time", { exact: true }).fill("100");
  await page.getByRole("button", { name: "+ Rep", exact: true }).click();
  await page.locator("li.lap-row").last().getByLabel("Time", { exact: true }).fill("155");
  await page.getByRole("button", { name: "+ Recovery", exact: true }).click();
  await page.getByRole("button", { name: "Remove lap 4", exact: true }).click();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("li.lap-row")).toHaveCount(3);
  const id = await save(page);
  const { activity, actual } = await record("running", id);
  expect(actual.laps).toHaveLength(3);
  expect(actual.laps[0]).toMatchObject({ averageHeartRate: 150, maxHeartRate: 180 });
  expect(Number(actual.distance_metres)).toBe(800);
  expect(activity.duration_ms).toBe(295000);
});

await check("planned-run-laps-and-date", "alex", async (page, _userId, trainingDate) => {
  await go(page, "/today/log?sport=running");
  const planned = page.getByRole("link", { name: /6 × 2 min in zone 4/ }).first();
  const href = await planned.getAttribute("href");
  expect(href).toBeTruthy();
  const occurrenceId = new URL(href, baseURL).searchParams.get("counts");
  await planned.click();
  await page.getByLabel("When", { exact: true }).fill(trainingDate);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Training date", { exact: true })).toHaveValue(trainingDate);
  await field(page, "Start time", "06:30");
  await expect(page.getByLabel("Kind of run", { exact: true })).toHaveValue("intervals");
  await page.locator("summary").filter({ hasText: "Laps and intervals" }).click();
  const layout = page.getByRole("button", { name: /^Lay out the plan’s \d+ laps$/ });
  const count = Number((await layout.innerText()).match(/\d+/)[0]);
  await layout.click();
  await expect(page.locator("li.lap-row")).toHaveCount(count);
  for (const row of await page.locator("li.lap-row").all()) {
    await expect(row.getByLabel("Distance", { exact: true })).toHaveValue("");
    await expect(row.getByLabel("Time", { exact: true })).toHaveValue("");
  }
  await page.getByRole("button", { name: "Fill in the planned distances and times" }).click();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("li.lap-row")).toHaveCount(count);
  for (const row of await page.locator("li.lap-row").all())
    if (!(await row.getByLabel("Time", { exact: true }).inputValue()))
      await row.getByLabel("Time", { exact: true }).fill("200");
  await choose(page, "effort", "3");
  // A timed prescription supplies no actual distance. Ask for it instead of saving a guess.
  await page.getByRole("button", { name: "Save run", exact: true }).click();
  await expect(page.getByText("Enter how far you ran.", { exact: true })).toBeVisible();
  await page.locator(".row-stepper").getByLabel("Distance", { exact: true }).fill("3");
  const id = await save(page);
  const { activity, actual } = await record("running", id);
  expect(activity.occurrence_id).toBe(occurrenceId);
  expect(activity.occurred_on.toISOString().slice(0, 10)).toBe(trainingDate);
  expect(actual.laps).toHaveLength(count);
  expect(activity.duration_ms).toBeGreaterThan(0);
  artifacts.plannedRun = id;
});

for (const sport of ["cycling", "swimming"]) {
  await check(`${sport}-backdated-entry`, "sam", async (page, _userId, trainingDate) => {
    await go(page, `/today/log?sport=${sport}&counts=unplanned`);
    await page.getByLabel("When", { exact: true }).fill(trainingDate);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByLabel("Training date", { exact: true })).toHaveValue(trainingDate);
    await expect(page.getByLabel("Start time", { exact: true })).toHaveValue("");
    await field(page, sport === "swimming" ? "Elapsed time" : "Duration", "3000");
    await choose(page, "effort", "unsure");
    await page.getByRole("button", { name: /^Save (ride|swim)$/ }).click();
    expect(
      await page.getByLabel("Start time", { exact: true }).evaluate((e) => e.checkValidity()),
    ).toBe(false);
    await field(page, "Start time", "06:30");
    const id = await save(page);
    const { activity } = await record(sport, id);
    expect(activity.occurred_on.toISOString().slice(0, 10)).toBe(trainingDate);
    expect(activity.duration_ms).toBe(1800000);
    artifacts[`${sport}Backdated`] = id;
  });
}

for (const sport of ["running", "cycling", "swimming"]) {
  await check(`${sport}-button-only-draft`, "sam", async (page) => {
    await fresh(page, sport);
    await page.getByRole("button", { name: "A minute more", exact: true }).click();
    if (sport === "swimming") {
      await choose(page, "distanceMethod", "manual");
      await page.getByRole("button", { name: "More, 25 m", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "More, 0.1 km", exact: true }).click();
    }
    await page.getByRole("button", { name: /^Distance in / }).click();
    await expect(page.getByText("Draft kept", { exact: true })).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(
      page.getByLabel(sport === "swimming" ? "Elapsed time" : "Duration", { exact: true }),
    ).toHaveValue("1:00");
    await expect(
      page.getByRole("button", {
        name: sport === "swimming" ? /^Distance in yd/ : /^Distance in mi/,
      }),
    ).toBeVisible();
    if (sport === "swimming")
      await expect(page.getByLabel("Distance", { exact: true })).toHaveValue("25");
    else
      await expect(page.getByLabel("Distance, after the point", { exact: true })).toHaveValue("1");
  });
}

for (const sport of ["running", "cycling", "swimming"]) {
  for (const theme of ["light", "dark"]) {
    for (const [width, font] of [
      [390, 16],
      [320, 16],
      [320, 32],
      [1440, 16],
    ]) {
      await check(
        `${sport}-layout-${theme}-${width}-${font}`,
        "priya",
        async (page) => {
          await fresh(page, sport);
          await field(page, sport === "swimming" ? "Elapsed time" : "Duration", "10530");
          if (sport === "swimming") await choose(page, "distanceMethod", "manual");
          await field(page, "Distance", sport === "swimming" ? "10000" : "123.45");
          await choose(page, "effort", "4");
          await details(page);
          await field(page, "Average heart rate", "155");
          await field(page, "Maximum heart rate", "180");
          await field(page, "Title", "An ordinary training session");
          await field(page, "Notes", "Every measurement remains readable on a narrow screen.");
          await page.evaluate((size) => {
            document.documentElement.style.fontSize = `${size}px`;
          }, font);
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({
            path: `${output}/${sport}-${theme}-${width}-${font}.png`,
            fullPage: true,
            scale: "css",
          });
          const geometry = await page.locator(".row-stepper-figure input").evaluateAll((inputs) =>
            inputs.map((input) => {
              const style = getComputedStyle(input);
              const ctx = document.createElement("canvas").getContext("2d");
              ctx.font = style.font;
              const needed = ctx.measureText(input.value).width;
              const available =
                input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
              return { value: input.value, needed, available };
            }),
          );
          artifacts[`${sport}-${theme}-${width}-${font}`] = geometry;
          expect(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
            ),
          ).toBe(true);
          expect(geometry.filter((item) => item.needed > item.available + 1)).toEqual([]);
          const axe = await new AxeBuilder({ page })
            .include("main")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          expect(
            axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          ).toEqual([]);
        },
        { viewport: { width, height: width === 1440 ? 1000 : 844 }, colorScheme: theme },
      );
    }
  }
}

await browser.close();
await sql.end();
console.log(`${results.filter((r) => r.passed).length}/${results.length} passed (${engine})`);
if (results.some((r) => !r.passed)) process.exitCode = 1;
