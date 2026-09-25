// Every statement each screen sends to Postgres, counted and listed (docs/audits/2026-09-25-db-round-trips.md).
//
// A proxy between the app and the audit database logs every statement that passes through it.
// The script signs in as the seeded Vinit, finds real ids for every dynamic route in the audit
// database, then opens each screen by client-side navigation, the way a tap does, starting each
// one from a screen that is not in the list so a tab's one-minute copy never answers for it.
// Prefetch requests are refused so only the navigation itself is counted. The app runs with the
// profile cache warm, so the numbers are what a typical tap costs; a profile miss adds one
// read-only transaction (four round trips).
//
//   npm run audit:setup    # once
//   npm run audit:build    # after each change being measured
//   npm run audit:auth     # terminal 1
//   AUDIT_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:6543/overload_audit \
//     npm run audit:start  # terminal 2: the app, talking to the proxy
//   npm run audit:db-screens   # terminal 3
//
// ONLY=<regex> limits the screens; DB_SCREENS_OUT=<file> writes every statement as JSON.
// node-postgres sends each statement and its values in one exchange, so for this app the
// statement count is the round-trip count: BEGIN, the claims statement, the athlete lock for a
// write transaction, the screen's own statements and COMMIT.
import { chromium, devices } from "@playwright/test";
import { writeFileSync } from "node:fs";
import net from "node:net";
import postgres from "postgres";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const target = new URL(
  process.env.AUDIT_TARGET_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:5432/overload_audit",
);
const proxyPort = Number(process.env.LATENCY_PROXY_PORT ?? 6543);
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname)
)
  throw new Error("Local audit only.");

// --- The proxy: logs each statement the app sends, with the connection it came on. ---
let log = [];
let connections = 0;
const proxy = net.createServer((client) => {
  const conn = ++connections;
  const server = net.connect(Number(target.port || 5432), target.hostname);
  let started = false;
  let buffer = Buffer.alloc(0);
  let parsed = "";
  client.on("data", (chunk) => {
    server.write(chunk);
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (!started) {
        if (buffer.length < 4 || buffer.length < buffer.readUInt32BE(0)) break;
        buffer = buffer.subarray(buffer.readUInt32BE(0));
        started = true;
        continue;
      }
      if (buffer.length < 5 || buffer.length < 1 + buffer.readUInt32BE(1)) break;
      const type = String.fromCharCode(buffer[0]);
      const body = buffer.subarray(5, 1 + buffer.readUInt32BE(1));
      // Q(uery) is a simple statement; P(arse) carries the text an E(xecute) then runs.
      if (type === "Q") log.push({ conn, sql: body.subarray(0, body.indexOf(0)).toString() });
      if (type === "P") {
        const name = body.indexOf(0);
        parsed = body.subarray(name + 1, body.indexOf(0, name + 1)).toString();
      }
      if (type === "E") log.push({ conn, sql: parsed });
      buffer = buffer.subarray(1 + buffer.readUInt32BE(1));
    }
  });
  server.on("data", (chunk) => client.write(chunk));
  client.on("end", () => server.end());
  server.on("end", () => client.end());
  client.on("error", () => server.destroy());
  server.on("error", () => client.destroy());
});
await new Promise((resolve) => proxy.listen(proxyPort, "127.0.0.1", resolve));

// --- Real ids for the dynamic routes, read straight from the audit database. ---
const sql = postgres(target.toString(), { max: 1 });
const [ids] = await sql`
  with me as (select id from profiles where username = 'vinit'),
  friend as (
    select p.id, p.username from follows f join profiles p on p.id = f.followee_id
    where f.follower_id = (select id from me) and f.status = 'accepted' limit 1
  ),
  finished as (
    select s.id from workout_sessions s
    where s.user_id = (select id from me) and s.completed_at is not null
    order by s.started_at desc limit 1
  ),
  open as (
    select s.id from workout_sessions s
    where s.user_id = (select id from me) and s.completed_at is null limit 1
  )
  select
    (select id from finished) as finished,
    (select id from workout_exercises where workout_session_id = (select id from finished)
      order by order_index limit 1) as finished_exercise,
    (select id from open) as open,
    (select id from workout_exercises where workout_session_id = (select id from open)
      order by order_index limit 1) as open_exercise,
    (select id from gyms where user_id = (select id from me) order by name limit 1) as gym,
    (select id from equipment_instances where gym_id =
      (select id from gyms where user_id = (select id from me) order by name limit 1)
      order by name limit 1) as equipment,
    (select pe.exercise_id from program_exercises pe
      join program_days d on d.id = pe.program_day_id
      join programs p on p.id = d.program_id
      where p.user_id = (select id from me) and p.status = 'active'
      order by d.day_index, pe.order_index limit 1) as exercise,
    (select id from activities where user_id = (select id from me) and sport = 'cycling'
      order by occurred_on desc limit 1) as cycling,
    (select id from activities where user_id = (select id from me) and sport = 'running'
      order by occurred_on desc limit 1) as running,
    (select id from planned_occurrences where user_id = (select id from me)
      order by created_at limit 1) as occurrence,
    (select id from activity_templates where user_id = (select id from me) limit 1) as template,
    (select id from program_drafts where user_id = (select id from me) limit 1) as draft,
    (select id from coach_jobs where user_id = (select id from me) limit 1) as job,
    (select username from friend) as friend,
    (select id from shared_session_stats where user_id = (select id from friend)
      order by started_at desc limit 1) as shared`;
