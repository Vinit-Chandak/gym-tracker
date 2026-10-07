// Real workout lifecycle, device-local draft recovery and small-screen controls.
// Each run creates a disposable athlete through the actual sign-up/onboarding UI.
import { chromium, webkit, devices, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { chooseOnboardingUnits } from "./audit-controls.mjs";

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
  throw new Error("Local audit only.");
const device = process.env.AUDIT_DEVICE ?? "android";
const output = `${process.env.AUDIT_OUTPUT_DIR ?? "output/flow-audit"}/workout-${device}`;
await mkdir(output, { recursive: true });
const browser = await (device === "iphone" ? webkit : chromium).launch();
const context = await browser.newContext({
  ...devices[device === "iphone" ? "iPhone 13" : "Pixel 7"],
  baseURL,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const sql = postgres(database, { max: 1 });
const results = [];
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
const username = `workout${Date.now().toString(36)}`;
let userId, sessionId, exerciseId;
const go = async (route) => {
  if (page.url() !== "about:blank") await page.waitForLoadState("networkidle");
  await page.goto(route, { waitUntil: "networkidle" });
};
const chooseFirst = () => page.getByRole("button", { name: /High-bar barbell squat/ }).click();
const typeEntry = async () => {
  if (!(await page.locator(".entry input").count()))
    await page.locator('.entry [data-field="load"] button.stepper-figure').click();
};
const fillSet = async (n, load, reps, rir) => {
  await expect(page.locator(".entry")).toHaveAttribute(
    "aria-label",
    new RegExp(`^Set ${n}(?: of|$)`),
  );
  await typeEntry();
  await page.getByLabel("Load in pounds", { exact: true }).fill(String(load));
  await page.getByLabel("Reps", { exact: true }).fill(String(reps));
  await page.getByRole("textbox", { name: "RIR", exact: true }).fill(String(rir));
};
const saveSet = async (n) => {
  await page
    .locator(".entry")
    .getByRole("button", { name: /^(Save|Retry saving set \d+)$/ })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: new RegExp(`^Set ${n} saved:`) }),
  ).toBeAttached();
};
const editSet = (n) =>
  page.getByRole("button", { name: new RegExp(`^Set ${n}:.*\\. Edit$`) }).click();
