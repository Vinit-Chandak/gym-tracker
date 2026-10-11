// Every screen of the six year-long accounts, at phone, small-phone, Android, tablet and desktop
// sizes, and at 200% text: status, runtime errors, horizontal overflow, targets under 44 px,
// text under 12 px, and a screenshot each. Read-only: it never taps anything that saves.
//
//   AUDIT_BASE_URL=http://localhost:3107 node scripts/dev/year/audit-year.mjs
//
// YEAR_DATABASE_URL (default the local overload_audit_year) is read for real ids to visit.
// YEAR_AUDIT_DEVICES narrows the configurations (comma-separated names), YEAR_AUDIT_PERSONAS the
// accounts, YEAR_AUDIT_ROUTES (a regular expression) the routes.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import postgres from "postgres";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3107";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
  throw new Error("Local audit only.");
const database =
  process.env.YEAR_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_year";
const output = process.env.YEAR_AUDIT_OUTPUT ?? "output/year-audit";
const executablePath = process.env.AUDIT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

const sql = postgres(database, { max: 1, onnotice: () => {} });
const people = await sql`select id, username, time_zone from profiles order by username`;
const ids = {};
for (const person of people) {
  const [finished] = await sql`select id from workout_sessions
    where user_id = ${person.id} and completed_at is not null order by started_at desc limit 1`;
  const [old] = await sql`select id from workout_sessions
    where user_id = ${person.id} and completed_at is not null order by started_at asc limit 1`;
  const [open] = await sql`select id from workout_sessions
    where user_id = ${person.id} and completed_at is null limit 1`;
  const [openExercise] = open
    ? await sql`select id from workout_exercises where workout_session_id = ${open.id}
        order by order_index limit 1`
    : [];
  const [topExercise] = await sql`select we.exercise_id as id from workout_exercises we
    join set_logs s on s.workout_exercise_id = we.id
    where we.user_id = ${person.id} group by we.exercise_id order by count(*) desc limit 1`;
  const [gym] = await sql`select id from gyms where user_id = ${person.id} order by created_at limit 1`;
  const [machine] = gym
    ? await sql`select id from equipment_instances where gym_id = ${gym.id} order by name limit 1`
    : [];
  const activities = await sql`select distinct on (sport) id, sport from activities
    where user_id = ${person.id} and sport <> 'strength' order by sport, started_at desc`;
  const [day] = await sql`select occurred_on::text as day from activities
    where user_id = ${person.id} group by occurred_on order by count(*) desc, occurred_on desc limit 1`;
  const [program] = await sql`select id from programs where user_id = ${person.id} and status = 'active'`;
  const programDays = program
    ? await sql`select id from program_days where program_id = ${program.id} order by day_index`
    : [];
  const [occurrence] = await sql`select id from planned_occurrences
    where user_id = ${person.id} order by created_at desc limit 1`;
  const friends = await sql`select p.username from follows f join profiles p on p.id = f.followee_id
    where f.follower_id = ${person.id} and f.status = 'accepted' order by p.username`;
  const [shared] = friends.length
    ? await sql`select s.id from shared_session_stats s join profiles p on p.id = s.user_id
        where p.username = ${friends[0].username} order by s.started_at desc limit 1`
    : [];
  const [commonExercise] = friends.length
    ? await sql`select a.exercise_id as id from shared_exercise_stats a
        join shared_exercise_stats b on b.exercise_id = a.exercise_id
        join profiles p on p.id = b.user_id
        join exercises e on e.id = a.exercise_id
        where a.user_id = ${person.id} and p.username = ${friends[0].username}
          and e.load_portability <> 'equipment_specific'
        group by a.exercise_id order by count(*) desc limit 1`
    : [];
  ids[person.username] = {
    finished: finished?.id,
    old: old?.id,
    open: open?.id,
    openExercise: openExercise?.id,
    exercise: topExercise?.id,
    gym: gym?.id,
    machine: machine?.id,
    activities,
    day: day?.day,
    programDays: programDays.map((d) => d.id),
    occurrence: occurrence?.id,
    friend: friends[0]?.username,
    shared: shared?.id,
    commonExercise: commonExercise?.id,
  };
}
await sql.end();

