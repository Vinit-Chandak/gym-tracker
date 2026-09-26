import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit, devices, expect } from "@playwright/test";
import postgres from "postgres";

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

async function runDevice(device) {
  const browser = await (device === "iphone" ? webkit : chromium).launch({
    executablePath: device === "iphone" ? undefined : process.env.AUDIT_CHROMIUM_PATH,
  });
  const context = await browser.newContext({
    ...devices[device === "iphone" ? "iPhone 13" : "Pixel 7"],
    baseURL,
    timezoneId: "America/New_York",
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
  const username = `auditpr${device[0]}${Date.now().toString(36)}`;
  const email = `${username}@local.test`;
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
      await field(page, "Name").fill("Programme Audit");
      await field(page, "Username").fill(username);
      await field(page, "Email").fill(email);
      await field(page, "Password").fill(password);
      await field(page, "Confirm password").fill(password);
      await button(page, "Create account").click();
      await page.waitForURL(/\/welcome$/);
      await field(page, "Weight units").selectOption("lb");
      await field(page, "Time zone").fill("America/New_York");
      await button(page, "Continue").click();
      await page.waitForURL(/\/welcome\/sports$/);
      await button(page, "Continue").click();
      await page.waitForURL(/\/welcome\/gym$/);
      await field(page, "Name").fill(`${username} training gym`);
      await button(page, "Add gym").click();
      await page.waitForURL(/\/welcome\/equipment\?gym=/);
      await page.getByRole("checkbox", { name: "Chest press machine", exact: true }).check();
      await button(page, "Add and continue").click();
      await page.waitForURL(/\/welcome\/programme$/);
      await button(page, "I'll train without a programme").click();
      await page.waitForURL(/\/today$/);
      [{ id: userId }] = await sql`select id from profiles where username=${username}`;
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
      await button(page, "Save to my exercise library").click();
      await page.waitForURL(/\/exercises\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { name: customName, exact: true })).toBeVisible();
      [custom] =
        await sql`select id,slug,name,modality,default_prescription_type from exercises where user_id=${userId}`;
      assert.equal(custom.name, customName);
      assert.equal(custom.modality, "machine");
      assert.equal(custom.default_prescription_type, "reps");
    });
    await step("manual-draft-routine-save-and-reload", async () => {
      await go("/profile/programme/manual");
      await field(page, "Programme name").fill(programmeName);
      await field(page, "Number of weeks").fill("4");
      await field(page, "Programme notes").fill(
        "Repeat the cycle steadily; leave enough recovery between upper-body sessions.",
      );
      await button(page, "Add a day").click();
      await field(page, "Day name").fill(routineName);
      await field(page, "Usual weekday").selectOption("1");
      await field(page, "Focus").fill("Controlled upper-body strength");
      await field(page, "Time available / notes").fill("45 minutes including a gradual warm-up");
      await field(page, "Find an exercise").fill(customName);
      await field(page, "Exercise to add").selectOption(custom.slug);
      await button(page, "Add exercise").click();
      const press = page.getByRole("group", { name: customName, exact: true });
      await field(press, "Sets").fill("3");
      await field(press, "Reps minimum").fill("8");
      await field(press, "Reps maximum").fill("12");
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
      await field(plank, "Rest seconds minimum").fill("45");
      await field(plank, "Rest seconds maximum").fill("60");
      await field(plank, "Superset group (optional)").fill("Controlled work and core");
      await button(page, "Save this day as a routine").click();
      await expect(page.getByRole("status").filter({ hasText: "to your routines" })).toBeVisible();
      await button(page, "Add a day").click();
      await field(page, "Day name").nth(1).fill("Recovery and mobility");
      await field(page, "Usual weekday").nth(1).selectOption("3");
      await button(page, "Move day 2 up").click();
      await expect(field(page, "Day name").first()).toHaveValue("Recovery and mobility");
      await button(page, "Move day 1 down").click();
      await button(page, "Save draft").click();
      await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
      const [draft] =
        await sql`select id,revision,blueprint from program_drafts where user_id=${userId} and source='manual'`;
      draftId = draft.id;
      assert.equal(draft.blueprint.days.length, 2);
      assert.equal(draft.blueprint.days[0].exercises.length, 2);
      const [routines] =
        await sql`select count(*)::int as count from saved_routines where user_id=${userId}`;
      assert.equal(routines.count, 1);
      await go(`/profile/programme/manual?draft=${draftId}`);
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
      await button(page, "Preview programme").click();
      await page.waitForURL(`/profile/programme/drafts/${draftId}`);
      await expect(page.getByRole("heading", { name: programmeName, exact: true })).toBeVisible();
      await expect(button(page, "Start my programme")).toBeEnabled();
      await button(page, "Start my programme").click();
      await page.waitForURL(/\/today$/);
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
      await page.waitForURL(/\/profile\/programme\?view=changes$/);
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
      await page.waitForURL(/\/profile\/programme\?view=changes$/);
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
      await page.waitForURL(/\/profile\/programme\?view=changes$/);
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
      await expect(button(page, "Start this routine")).toBeDisabled();
      await field(page, "Where will you train?").selectOption(gymId);
      await button(page, "Start this routine").click();
      await page.waitForURL(/\/workouts\/[0-9a-f-]{36}$/);
      const sessionId = new URL(page.url()).pathname.split("/").at(-1);
      const exercises =
        await sql`select id,saved_prescription from workout_exercises where workout_session_id=${sessionId} order by order_index`;
      assert.equal(exercises.length, 2);
      assert.equal(exercises[0].saved_prescription.sets, 3);
      assert.deepEqual(exercises[1].saved_prescription.duration, [30, 45]);
      const [sets] = await sql`select count(*)::int as count from set_logs where user_id=${userId}`;
      assert.equal(sets.count, 0);
      await page.getByRole("link", { name: "Finish session", exact: true }).click();
      await field(page, "Notes").fill(
        "Routine launch verified; ended before recording any completed sets.",
      );
      await button(page, "Finish session").click();
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
      await field(page, "Use a saved routine as a programme day").selectOption(routine.id);
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
      await button(page, "Preview programme").click();
      await page.waitForURL(`/profile/programme/drafts/${draft.id}`);
      await button(page, "Discard").click();
      await page.waitForURL(/\/profile\/programme\?view=changes$/);
      const [discarded] = await sql`select status from program_drafts where id=${draft.id}`;
      assert.equal(discarded.status, "rejected");
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
    await runDevice(device);
  const passed = results.every((result) => result.passed) && runtimeErrors.length === 0;
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ passed, results, runtimeErrors }, null, 2),
  );
  console.log(
    JSON.stringify({
      passed,
      checks: results.length,
      failed: results.filter((result) => !result.passed).length,
      runtimeErrors: runtimeErrors.length,
    }),
  );
  if (!passed) process.exitCode = 1;
} finally {
  await sql.end();
}