const completeExercise = async () => {
  await page
    .getByRole("button", { name: "Complete, skip, superset, substitute", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Back to / })).toBeVisible();
};
const backToSession = () => page.locator(".session-back").click();
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
    await page
      .screenshot({ path: `${output}/failure-${results.length}.png`, fullPage: true })
      .catch(() => {});
    throw error;
  } finally {
    await writeFile(
      `${output}/results.json`,
      JSON.stringify({ username, userId, sessionId, results, pageErrors }, null, 2),
    );
  }
}
try {
  await check(
    "a new imperial athlete completes all five onboarding steps and adopts a programme",
    async () => {
      await go("/signup");
      await page.getByLabel("Name", { exact: true }).fill("Workout audit athlete");
      await page.locator('[name="username"]').fill(username);
      await page.getByLabel("Email", { exact: true }).fill(`${username}@local.test`);
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByLabel("Confirm password", { exact: true }).fill("password123");
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await chooseOnboardingUnits(page, "lb");
      await page.getByLabel("Time zone", { exact: true }).fill("America/New_York");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("heading", { name: "What do you train?" }).waitFor();
      for (const sport of ["Strength", "Running"]) {
        const button = page.getByRole("checkbox", { name: sport, exact: true });
        if ((await button.getAttribute("aria-checked")) !== "true") await button.click();
      }
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByLabel("Name", { exact: true })
        .fill(`Workout audit ${device} gym with a long name`);
      await page.getByRole("button", { name: "Add gym", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Start training", exact: true }).click();
      await page.getByRole("link", { name: /Start workout/ }).waitFor();
      const [profile] =
        await sql`select id, preferred_unit, time_zone, onboarded_at from profiles where username=${username}`;
      expect(profile.preferred_unit).toBe("lb");
      expect(profile.time_zone).toBe("America/New_York");
      expect(profile.onboarded_at).not.toBeNull();
      userId = profile.id;
    },
  );
  await check("a planned workout records readiness and one session identity", async () => {
    await page.getByRole("link", { name: /Start workout/ }).click();
    await page.getByLabel("Hours last night", { exact: true }).fill("7.5");
    await page.getByRole("button", { name: "Save and start", exact: true }).click();
    await page.getByRole("button", { name: /High-bar barbell squat/ }).waitFor();
    sessionId = new URL(page.url()).pathname.split("/")[2];
    const [session] =
      await sql`select sleep_hours, completed_at from workout_sessions where id=${sessionId} and user_id=${userId}`;
    expect(Number(session.sleep_hours)).toBe(7.5);
    expect(session.completed_at).toBeNull();
    await page.getByRole("button", { name: "Mark warm-up done", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await sql`select warmup_completed from workout_sessions where id=${sessionId}`)[0]
            .warmup_completed,
      )
      .toBe(true);
    await page.getByRole("button", { name: "Warm-up done. Mark not done", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await sql`select warmup_completed from workout_sessions where id=${sessionId}`)[0]
            .warmup_completed,
      )
      .toBe(false);
    await chooseFirst();
  });
  await check("set save preserves pounds and updates the row without duplication", async () => {
    await fillSet(1, 135, 5, 2);
    await saveSet(1);
    const sets =
      await sql`select s.*, e.id as exercise_id from set_logs s join workout_exercises e on e.id=s.workout_exercise_id where e.workout_session_id=${sessionId}`;
    expect(sets).toHaveLength(1);
    expect(Number(sets[0].weight)).toBe(135);
    expect(sets[0].unit).toBe("lb");
    exerciseId = sets[0].exercise_id;
  });
  await check("offline set drafts survive reload and can be explicitly retried", async () => {
    await fillSet(2, 140, 6, 2);
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await page.locator(".entry").getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/Connection lost\. Your entries are still here/)).toBeVisible();
    expect(
      await sql`select id from set_logs where workout_exercise_id=${exerciseId} and set_index=2`,
    ).toHaveLength(0);
    await context.setOffline(false);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText(/Unsaved draft restored/)).toBeVisible();
    await typeEntry();
    await expect(page.getByLabel("Load in pounds", { exact: true })).toHaveValue("140");
    await saveSet(2);
    expect(
      await sql`select id from set_logs where workout_exercise_id=${exerciseId} and set_index=2`,
    ).toHaveLength(1);
  });
  await check(
    "set options, native select and stepper stay usable at 320px and 200% text",
    async () => {
      for (const font of [16, 32]) {
        await page.setViewportSize({ width: 320, height: 568 });
        await page.evaluate((size) => {
          document.documentElement.style.fontSize = `${size}px`;
        }, font);
        await editSet(2);
        const sheet = page.getByRole("dialog", { name: "Set 2", exact: true });
        await sheet.getByLabel("Type", { exact: true }).selectOption("backoff");
        await sheet.getByRole("button", { name: /^More load,/ }).click();
        for (const stepper of await sheet.locator(".round-button").all()) {
          const bounds = await stepper.boundingBox();
          expect(bounds.width).toBeGreaterThanOrEqual(44);
          expect(bounds.height).toBeGreaterThanOrEqual(44);
        }
        expect(
          await sheet
            .getByRole("textbox", { name: "Load in pounds", exact: true })
            .evaluate((input) => {
              const font = getComputedStyle(input);
              const measure = document.createElement("canvas").getContext("2d");
              measure.font = font.font;
              return (
                measure.measureText(input.value).width <=
                input.clientWidth - parseFloat(font.paddingLeft) - parseFloat(font.paddingRight)
              );
            }),
        ).toBe(true);
        await sheet
          .getByRole("button", { name: "Close sheet", exact: true })
          .scrollIntoViewIfNeeded();
        expect(await sheet.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
          ),
        ).toBe(true);
        await page.screenshot({ path: `${output}/set-sheet-320-${font}.png` });
        await sheet.getByRole("button", { name: "Update", exact: true }).click();
        await expect(sheet).toHaveCount(0);
        await editSet(2);
        await expect(sheet.getByLabel("Type", { exact: true })).toHaveValue("backoff");
        await sheet.getByLabel("Type", { exact: true }).selectOption("working");
        await sheet.getByRole("button", { name: "Update", exact: true }).click();
        await expect(sheet).toHaveCount(0);
      }
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "16px";
      });
      await page.setViewportSize({ width: 390, height: 844 });
    },
  );
  await check("deleting a saved row removes exactly that set", async () => {
    await editSet(2);
    await page.getByRole("button", { name: "Delete this set", exact: true }).click();
    await page.getByRole("button", { name: "Delete it", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await sql`select id from set_logs where workout_exercise_id=${exerciseId}`).length,
      )
      .toBe(1);
    await completeExercise();
    await backToSession();
  });
  await check(
    "finish converts body weight once and keeps the completed workout readable",
    async () => {
      await page.getByRole("link", { name: "Finish", exact: true }).click();
      await page.getByLabel("Body weight (lb)", { exact: true }).fill("180");
      await page
        .getByLabel("Notes", { exact: true })
        .fill("Completed by the local mobile workout audit.");
      await page.getByRole("button", { name: "Finish session", exact: true }).click();
      await expect
        .poll(
          async () =>
            (await sql`select completed_at from workout_sessions where id=${sessionId}`)[0]
              .completed_at,
        )
        .not.toBeNull();
      const [weight] =
        await sql`select weight_kg from body_weight_logs where user_id=${userId} order by measured_on desc limit 1`;
      expect(Number(weight.weight_kg)).toBeCloseTo(81.6466, 1);
      await go(`/workouts/${sessionId}`);
      await expect(page.getByText(/Completed by the local mobile workout audit/)).toBeAttached();
      await go("/progress/history?kind=workout");
      await expect(page.getByRole("link", { name: /Lower A/ })).toBeVisible();
    },
  );
  await check(
    "workouts skipped on three separate days can be logged later against their original slots",
    async () => {
      await go("/today");
      await page.getByRole("button", { name: /^More options/ }).click();
      await page.getByRole("button", { name: "Skip this session", exact: true }).click();
      await page.getByLabel("Reason", { exact: true }).fill("Travelling; train this day later.");
      await page.getByRole("button", { name: "Skip session", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const [program] =
        await sql`select id from programs where user_id=${userId} and status='active'`;
      const days = await sql`select id,day_index,name from program_days
        where program_id=${program.id} and includes_lifting and day_index between 2 and 4
        order by day_index`;
      expect(days).toHaveLength(3);
      const [skipped] = await sql`select * from program_slot_events where program_id=${program.id}
        and cycle_index=1 and day_index=2 and part='session'`;
      expect(skipped.status).toBe("skipped");
      expect(skipped.note).toBe("Travelling; train this day later.");
      // Simulate the intervening calendar days without changing the machine's clock.
      // The first skip came through the real form; the other two are historical fixtures.
      await sql`update program_slot_events set occurred_on=current_date-6
        where id=${skipped.id}`;
      for (const day of days.slice(1))
        await sql`insert into program_slot_events
          (user_id,program_id,cycle_index,day_index,part,status,occurred_on,note)
          values (${userId},${program.id},1,${day.day_index},'session','skipped',
            current_date-${8 - day.day_index}::integer,'Historical missed session: work and travel')`;
      const otherSlots = await sql`select id,status,workout_session_id from program_slot_events
        where program_id=${program.id} and not (cycle_index=1 and day_index between 2 and 4 and part='session')
        order by id`;
      const otherOccurrences =
        await sql`select o.id,o.disposition,o.current_revision_id,v.scheduled_on
        from planned_occurrences o join occurrence_versions v on v.id=o.current_revision_id
        where o.user_id=${userId} order by o.id`;
      for (const day of days) {
        await go("/today/choose");
        await page
          .getByRole("link", { name: `Start skipped workout: ${day.name}`, exact: true })
          .click();
        await page.getByRole("button", { name: "Skip check-in", exact: true }).click();
        await page.waitForURL(/\/workouts\/[0-9a-f-]+$/);
        const resumedId = new URL(page.url()).pathname.split("/")[2];
        const [resumed] =
          await sql`select program_day_id,cycle_index from workout_sessions where id=${resumedId}`;
        expect(resumed).toMatchObject({ program_day_id: day.id, cycle_index: 1 });
        const [first] =
          await sql`select e.name from workout_exercises w join exercises e on e.id=w.exercise_id
          where w.workout_session_id=${resumedId} order by w.order_index limit 1`;
        await page
          .getByRole("button", {
            name: new RegExp(first.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
          })
          .first()
          .click();
        const machineAnswer = page.getByRole("button", { name: "Not sure", exact: true });
        if (await machineAnswer.count()) await machineAnswer.click();
        await fillSet(1, 65, 8, 3);
        await saveSet(1);
        await backToSession();
        await page.getByRole("link", { name: "Finish", exact: true }).click();
        await page
          .getByLabel("Notes", { exact: true })
          .fill("Logged later after the missed training day.");
        await page.getByRole("button", { name: "Finish session", exact: true }).click();
        await expect
          .poll(
            async () =>
              (
                await sql`select status from program_slot_events
          where program_id=${program.id} and cycle_index=1 and day_index=${day.day_index} and part='session'`
              )[0]?.status,
          )
          .toBe("completed");
        const [event] = await sql`select workout_session_id from program_slot_events
          where program_id=${program.id} and cycle_index=1 and day_index=${day.day_index} and part='session'`;
        expect(event.workout_session_id).toBe(resumedId);
        expect(
          await sql`select id from workout_sessions
          where user_id=${userId} and program_day_id=${day.id} and cycle_index=1`,
        ).toHaveLength(1);
      }
      expect(
        await sql`select id,status,workout_session_id from program_slot_events
        where program_id=${program.id} and not (cycle_index=1 and day_index between 2 and 4 and part='session')
        order by id`,
      ).toEqual(otherSlots);
      expect(
        await sql`select o.id,o.disposition,o.current_revision_id,v.scheduled_on
        from planned_occurrences o join occurrence_versions v on v.id=o.current_revision_id
        where o.user_id=${userId} order by o.id`,
      ).toEqual(otherOccurrences);
    },
  );
  await check(
    "an offline start keeps the check-in and starts nothing until it is sent",
    async () => {
      await go("/today");
      await page.getByRole("button", { name: /^More options/ }).click();
      await page.getByRole("link", { name: "Start an unplanned session", exact: true }).click();
      await page.getByRole("button", { name: "Save and start", exact: true }).waitFor();
      await page.waitForLoadState("networkidle");
      await context.setOffline(true);
      await page.getByRole("button", { name: "Skip check-in", exact: true }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page).toHaveURL(/\/workouts\/start\?/);
      await context.setOffline(false);
    },
  );
  await page.getByRole("button", { name: "Skip check-in", exact: true }).click();
  await page.waitForURL(/\/workouts\/[0-9a-f-]+$/);
  const additionalSessionId = new URL(page.url()).pathname.split("/")[2];
  for (const exercise of [
    { name: "Plank", label: "seconds", value: 45, load: 0, column: "Seconds" },
    { name: "Farmer's carry", label: "metres", value: 30, load: 40, column: "Metres" },
  ]) {
    await check(
      `${exercise.name} retains its recorded measure and RPE after completion and reload`,
      async () => {
        await page.getByRole("link", { name: "Add exercise", exact: true }).click();
        await page
          .getByRole("searchbox", { name: "Search exercises", exact: true })
          .fill(exercise.name);
        await page
          .getByRole("checkbox", { name: new RegExp(`^${exercise.name}`) })
          .locator("..")
          .click();
        await page.getByRole("button", { name: "Add 1 exercise", exact: true }).click();
        await page.getByRole("button", { name: new RegExp(exercise.name) }).click();
        await typeEntry();
        await page.getByLabel("Load in pounds", { exact: true }).fill(String(exercise.load));
        await page.getByLabel(exercise.column, { exact: true }).fill(String(exercise.value));
        await page.getByRole("textbox", { name: "RPE", exact: true }).fill("7");
        await saveSet(1);
        await completeExercise();
        await expect(
          page
            .locator(".log-line")
            .filter({ hasText: new RegExp(`Set 1:.*${exercise.value} ${exercise.label}, RPE 7`) }),
        ).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.reload({ waitUntil: "networkidle" });
        await expect(
          page
            .locator(".log-line")
            .filter({ hasText: new RegExp(`Set 1:.*${exercise.value} ${exercise.label}, RPE 7`) }),
        ).toBeVisible();
        const [record] = await sql`
        select s.rpe, s.rir, s.reps, s.duration_seconds, s.distance_meters
        from set_logs s
        join workout_exercises w on w.id=s.workout_exercise_id
        join exercises e on e.id=w.exercise_id
        where w.workout_session_id=${additionalSessionId} and e.name=${exercise.name}`;
        expect(Number(record.rpe)).toBe(7);
        expect(record.rir).toBeNull();
        expect(record.reps).toBeNull();
        expect(
          Number(exercise.label === "seconds" ? record.duration_seconds : record.distance_meters),
        ).toBe(exercise.value);
        await backToSession();
      },
    );
  }
  await check("superset grouping and ungrouping preserve the two recorded exercises", async () => {
    const records = await sql`select s.id,s.reps,s.duration_seconds,s.distance_meters,s.rpe
      from set_logs s join workout_exercises w on w.id=s.workout_exercise_id
      where w.workout_session_id=${additionalSessionId} order by s.id`;
    await page.getByRole("button", { name: "Superset", exact: true }).click();
    const sheet = page.getByRole("dialog");
    for (const name of ["Plank", "Farmer's carry"])
      await sheet.getByRole("checkbox", { name, exact: true }).check();
    await sheet.getByRole("button", { name: "Create superset", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (
            await sql`select distinct superset_group from workout_exercises
      where workout_session_id=${additionalSessionId} and superset_group is not null`
          ).length,
      )
      .toBe(1);
    await page.getByRole("button", { name: "Superset", exact: true }).click();
    await sheet.locator(".superset-row").click();
    await sheet.getByRole("button", { name: "Ungroup", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    expect(
      await sql`select id from workout_exercises where workout_session_id=${additionalSessionId}
      and superset_group is not null`,
    ).toHaveLength(0);
    expect(
      await sql`select s.id,s.reps,s.duration_seconds,s.distance_meters,s.rpe
      from set_logs s join workout_exercises w on w.id=s.workout_exercise_id
      where w.workout_session_id=${additionalSessionId} order by s.id`,
    ).toEqual(records);
  });
  await check("an unlogged exercise can be skipped with its reason and restored", async () => {
    await page.getByRole("link", { name: "Add exercise", exact: true }).click();
    await page
      .getByRole("searchbox", { name: "Search exercises", exact: true })
      .fill("Goblet squat");
    await page
      .getByRole("checkbox", { name: /^Goblet squat\b/ })
      .locator("..")
      .click();
    await page.getByRole("button", { name: "Add 1 exercise", exact: true }).click();
    await page.getByRole("button", { name: /Goblet squat/ }).click();
    await page
      .getByRole("button", { name: "Complete, skip, superset, substitute", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Skip exercise", exact: true })
      .click();
    await page.getByLabel("Reason", { exact: true }).fill("Leave extra recovery after travelling.");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Skip exercise", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await sql`select w.skipped_at from workout_exercises w
      join exercises e on e.id=w.exercise_id where w.workout_session_id=${additionalSessionId}
      and e.slug='goblet-squat'`
          )[0]?.skipped_at,
      )
      .not.toBeNull();
    await page
      .getByRole("button", { name: "Complete, skip, superset, substitute", exact: true })
      .click();
    await page.getByRole("dialog").getByRole("button", { name: "Unskip", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await sql`select w.skipped_at from workout_exercises w
      join exercises e on e.id=w.exercise_id where w.workout_session_id=${additionalSessionId}
      and e.slug='goblet-squat'`
          )[0]?.skipped_at,
      )
      .toBeNull();
    expect(
      await sql`select s.id from set_logs s join workout_exercises w on w.id=s.workout_exercise_id
      join exercises e on e.id=w.exercise_id where w.workout_session_id=${additionalSessionId}
      and e.slug='goblet-squat'`,
    ).toHaveLength(0);
  });
  await check(
    "substituting an unlogged exercise keeps its slot and the other exercises' sets",
    async () => {
      const [before] =
        await sql`select w.id from workout_exercises w join exercises e on e.id=w.exercise_id
      where w.workout_session_id=${additionalSessionId} and e.slug='goblet-squat'`;
      await page
        .getByRole("button", { name: "Complete, skip, superset, substitute", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "Swap the exercise", exact: true })
        .click();
      await page
        .getByRole("searchbox", { name: "Search exercises", exact: true })
        .fill("Dumbbell Romanian deadlift");
      await page
        .getByRole("radio", { name: /^Dumbbell Romanian deadlift\b/ })
        .locator("..")
        .click();
      await page.getByRole("button", { name: "Use this instead", exact: true }).click();
      await page.getByRole("button", { name: /^Dumbbell Romanian deadlift\b/ }).click();
      await expect(
        page.getByRole("heading", { name: "Dumbbell Romanian deadlift", exact: true }),
      ).toBeVisible();
      const [after] =
        await sql`select w.id,e.slug from workout_exercises w join exercises e on e.id=w.exercise_id
      where w.id=${before.id}`;
      expect(after).toEqual({ id: before.id, slug: "db-romanian-deadlift" });
      expect(
        await sql`select s.id from set_logs s join workout_exercises w on w.id=s.workout_exercise_id
      where w.workout_session_id=${additionalSessionId}`,
      ).toHaveLength(2);
      await backToSession();
      await page.getByRole("link", { name: "Finish", exact: true }).click();
      await page.getByRole("button", { name: "Finish session", exact: true }).click();
      await expect
        .poll(
          async () =>
            (
              await sql`select completed_at from workout_sessions where id=${additionalSessionId}`
            )[0].completed_at,
        )
        .not.toBeNull();
    },
  );
  await check("discarding a separate empty session leaves completed training intact", async () => {
    await go("/today");
    await page.getByRole("button", { name: /^More options/ }).click();
    await page.getByRole("link", { name: "Start an unplanned session", exact: true }).click();
    await page.getByRole("button", { name: "Skip check-in", exact: true }).click();
    await page.waitForURL(/\/workouts\/[0-9a-f-]+$/);
    const emptyId = new URL(page.url()).pathname.split("/")[2];
    await page.getByRole("link", { name: "Finish", exact: true }).click();
    await page.getByRole("button", { name: "Discard session", exact: true }).click();
    await page.waitForURL(/\/today(?:\?|$)/);
    expect(await sql`select id from workout_sessions where id=${emptyId}`).toHaveLength(0);
    expect(
      await sql`select id from workout_sessions where id=${additionalSessionId} and completed_at is not null`,
    ).toHaveLength(1);
  });
  await check("no uncaught browser errors", async () => expect(pageErrors).toEqual([]));
} finally {
  await context.setOffline(false);
  await browser.close();
  try {
    // This run owns only its unique signup. Cascades remove its temporary workouts and
    // body-weight readings while the populated audit personas remain unchanged.
    await sql`delete from auth.users where email=${`${username}@local.test`}
      and raw_user_meta_data->>'username'=${username}`;
  } finally {
    await sql.end();
  }
}
