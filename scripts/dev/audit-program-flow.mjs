// Current programme entry points -> review -> activation -> a real logged session.
// Run only against the disposable database created by scripts/dev/audit.mjs setup.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { devices, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { launch } from "./audit-engines.mjs";
import { answerFirstStep, choosePlace, signUp } from "./audit-controls.mjs";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const database = process.env.AUDIT_DATABASE_URL;
const target = new URL(database ?? "http://invalid");
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname) ||
  target.search ||
  target.hash
)
  throw new Error("Set AUDIT_DATABASE_URL to a local overload_audit database.");

const device = process.env.AUDIT_DEVICE ?? "android";
const output = `${process.env.AUDIT_OUTPUT_DIR ?? "output/audit-program-flow"}/${device}`;
await mkdir(output, { recursive: true });
const sql = postgres(database, { max: 1 });
const browser = await launch(device === "iphone" ? "webkit" : "chromium");
const context = await browser.newContext({
  ...devices[
    device === "iphone" ? "iPhone 13" : device === "desktop" ? "Desktop Chrome" : "Pixel 7"
  ],
  baseURL,
  timezoneId: "UTC",
  serviceWorkers: "block",
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
page.setDefaultNavigationTimeout(120_000);
page.on("dialog", (dialog) => dialog.accept());
const results = [],
  pageErrors = [];
page.on("pageerror", (error) => pageErrors.push({ url: page.url(), message: error.message }));
const button = (name) => page.getByRole("button", { name, exact: true });
const field = (name) => page.getByLabel(name, { exact: true });
const go = (route) => page.goto(route, { waitUntil: "networkidle" });
let userId;
const email = `programflow${Date.now().toString(36)}@local.test`;
async function disclosure(name) {
  const summary = page
    .locator("summary")
    .filter({ hasText: new RegExp(`^${name}`) })
    .first();
  if ((await summary.locator("..").getAttribute("open")) === null) await summary.click();
}
async function step(name, run) {
  try {
    await run();
    await page.waitForLoadState("networkidle");
    const size = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    assert.ok(size.content <= size.viewport + 1, `Overflow: ${JSON.stringify(size)}`);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
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
    await page
      .screenshot({ path: `${output}/${name}-failure.png`, fullPage: true })
      .catch(() => {});
    console.error(`FAIL ${name}: ${error.message}`);
    throw error;
  } finally {
    await writeFile(
      `${output}/results.json`,
      JSON.stringify({ email, userId, results, pageErrors }, null, 2),
    );
  }
}
async function activate(name, sport) {
  await button("Save draft").click();
  await page.getByText("Draft saved.", { exact: true }).waitFor();
  const [draft] =
    await sql`select id, blueprint from program_drafts where user_id=${userId} and blueprint->>'name'=${name} order by created_at desc limit 1`;
  assert.equal(draft.blueprint.sport, sport);
  await button("Review programme").click();
  await page.waitForURL(/\/plan\/drafts\/[0-9a-f-]+$/);
  await page
    .getByRole("button", { name: /^(Start programme|Replace programme|Use these changes)$/ })
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith("/plan/drafts/"));
  const [program] =
    await sql`select id, family_id, name, repeats, blueprint from programs where user_id=${userId} and sport=${sport} and status='active'`;
  assert.equal(program.name, name);
  // Strength is materialised into day/exercise rows; endurance retains its authoring document.
  return { ...program, blueprint: program.blueprint ?? draft.blueprint };
}
async function strength(mode) {
  let program, sessionId;
  const name = `Flow audit strength ${mode}`;
  await step(`strength-${mode}-build-review-activate`, async () => {
    await go("/plan/new?sport=strength");
    await page.getByRole("link", { name: mode === "once" ? /^Progressive/ : /^Repeating/ }).click();
    await field("Programme name").fill(name);
    await field("Programme notes").fill("Keep each day's own targets and progression history.");
    await field("Repeats").selectOption(mode);
    if (mode !== "once") await field("Number of weeks").fill("2");
    await button("Add a day").click();
    await field("Day name").fill("Strength A");
    if (mode === "weekly")
      await field("Usual weekday").selectOption(String(new Date().getUTCDay() || 7));
    await disclosure("Day details");
    await field("Focus").fill("Controlled strength");
    await field("Time").fill("About twenty minutes");
    await field("Effort").fill("Two reps in reserve");
    await field("Day notes").fill("Stop if technique changes.");
    await field("Exercise to add").selectOption({ label: "High-bar barbell squat" });
    await button("Add exercise").click();
    await field("Sets").fill("1");
    await field("Reps from").fill("8");
    await field("Reps to").fill("10");
    await disclosure("Rest, effort and progression");
    await field("Rest seconds from").fill("60");
    await field("Rest seconds to").fill("90");
    const rir = page.getByRole("checkbox", { name: "Set a reps-in-reserve target" });
    if (!(await rir.isChecked())) await rir.check();
    await field("RIR from").fill("2");
    await field("RIR to").fill("3");
    await field("Load note").fill("Use a comfortable starting load.");
    await field("Progression notes").fill("Add load after meeting the top of the range.");
    await field("Exercise notes").fill("Maintain a controlled descent.");
    program = await activate(name, "strength");
    assert.deepEqual(program.blueprint.days[0].exercises[0].reps, [8, 10]);
    assert.deepEqual(program.blueprint.days[0].exercises[0].rir, [2, 3]);
    assert.equal(program.blueprint.repeats, mode);
  });
  await step(`strength-${mode}-workout-completed`, async () => {
    await go("/today/log?sport=strength");
    await page
      .getByRole("link", { name: /Next in your programme|Cycle \d+$/ })
      .first()
      .click();
    await button("Start workout").click();
    await field("Hours last night").fill("7.5");
    await button("Save and start").click();
    await page.waitForURL(/\/workouts\/[0-9a-f-]+$/);
    sessionId = new URL(page.url()).pathname.split("/")[2];
    await page
      .getByRole("button", { name: /High-bar barbell squat/ })
      .first()
      .click();
    await page.locator(".entry").waitFor();
    if (!(await page.locator(".entry input").count()))
      await page.locator('.entry [data-field="load"] button.stepper-figure').click();
    await page.getByLabel(/^Load in /).fill("40");
    await field("Reps").fill("10");
    await page.getByRole("textbox", { name: "RIR", exact: true }).fill("3");
    await page.locator(".entry").getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /^Set 1 saved:/ })
      .waitFor({ state: "attached" });
    await page.locator(".session-back").click();
    await page.getByRole("link", { name: "Finish", exact: true }).click();
    await field("Notes").fill(`Completed ${mode} programme session.`);
    await button("Finish session").click();
    await page.waitForURL((url) => !url.pathname.endsWith("/finish"));
    await expect
      .poll(
        async () =>
          (await sql`select completed_at from workout_sessions where id=${sessionId}`)[0]
            ?.completed_at,
      )
      .toBeTruthy();
    const rows =
      await sql`select s.* from set_logs s join workout_exercises e on e.id=s.workout_exercise_id where e.workout_session_id=${sessionId}`;
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].weight), 40);
    assert.equal(rows[0].reps, 10);
    await go("/plan/strength");
  });
}
async function endurance(sport, mode) {
  let program, occurrence;
  const name = `Flow audit ${sport} ${mode}`;
  await step(`${sport}-${mode}-build-review-activate`, async () => {
    await go(`/plan/new?sport=${sport}`);
    await page
      .getByRole("link", { name: mode === "progressive" ? /^Progressive/ : /^Repeating/ })
      .click();
    await field("Programme name").fill(name);
    await disclosure("Programme settings");
    await field("Length in weeks").fill("2");
    await field("Programme notes").fill(
      "Keep the requested targets separate from the actual results.",
    );
    await field("Session name").fill(`${sport} first session`);
    await field("Minutes from").fill("20");
    await field("Minutes to").fill("30");
    const distance = sport === "swimming" ? "Metres" : "Kilometres";
    await field(`${distance} from`).fill(
      sport === "swimming" ? "800" : sport === "cycling" ? "10" : "3",
    );
    await field(`${distance} to`).fill(
      sport === "swimming" ? "1000" : sport === "cycling" ? "15" : "5",
    );
    await field("Effort out of 5 from").fill("2");
    await field("Effort out of 5 to").fill("3");
    await disclosure("Date and instructions");
    await field("Time").fill("07:30");
    await field("Instructions").fill("Keep effort comfortable and record what actually happened.");
    if (mode === "repeating") {
      await disclosure("Repeat or remove");
      await field("Repeat every (days)").fill("7");
      await button("Repeat through programme").click();
    } else {
      await field("Week").selectOption("2");
      await button("Add session").click();
      await field("Session name").fill(`${sport} second week progression`);
      await field("Minutes from").fill("30");
      await field("Minutes to").fill("40");
    }
    program = await activate(name, sport);
    assert.equal(program.blueprint.enduranceSessions.length, 2);
    assert.deepEqual(
      program.blueprint.enduranceSessions[0].prescription.sessionTargets.durationMs,
      [1200000, 1800000],
    );
    [occurrence] =
      await sql`select o.id, v.prescription from planned_occurrences o join occurrence_versions v on v.id=o.current_revision_id where o.user_id=${userId} and o.family_id=${program.family_id} order by v.scheduled_on limit 1`;
    assert.ok(occurrence);
    await go(`/plan/${sport}`);
    await page.locator(`a[href="/plan/sessions/${occurrence.id}"]`).first().click();
    await expect(
      page.getByRole("heading", { name: `${sport} first session`, exact: true }),
    ).toBeVisible();
  });
  await step(`${sport}-${mode}-session-logged-and-linked`, async () => {
    await page
      .getByRole("link", { name: /^Log (run|ride|swim|session)/i })
      .first()
      .click();
    if (sport === "swimming") {
      await field("Elapsed time").fill("2500");
      await page.getByRole("radio", { name: "Enter distance", exact: true }).locator("..").click();
      await field("Distance").fill("900");
    } else {
      await field("Duration").fill("2500");
      await field("Distance").fill(sport === "running" ? "4" : "12");
      await field("Distance, after the point").fill("0");
    }
    await page
      .getByRole("radiogroup", { name: "Effort", exact: true })
      .getByText("3", { exact: true })
      .click();
    await button(
      `Save ${sport === "running" ? "run" : sport === "cycling" ? "ride" : "swim"}`,
    ).click();
    await page.waitForURL((url) => /^\/progress\/activities\/[0-9a-f-]+$/.test(url.pathname));
    const id = new URL(page.url()).pathname.split("/").at(-1);
    const [activity] =
      await sql`select sport, occurrence_id, duration_ms from activities where id=${id} and user_id=${userId}`;
    assert.equal(activity.sport, sport);
    assert.equal(activity.occurrence_id, occurrence.id);
    assert.equal(Number(activity.duration_ms), 1500000);
    const [version] =
      await sql`select v.prescription from planned_occurrences o join occurrence_versions v on v.id=o.current_revision_id where o.id=${occurrence.id}`;
    assert.deepEqual(version.prescription, occurrence.prescription);
    await go(`/plan/sessions/${occurrence.id}`);
    await expect(page.getByRole("link", { name: /^Log (run|ride|swim|session)/i })).toHaveCount(0);
  });
}

