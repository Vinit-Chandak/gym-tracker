// Read-only design references. Every interaction opens a view; no data is submitted.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { webkit, devices } from "@playwright/test";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3102";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
  throw new Error("Design captures require the local audit app.");
const fixturePath = process.env.DESIGN_FIXTURES ?? "output/audit-2026-09-29/fixtures.json";
const output = process.env.DESIGN_OUTPUT_DIR ?? "output/design-revamp-iphone17-2026-09-30";
const folder = `${output}/overlays`;
const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));
const alex = fixtures.people.find((person) => person.username === "alex").id;
const active = fixtures.workouts.find((workout) => workout.userId === alex && !workout.completedAt);
const exercise = fixtures.workoutExercises.find((item) => item.workoutSessionId === active.id);
const foodDay = `?day=${fixtures.history.to}`;
const progressRange = `?from=2026-08-01&to=${fixtures.history.to}`;
const workout = `/workouts/${active.id}`;
const logger = `${workout}?exercise=${exercise.id}`;
const click = (name) => async (page) =>
  page.getByRole("button", { name, exact: typeof name === "string" }).click();
const cases = [
  {
    name: "profile-appearance",
    route: "/profile",
    open: click(/^Appearance:/),
    dialog: "Appearance",
  },
  {
    name: "profile-install-instructions",
    route: "/profile",
    open: click("Install Overload"),
    dialog: "Install Overload",
  },
  {
    name: "coach-explanation",
    route: "/profile/ai-coach",
    open: click("About the AI coach"),
    note: true,
  },
  {
    name: "today-gym-chooser",
    route: "/today",
    open: async (page) =>
      page
        .getByRole("region", { name: "Current gym" })
        .getByRole("button", { name: "Change", exact: true })
        .click(),
    dialog: "Choose gym",
  },
  { name: "today-more-options", route: "/today", open: click("More options"), dialog: true },
  {
    name: "food-calendar",
    route: `/food${foodDay}`,
    open: click(/, calendar$/),
    dialog: "Calendar",
  },
  {
    name: "food-protein-breakdown",
    route: `/food${foodDay}`,
    open: click(/^Protein:/),
    dialog: "Protein",
  },
  {
    name: "food-quick-add",
    route: `/food/breakfast${foodDay}`,
    open: click("Quick add Calories and macros, just this once"),
    dialog: "Quick add",
  },
  {
    name: "food-edit-portion",
    route: `/food/breakfast${foodDay}`,
    open: async (page) =>
      page
        .getByRole("list", { name: "In breakfast", exact: true })
        .locator("[data-swipe-row] > button")
        .first()
        .click(),
    dialog: true,
  },
  {
    name: "food-add-saved-meal",
    route: `/food/breakfast${foodDay}`,
    open: async (page) =>
      page
        .getByRole("list", { name: "Your foods and meals", exact: true })
        .getByRole("button", { name: /Oats, yoghurt and banana/ })
        .click(),
    dialog: true,
  },
  { name: "food-new-food", route: "/food/my-foods", open: click("New food"), dialog: "New food" },
  {
    name: "food-edit-saved-food",
    route: "/food/my-foods",
    open: async (page) =>
      page
        .getByRole("list", { name: "Foods", exact: true })
        .locator("li")
        .first()
        .locator("button")
        .last()
        .click(),
    dialog: "Edit food",
  },
  {
    name: "history-filters",
    route: `/progress/history${progressRange}`,
    open: click(/^Filters:/),
    dialog: "Filters",
  },
  {
    name: "progress-filters",
    route: `/progress${progressRange}`,
    open: click(/^Filters:/),
    dialog: "Filters",
  },
  {
    name: "progress-weekly-sessions-help",
    route: `/progress${progressRange}`,
    open: click("About weekly sessions"),
    note: true,
  },
  {
    name: "progress-chart-tooltip",
    route: `/progress${progressRange}`,
    open: async (page) => {
      const chart = page.locator('svg[role="img"]').first();
      await chart.evaluate((element) => element.scrollIntoView({ block: "center" }));
      const rect = await chart.boundingBox();
      await chart.dispatchEvent("pointerdown", {
        clientX: rect.x + rect.width * 0.7,
        clientY: rect.y + 50,
        pointerType: "touch",
      });
      await chart.locator("..").getByRole("status").waitFor();
    },
  },
  {
    name: "workout-session-details",
    persona: "alex",
    route: workout,
    open: click("Session details"),
    dialog: "Session details",
  },
  {
    name: "workout-superset",
    persona: "alex",
    route: workout,
    open: click(/^Supersets?$/),
    dialog: true,
  },
  {
    name: "workout-superset-help",
    persona: "alex",
    route: workout,
    open: async (page) => {
      await page.getByRole("button", { name: /^Supersets?$/ }).click();
      await page.getByRole("button", { name: "About supersets", exact: true }).click();
    },
    note: true,
  },
  {
    name: "workout-set-options",
    persona: "alex",
    route: logger,
    open: async (page) =>
      page
        .getByRole("button", { name: /^Set \d+ options/ })
        .first()
        .click(),
    dialog: true,
  },
  {
    name: "workout-exercise-technique",
    persona: "alex",
    route: logger,
    open: async (page) => page.getByRole("tab", { name: "Technique", exact: true }).click(),
  },
  {
    name: "workout-exercise-history",
    persona: "alex",
    route: logger,
    open: async (page) => page.getByRole("tab", { name: "History", exact: true }).click(),
  },
];

