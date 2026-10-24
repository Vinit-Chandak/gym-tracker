// Logging carried out as athletes do it (PRODUCT.md, principle 9; COLOUR_FORMS_AND_LAPS_PLAN.md,
// Done means 1 to 5), over the accounts `npm run audit:setup` seeds: priya runs in kilometres and
// swims in metres, alex rides in miles, vinit lifts. Each walk fails when its task fails.
//
//   AUDIT_BASE_URL=http://localhost:3100 AUDIT_DATABASE_URL=postgres://…/overload_audit \
//     node scripts/dev/audit-logging.mjs          # AUDIT_DEVICE=iphone for WebKit
//
// 1. An unplanned interval run as laps alone (reps and standing recoveries), no total typed: it
//    saves as Intervals, and its page leads with the rep pace. Corrected, it opens From laps.
// 2. The watch's distance typed below the laps: refused at the distance, once, with the laps'
//    figure as the fix; used; saved.
// 3. A run refused with its kind, where, effort, surface and laps filled in keeps every one.
// 4. A ride in miles; a ride refused and fixed, keeping everything.
// 5. A pool swim by counted lengths, an open-water swim by distance, a swim refused keeping its
//    stroke and everything else.
// 6. A workout started with a check-in whose save fails offline (its readings kept), sets logged
//    with one failing offline and retried, and finished.
import { mkdir } from "node:fs/promises";
import { devices } from "@playwright/test";
import { launch, skipWholeRun } from "./audit-engines.mjs";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const database =
  process.env.AUDIT_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/overload_audit";
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(database).hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(new URL(database).pathname)
)
  throw new Error("Local audit only.");
const device = process.env.AUDIT_DEVICE ?? "android";
const engine = device === "iphone" ? "webkit" : "chromium";
const output = `${process.env.AUDIT_OUTPUT_DIR ?? "output/flow-audit"}/logging-${device}`;
await mkdir(output, { recursive: true });
await skipWholeRun(device, engine, `${output}/results.json`);