async function coachFields() {
  await page.setViewportSize(devices[device === "iphone" ? "iPhone 13" : "Pixel 7"].viewport);
  await step("strength-coach-answers-autosave-and-review", async () => {
    await go("/plan/new?sport=strength&method=coach");
    await field("What are you training for?").selectOption("other");
    await field("Your goal").fill("Build strength with three manageable sessions.");
    await field("Weight (kg)").fill("80");
    await field("Age").fill("32");
    await field("Height (cm)").fill("180");
    await field("Your brief").fill("Keep the plan compatible with running and swimming.");
    await button("Continue").click();
    await field("Sessions a week").fill("3");
    await field("Usual session length (minutes)").fill("45");
    await button("Continue").click();
    await field("How long have you been training?").selectOption("intermediate");
    await field("Injuries or movements to avoid").fill("Avoid uncomfortable overhead movements.");
    await field("Exercises you enjoy or dislike").fill("Prefer squats and rows.");
    await button("Continue").click();
    await field("What you lift now").fill("Squat 40 kg for 10 reps with 3 in reserve.");
    await button("Continue").click();
    await expect(button("Create my programme")).toBeDisabled();
    const [intake] =
      await sql`select answers from coach_intakes where user_id=${userId} and sport='strength' order by updated_at desc limit 1`;
    assert.equal(intake.answers.weightKg, 80);
    assert.equal(intake.answers.sessionsPerWeek, 3);
    assert.equal(intake.answers.minutesPerSession, 45);
    await go("/plan/new?sport=strength&method=coach");
    await expect(field("Your goal")).toHaveValue("Build strength with three manageable sessions.");
  });
  for (const sport of ["running", "cycling", "swimming"]) {
    await step(`${sport}-coach-partial-save-reload-and-inputs`, async () => {
      await go(`/plan/new?sport=${sport}&method=coach`);
      const brief = sport === "running" ? "In your own words" : "Your brief";
      await field(brief).fill(`Keep this partial ${sport} brief.`);
      await button("Save answers").click();
      await page.getByText("Answers saved.", { exact: true }).waitFor();
      await go(`/plan/new?sport=${sport}&method=coach`);
      await expect(field(brief)).toHaveValue(`Keep this partial ${sport} brief.`);
      if (sport === "running") {
        await field("What are you training for?").selectOption("race");
        await field("Distance").selectOption("5k");
        await field("Race date").fill(
          new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
        );
        await field("Goal time").fill("2400");
        await field("A recent race or time trial").selectOption("5k");
        await field("Time").fill("2600");
        await field("A usual week, in km").fill("15");
        await field("Longest run this month, in km").fill("7");
        await field("Your running").selectOption("intermediate");
        await field("Runs a week").fill("3");
        for (const day of ["Monday", "Wednesday", "Sunday"]) await button(day).click();
        await field("Long run day").selectOption("7");
        // Time is a limit on the days that have one, and optional (ADR 0063).
        await page.locator("summary").filter({ hasText: "Any days with a time limit?" }).click();
        await field("Monday (minutes)").fill("40");
        await field("Wednesday (minutes)").fill("40");
        await field("Terrain").selectOption("flat");
        await field("Anything that limits your running?").fill(
          "Keep recovery days between hard runs.",
        );
      } else {
        const ride = sport === "cycling";
        await field("What are you training for?").fill(`Build consistent ${sport}.`);
        await field(`Your ${sport}`).selectOption("intermediate");
        await field(ride ? "What you ride now" : "What you swim now").fill(
          "Two comfortable sessions a week.",
        );
        await field(ride ? "Rides a week" : "Swims a week").fill("3");
        await button("Monday").click();
        await button("Thursday").click();
        await button("Saturday").click();
        await field(ride ? "Minutes on a usual ride" : "Minutes on a usual swim").fill("45");
        await field(
          ride ? "Where and with what can you ride?" : "Where and with what can you swim?",
        ).fill(ride ? "Road bike and indoor trainer" : "25 metre pool");
        await field(
          ride ? "Anything that limits your riding?" : "Anything that limits your swimming?",
        ).fill("Build volume gradually.");
      }
      await button("Save answers").click();
      await page.getByText("Answers saved.", { exact: true }).waitFor();
      await expect(button("Ask the coach for a programme")).toBeDisabled();
      const [intake] =
        await sql`select answers from coach_intakes where user_id=${userId} and sport=${sport} order by updated_at desc limit 1`;
      assert.equal(intake.answers.programmeSport, sport);
      assert.deepEqual(
        intake.answers.sports.map((entry) => entry.sport),
        [sport],
      );
      assert.equal(intake.answers.sessionsPerWeek, 3);
      if (sport === "running")
        assert.deepEqual(intake.answers.sports[0].running.timeLimits, [
          { day: 1, minutes: 40 },
          { day: 3, minutes: 40 },
        ]);
      await go(`/plan/new?sport=${sport}&method=coach`);
      await expect(
        field(
          sport === "running"
            ? "Runs a week"
            : sport === "cycling"
              ? "Rides a week"
              : "Swims a week",
        ),
      ).toHaveValue("3");
    });
  }
}