await mkdir(folder, { recursive: true });
const prior = await readFile(`${folder}/manifest.json`, "utf8")
  .then(JSON.parse)
  .catch(() => null);
const results = process.env.DESIGN_CAPTURE_FILTER ? (prior?.results ?? []) : [];
const manifest = {
  purpose: "Supplementary overlay and client-state references for the app design revamp",
  engine: "WebKit",
  device: "iPhone 17 emulation",
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  png: { width: 1206, height: 2622 },
  rootFontSize: 16,
  themes: ["light", "dark"],
  fixturePath,
  notes: [
    "App canvas only: no fabricated Safari chrome, status bar, Dynamic Island or home indicator.",
    "Native OS picker popups and software keyboards are not rendered by headless browser screenshots; their app fields are covered by route captures.",
    "Only menus, dialogs, help, chart selection and client-side tabs are opened. No save, delete, submit or account-setting mutation is performed.",
    "Authentication and appearance preferences are confined to fresh browser contexts. Existing seeded data is used unchanged.",
  ],
  results,
};
const browser = await webkit.launch();
try {
  for (const theme of ["light", "dark"]) {
    await mkdir(`${folder}/${theme}`, { recursive: true });
    for (const persona of ["vinit", "alex"]) {
      const selected = cases.filter(
        (item) =>
          (item.persona ?? "vinit") === persona &&
          (!process.env.DESIGN_CAPTURE_FILTER ||
            new RegExp(process.env.DESIGN_CAPTURE_FILTER).test(item.name)),
      );
      if (!selected.length) continue;
      const context = await browser.newContext({
        ...devices["iPhone 17"],
        baseURL,
        viewport: manifest.viewport,
        screen: manifest.viewport,
        deviceScaleFactor: 3,
        colorScheme: theme,
      });
      await context.addInitScript((mode) => {
        localStorage.setItem("overload:appearance", mode);
      }, theme);
      const login = await context.newPage();
      await login.goto("/login", { waitUntil: "networkidle" });
      await login.getByLabel("Email", { exact: true }).fill(`${persona}@local.test`);
      await login.getByLabel("Password", { exact: true }).fill("password123");
      await login.getByRole("button", { name: "Sign in", exact: true }).click();
      await login.waitForURL((url) => !url.pathname.startsWith("/login"));
      await login.close();
      for (const item of selected) {
        const page = await context.newPage();
        page.setDefaultTimeout(12_000);
        const errors = [];
        const postRequests = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("request", (request) => {
          if (request.method() === "POST")
            postRequests.push({
              path: new URL(request.url()).pathname,
              serverAction: !!request.headers()["next-action"],
            });
        });
        const record = {
          name: item.name,
          title: item.name.replaceAll("-", " "),
          theme,
          persona,
          route: item.route,
          notes: [],
        };
        try {
          const response = await page.goto(item.route, { waitUntil: "networkidle" });
          assert.equal(response.status(), 200);
          await page.getByRole("heading", { level: 1 }).waitFor();
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "16px";
          });
          await page.waitForFunction(
            (mode) => document.documentElement.getAttribute("data-overload-mode") === mode,
            theme,
          );
          await item.open(page);
          if (item.dialog)
            await page
              .getByRole(
                "dialog",
                typeof item.dialog === "string" ? { name: item.dialog, exact: true } : {},
              )
              .waitFor();
          if (item.note) await page.getByRole("note").waitFor();
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(requestAnimationFrame);
          });
          const file = `${theme}/${String(cases.indexOf(item) + 1).padStart(2, "0")}-${item.name}.png`;
          const png = await page.screenshot({
            path: `${folder}/${file}`,
            animations: "disabled",
            fullPage: false,
            scale: "device",
          });
          assert.equal(png.readUInt32BE(16), manifest.png.width);
          assert.equal(png.readUInt32BE(20), manifest.png.height);
          assert.equal(await page.locator("html").getAttribute("data-overload-mode"), theme);
          assert.deepEqual(errors, []);
          Object.assign(record, {
            ok: true,
            passed: true,
            file,
            screenshot: `overlays/${file}`,
            url: page.url(),
            pageTitle: await page.title(),
            pageErrors: errors,
            postRequests,
          });
        } catch (error) {
          Object.assign(record, {
            ok: false,
            passed: false,
            error: String(error),
            pageErrors: errors,
            postRequests,
          });
        }
        const existing = results.findIndex(
          (result) => result.name === item.name && result.theme === theme,
        );
        if (existing < 0) results.push(record);
        else results[existing] = record;
        console.log(`${theme} ${item.name}: ${record.ok ? "CAPTURED" : record.error}`);
        await page.close();
        await writeFile(
          `${folder}/manifest.json`,
          JSON.stringify({ ...manifest, capturedAt: new Date().toISOString() }, null, 2),
        );
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const failed = results.filter((result) => !result.ok);
console.log(
  JSON.stringify({
    captured: results.length - failed.length,
    failed: failed.length,
    manifest: `${folder}/manifest.json`,
  }),
);
if (failed.length) process.exitCode = 1;
