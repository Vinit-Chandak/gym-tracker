import { chromium, webkit, devices } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
  throw new Error("Local audit only.");
const fixtures = JSON.parse(await readFile("output/flow-audit/fixtures.json", "utf8"));
const results = [];
const user = (name) => fixtures.people.find((p) => p.username === name).id;
const vinit = user("vinit"),
  alex = user("alex");
const own = (rows, id = vinit) => rows.find((row) => row.userId === id);
const gym = own(fixtures.gyms).id;
const equipment = own(fixtures.equipment).id;
const workout = own(fixtures.workouts).id;
const active = fixtures.workouts.find((w) => w.userId === alex && !w.completedAt).id;
const run = own(fixtures.activities.filter((activity) => activity.sport === "running")).id;
const draft = own(fixtures.drafts).id;
const exercise = fixtures.exercises.find((e) => e.slug === "barbell-bench-press").id;
const activities = fixtures.activities.filter((a) => a.userId === vinit && a.sport !== "strength");
const occurrences = fixtures.occurrences.filter((a) => a.userId === vinit);
const templates = fixtures.templates.filter((a) => a.userId === vinit);
const routes = [
  "/today",
  "/today/choose",
  "/runs",
  "/runs/new",
  `/runs/${run}`,
  `/runs/${run}/edit`,
  "/food",
  "/progress/history",
  "/progress/history?kind=run",
  "/progress",
  "/progress?view=body",
  "/progress?view=running",
  "/profile",
  "/profile/edit",
  "/profile/privacy",
  "/profile/password",
  "/profile/delete-account",
  "/profile/coach",
  "/profile/ai-coach",
  "/profile/programme",
  "/profile/programme?view=changes",
  "/profile/programme/create",
  "/profile/programme/manual",
  "/profile/routines",
  `/profile/programme/drafts/${draft}`,
  ...fixtures.jobs.filter((j) => j.userId === vinit).map((j) => `/profile/programme/jobs/${j.id}`),
  "/profile/friends",
  "/profile/friends/people",
  "/profile/friends/people?people=followers",
  "/profile/friends/find",
  "/profile/friends/compare",
  "/profile/friends/leaderboard",
  "/profile/friends/leaderboard?sport=running",
  "/u/vinit",
  "/u/shreyash",
  "/u/priya",
  "/u/alex",
  "/u/shreyash/compare",
  "/u/shreyash/compare?sport=running",
  `/u/shreyash/compare/${exercise}`,
  "/gyms",
  "/gyms/new",
  `/gyms/${gym}`,
  `/gyms/${gym}/edit`,
  `/gyms/${gym}/equipment/new`,
  `/gyms/${gym}/equipment/${equipment}`,
  `/gyms/${gym}/programme`,
  `/gyms/${gym}/programme/${exercise}/fallback`,
  "/exercises",
  "/exercises/new",
  `/exercises/${exercise}`,
  `/workouts/${workout}`,
  "/training",
  "/training/scheduled",
  "/training/programme",
  "/profile/sports",
  "/training/templates",
  "/training/templates/new",
  ...["running", "cycling", "swimming"].flatMap((sport) => {
    const activity = activities.find((a) => a.sport === sport);
    const occurrence = occurrences.find(
      (a) => a.sport === sport && !a.familyId && a.disposition === "pending",
    );
    const template = templates.find((a) => a.sport === sport);
    return [
      `/training/new?sport=${sport}`,
      `/training/schedule?sport=${sport}`,
      `/training/programme?sport=${sport}`,
      `/training/activities/${activity.id}`,
      `/training/activities/${activity.id}/edit`,
      `/training/programme/occurrences/${occurrence.id}`,
      `/training/new?occurrence=${occurrence.id}`,
      `/training/templates/${template.id}/edit`,
      `/u/shreyash?sport=${sport}`,
      `/profile/friends/leaderboard?sport=${sport}`,
      `/u/shreyash/compare?sport=${sport}`,
    ];
  }),
  `/u/shreyash/activities/${fixtures.shared.find((a) => a.userId === user("shreyash") && a.sport === "cycle").id}`,
];
const configurations = [
  { name: "android", browser: chromium, options: devices["Pixel 7"] },
  { name: "iphone", browser: webkit, options: devices["iPhone 13"] },
  {
    name: "narrow",
    browser: chromium,
    options: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true },
  },
  { name: "desktop", browser: chromium, options: { viewport: { width: 1440, height: 1000 } } },
];
for (const config of configurations.filter(
  (c) => !process.env.AUDIT_DEVICE || c.name === process.env.AUDIT_DEVICE,
)) {
  const theme = process.env.AUDIT_THEME === "dark" ? "dark" : "light";
  if (theme === "dark") config.name += "-dark";
  // A machine whose browsers predate this Playwright can point at its own Chromium.
  const browser = await config.browser.launch({
    executablePath: config.browser === chromium ? process.env.AUDIT_CHROMIUM_PATH : undefined,
  });
  const context = await browser.newContext({ ...config.options, baseURL, colorScheme: theme });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const folder = `output/flow-audit/${config.name}`;
  await mkdir(folder, { recursive: true });
  async function visit(route, persona, index) {
    if (process.env.AUDIT_ROUTE_FILTER && !new RegExp(process.env.AUDIT_ROUTE_FILTER).test(route))
      return;
    errors.length = 0;
    try {
      const response = await page.goto(route, { waitUntil: "networkidle", timeout: 30_000 });
      const fullPage = await page.evaluate(
        () => document.documentElement.scrollHeight * devicePixelRatio < 32000,
      );
      await page.screenshot({
        path: `${folder}/${persona}-${String(index).padStart(2, "0")}.png`,
        fullPage,
      });
      const data = await page.evaluate(() => ({
        title: document.title,
        text: document.body.innerText.slice(0, 18000),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        overflowing: [...document.querySelectorAll("main *")]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.right > window.innerWidth + 1;
          })
          .slice(0, 8)
          .map((e) => ({ tag: e.tagName, text: e.textContent?.slice(0, 100), class: e.className })),
        alerts: [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent),
      }));
      const accessibility = config.name.startsWith("android")
        ? (
            await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
          ).violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
          }))
        : [];
      results.push({
        device: config.name,
        persona,
        route,
        url: page.url(),
        status: response.status(),
        ...data,
        errors: [...errors],
        accessibility,
        unexpectedNotFound: /(^|\n)(?:Not found|This page could not be found)(?:\n|\.|$)/i.test(
          data.text,
        ),
      });
      console.log(
        `${config.name} ${persona} ${route}: ${response.status()}${data.overflow ? " OVERFLOW" : ""}${errors.length ? ` ERRORS ${errors.length}` : ""}${accessibility.length ? ` A11Y ${accessibility.map((v) => v.id).join(",")}` : ""}`,
      );
    } catch (error) {
      results.push({ device: config.name, persona, route, error: error.message });
      console.log(`${config.name} ${route}: FAILED ${error.message.split("\n")[0]}`);
    }
    await writeFile(
      `output/flow-audit/screens-${config.name}.json`,
      JSON.stringify(
        results.filter((r) => r.device === config.name),
        null,
        2,
      ),
    );
  }
  async function login(persona) {
    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(`${persona}@local.test`);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  }
  for (const [i, route] of ["/login", "/signup", "/forgot-password", "/reset-password"].entries())
    await visit(route, "public", i);
  await login("vinit");
  for (const [i, route] of routes.entries()) await visit(route, "vinit", i);
  for (const persona of ["alex", "sam", "taylor"]) {
    await login(persona);
    const extra =
      persona === "alex"
        ? [
            `/workouts/${active}`,
            `/workouts/${active}/check-in`,
            `/workouts/${active}/finish`,
            `/workouts/${active}/add-exercise`,
            "/profile/edit",
            "/progress",
          ]
        : persona === "sam"
          ? [
              "/today",
              "/training",
              "/food",
              "/progress/history",
              "/progress",
              "/profile/programme",
              "/gyms",
              "/profile/friends",
            ]
          : [
              "/welcome",
              "/welcome/sports",
              "/welcome/gym",
              "/welcome/equipment",
              "/welcome/programme",
              "/welcome/programme/create",
              "/welcome/programme/manual",
            ];
    for (const [i, route] of extra.entries()) await visit(route, persona, i);
  }
  await browser.close();
}
console.log(`Saved ${results.length} screen checks.`);
const failures = results.filter(
  (result) =>
    result.error ||
    result.status >= 400 ||
    result.unexpectedNotFound ||
    result.overflow ||
    result.errors?.length ||
    result.accessibility?.length,
);
if (failures.length) {
  console.error(`${failures.length} screen checks failed. See output/flow-audit/screens-*.json.`);
  process.exitCode = 1;
}