async function visualStates() {
  for (const sport of ["strength", "running", "cycling", "swimming"]) {
    for (const [state, route] of [
      ["overview", `/plan/${sport}`],
      ["builder", `/plan/${sport}/edit?mode=repeating`],
      ["coach", `/plan/new?sport=${sport}&method=coach`],
    ]) {
      await step(`${sport}-${state}-layout-and-accessibility`, async () => {
        await go(route);
        if (state === "builder") await expect(field("Programme name")).toBeEnabled();
        if (state === "coach")
          await expect(page.getByText("Opening your questions…", { exact: true })).toBeHidden();
        const result = await new AxeBuilder({ page }).include("main").analyze();
        await writeFile(
          `${output}/${sport}-${state}-accessibility.json`,
          JSON.stringify(result.violations, null, 2),
        );
        assert.deepEqual(
          result.violations
            .filter((issue) => ["critical", "serious"].includes(issue.impact))
            .map((issue) => ({ id: issue.id, description: issue.description })),
          [],
        );
      });
    }
  }
}

async function saveRecovery() {
  for (const sport of ["strength", "running", "cycling", "swimming"]) {
    await step(`${sport}-draft-offline-pending-and-retry`, async () => {
      await go(`/plan/${sport}/edit?mode=repeating`);
      const name = `Retained ${sport} draft`;
      await field("Programme name").fill(name);
      if (sport === "strength") {
        await button("Add a day").click();
        await field("Exercise to add").selectOption({ label: "High-bar barbell squat" });
        await button("Add exercise").click();
      }
      try {
        await context.setOffline(true);
        await button("Save draft").click();
        await page
          .getByText(
            "Connection lost. Your inputs are still here. Check the saved result before retrying.",
            { exact: true },
          )
          .waitFor();
        await expect(field("Programme name")).toHaveValue(name);
        await expect(button("Save draft")).toBeEnabled();
        await page.screenshot({
          path: `${output}/${sport}-draft-offline-error.png`,
          fullPage: true,
        });
      } finally {
        await context.setOffline(false);
      }
      let release,
        requested = false;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const matcher = `**/plan/${sport}/edit*`;
      const hold = async (route) => {
        if (route.request().method() === "POST") {
          requested = true;
          await gate;
        }
        await route.continue();
      };
      await page.route(matcher, hold);
      try {
        await button("Save draft").click();
        await expect.poll(() => requested).toBe(true);
        await expect(button("Save draft")).toBeDisabled();
        await expect(button("Saving…")).toBeDisabled();
      } finally {
        release();
        await page.unrouteAll({ behavior: "wait" });
      }
      await page.getByText("Draft saved.", { exact: true }).waitFor();
      const drafts =
        await sql`select blueprint from program_drafts where user_id=${userId} and blueprint->>'name'=${name}`;
      assert.equal(drafts.length, 1);
      assert.equal(drafts[0].blueprint.sport, sport);
    });
  }
}