await sql.end();

const screens = [
  "/today",
  "/today/choose",
  "/training",
  "/training/new?sport=running",
  ids.occurrence && `/training/new?occurrence=${ids.occurrence}`,
  "/training/programme",
  ids.occurrence && `/training/programme/occurrences/${ids.occurrence}`,
  "/training/schedule",
  "/training/scheduled",
  "/training/templates",
  "/training/templates/new",
  ids.template && `/training/templates/${ids.template}/edit`,
  ids.cycling && `/training/activities/${ids.cycling}`,
  ids.cycling && `/training/activities/${ids.cycling}/edit`,
  ids.running && `/training/activities/${ids.running}`,
  "/history",
  "/progress",
  ids.finished && `/workouts/${ids.finished}`,
  ids.open && `/workouts/${ids.open}`,
  ids.open && `/workouts/${ids.open}/add-exercise`,
  ids.open && `/workouts/${ids.open}/check-in`,
  ids.open_exercise && `/workouts/${ids.open}/exercises/${ids.open_exercise}/substitute`,
  ids.open && `/workouts/${ids.open}/finish`,
  "/gyms",
  "/gyms/new",
  ids.gym && `/gyms/${ids.gym}`,
  ids.gym && `/gyms/${ids.gym}/edit`,
  ids.gym && `/gyms/${ids.gym}/equipment/new`,
  ids.equipment && `/gyms/${ids.gym}/equipment/${ids.equipment}`,
  ids.gym && `/gyms/${ids.gym}/programme`,
  ids.exercise && `/gyms/${ids.gym}/programme/${ids.exercise}/fallback`,
  "/exercises",
  "/exercises/new",
  ids.exercise && `/exercises/${ids.exercise}`,
  "/profile",
  "/profile/edit",
  "/profile/privacy",
  "/profile/delete-account",
  "/profile/sports",
  "/profile/routines",
  "/profile/coach",
  "/profile/ai-coach",
  "/profile/friends",
  "/profile/friends/find",
  "/profile/friends/people",
  "/profile/friends/leaderboard",
  "/profile/friends/compare",
  "/profile/programme",
  "/profile/programme/create",
  "/profile/programme/manual",
  ids.draft && `/profile/programme/drafts/${ids.draft}`,
  ids.job && `/profile/programme/jobs/${ids.job}`,
  ids.friend && `/u/${ids.friend}`,
  ids.friend && `/u/${ids.friend}/compare`,
  ids.exercise && ids.friend && `/u/${ids.friend}/compare/${ids.exercise}`,
  ids.shared && `/u/${ids.friend}/activities/${ids.shared}`,
].filter((path) => path && (!only || only.test(path)));
if (!ids.open) console.log("No open workout: start one to measure the in-workout screens.");

// --- The browser: sign in, then open each screen from a neutral one. ---
// AUDIT_CHROMIUM_PATH points at an installed Chromium when Playwright's own is not downloaded.
const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROMIUM_PATH });
const context = await browser.newContext({ ...devices["Pixel 7"], baseURL });
await context.route("**/*", (route) => {
  const headers = route.request().headers();
  if (headers["next-router-prefetch"] || headers["next-router-segment-prefetch"])
    return route.abort();
  return route.continue();
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
let inflight = 0;
page.on("request", () => inflight++);
page.on("requestfinished", () => inflight--);
page.on("requestfailed", () => inflight--);
// Settled: nothing in flight for a while and no loading screen showing.
async function settled(quietMs = 500) {
  let since = Date.now();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (inflight > 0) since = Date.now();
    if (Date.now() - since < quietMs) continue;
    const loading = await page
      .evaluate(() => /\bLoading\b/.test(document.body.innerText))
      .catch(() => false);
    if (!loading) return;
    since = Date.now();
  }
}
await page.goto("/login");
await page.getByLabel("Email", { exact: true }).fill("vinit@local.test");
await page.getByLabel("Password", { exact: true }).fill("password123");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL((url) => url.pathname === "/today");
await settled();

const rows = [];
const detail = {};
for (const path of screens) {
  await page.goto("/profile/password");
  await settled(400);
  log = [];
  await page.evaluate((p) => window.next.router.push(p), path);
  await settled();
  const statements = log.map((entry) => ({ ...entry, sql: entry.sql.replace(/\s+/g, " ") }));
  const counts = new Map();
  for (const entry of statements) counts.set(entry.conn, (counts.get(entry.conn) ?? 0) + 1);
  const perConnection = [...counts.values()];
  const landed = new URL(page.url()).pathname;
  rows.push({
    screen: path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id"),
    landed: landed === new URL(path, baseURL).pathname ? "" : "redirected",
    transactions: statements.filter((entry) => /^begin/i.test(entry.sql)).length,
    statements: statements.length,
    "per connection": perConnection.join("+"),
    "athlete lock": statements.some((entry) => /for update$/i.test(entry.sql)) ? "yes" : "",
  });
  detail[path] = statements.map((entry) => `[c${entry.conn}] ${entry.sql}`);
}
console.table(rows);
if (process.env.DB_SCREENS_OUT)
  writeFileSync(process.env.DB_SCREENS_OUT, JSON.stringify({ ids, rows, detail }, null, 2));
await browser.close();
proxy.close();
process.exit(0);
