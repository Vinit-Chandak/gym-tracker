import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { devices, expect } from "@playwright/test";
import postgres from "postgres";
import { assertReadableText } from "./audit-text-readability.mjs";
import {
  addStarterChestPress,
  answerFirstStep,
  choosePlace,
  clickWithSlowNavigation,
  signUp,
} from "./audit-controls.mjs";
import { launch, skipDevice, skippedDevices } from "./audit-engines.mjs";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3101";
const database =
  process.env.AUDIT_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_56months";
const target = new URL(database);
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.search ||
  target.hash ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname)
)
  throw new Error("Local audit only.");
const output = `${process.env.AUDIT_OUTPUT_DIR ?? "output/audit-56-months"}/programme`;
await mkdir(output, { recursive: true });
const sql = postgres(database, { max: 1 });
const execute = promisify(execFile);
const results = [],
  runtimeErrors = [];
const button = (page, name) => page.getByRole("button", { name, exact: true });
const field = (page, name) => page.getByLabel(name, { exact: true });
const password = "AuditProgramme123!";
const openDisclosure = async (scope, name) => {
  const summary = scope.locator("summary").filter({ hasText: name });
  await expect(summary).toHaveCount(1);
  const details = summary.locator("..");
  if ((await details.getAttribute("open")) === null) await summary.click();
  await expect(details).toHaveAttribute("open", "");
};