async function editorFields(filter) {
  if (filter.test("strength-fields"))
    await step("strength-fields-boundaries-and-measurements", async () => {
      await go("/plan/strength/edit?mode=repeating");
      await field("Programme name").fill("Strength field audit");
      await button("Add a day").click();
      await expect(field("Programme name")).toHaveValue("Strength field audit");
      await field("Exercise to add").selectOption({ label: "High-bar barbell squat" });
      await button("Add exercise").click();
      await field("Sets").fill("0");
      await button("Save draft").click();
      await expect(field("Sets")).toHaveAttribute("aria-invalid", "true");
      await expect(button("Save draft")).toBeEnabled();
      await field("Sets").fill("2");
      await field("Count each set in").selectOption("duration");
      await expect(field("Seconds from")).toHaveValue("");
      await field("Seconds from").fill("30");
      await field("Seconds to").fill("60");
      await field("Count each set in").selectOption("distance");
      await expect(field("Metres from")).toHaveValue("");
      await field("Metres from").fill("20");
      await field("Metres to").fill("40");
      await disclosure("Rest, effort and progression");
      await field("Rest seconds from").fill("60");
      await field("Rest seconds to").fill("1201");
      await button("Save draft").click();
      await expect(field("Rest seconds to")).toHaveAttribute("aria-invalid", "true");
      await expect(button("Save draft")).toBeEnabled();
      await field("Rest seconds to").fill("90");
      await page.getByRole("checkbox", { name: "Per side", exact: true }).check();
      await field("Superset").fill("A");
      await button("Save draft").click();
      await page.getByText("Draft saved.", { exact: true }).waitFor();
      const [draft] =
        await sql`select id, blueprint from program_drafts where user_id=${userId} and blueprint->>'name'='Strength field audit' order by created_at desc limit 1`;
      const exercise = draft.blueprint.days[0].exercises[0];
      assert.deepEqual(exercise.distance, [20, 40]);
      assert.equal(exercise.reps, undefined);
      assert.equal(exercise.duration, undefined);
      assert.equal(exercise.perSide, true);
      assert.equal(exercise.supersetGroup, "A");
      await go(`/plan/strength/edit?draft=${draft.id}`);
      await expect(field("Count each set in")).toHaveValue("distance");
      await disclosure("Day details");
      await button("Duplicate day").click();
      await disclosure("Day details");
      await button("Move day earlier").click();
      await disclosure("Day details");
      await button("Remove day").click();
      await button("Undo remove day").click();
      await expect(field("Day to edit").locator("option")).toHaveCount(2);
    });
  for (const sport of ["running", "cycling", "swimming"]) {
    if (!filter.test(`${sport}-fields`)) continue;
    await step(`${sport}-fields-boundaries-and-recovery`, async () => {
      await go(`/plan/${sport}/edit?mode=repeating`);
      await field("Programme name").fill(`Boundary audit ${sport}`);
      await disclosure("Programme settings");
      await field("Length in weeks").fill("1000000000");
      await button("Save draft").click();
      await expect(field("Length in weeks")).toHaveAttribute("aria-invalid", "true");
      await disclosure("Repeat or remove");
      await expect(button("Repeat through programme")).toBeDisabled();
      await expect(button("Add session")).toBeDisabled();
      await field("Length in weeks").fill("1.5");
      await expect(button("Repeat through programme")).toBeDisabled();
      await field("Length in weeks").fill("2");
      await field("Minutes from").fill("");
      await expect(field("Minutes to")).toHaveValue("30");
      await button("Save draft").click();
      await expect(field("Minutes from")).toHaveAttribute("aria-invalid", "true");
      await expect(button("Save draft")).toBeEnabled();
      await field("Minutes from").fill("40");
      await button("Save draft").click();
      await expect(field("Minutes to")).toHaveAttribute("aria-invalid", "true");
      await expect(button("Save draft")).toBeEnabled();
      await field("Minutes from").fill("20");
      await field("Effort out of 5 from").fill("6");
      await button("Save draft").click();
      await expect(field("Effort out of 5 from")).toHaveAttribute("aria-invalid", "true");
      await expect(button("Save draft")).toBeEnabled();
      await field("Effort out of 5 from").fill("2");
      await field("Effort out of 5 to").fill("3");
      await disclosure("Date and instructions");
      const date = await field("Session date").inputValue();
      await field("Session date").fill("2020-01-01");
      await expect(field("Session date")).toHaveAttribute("aria-invalid", "true");
      await button("Save draft").click();
      await expect(field("Session name")).toBeVisible();
      await field("Session date").fill(date);
      if (sport === "running") {
        await field("Pace per km, m:ss").fill("30");
        await field("Programme name").click();
        await expect(field("Pace per km, m:ss")).toHaveValue("0:30");
        await button("Save draft").click();
        await expect(field("Pace per km, m:ss")).toHaveAttribute("aria-invalid", "true");
        await field("Pace per km, m:ss").fill("530");
        await field("Programme name").click();
        await field("Pace up to, m:ss").fill("30");
        await field("Programme name").click();
        await expect(field("Pace up to, m:ss")).toHaveAttribute("aria-invalid", "true");
        await field("Pace per km, m:ss").fill("");
        await field("Programme name").click();
        await expect(field("Pace up to, m:ss")).toBeDisabled();
        await expect(field("Pace up to, m:ss")).toHaveValue("");
        await field("Pace per km, m:ss").fill("530");
        await field("Programme name").click();
        await field("Zone").selectOption("2");
        await button("Add repeats").click();
        await field("Times").fill("101");
        await field("Programme name").click();
        await expect(field("Times")).toHaveValue("101");
        await expect(field("Times")).toHaveAttribute("aria-invalid", "true");
        await button("Save draft").click();
        await field("Times").fill("4");
        await field("Programme name").click();
      }
      await disclosure("Repeat or remove");
      await field("Repeat every (days)").fill("0");
      await expect(button("Repeat through programme")).toBeDisabled();
      await field("Repeat every (days)").fill("7");
      await button("Repeat through programme").click();
      await expect(field("Apply workout changes to")).toBeVisible();
      await field("Apply workout changes to").selectOption("this");
      await field("Session name").fill("One session only");
      await button("Save draft").click();
      await page.getByText("Draft saved.", { exact: true }).waitFor();
      const [draft] =
        await sql`select blueprint from program_drafts where user_id=${userId} and blueprint->>'name'=${`Boundary audit ${sport}`} order by created_at desc limit 1`;
      assert.deepEqual(
        draft.blueprint.enduranceSessions.map((entry) => entry.name),
        ["One session only", "Session 1"],
      );
      const accessibility = await new AxeBuilder({ page }).include("main").analyze();
      await writeFile(
        `${output}/${sport}-accessibility.json`,
        JSON.stringify(accessibility.violations, null, 2),
      );
      assert.deepEqual(
        accessibility.violations
          .filter((issue) => ["critical", "serious"].includes(issue.impact))
          .map((issue) => ({ id: issue.id, description: issue.description })),
        [],
      );
    });
  }
  if (["running", "cycling", "swimming"].some((sport) => filter.test(`${sport}-fields`)))
    await step("narrow-screen-large-text", async () => {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await expect(field("Session name")).toBeVisible();
    });
}