function routesFor(username) {
  const id = ids[username];
  const routes = [
    "/today",
    "/today/choose",
    "/training",
    "/training/programme",
    "/training/scheduled",
    "/training/templates",
    "/training/new?sport=running",
    "/food",
    "/food/breakfast",
    "/food/dinner",
    "/food/targets",
    "/food/my-foods",
    "/progress",
    "/progress?view=strength",
    "/progress?view=muscles",
    "/progress?view=body",
    "/progress?view=running",
    "/progress?view=recovery",
    "/progress?view=food",
    "/progress/history",
    "/progress/calendar",
    "/profile",
    "/profile/edit",
    "/profile/programme",
    "/profile/programme/history",
    "/profile/friends",
    "/profile/friends/people",
    "/profile/friends/find",
    "/profile/friends/leaderboard",
    "/profile/friends/compare",
    "/profile/privacy",
    "/profile/sports",
    "/profile/routines",
    "/gyms",
    "/exercises",
    `/u/${username}`,
  ];
  if (id.day) routes.push(`/progress/day/${id.day}`);
  if (id.finished) routes.push(`/workouts/${id.finished}`);
  if (id.old) routes.push(`/workouts/${id.old}`);
  if (id.open)
    routes.push(
      `/workouts/${id.open}`,
      `/workouts/${id.open}/finish`,
      `/workouts/${id.open}/add-exercise`,
      `/workouts/${id.open}/check-in`,
    );
  if (id.open && id.openExercise)
    routes.push(`/workouts/${id.open}/exercises/${id.openExercise}/substitute`);
  if (id.exercise) routes.push(`/exercises/${id.exercise}`);
  if (id.gym)
    routes.push(`/gyms/${id.gym}`, `/gyms/${id.gym}/programme`, `/gyms/${id.gym}/edit`);
  if (id.gym && id.machine) routes.push(`/gyms/${id.gym}/equipment/${id.machine}`);
  for (const activity of id.activities)
    routes.push(`/training/activities/${activity.id}`, `/training/activities/${activity.id}/edit`);
  for (const day of id.programDays.slice(0, 2)) routes.push(`/training/days/${day}`);
  if (id.occurrence) routes.push(`/training/programme/occurrences/${id.occurrence}`);
  if (id.friend)
    routes.push(
      `/u/${id.friend}`,
      `/u/${id.friend}/compare`,
      `/profile/friends/leaderboard?sport=running`,
    );
  if (id.friend && id.commonExercise) routes.push(`/u/${id.friend}/compare/${id.commonExercise}`);
  if (id.friend && id.shared) routes.push(`/u/${id.friend}/activities/${id.shared}`);
  return routes;
}