async function runDevice(device) {
  const browser = await launch(device === "iphone" ? "webkit" : "chromium");
  const context = await browser.newContext({
    ...devices[device === "iphone" ? "iPhone 13" : "Pixel 7"],
    baseURL,
    timezoneId: "America/New_York",
    // The gated navigation checks need Playwright to intercept the page's requests.
    // Service-worker and offline-install behavior are covered by the food/endurance suites.
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) =>
    runtimeErrors.push({ device, url: page.url(), message: error.message }),
  );
  const network = { active: new Set(), changedAt: 0 };
  page.on("request", (request) => {
    network.active.add(request);
    network.changedAt = Date.now();
  });
  const finished = (request) => {
    network.active.delete(request);
    network.changedAt = Date.now();
  };
  page.on("requestfinished", finished);
  page.on("requestfailed", finished);
  const settle = async () => {
    const deadline = Date.now() + 20_000;
    while (network.active.size || Date.now() - network.changedAt < 750) {
      if (Date.now() > deadline) throw new Error("Page requests did not settle before navigation.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  const go = async (route) => {
    await settle();
    await page.waitForLoadState("networkidle");
    await page.goto(route, { waitUntil: "networkidle" });
  };
  const key = `auditpr${device[0]}${Date.now().toString(36)}`;
  const email = `${key}@local.test`;
  let userId, gymId, custom, draftId, activeProgram;
  const programmeName = "Audit controlled strength — practical training across busy weeks";
  const routineName = "Upper strength — controlled tempo and core stability";
  const customName = "Audit controlled chest press — slow tempo through a comfortable range";
  const step = async (name, work) => {
    try {
      await work();
      await settle();
      const width = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      assert.ok(width.document <= width.viewport + 1, `Page overflows: ${JSON.stringify(width)}`);
      await page.screenshot({ path: `${output}/${device}-${name}.png`, fullPage: true });
      results.push({ device, name, passed: true });
      console.log(`PASS ${device} ${name}`);
    } catch (error) {
      results.push({
        device,
        name,
        passed: false,
        message: error.stack,
        url: page.url(),
        text: await page
          .locator("body")
          .innerText()
          .catch(() => ""),
      });
      await page
        .screenshot({ path: `${output}/${device}-${name}-failure.png`, fullPage: true })
        .catch(() => {});
      console.error(`FAIL ${device} ${name}: ${error.message.split("\n")[0]}`);
      throw error;
    }
  };
  const cloneProposal = async () => {
    const { stdout } = await execute(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/dev/seed-audit-programme.ts", userId],
      {
        env: {
          ...process.env,
          SEED_DATABASE_URL: database,
          DATABASE_URL: database,
          DIRECT_DATABASE_URL: database,
        },
      },
    );
    return JSON.parse(stdout.trim());
  };
  try {
    await step("signup-and-custom-exercise-validation", async () => {
      await go("/signup");
      await signUp(page, { name: "Programme Audit", email, password });
      await answerFirstStep(page, {
        sports: ["Strength", "Running"],
        weight: "lb",
        timeZone: "America/New_York",
      });
      await choosePlace(page, { name: `${key} training gym` });
      await addStarterChestPress(page);
      await page.waitForURL(/\/welcome\/programme$/);
      await button(page, "Log my own workouts").click();
      await page.waitForURL(/\/today$/);
      [{ id: userId }] =
        await sql`select p.id from profiles p join auth.users u on u.id = p.id where u.email = ${email}`;
      [{ id: gymId }] = await sql`select id from gyms where user_id=${userId} and is_default`;
      await go("/exercises/new");
      await field(page, "Exercise name").fill(customName);
      await field(page, "Category").selectOption("strength");
      await field(page, "Equipment / movement type").selectOption("machine");
      await field(page, "How is one set measured?").selectOption("reps");
      await page.getByRole("checkbox", { name: "Chest", exact: true }).check();
      await field(page, "Form notes").fill(
        "Use a controlled lowering phase and keep both shoulders comfortable.",
      );
      await button(page, "Save to my exercise library").click();
      await expect(
        page.getByRole("alert").filter({ hasText: "Choose the registered equipment" }),
      ).toBeVisible();
      const [machine] =
        await sql`select id from equipment_instances where user_id=${userId} and is_active limit 1`;
      await field(page, "Registered machine (required for machine exercises)").selectOption(
        machine.id,
      );
      await clickWithSlowNavigation(
        page,
        button(page, "Save to my exercise library"),
        /\/exercises\/[0-9a-f-]{36}(?:\?|$)/,
      );
      await page.waitForURL(/\/exercises\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { name: customName, exact: true })).toBeVisible();
      [custom] =
        await sql`select id,slug,name,modality,default_prescription_type from exercises where user_id=${userId}`;
      assert.equal(custom.name, customName);
      assert.equal(custom.modality, "machine");
      assert.equal(custom.default_prescription_type, "reps");
    });
    await step("coach-intake-autosave-reload-and-reports", async () => {
      await go("/profile/programme/create");
      if (await button(page, "Set it up in detail").count())
        await button(page, "Set it up in detail").click();
      await field(page, "What are you training for?").selectOption("other");
      await field(page, "Your goal").fill(
        "Build strength steadily with three full-body sessions a week.",
      );
      await field(page, "Weight (lb)").fill("180");
      await field(page, "Age").fill("32");
      await field(page, "Height (feet)").fill("5");
      await field(page, "Inches").fill("10");
      await field(page, "Your brief").fill(
        "Three sensible strength sessions with rowing and one easy run. Keep an extra day for recovery.",
      );
      await button(page, "Continue").click();
      for (const day of ["Monday", "Wednesday", "Friday"])
        await page
          .getByRole("group", { name: /^Training days/ })
          .getByRole("button", { name: day, exact: true })
          .click();
      await field(page, "Usual session length (minutes)").fill("50");
      await expect(
        page.getByText("Running, cycling and swimming have their own programmes in Training.", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(field(page, "Runs a week")).toHaveCount(0);
      await button(page, "Continue").click();
      await field(page, "How long have you been training?").selectOption("intermediate");
      await field(page, "Injuries or movements to avoid").fill(
        "No current injury; ease back into squatting after travel.",
      );
      await field(page, "Exercises you enjoy or dislike").fill(
        "Rows and split squats; avoid burpees.",
      );
      await field(page, "Leave these out entirely").selectOption("barbell-bench-press");
      await button(page, "Continue").click();
      await field(page, "If you already lift, what are you lifting?").fill(
        "Squat 65 kg for 8, row 40 kg for 10, RIR 3. Restart after a week away.",
      );
      const contents = Buffer.from(
        "Six-month training notes\nThree strength sessions weekly; gradual loading and recovery.\n",
      );
      await page
        .locator('input[type="file"]')
        .setInputFiles({ name: "training-history.txt", mimeType: "text/plain", buffer: contents });
      await expect(
        page.getByRole("checkbox", { name: "training-history.txt", exact: true }),
      ).toBeChecked();
      const [attachment] =
        await sql`select id,content from coach_attachments where user_id=${userId}`;
      assert.equal(Buffer.from(attachment.content, "base64").toString(), contents.toString());
      const download = await page.request.get(`/api/coaching/attachments/${attachment.id}`);
      assert.equal(download.status(), 200);
      assert.equal((await download.body()).toString(), contents.toString());
      const originalViewport = page.viewportSize();
      await page.setViewportSize({ width: 320, height: 740 });
      for (const font of [16, 32]) {
        await page.evaluate(
          (size) => (document.documentElement.style.fontSize = `${size}px`),
          font,
        );
        const report = page
          .getByRole("checkbox", { name: "training-history.txt", exact: true })
          .locator("..");
        await assertReadableText(
          page.getByRole("heading", { name: "Starting point", level: 2, exact: true }),
        );
        await assertReadableText(button(page, "Save and exit"));
        await assertReadableText(report.locator("span"));
        await assertReadableText(button(page, "Continue"));
        const target = page.getByRole("link", { name: "Download", exact: true });
        const box = await target.boundingBox();
        assert.ok(
          box.width >= 44 && box.height >= 44,
          `Report download target: ${JSON.stringify(box)}`,
        );
        await button(page, "Continue").scrollIntoViewIfNeeded();
        const footer = await button(page, "Continue").boundingBox();
        const nav = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
        assert.ok(
          footer.y + footer.height <= nav.y + 1,
          `Footer overlaps navigation: ${JSON.stringify({ footer, nav })}`,
        );
        await page.screenshot({
          path: `${output}/${device}-reports-320-text${font}.png`,
          fullPage: true,
        });
      }
      await page.evaluate(() => (document.documentElement.style.fontSize = "16px"));
      await page.setViewportSize(originalViewport);
      await clickWithSlowNavigation(
        page,
        button(page, "Save and exit"),
        /\/profile\/programme(?:\?|$)/,
      );
      await page.waitForURL(/\/profile\/programme$/);
      await go("/profile/programme/create");
      await expect(field(page, "Weight (lb)")).toHaveValue("180");
      const [intake] =
        await sql`select answers from coach_intakes where user_id=${userId} order by revision desc limit 1`;
      assert.ok(Math.abs(intake.answers.weightKg - 81.6466) < 0.01);
      assert.deepEqual(intake.answers.preferredDays, [1, 3, 5]);
      assert.equal(intake.answers.sessionsPerWeek, 3);
      assert.equal(intake.answers.programmeSport, "strength");
      assert.equal(intake.answers.runsPerWeek, null);
      assert.deepEqual(intake.answers.attachmentIds, [attachment.id]);
      assert.equal(
        intake.answers.restrictions,
        "No current injury; ease back into squatting after travel.",
      );
      await button(page, "Step 4 of 5: Starting point").click();
      await page.locator('input[type="file"]').setInputFiles({
        name: "invalid.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("This is not a PDF."),
      });
      await expect(page.getByRole("alert").filter({ hasText: "correct file type" })).toBeVisible();
      assert.equal((await sql`select id from coach_attachments where user_id=${userId}`).length, 1);
      await button(page, "Remove").click();
      await expect(
        page.getByRole("checkbox", { name: "training-history.txt", exact: true }),
      ).toHaveCount(0);
      assert.equal((await sql`select id from coach_attachments where user_id=${userId}`).length, 0);
      await button(page, "Step 5 of 5: Review").click();
      await expect(button(page, "Create my programme")).toBeDisabled();
      await expect(
        page.getByText(
          "Programme generation is not available yet. Your answers and files are saved.",
        ),
      ).toBeVisible();
      // The disabled external generator is honest; locally saved answers still remain editable.
      await button(page, "Step 2 of 5: Your week").click();
      await expect(field(page, "Usual session length (minutes)")).toHaveValue("50");
      await page.setViewportSize({ width: 320, height: 740 });
      for (const target of await page
        .getByRole("navigation", { name: "Programme steps" })
        .getByRole("button")
        .all()) {
        const box = await target.boundingBox();
        assert.ok(
          box.width >= 44 && box.height >= 44,
          `Programme step target: ${JSON.stringify(box)}`,
        );
      }
      for (const target of await page
        .getByRole("group", { name: /^Training days/ })
        .getByRole("button")
        .all()) {
        const box = await target.boundingBox();
        assert.ok(
          box.width >= 44 && box.height >= 44,
          `Training day target: ${JSON.stringify(box)}`,
        );
      }
      await page.setViewportSize(originalViewport);
    });
    await step("coach-notes-toggle-and-read-only-token-lifecycle", async () => {
      await go("/profile/ai-coach");
      const enabled = page.getByRole("switch", { name: "AI coach", exact: true });
      if ((await enabled.getAttribute("aria-checked")) === "true") await enabled.click();
      await expect
        .poll(
          async () =>
            (await sql`select ai_coach_enabled from profiles where id=${userId}`)[0]
              .ai_coach_enabled,
        )
        .toBe(false);
      await enabled.click();
      await page.waitForURL(/\/training\/programmes\/new$/);
      await expect(page.getByRole("heading", { name: "Add programme", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Strength", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Running", exact: true })).toBeVisible();
      assert.equal(
        (await sql`select ai_coach_enabled from profiles where id=${userId}`)[0].ai_coach_enabled,
        false,
      );
      // A first activation correctly asks for confirmed setup. Simulate its saved output
      // locally, since this stack intentionally disables the external generator.
      await sql`update coach_intakes set confirmed_at=now() where user_id=${userId}`;
      await go("/profile/ai-coach");
      await page.getByRole("switch", { name: "AI coach", exact: true }).click();
      await expect
        .poll(
          async () =>
            (await sql`select ai_coach_enabled from profiles where id=${userId}`)[0]
              .ai_coach_enabled,
        )
        .toBe(true);
      await page.getByRole("switch", { name: "AI coach", exact: true }).click();
      await expect
        .poll(
          async () =>
            (await sql`select ai_coach_enabled from profiles where id=${userId}`)[0]
              .ai_coach_enabled,
        )
        .toBe(false);
      // A note typed while the switch is saving survives the switch's answer, which draws the
      // page again. The answer is held open until the note is typed, as a slow connection would.
      let releaseSwitch, switchHeld;
      const answerHeld = new Promise((resolve) => (switchHeld = resolve));
      const released = new Promise((resolve) => (releaseSwitch = resolve));
      const switchSave = (url) => new URL(url).pathname === "/profile/ai-coach";
      let holdError;
      await page.route(switchSave, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        try {
          const response = await route.fetch();
          switchHeld();
          await released;
          await route.fulfill({ response });
        } catch (error) {
          holdError = error;
        }
      });
      const note =
        "Travelling next week: keep three shorter strength sessions and review my programme.";
      try {
        await page.getByRole("switch", { name: "AI coach", exact: true }).click();
        await Promise.race([
          answerHeld,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("The switch sent no save to hold")), 15_000),
          ),
        ]);
        await expect(page.getByRole("switch", { name: "AI coach", exact: true })).toBeDisabled();
        await field(page, "Notes for the coach").fill(note);
      } finally {
        releaseSwitch();
        // The held answer is given before the route goes: stopping interception first would let
        // the browser's request go on unanswered by it.
        await page.unrouteAll({ behavior: "wait" });
      }
      if (holdError) throw holdError;
      await expect
        .poll(
          async () =>
            (await sql`select ai_coach_enabled from profiles where id=${userId}`)[0]
              .ai_coach_enabled,
        )
        .toBe(true);
      await expect(page.getByRole("switch", { name: "AI coach", exact: true })).toBeEnabled();
      await settle();
      await expect(field(page, "Notes for the coach")).toHaveValue(note);
      await button(page, "Send note").click();
      await expect
        .poll(async () =>
          (await sql`select text from coach_notes where user_id=${userId}`).map((row) => row.text),
        )
        .toContain(note);
      await go("/profile/ai-coach");
      await page.getByRole("tab", { name: "Notes & memory", exact: true }).click();
      await expect(page.getByText(note, { exact: true })).toBeVisible();
      await go("/profile/coach");
      await field(page, "Name").fill("Local audit read access");
      await field(page, "Expires after").selectOption("30");
      await button(page, "Create token").click();
      const tokenField = field(page, "New coach token");
      await expect(tokenField).toBeVisible();
      const token = await tokenField.inputValue();
      // Keep the ephemeral credential out of screenshots and logs.
      const response = await page.request.get("/api/coach/summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status(), 200);
      await button(page, "Hide token").click();
      await expect(tokenField).toHaveCount(0);
      await button(page, "Revoke").click();
      await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
      const revoked = await page.request.get("/api/coach/summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(revoked.status(), 401);
    });
    await step("running-intake-saves-separately-and-reloads", async () => {
      const [strengthBefore] =
        await sql`select id,revision,answers from coach_intakes where user_id=${userId} and sport='strength' order by revision desc limit 1`;
      await go("/training/programmes/new");
      await page.getByRole("link", { name: "Running", exact: true }).click();
      await page.waitForURL(/\/training\/programmes\/new\?sport=running&scope=programme$/);
      await page.getByRole("link", { name: "Create with the coach", exact: true }).click();
      await page.waitForURL(/method=coach$/);
      const goal = "Build one steady easy run a week alongside my lifting programme.";
      await field(page, "What are you training for?").fill(goal);
      await field(page, "Sessions a week").fill("1");
      await field(page, "Minutes per session").fill("30");
      await field(page, "Your experience in running").selectOption("returning");
      await field(page, "Where and with what can you train?").fill(
        "Flat park paths and a treadmill when it rains.",
      );
      await field(page, "Anything that limits your training?").fill(
        "Keep the pace easy while returning after travel.",
      );
      await field(page, "Your brief").fill(
        "Sunday mornings, one easy run. Keep my three lifting days unchanged.",
      );
      await button(page, "Save answers").click();
      await expect(page.getByRole("status").filter({ hasText: "Answers saved." })).toBeVisible();
      const [running] =
        await sql`select id,answers from coach_intakes where user_id=${userId} and sport='running' order by revision desc limit 1`;
      assert.equal(running.answers.programmeSport, "running");
      assert.equal(running.answers.scope, "programme");
      assert.equal(running.answers.sessionsPerWeek, 1);
      assert.equal(running.answers.minutesPerSession, 30);
      assert.equal(running.answers.sports.length, 1);
      assert.equal(running.answers.sports[0].sport, "running");
      assert.equal(running.answers.sports[0].sessionsPerWeek, 1);
      assert.equal(running.answers.trainingLocation, null);
      assert.equal(running.answers.gymId, null);
      assert.notEqual(running.id, strengthBefore.id);
      const [strengthAfter] =
        await sql`select id,revision,answers from coach_intakes where user_id=${userId} and sport='strength' order by revision desc limit 1`;
      assert.deepEqual(
        strengthAfter,
        strengthBefore,
        "Running setup must not replace lifting answers",
      );
      await go("/training/programmes/new?sport=running&scope=programme&method=coach");
      await expect(field(page, "What are you training for?")).toHaveValue(goal);
      await expect(field(page, "Sessions a week")).toHaveValue("1");
      await expect(field(page, "Minutes per session")).toHaveValue("30");
      await expect(field(page, "Your experience in running")).toHaveValue("returning");
      assert.equal(
        (await sql`select count(*)::int as count from coach_jobs where user_id=${userId}`)[0].count,
        0,
        "Saving intake answers must not request external generation",
      );
    });
    await step("manual-draft-routine-save-and-reload", async () => {
      await go("/profile/programme/manual");
      await field(page, "Programme name").fill(programmeName);
      await field(page, "Number of weeks").fill("4");
      await field(page, "Programme notes").fill(
        "Repeat the cycle steadily; leave enough recovery between upper-body sessions.",
      );
      await field(page, "Repeats").selectOption("weekly");
      await button(page, "Add a day").click();
      await field(page, "Day name").fill(routineName);
      await field(page, "Usual weekday").selectOption("1");
      await openDisclosure(page, "Day details and options");
      await field(page, "Focus").fill("Controlled upper-body strength");
      await field(page, "Time available / notes").fill("45 minutes including a gradual warm-up");
      await field(page, "Find an exercise").fill(customName);
      await field(page, "Exercise to add").selectOption(custom.slug);
      await button(page, "Add exercise").click();
      const press = page.getByRole("group", { name: customName, exact: true });
      await field(press, "Sets").fill("3");
      await field(press, "Reps minimum").fill("8");
      await field(press, "Reps maximum").fill("12");
      await openDisclosure(press, "Rest, effort and progression");
      await field(press, "Rest seconds minimum").fill("60");
      await field(press, "Rest seconds maximum").fill("90");
      await field(press, "Superset group (optional)").fill("Controlled work and core");
      await field(press, "Load / calibration guidance").fill(
        "Start with a comfortable machine load, then increase gradually.",
      );
      await field(page, "Find an exercise").fill("Plank");
      await field(page, "Exercise to add").selectOption("plank");
      await button(page, "Add exercise").click();
      const plank = page.getByRole("group", { name: "Plank", exact: true });
      await field(plank, "Sets").fill("2");
      await field(plank, "Seconds minimum").fill("30");
      await field(plank, "Seconds maximum").fill("45");
      await openDisclosure(plank, "Rest, effort and progression");
      await field(plank, "Rest seconds minimum").fill("45");
      await field(plank, "Rest seconds maximum").fill("60");
      await field(plank, "Superset group (optional)").fill("Controlled work and core");
      await button(page, "Save this day as a routine").click();
      await expect(page.getByRole("status").filter({ hasText: "to your routines" })).toBeVisible();
      await button(page, "Add a day").click();
      await field(page, "Day name").fill("Recovery and mobility");
      await field(page, "Usual weekday").selectOption("3");
      await openDisclosure(page, "Day details and options");
      await button(page, "Move day earlier").click();
      await expect(field(page, "Day to edit")).toHaveValue("0");
      await expect(field(page, "Day name")).toHaveValue("Recovery and mobility");
      await openDisclosure(page, "Day details and options");
      await button(page, "Move day later").click();
      await expect(field(page, "Day to edit")).toHaveValue("1");
      await button(page, "Save draft").click();
      await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
      const [draft] =
        await sql`select id,revision,blueprint from program_drafts where user_id=${userId} and source='manual'`;
      draftId = draft.id;
      assert.equal(draft.blueprint.days.length, 2);
      assert.equal(draft.blueprint.days[0].exercises.length, 2);
      assert.equal(draft.blueprint.repeats, "weekly");
      assert.deepEqual(
        draft.blueprint.days.map((day) => [day.name, day.dayOfWeek]),
        [
          [routineName, 1],
          ["Recovery and mobility", 3],
        ],
      );
      const [routines] =
        await sql`select count(*)::int as count from saved_routines where user_id=${userId}`;
      assert.equal(routines.count, 1);
      await go(`/profile/programme/manual?draft=${draftId}`);
      await openDisclosure(page, "Programme settings");
      await expect(field(page, "Programme name")).toHaveValue(programmeName);
      await expect(field(page, "Number of weeks")).toHaveValue("4");
      await expect(
        field(page.getByRole("group", { name: customName, exact: true }), "Reps maximum"),
      ).toHaveValue("12");
      await field(page, "Programme notes").fill(
        "Edited after reloading; retain the saved prescriptions and day order.",
      );
      await button(page, "Save draft").click();
      await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
      const [updated] =
        await sql`select revision,blueprint from program_drafts where id=${draftId}`;
      assert.equal(updated.revision, draft.revision + 1);
      assert.match(updated.blueprint.notes, /^Edited after reloading/);
    });
    await step("preview-and-activate-manual-programme", async () => {
      await clickWithSlowNavigation(
        page,
        button(page, "Review programme"),
        /\/profile\/programme\/drafts\/[0-9a-f-]{36}(?:\?|$)/,
      );
      await page.waitForURL(`/profile/programme/drafts/${draftId}`);
      await expect(page.getByRole("heading", { name: programmeName, exact: true })).toBeVisible();
      await expect(button(page, "Start my programme")).toBeEnabled();
      await button(page, "Start my programme").click();
      await page.waitForURL(/\/training$/);
      [activeProgram] =
        await sql`select id,family_id,version from programs where user_id=${userId} and status='active'`;
      assert.equal(activeProgram.version, 1);
      const [draft] =
        await sql`select status,activated_program_id from program_drafts where id=${draftId}`;
      assert.equal(draft.status, "activated");
      assert.equal(draft.activated_program_id, activeProgram.id);
      await go("/profile/programme?view=cycle");
      await expect(page.getByText(programmeName, { exact: true })).toBeVisible();
    });
    await step("cloned-coach-proposal-request-revisions", async () => {
      const proposal = await cloneProposal();
      await go(`/profile/programme/drafts/${proposal.id}`);
      await button(page, "Ask for changes").click();
      await field(page, "what you would like changed").fill(
        "Keep three sets for now and review again after a comfortable week.",
      );
      await button(page, "Send").click();
      await page.waitForURL(/\/training$/);
      const [draft] =
        await sql`select status,closed_as,revision_note_id from program_drafts where id=${proposal.id}`;
      assert.equal(draft.status, "rejected");
      assert.equal(draft.closed_as, "revised");
      assert.ok(draft.revision_note_id);
      const [note] = await sql`select text from coach_notes where id=${draft.revision_note_id}`;
      assert.match(note.text, /Keep three sets/);
      const [active] =
        await sql`select id from programs where user_id=${userId} and status='active'`;
      assert.equal(active.id, activeProgram.id);
    });
    await step("cloned-coach-proposal-decline", async () => {
      const proposal = await cloneProposal();
      await go(`/profile/programme/drafts/${proposal.id}`);
      await button(page, "Decline").click();
      await page.waitForURL(/\/training$/);
      const [draft] =
        await sql`select status,closed_as from program_drafts where id=${proposal.id}`;
      assert.equal(draft.status, "rejected");
      assert.equal(draft.closed_as, "declined");
      await go(`/profile/programme/drafts/${proposal.id}`);
      await expect(page.getByText(/You declined this on/)).toBeVisible();
      await expect(button(page, "Approve")).toHaveCount(0);
    });
    await step("cloned-coach-proposal-approve-keeps-lineage", async () => {
      const proposal = await cloneProposal();
      await go(`/profile/programme/drafts/${proposal.id}`);
      await page
        .getByRole("link", { name: "See the full programme with these changes", exact: true })
        .click();
      await page.waitForURL(`/profile/programme/drafts/${proposal.id}/programme`);
      await page.locator("summary").filter({ hasText: routineName }).click();
      await expect(page.getByText(customName, { exact: true }).first()).toBeVisible();
      await go(`/profile/programme/drafts/${proposal.id}`);
      await button(page, "Approve").click();
      await page.waitForURL(/\/training$/);
      const [draft] =
        await sql`select status,activated_program_id from program_drafts where id=${proposal.id}`;
      const [active] =
        await sql`select id,family_id,version from programs where user_id=${userId} and status='active'`;
      assert.equal(draft.status, "activated");
      assert.equal(draft.activated_program_id, active.id);
      assert.equal(active.family_id, activeProgram.family_id);
      assert.equal(active.version, activeProgram.version + 1);
      const [prescription] =
        await sql`select pe.sets from program_exercises pe join program_days pd on pd.id=pe.program_day_id where pd.program_id=${active.id} and pe.exercise_id=${custom.id}`;
      assert.equal(prescription.sets, 4);
      const [jobs] =
        await sql`select count(*)::int as count from coach_jobs where user_id=${userId}`;
      assert.equal(jobs.count, 0, "Answering copied proposals must not generate a coach job");
    });
    await step("saved-routine-starts-without-copying-sets", async () => {
      await go("/profile/routines");
      await expect(page.getByRole("heading", { name: routineName, exact: true })).toBeVisible();
      // The location starts on the athlete's default gym, so the routine can start at once.
      await expect(field(page, "Where will you train?")).toHaveValue(gymId);
      await expect(button(page, "Start this routine")).toBeEnabled();
      await field(page, "Where will you train?").selectOption(gymId);
      await clickWithSlowNavigation(
        page,
        button(page, "Start this routine"),
        /\/workouts\/[0-9a-f-]{36}(?:\?|$)/,
      );
      await page.waitForURL(/\/workouts\/[0-9a-f-]{36}$/);
      const sessionId = new URL(page.url()).pathname.split("/").at(-1);
      const exercises =
        await sql`select id,saved_prescription from workout_exercises where workout_session_id=${sessionId} order by order_index`;
      assert.equal(exercises.length, 2);
      assert.equal(exercises[0].saved_prescription.sets, 3);
      assert.deepEqual(exercises[1].saved_prescription.duration, [30, 45]);
      const [sets] = await sql`select count(*)::int as count from set_logs where user_id=${userId}`;
      assert.equal(sets.count, 0);
      await page.getByRole("link", { name: "Finish", exact: true }).click();
      await field(page, "Notes").fill(
        "Routine launch verified; ended before recording any completed sets.",
      );
      await button(page, "Finish and keep it").click();
      await expect
        .poll(
          async () =>
            (await sql`select completed_at from workout_sessions where id=${sessionId}`)[0]
              .completed_at,
        )
        .not.toBeNull();
    });
    await step("reuse-and-edit-routine-without-changing-original", async () => {
      const [routine] = await sql`select id,day from saved_routines where user_id=${userId}`;
      await go("/profile/programme/manual");
      await field(page, "Programme name").fill(
        "Audit reusable routine — a separate edited programme",
      );
      await field(page, "Number of weeks").fill("2");
      await field(page, "Repeats").selectOption("weekly");
      await openDisclosure(page, "Add a saved routine");
      await field(page, "Routine to add").selectOption(routine.id);
      await button(page, "Add routine as a day").click();
      await field(page, "Usual weekday").selectOption("2");
      await field(page.getByRole("group", { name: customName, exact: true }), "Sets").fill("5");
      await button(page, "Save draft").click();
      await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
      const [draft] =
        await sql`select id,blueprint from program_drafts where user_id=${userId} and source='manual' and status='editing'`;
      assert.equal(draft.blueprint.days[0].exercises[0].sets, 5);
      const [unchanged] = await sql`select day from saved_routines where id=${routine.id}`;
      assert.deepEqual(unchanged.day, routine.day);
      await go(`/profile/programme/manual?draft=${draft.id}`);
      await expect(
        field(page.getByRole("group", { name: customName, exact: true }), "Sets"),
      ).toHaveValue("5");
      await clickWithSlowNavigation(
        page,
        button(page, "Review programme"),
        /\/profile\/programme\/drafts\/[0-9a-f-]{36}(?:\?|$)/,
      );
      await page.waitForURL(`/profile/programme/drafts/${draft.id}`);
      await button(page, "Discard").click();
      await page.waitForURL(/\/training$/);
      const [discarded] = await sql`select status from program_drafts where id=${draft.id}`;
      assert.equal(discarded.status, "rejected");
    });
    await step("duplicate-programme-waits-for-slow-navigation", async () => {
      await go("/profile/programme");
      await openDisclosure(page.locator(".programme-management").first(), "More options");
      await clickWithSlowNavigation(
        page,
        button(page, "Duplicate programme").first(),
        "**/profile/programme/manual?draft=*",
      );
      await page.waitForURL(/\/profile\/programme\/manual\?draft=/);
      await openDisclosure(page, "Programme settings");
      await expect(field(page, "Programme name")).toBeVisible();
    });
    await step("delete-disposable-programme-account", async () => {
      await go("/profile/delete-account");
      await field(page, "Type DELETE to confirm").fill("DELETE");
      await button(page, "Delete everything").scrollIntoViewIfNeeded();
      await settle();
      await button(page, "Delete everything").click();
      await page.waitForURL(/\/login\?deleted=1$/);
      const [remaining] = await sql`select count(*)::int as count from profiles where id=${userId}`;
      assert.equal(remaining.count, 0);
    });
  } catch {
    /* Each failure preserves its screenshot, URL and visible page. */
  } finally {
    await context.close();
    await browser.close();
    await sql`delete from auth.users where email=${email}`;
  }
}
try {
  for (const device of process.env.AUDIT_DEVICE
    ? [process.env.AUDIT_DEVICE]
    : ["android", "iphone"])
    if (!skipDevice(device, device === "iphone" ? "webkit" : "chromium")) await runDevice(device);
  const passed = results.every((result) => result.passed) && runtimeErrors.length === 0;
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ passed, results, runtimeErrors, skipped: skippedDevices }, null, 2),
  );
  console.log(
    JSON.stringify({
      passed,
      checks: results.length,
      failed: results.filter((result) => !result.passed).length,
      runtimeErrors: runtimeErrors.length,
      skipped: skippedDevices.map((row) => row.device),
    }),
  );
  if (!passed) process.exitCode = 1;
} finally {
  await sql.end();
}