try {
  await step("onboarding-all-sports", async () => {
    await go("/signup");
    await signUp(page, { name: "Programme flow audit", email, password: "ProgramFlow123!" });
    await answerFirstStep(page, {
      sports: ["Strength", "Running", "Cycling", "Swimming"],
      weight: "kg",
      distance: "km",
      timeZone: "UTC",
    });
    await choosePlace(page, { name: "Programme flow gym" });
    if (/\/equipment$/.test(new URL(page.url()).pathname)) await button("Continue").click();
    await button("Log my own workouts").click();
    await page.waitForURL(/\/today$/);
    [{ id: userId }] = await sql`select id from auth.users where email=${email}`;
  });
  const filter = new RegExp(process.env.AUDIT_SCENARIO ?? ".*");
  for (const mode of ["rolling", "weekly", "once"])
    if (filter.test(`strength-${mode}`)) await strength(mode);
  for (const sport of ["running", "cycling", "swimming"])
    for (const mode of ["repeating", "progressive"])
      if (filter.test(`${sport}-${mode}`)) await endurance(sport, mode);
  if (
    ["strength", "running", "cycling", "swimming"].some((sport) => filter.test(`${sport}-fields`))
  )
    await editorFields(filter);
  if (filter.test("coach")) await coachFields();
  if (filter.test("save-recovery")) await saveRecovery();
  if (filter.test("visual-states")) await visualStates();
  await step("no-browser-errors", async () => assert.deepEqual(pageErrors, []));
} catch {
  process.exitCode = 1;
} finally {
  await browser.close();
  await sql.end();
}