const browser = await launch(engine);
const results = [];
const pageErrors = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail && !ok ? ` — ${detail}` : ""}`);
};
const plain = (text) => text.replace(/ /g, " ").replace(/⁠/g, "").replace(/\s+/g, " ").trim();

async function signedIn(email) {
  const context = await browser.newContext({
    ...devices[device === "iphone" ? "iPhone 13" : "Pixel 7"],
    baseURL,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (error) => pageErrors.push(`${email} ${page.url()}: ${error.message}`));
  await page.goto("/login", { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 120_000 });
  await page.waitForLoadState("networkidle");
  return page;
}

/** Runs one walk; a step that throws fails it, with a screenshot, and the next walk goes on. */
async function walk(name, email, steps) {
  if (process.env.AUDIT_WALK && !new RegExp(process.env.AUDIT_WALK).test(name)) return;
  const page = await signedIn(email);
  try {
    await steps(page);
  } catch (error) {
    check(`${name}: completed`, false, String(error?.message ?? error).split("\n")[0]);
    await page
      .screenshot({ path: `${output}/${name.replace(/\W+/g, "-")}-failure.png`, fullPage: true })
      .catch(() => {});
  } finally {
    await page.context().close();
  }
}

const tap = (page, label) =>
  page
    .locator("label", { hasText: new RegExp(`^${label}$`) })
    .first()
    .click();
const effort = (page, value) =>
  page.getByRole("radiogroup", { name: "Effort" }).getByText(value, { exact: true }).click();
const alerts = async (page) =>
  (await page.locator('[role="alert"]').allInnerTexts()).map(plain).filter(Boolean);
async function saved(page, button) {
  await page.getByRole("button", { name: button }).click();
  await page.waitForURL(/\/progress\/activities\/[0-9a-f-]+/, { timeout: 120_000 });
  await page.locator(".activity-stat-label").first().waitFor({ timeout: 120_000 });
  return plain(await page.locator("main").innerText());
}

// ---------- runs ----------
const lapRows = (page) => page.locator("li.lap-row");
async function lap(page, kind, { unit, distance, time, avg, max } = {}) {
  await page.getByRole("button", { name: kind === "rep" ? "+ Rep" : "+ Recovery" }).click();
  const row = lapRows(page).last();
  if (unit) await row.getByLabel("Unit").selectOption(unit);
  if (distance !== undefined) await row.getByLabel("Distance").fill(distance);
  if (time !== undefined) await row.getByLabel("Time").fill(time);
  if (avg !== undefined) await row.getByLabel("Avg HR").fill(avg);
  if (max !== undefined) await row.getByLabel("Max HR").fill(max);
}
async function runForm(page) {
  await page.goto("/today/log/new?sport=running", { waitUntil: "networkidle" });
  await page.getByText("Laps and intervals").click();
}
/** The owner's session of 21 October 2026: three reps with standing recoveries between them. */
async function ownersSession(page) {
  await lap(page, "rep", { unit: "km", distance: "0.47", time: "200", avg: "164", max: "182" });
  await lap(page, "recovery", { time: "130" });
  await lap(page, "rep", { distance: "0.51", time: "157", avg: "165", max: "184" });
  await lap(page, "recovery");
  await lap(page, "rep", { distance: "0.49", time: "159", avg: "166", max: "185" });
}
const row = async (page, name) => plain(await page.getByRole("group", { name }).innerText());

await walk("interval run as laps alone", "priya@local.test", async (page) => {
  await runForm(page);
  await ownersSession(page);
  check(
    "run: distance is the laps added up",
    (await row(page, "Distance")) === "Distance From laps 1.47 km",
  );
  check(
    "run: time is the laps added up",
    (await row(page, "Duration")) === "Duration From laps 8:56",
  );
  check(
    "run: reps with recoveries are Intervals",
    (await page.getByLabel("Kind of run").inputValue()) === "intervals",
  );
  const paces = plain(await page.locator('[role="status"]', { hasText: "Rep pace" }).innerText());
  check(
    "run: rep pace leads, overall with rests",
    paces === "Rep pace, 3 reps 4:02 /km Overall, with rests 6:05 /km",
    paces,
  );
  await effort(page, "4");
  const text = await saved(page, "Save run");
  const stats = await page.locator(".activity-stat-label").allInnerTexts();
  check(
    "run: its page leads with the rep pace",
    stats[0] === "Rep pace" && stats.includes("Overall, with rests"),
    stats.join(", "),
  );
  check(
    "run: saved as Intervals, its laps Rep and Standing",
    text.includes("Intervals") && text.includes("Standing") && text.includes("4:02"),
  );

  await page.goto(`${new URL(page.url()).pathname}/edit`, { waitUntil: "networkidle" });
  await page.getByRole("group", { name: "Duration" }).waitFor();
  check(
    "run: its correction opens From laps",
    (await row(page, "Duration")) === "Duration From laps 8:56",
  );
  await lapRows(page).nth(0).getByLabel("Time").fill("205");
  check(
    "run: a lap's change moves the total",
    (await row(page, "Duration")) === "Duration From laps 9:01",
  );
  const corrected = await saved(page, /^Save/);
  check("run: the correction saved", corrected.includes("9:01"));
});

await walk("watch total short of its laps", "priya@local.test", async (page) => {
  await runForm(page);
  await ownersSession(page);
  await page.getByRole("button", { name: "Use the watch’s totals instead" }).click();
  await page.getByLabel("Distance", { exact: true }).fill("1.00");
  await effort(page, "3");
  await page.getByRole("button", { name: "Save run" }).click();
  await page.getByText(/^The laps add up to 1\.47\skm, more than 1\.00\skm\.$/).waitFor();
  const said = await alerts(page);
  check(
    "run: a short total is refused once, at the distance",
    said.length === 1,
    JSON.stringify(said),
  );
  await page.getByRole("button", { name: /^Use 1\.47\skm$/ }).click();
  check("run: the fix clears it", (await page.getByText(/more than 1\.00/).count()) === 0);
  await saved(page, "Save run");
  check("run: saved once fixed", true);
});

await walk("refused run keeps everything", "priya@local.test", async (page) => {
  await runForm(page);
  await page.getByLabel("Kind of run").selectOption("tempo");
  await tap(page, "Treadmill");
  await lap(page, "rep", { unit: "km", distance: "1", time: "430", avg: "180", max: "170" });
  await lap(page, "recovery", { time: "100" });
  await effort(page, "5");
  await page.getByText("Date, notes, heart rate, more").click();
  await page.getByLabel("Surface").fill("Track");
  await page.getByRole("button", { name: "Save run" }).click();
  await lapRows(page).nth(0).getByRole("alert").waitFor();
  check(
    "run: refused at the lap at fault",
    (await lapRows(page).nth(0).getByLabel("Max HR").getAttribute("aria-invalid")) === "true",
  );
  check("run: kind kept", (await page.getByLabel("Kind of run").inputValue()) === "tempo");
  check("run: where kept", await page.getByRole("radio", { name: "Treadmill" }).isChecked());
  check(
    "run: effort kept",
    await page
      .getByRole("radiogroup", { name: "Effort" })
      .getByRole("radio", { name: "5" })
      .isChecked(),
  );
  check("run: surface kept", (await page.getByLabel("Surface").inputValue()) === "Track");
  check(
    "run: laps kept",
    (await lapRows(page).count()) === 2 &&
      (await lapRows(page).nth(0).getByLabel("Avg HR").inputValue()) === "180",
  );
});

// ---------- rides ----------
await walk("ride in miles", "alex@local.test", async (page) => {
  await page.goto("/today/log/new?sport=cycling", { waitUntil: "networkidle" });
  check(
    "ride: opens in miles",
    (await page.getByRole("button", { name: /^Distance in mi\./ }).count()) === 1,
  );
  await page.getByLabel("Duration").fill("10500");
  await page.getByLabel("Distance", { exact: true }).fill("20.5");
  await effort(page, "3");
  const text = await saved(page, "Save ride");
  check(
    "ride: saved in miles with its speed in mph",
    text.includes("20.5 mi") && text.includes("18.9 mph"),
    text.slice(0, 160),
  );
});

await walk("ride refused, then fixed", "alex@local.test", async (page) => {
  await page.goto("/today/log/new?sport=cycling", { waitUntil: "networkidle" });
  await page.getByLabel("Duration").fill("4500");
  await page.getByLabel("Distance", { exact: true }).fill("12.4");
  await tap(page, "Assisted");
  await effort(page, "4");
  await page.getByText("Date, notes, heart rate, more").click();
  await page.getByLabel("Average heart rate").fill("150");
  await page.getByLabel("Maximum heart rate").fill("140");
  await page.getByRole("button", { name: "Save ride" }).click();
  await page.getByText("Maximum heart rate cannot be below the average.").waitFor();
  check("ride: refused once, at the field", (await alerts(page)).length === 1);
  check(
    "ride: keeps everything",
    (await page.getByLabel("Duration").inputValue()) === "45:00" &&
      (await page.getByLabel("Distance", { exact: true }).inputValue()) === "12.4" &&
      (await page.getByRole("radio", { name: "Assisted", exact: true }).isChecked()) &&
      (await page
        .getByRole("radiogroup", { name: "Effort" })
        .getByRole("radio", { name: "4" })
        .isChecked()) &&
      (await page.getByLabel("Average heart rate").inputValue()) === "150",
  );
  await page.getByLabel("Maximum heart rate").fill("171");
  check("ride: saved once fixed", (await saved(page, "Save ride")).includes("12.4"));
});

// ---------- swims ----------
await walk("swims", "priya@local.test", async (page) => {
  await page.goto("/today/log/new?sport=swimming", { waitUntil: "networkidle" });
  await page.getByLabel("Elapsed time").fill("3000");
  await tap(page, "Count lengths");
  await page.getByLabel("Pool length", { exact: true }).fill("25");
  await page.getByLabel("Lengths", { exact: true }).fill("40");
  await effort(page, "3");
  check(
    "swim: counted lengths saved as 1,000 m",
    (await saved(page, "Save swim")).includes("1,000 m"),
  );

  await page.goto("/today/log/new?sport=swimming", { waitUntil: "networkidle" });
  await tap(page, "Open water");
  await page.getByLabel("Elapsed time").fill("3500");
  await tap(page, "Enter distance");
  await page.getByLabel("Distance", { exact: true }).fill("1500");
  await effort(page, "4");
  const open = await saved(page, "Save swim");
  check(
    "swim: open water by distance saved as 1,500 m",
    open.includes("1,500 m") && open.includes("Open water"),
  );

  await page.goto("/today/log/new?sport=swimming", { waitUntil: "networkidle" });
  await page.getByLabel("Elapsed time").fill("3000");
  await tap(page, "Count lengths");
  await page.getByLabel("Pool length", { exact: true }).fill("25");
  await page.getByLabel("Lengths", { exact: true }).fill("48");
  await effort(page, "2");
  await page.getByText("Date, notes, heart rate, more").click();
  await page.getByLabel("Minutes").fill("40");
  await page.getByLabel("Stroke", { exact: true }).selectOption("breaststroke");
  await page.getByRole("button", { name: "Save swim" }).click();
  await page.getByText("Swimming time cannot be longer than the elapsed time.").waitFor();
  check("swim: refused once, at the field", (await alerts(page)).length === 1);
  check(
    "swim: keeps everything, its stroke included",
    (await page.getByLabel("Stroke", { exact: true }).inputValue()) === "breaststroke" &&
      (await page.getByRole("radio", { name: "Count lengths" }).isChecked()) &&
      (await page.getByLabel("Lengths", { exact: true }).inputValue()) === "48" &&
      (await page
        .getByRole("radiogroup", { name: "Effort" })
        .getByRole("radio", { name: "2" })
        .isChecked()),
  );
  await page.getByLabel("Minutes").fill("26");
  check("swim: saved once fixed", (await saved(page, "Save swim")).includes("1,200 m"));
});

// ---------- a workout ----------
await walk("workout", "vinit@local.test", async (page) => {
  const context = page.context();
  await page.goto("/today", { waitUntil: "networkidle" });
  // A session an earlier walk left open is discarded when empty and finished otherwise.
  const discard = page.getByRole("button", { name: "Discard empty session" });
  const resume = page.getByRole("link", { name: /^Resume session/ });
  if (await discard.count()) await discard.click();
  else if (await resume.count()) {
    await resume.click();
    await page.getByRole("link", { name: "Finish", exact: true }).click();
    await page.getByRole("button", { name: "Finish session", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/finish"));
    await page.goto("/today", { waitUntil: "networkidle" });
  }
  const start = page.getByRole("link", { name: /^Start workout/ });
  if (await start.count()) await start.click();
  else {
    // Programme links prefetch streamed responses; readiness is the visible next-session link.
    await page.goto("/today/log?sport=strength", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("link", { name: /Next in your programme|Cycle \d+$/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Start workout", exact: true }).click();
  }
  await page.getByRole("button", { name: "Save and start", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Hours last night", { exact: true }).fill("7.5");
  const fatigue = page.getByRole("radiogroup", { name: "General fatigue" });
  await fatigue.locator("label", { hasText: /^2$/ }).click();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Save and start", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /^Connection lost/ })
    .waitFor();
  check(
    "workout: a check-in refused offline keeps its readings",
    (await page.getByLabel("Hours last night", { exact: true }).inputValue()) === "7.5" &&
      (await fatigue.getByRole("radio", { name: "2" }).isChecked()),
  );
  await context.setOffline(false);
  await page.getByRole("button", { name: "Save and start", exact: true }).click();
  await page.waitForURL(/\/workouts\/[0-9a-f-]+$/, { timeout: 120_000 });
  await page
    .getByRole("button", { name: /\d+ × / })
    .first()
    .click();
  await page.locator(".entry").waitFor();
  async function fill(kg, reps) {
    if (!(await page.locator(".entry input").count()))
      await page.locator('.entry [data-field="load"] button.stepper-figure').click();
    await page.getByLabel(/^Load in /).fill(String(kg));
    await page.getByLabel("Reps", { exact: true }).fill(String(reps));
    await page
      .getByRole("textbox", { name: /^RIR$|^RPE$/ })
      .first()
      .fill("2");
  }
  const savedLoad = (kg) =>
    page
      .getByRole("status")
      .filter({ hasText: new RegExp(`saved: ${String(kg).replace(".", "\\.")} kilograms`) })
      .waitFor();
  await fill(60, 8);
  await page.locator(".entry").getByRole("button", { name: "Save", exact: true }).click();
  await savedLoad(60);
  await fill(62.5, 8);
  await page.waitForLoadState("networkidle");
  await context.setOffline(true);
  await page.locator(".entry").getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText(/Connection lost\. Your entries are still here/).waitFor();
  check(
    "workout: a set whose save failed offline keeps what was typed",
    (await page.getByRole("button", { name: /^62\.5 kilograms\. Type a load$/ }).count()) === 1,
  );
  await context.setOffline(false);
  await page
    .locator(".entry")
    .getByRole("button", { name: /^Retry saving/ })
    .click();
  await savedLoad(62.5);
  check("workout: the set saved on retry", true);
  await page.locator(".session-back").click();
  await page.getByRole("link", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish session", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/finish"), { timeout: 120_000 });
  await page.getByText("Loading session…").waitFor({ state: "detached", timeout: 120_000 });
  check(
    "workout: finished with its sets",
    /62\.5 kg/.test(plain(await page.locator("main").innerText())),
  );
});

check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
await browser.close();
const failed = results.filter((result) => !result.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} passed on ${device} (${engine})`,
);
process.exit(failed.length > 0 ? 1 : 0);