const configurations = [
  {
    name: "iphone",
    options: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: "small",
    options: {
      viewport: { width: 320, height: 568 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: "android",
    options: {
      viewport: { width: 360, height: 800 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
    },
  },
  {
    name: "iphone-text200",
    fontSize: 32,
    options: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  },
  { name: "tablet", options: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
  { name: "tablet-landscape", options: { viewport: { width: 1180, height: 820 }, hasTouch: true } },
  { name: "desktop", options: { viewport: { width: 1440, height: 900 } } },
  { name: "desktop-dark", dark: true, options: { viewport: { width: 1920, height: 1080 } } },
];

const wantedDevices = process.env.YEAR_AUDIT_DEVICES?.split(",");
const wantedPeople = process.env.YEAR_AUDIT_PERSONAS?.split(",");
const routeFilter = process.env.YEAR_AUDIT_ROUTES ? new RegExp(process.env.YEAR_AUDIT_ROUTES) : null;
const results = [];
const browser = await chromium.launch({ executablePath });
for (const config of configurations.filter((c) => !wantedDevices || wantedDevices.includes(c.name))) {
  for (const person of people.filter((p) => !wantedPeople || wantedPeople.includes(p.username))) {
    const context = await browser.newContext({
      ...config.options,
      baseURL,
      colorScheme: config.dark ? "dark" : "light",
      timezoneId: person.time_zone,
    });
    await context.addInitScript((mode) => {
      try {
        localStorage.setItem("overload:appearance", mode);
      } catch {}
    }, config.dark ? "dark" : "light");
    const login = await context.newPage();
    await login.goto("/login");
    await login.getByLabel("Email", { exact: true }).fill(`${person.username}@local.test`);
    await login.getByLabel("Password", { exact: true }).fill("password123");
    await login.getByRole("button", { name: "Sign in", exact: true }).click();
    await login.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
    await login.close();
    const folder = `${output}/${config.name}/${person.username}`;
    await mkdir(folder, { recursive: true });
    for (const [index, route] of routesFor(person.username).entries()) {
      if (routeFilter && !routeFilter.test(route)) continue;
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text().slice(0, 300)}`);
      });
      const entry = { device: config.name, persona: person.username, route };
      try {
        const started = Date.now();
        const response = await page.goto(route, { waitUntil: "networkidle", timeout: 45_000 });
        entry.status = response?.status();
        await page
          .getByRole("heading", { level: 1 })
          .first()
          .waitFor({ state: "visible", timeout: 15_000 })
          .catch(() => {});
        entry.ms = Date.now() - started;
        if (config.fontSize)
          await page.evaluate((size) => {
            document.documentElement.style.fontSize = `${size}px`;
          }, config.fontSize);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        Object.assign(
          entry,
          await page.evaluate(() => {
            const width = document.documentElement.clientWidth;
            const visible = (element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.visibility !== "hidden" &&
                style.display !== "none" &&
                !element.closest("[aria-hidden='true'], [inert]")
              );
            };
            const describe = (element) => ({
              tag: element.tagName.toLowerCase(),
              text: (element.getAttribute("aria-label") ?? element.textContent ?? "")
                .trim()
                .slice(0, 80),
              cls: String(element.className).slice(0, 120),
            });
            const main = document.querySelector("main") ?? document.body;
            const overflowing = [...main.querySelectorAll("*")]
              .filter((element) => visible(element) && element.getBoundingClientRect().right > width + 1)
              .slice(0, 6)
              .map(describe);
            const smallTargets = [...document.querySelectorAll("a[href], button, [role='button'], input, select, [role='tab'], summary")]
              .filter(visible)
              .filter((element) => {
                const rect = element.getBoundingClientRect();
                return (rect.height < 43.5 || rect.width < 24) && element.type !== "hidden";
              })
              .slice(0, 8)
              .map((element) => ({ ...describe(element), h: Math.round(element.getBoundingClientRect().height), w: Math.round(element.getBoundingClientRect().width) }));
            const tinyText = [...main.querySelectorAll("*")]
              .filter(
                (element) =>
                  visible(element) &&
                  [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim()) &&
                  parseFloat(getComputedStyle(element).fontSize) < 11.5,
              )
              .slice(0, 6)
              .map((element) => ({ ...describe(element), size: getComputedStyle(element).fontSize }));
            const h1 = document.querySelector("h1");
            return {
              url: location.pathname + location.search,
              title: document.title,
              h1: h1?.textContent?.trim().slice(0, 120) ?? null,
              h1Size: h1 ? getComputedStyle(h1).fontSize : null,
              mainWidth: Math.round(main.getBoundingClientRect().width),
              overflow: document.documentElement.scrollWidth > width,
              overflowing,
              smallTargets,
              tinyText,
              alerts: [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent?.trim()).filter(Boolean),
              notFound: /This page could not be found|Not found/i.test(document.body.innerText.slice(0, 2000)),
              text: document.body.innerText.slice(0, 4000),
            };
          }),
        );
        const shot = `${folder}/${String(index).padStart(2, "0")}.png`;
        const tall = await page.evaluate(() => document.documentElement.scrollHeight < 9000);
        await page.screenshot({ path: shot, fullPage: tall, animations: "disabled" });
        entry.screenshot = shot;
      } catch (error) {
        entry.error = error.message.split("\n")[0];
      }
      entry.errors = errors;
      results.push(entry);
      const flags = [
        entry.status >= 400 ? `HTTP ${entry.status}` : "",
        entry.error ? `FAILED ${entry.error}` : "",
        entry.overflow ? "OVERFLOW" : "",
        errors.length ? `ERRORS ${errors.length}` : "",
        entry.notFound ? "NOT FOUND" : "",
      ]
        .filter(Boolean)
        .join(" ");
      console.log(`${config.name} ${person.username} ${route} ${entry.ms ?? ""}ms ${flags}`);
      await page.close();
    }
    await context.close();
    await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  }
}
await browser.close();
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
const bad = results.filter(
  (r) => r.error || r.status >= 400 || r.overflow || r.errors?.length || r.notFound,
);
console.log(`${results.length} visits, ${bad.length} with problems. ${output}/results.json`);
