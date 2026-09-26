// Real workout lifecycle, device-local draft recovery and small-screen controls.
// Each run creates a disposable athlete through the actual sign-up/onboarding UI.
import { chromium, webkit, devices, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
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
const fillSet = async (n, load, reps, rir) => {
  await page.getByLabel(`Set ${n} load, lb`, { exact: true }).fill(String(load));
  await page.getByLabel(`Set ${n} reps`, { exact: true }).fill(String(reps));
  await page.getByLabel(`Set ${n} RIR`, { exact: true }).fill(String(rir));
};
const saveSet = async (n) => {
  await page
    .getByRole("button", { name: new RegExp(`^(Save set|Retry saving set|Update set) ${n}$`) })
    .click();
  await expect(page.getByText(`Set ${n} saved`, { exact: true })).toBeAttached();
};
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
      await page.getByLabel("Weight units").selectOption("lb");
      await page.getByLabel("Time zone", { exact: true }).fill("America/New_York");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("heading", { name: "What do you train?" }).waitFor();
      for (const sport of ["Strength", "Running"]) {
        const button = page.getByRole("button", { name: sport, exact: true });
        if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
      }
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByLabel("Name", { exact: true })
        .fill(`Workout audit ${device} gym with a long name`);
      await page.getByRole("button", { name: "Add gym", exact: true }).click();
      await page.getByRole("button", { name: "Continue without machines", exact: true }).click();
      await page.getByRole("button", { name: "Start training", exact: true }).click();
      await page.getByRole("button", { name: /Start workout/ }).waitFor();
      const [profile] =
        await sql`select id, preferred_unit, time_zone, onboarded_at from profiles where username=${username}`;
      expect(profile.preferred_unit).toBe("lb");
      expect(profile.time_zone).toBe("America/New_York");
      expect(profile.onboarded_at).not.toBeNull();
      userId = profile.id;
    },
  );
  await check("a planned workout records readiness and one session identity", async () => {
    await page.getByRole("button", { name: /Start workout/ }).click();
    await page.getByLabel("Hours last night", { exact: true }).fill("7.5");
    await page.getByRole("button", { name: "Save and start", exact: true }).click();
    await page.getByRole("button", { name: /High-bar barbell squat/ }).waitFor();
    sessionId = new URL(page.url()).pathname.split("/")[2];
    const [session] =
      await sql`select sleep_hours, completed_at from workout_sessions where id=${sessionId} and user_id=${userId}`;
    expect(Number(session.sleep_hours)).toBe(7.5);
    expect(session.completed_at).toBeNull();
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
    await page.getByRole("button", { name: "Save set 2", exact: true }).click();
    await expect(page.getByText(/Connection lost\. Your entries are still here/)).toBeVisible();
    expect(
      await sql`select id from set_logs where workout_exercise_id=${exerciseId} and set_index=2`,
    ).toHaveLength(0);
    await context.setOffline(false);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByLabel("Set 2 load, lb", { exact: true })).toHaveValue("140");
    await expect(page.getByText(/Unsaved draft restored/)).toBeVisible();
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
        await page.getByRole("button", { name: "Set 2 options", exact: true }).click();
        const sheet = page.getByRole("dialog", { name: "Set 2", exact: true });
        await sheet.getByLabel("Set 2 type").selectOption("backoff");
        await sheet.getByRole("button", { name: "Increase lb", exact: true }).click();
        for (const stepper of await sheet
          .getByRole("button", { name: /^(Increase|Decrease) / })
          .all()) {
          const bounds = await stepper.boundingBox();
          expect(bounds.width).toBeGreaterThanOrEqual(44);
          expect(bounds.height).toBeGreaterThanOrEqual(44);
        }
        expect(
          await sheet.getByRole("textbox", { name: "lb", exact: true }).evaluate((input) => {
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
        await sheet.getByRole("button", { name: "Close sheet", exact: true }).click();
        await page.getByRole("button", { name: /^Set 2 options/ }).click();
        await sheet.getByLabel("Set 2 type").selectOption("working");
        await sheet.getByRole("button", { name: "Close sheet", exact: true }).click();
      }
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "16px";
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await saveSet(2);
    },
  );
  await check("deleting a saved row removes exactly that set", async () => {
    await page.getByRole("button", { name: "Set 2 options", exact: true }).click();
    await page.getByRole("button", { name: "Remove set 2", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await sql`select id from set_logs where workout_exercise_id=${exerciseId}`).length,
      )
      .toBe(1);
    await page.getByRole("button", { name: "Complete", exact: true }).click();
    await page.getByRole("button", { name: "All exercises", exact: true }).click();
  });
  await check(
    "finish converts body weight once and keeps the completed workout readable",
    async () => {
      await page.getByRole("link", { name: "Finish session", exact: true }).click();
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
  await check("an offline start reports a retryable error without replacing Today", async () => {
    await go("/today");
    await page.getByRole("button", { name: "More options", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await page.getByRole("button", { name: "Start an ad hoc session", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /Could not start the session/ }),
    ).toBeVisible();
    await context.setOffline(false);
    await page.getByRole("button", { name: "Start an ad hoc session", exact: true }).click();
    await page.getByRole("button", { name: "Save and start", exact: true }).waitFor();
  });
  await page.getByRole("link", { name: "Skip check-in", exact: true }).click();
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
          .getByRole("radio", { name: new RegExp(`^${exercise.name}`) })
          .locator("..")
          .click();
        await page.getByRole("button", { name: "Add to session", exact: true }).click();
        await page.getByRole("button", { name: new RegExp(exercise.name) }).click();
        await page.getByLabel(/^Set 1 load, /).fill(String(exercise.load));
        await page
          .getByLabel(`Set 1 ${exercise.label}`, { exact: true })
          .fill(String(exercise.value));
        await page.getByLabel("Set 1 RPE", { exact: true }).fill("7");
        await saveSet(1);
        await page.getByRole("button", { name: "Complete", exact: true }).click();
        await expect(page.getByRole("columnheader", { name: "RPE", exact: true })).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.reload({ waitUntil: "networkidle" });
        await expect(
          page.getByRole("columnheader", { name: exercise.column, exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("cell", { name: "7", exact: true })).toBeVisible();
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
        await page.getByRole("button", { name: "All exercises", exact: true }).click();
      },
    );
  }
  await check("no uncaught browser errors", async () => expect(pageErrors).toEqual([]));
} finally {
  await context.setOffline(false);
  await browser.close();
  try {
    // This run owns only its unique signup. Cascades remove its temporary workouts and
    // body-weight readings while the shared 56-month personas remain unchanged.
    await sql`delete from auth.users where email=${`${username}@local.test`}
      and raw_user_meta_data->>'username'=${username}`;
  } finally {
    await sql.end();
  }
}
