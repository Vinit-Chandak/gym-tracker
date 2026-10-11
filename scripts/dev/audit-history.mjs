// Read-only comparison of every seeded month with the actual Progress History screen.
// No application reader is used for the expectations: these are uncapped raw DB records.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { devices, expect } from "@playwright/test";
import postgres from "postgres";
import { launch, skipDevice, skippedDevices } from "./audit-engines.mjs";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3101";
const database =
  process.env.AUDIT_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_56months";
const appAddress = new URL(baseURL);
const dbAddress = new URL(database);
const local = (address) => ["localhost", "127.0.0.1"].includes(address.hostname);
if (
  !local(appAddress) ||
  !["http:", "https:"].includes(appAddress.protocol) ||
  appAddress.pathname !== "/" ||
  appAddress.search ||
  appAddress.hash ||
  appAddress.username ||
  appAddress.password ||
  !local(dbAddress) ||
  !["postgres:", "postgresql:"].includes(dbAddress.protocol) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(dbAddress.pathname) ||
  dbAddress.search ||
  dbAddress.hash
)
  throw new Error(
    "History audit requires a loopback app and an audit database without URL overrides.",
  );

const output = process.env.AUDIT_OUTPUT_DIR ?? "output/audit-56-months";
const folder = `${output}/history`;
const fixtures = JSON.parse(await readFile(`${output}/fixtures.json`, "utf8"));
const usernames = fixtures.history?.usernames ?? ["vinit", "shreyash", "priya", "alex"];
const labels = {
  workout: "Workout",
  run: "Run",
  cycling: "Ride",
  swimming: "Swim",
  recovery: "Recovery",
};
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const from = fixtures.history?.from;
const to = fixtures.history?.to;
assert(
  dayPattern.test(from) && dayPattern.test(to) && from <= to,
  "Seed a valid history window first.",
);

function monthsInRange(first, last) {
  const windows = [];
  const cursor = new Date(`${first.slice(0, 7)}-01T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= last) {
    const start = cursor.toISOString().slice(0, 10);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    const end = new Date(cursor.getTime() - 86_400_000).toISOString().slice(0, 10);
    windows.push({
      month: start.slice(0, 7),
      from: start < first ? first : start,
      to: end > last ? last : end,
    });
  }
  return windows;
}
const months = monthsInRange(from, to);
assert.equal(months.length, fixtures.history.months, "This audit must cover every seeded month.");

// Every month is selected through the real date controls. Forced document loads can abort
// a late intent-prefetch from the previous month while Next is still consuming its stream.
// Direct entries and reloads are independently covered by the screen/navigation suites.
const lastMonthIndex = (month) =>
  months.findLastIndex((window) => window.month.endsWith(`-${month}`));
const leapIndex = months.findIndex((window) => window.to.endsWith("-02-29"));
const nativeIndices = new Set(
  [1, leapIndex, lastMonthIndex("03"), lastMonthIndex("11"), months.length - 1].filter(
    (index) => index >= 0,
  ),
);
const sampleIndices = [...new Set([0, ...nativeIndices].filter((index) => index !== 1))].sort(
  (a, b) => a - b,
);
const report = {
  startedAt: new Date().toISOString(),
  from,
  to,
  months: months.length,
  personas: usernames,
  semantics: {
    workouts:
      "Completed sessions on the day their parent activity froze (occurred_on), else started_at in the profile's current time_zone.",
    endurance:
      "Completed canonical running/cycling/swimming activities, using frozen occurred_on; running requires its detail row as the repository does.",
    recovery:
      "Standalone daily_recovery.date; the UI exposes date rather than ID, so its unique (user_id,date) identifies the raw ID. Displayed readings and notes must also match.",
    expectations:
      "Uncapped raw SQL in read-only transactions. No application repository is called.",
  },
  results: [],
  kindFilters: [],
  accountCoverage: [],
  errors: [],
};
await mkdir(folder, { recursive: true });
const persist = () => writeFile(`${folder}/results.json`, JSON.stringify(report, null, 2));
const sql = postgres(database, { max: 1 });

function readings(row) {
  return [
    ["Sleep", row.sleep_hours, "h"],
    ["Energy", row.energy],
    ["Fatigue", row.fatigue],
    ["Soreness", row.soreness],
  ]
    .filter(([, value]) => value !== null)
    .map(([label, value, unit]) => `${label} ${Number(value)}${unit ? ` ${unit}` : ""}`)
    .join(" · ");
}

async function snapshot(username) {
  return sql.begin("read only", async (tx) => {
    const [mode] = await tx`select current_setting('transaction_read_only') as mode`;
    assert.equal(mode.mode, "on");
    const [profile] =
      await tx`select id, username, time_zone from profiles where username=${username}`;
    assert(profile, `Missing seeded account ${username}.`);
    assert.equal(profile.id, fixtures.people.find((person) => person.username === username)?.id);
    const [workouts, activities, recovery] = await Promise.all([
      // A lift is dated by the day its parent activity froze, as a run is; only a session older
      // than the parents falls back to its start in the account's zone.
      tx`
        select w.id, w.started_at,
          coalesce(
            to_char(a.occurred_on, 'YYYY-MM-DD'),
            to_char(w.started_at at time zone ${profile.time_zone}, 'YYYY-MM-DD')
          ) as day
        from workout_sessions w
        join gyms g on g.id=w.gym_id
        left join activities a on a.id=w.activity_id and a.user_id=w.user_id
        where w.user_id=${profile.id} and w.completed_at is not null
          and coalesce(a.occurred_on, (w.started_at at time zone ${profile.time_zone})::date)
            between ${from}::date and ${to}::date
        order by w.started_at desc, w.id desc
      `,
      tx`
        select a.id, a.sport, a.started_at, a.occurred_on::text as day,
          exists(select 1 from running_activity_details r where r.activity_id=a.id) as has_running_detail
        from activities a
        where a.user_id=${profile.id} and a.status='completed'
          and a.sport in ('running','cycling','swimming')
          and a.occurred_on between ${from}::date and ${to}::date
        order by a.started_at desc, a.id desc
      `,
      tx`
        select id, date::text as day, sleep_hours, energy, fatigue, soreness, notes
        from daily_recovery
        where user_id=${profile.id} and date between ${from}::date and ${to}::date
        order by date desc
      `,
    ]);
    assert(
      activities.filter((row) => row.sport === "running").every((row) => row.has_running_detail),
      "A completed run is missing its required detail row.",
    );
    assert.equal(
      new Set(recovery.map((row) => row.day)).size,
      recovery.length,
      "Recovery dates must uniquely identify the account's recovery rows.",
    );
    const records = [
      ...workouts.map((row) => ({
        id: row.id,
        kind: "workout",
        day: row.day,
        order: row.started_at.toISOString(),
      })),
      ...activities
        .filter((row) => row.sport === "running")
        .map((row) => ({
          id: row.id,
          kind: "run",
          day: row.day,
          order: row.started_at.toISOString(),
        })),
      ...activities
        .filter((row) => row.sport !== "running")
        .map((row) => ({
          id: row.id,
          kind: row.sport,
          day: row.day,
          order: row.started_at.toISOString(),
        })),
      ...recovery.map((row) => ({
        id: row.id,
        kind: "recovery",
        day: row.day,
        order: row.day,
        readings: readings(row),
        notes: (row.notes ?? "").trim(),
      })),
    ];
    return { profile, records };
  });
}
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const key = (record) => `${record.kind}:${record.id}`;
// Newest first as History reads it: by day, then by when in the day, so a day's entries stand
// together under one caption wherever their instants fall.
function expectedFor(data, window, kind = "all") {
  return data.records
    .filter(
      (row) =>
        row.day >= window.from && row.day <= window.to && (kind === "all" || row.kind === kind),
    )
    .sort((a, b) => b.day.localeCompare(a.day) || b.order.localeCompare(a.order));
}
/** Entries on a page of History (ADR 0044's `HISTORY_PAGE_SIZE`). */
const PAGE_SIZE = 10;
function rangeLabel(window) {
  const format = (day, year) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      ...(year ? { year: "numeric" } : {}),
    }).format(new Date(`${day}T00:00:00Z`));
  return window.from === window.to
    ? format(window.to, true)
    : `${format(window.from, window.from.slice(0, 4) !== window.to.slice(0, 4))} – ${format(window.to, true)}`;
}

async function navigate(page, path) {
  const response = await page.goto(path, { waitUntil: "networkidle", timeout: 30_000 });
  assert.equal(response.status(), 200, `Unexpected status for ${path}.`);
  return response.status();
}
async function login(page, username) {
  await navigate(page, "/login");
  await page.getByLabel("Email", { exact: true }).fill(`${username}@local.test`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/today");
  await page.waitForLoadState("networkidle");
}
const filterButton = (page) => page.getByRole("button", { name: /^Filters:/ });
const filterDialog = (page) => page.getByRole("dialog", { name: "Filters", exact: true });

async function enterHistory(page) {
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Progress", exact: true })
    .click();
  await page.waitForURL((address) => address.pathname === "/progress");
  // History is not a section any more (ADR 0045): it is the page behind Overview's latest.
  await page.getByRole("link", { name: "All history", exact: true }).click();
  await page.waitForURL((address) => address.pathname === "/progress/history");
  await page.waitForLoadState("networkidle");
}

async function applyDates(page, window) {
  await filterButton(page).click();
  const dialog = filterDialog(page);
  await dialog.getByLabel("From", { exact: true }).fill(window.from);
  await dialog.getByLabel("To", { exact: true }).fill(window.to);
  const response = page.waitForResponse((result) => {
    const address = new URL(result.url());
    return (
      address.origin === appAddress.origin &&
      address.pathname === "/progress/history" &&
      address.searchParams.get("from") === window.from &&
      address.searchParams.get("to") === window.to
    );
  });
  await dialog.getByRole("button", { name: "Apply dates", exact: true }).click();
  const status = (await response).status();
  assert.equal(status, 200);
  await expect(dialog).toBeHidden();
  await page.waitForLoadState("networkidle");
  return status;
}

async function checkFilters(page, window, kind = "all") {
  const address = new URL(page.url());
  assert.equal(address.pathname, "/progress/history");
  assert.equal(address.searchParams.get("from"), window.from);
  assert.equal(address.searchParams.get("to"), window.to);
  assert.equal(address.searchParams.get("kind") ?? "all", kind);
  // Dates keep their day with their month by no-break spaces; the words are the same.
  await expect
    .poll(async () =>
      (await filterButton(page).getAttribute("aria-label"))?.replaceAll("\u00a0", " "),
    )
    .toBe(`Filters: ${rangeLabel(window)}${kind === "all" ? "" : ", 1 set"}`);
  await filterButton(page).click();
  const dialog = filterDialog(page);
  const values = {};
  for (const [name, expected] of [
    ["From", window.from],
    ["To", window.to],
    ["Activity", kind],
    ["Gym", ""],
    ["Exercise", ""],
    ["Machine", ""],
  ]) {
    const control = dialog.getByLabel(name, { exact: true });
    await expect(control).toHaveValue(expected);
    if (name === "From" || name === "To") await expect(control).toHaveAttribute("type", "date");
    values[name] = await control.inputValue();
  }
  await dialog.getByRole("button", { name: "Close sheet", exact: true }).click();
  await expect(dialog).toBeHidden();
  return values;
}

// History is a page of its own behind Overview (ADR 0045), its entries ten to a page (ADR 0044).
// Every page of the window is read, from the first, and the list is left on its first page.
async function checkRecords(page, data, window, kind = "all") {
  await expect(page.getByRole("heading", { level: 1, name: "History", exact: true })).toBeVisible();
  const count = page
    .getByRole("status")
    .filter({ hasText: /^[\d,]+\sentr(?:y|ies)(?:\s·\spage\s\d+\sof\s\d+)?$/ });
  await expect(count).toHaveCount(1);
  const expected = expectedFor(data, window, kind);
  const pages = Math.max(1, Math.ceil(expected.length / PAGE_SIZE));
  const status = (number) =>
    `${expected.length.toLocaleString("en-GB")} ${expected.length === 1 ? "entry" : "entries"}` +
    (pages > 1 ? ` · page ${number} of ${pages}` : "");
  const tab = (number) =>
    page
      .getByRole("navigation", { name: "History pages", exact: true })
      .getByRole("button", { name: `Page ${number} of ${pages}`, exact: true });
  if (pages > 1 && (await count.textContent()) !== status(1)) await tab(1).click();
  await expect(count).toHaveText(status(1));
  // Next's route announcer is an alert containing the page title, outside main.
  const alerts = (await page.getByRole("main").getByRole("alert").allTextContents())
    .map((text) => text.trim())
    .filter(Boolean);
  assert.deepEqual(alerts, [], "History rendered an error.");
  const actual = [];
  for (let number = 1; number <= pages; number++) {
    if (number > 1) {
      await tab(number).click();
      await expect(count).toHaveText(status(number));
      await expect(tab(number)).toHaveAttribute("aria-current", "page");
    }
    actual.push(...(await readRows(count)));
  }
  // The last page says where a list that stopped short ends; a month never stops short.
  assert.equal(
    await page
      .getByRole("note")
      .filter({ hasText: /^The list ends at / })
      .count(),
    0,
    "A monthly range was truncated.",
  );
  if (pages > 1) {
    await tab(1).click();
    await expect(count).toHaveText(status(1));
  }
  return compareRecords(actual, data, expected);
}

/** The rows of the page being shown, under their days. */
function readRows(count) {
  return count.evaluate((status) => {
    const rows = status.parentElement.querySelectorAll(
      'section[aria-labelledby^="history-"] > ul > li',
    );
    return [...rows].map((row) => {
      const link = row.querySelector(":scope > a");
      return {
        href: link?.getAttribute("href") ?? null,
        badges: link
          ? [...link.querySelectorAll(".mark-cell [aria-label]")].map((mark) =>
              mark.getAttribute("aria-label"),
            )
          : [],
        date: link
          ? null
          : row.closest("section").getAttribute("aria-labelledby").replace("history-", ""),
        readings: link
          ? null
          : row
              .querySelector(":scope > div > span:last-child > .type-meta-small")
              ?.textContent.trim(),
      };
    });
  });
}

/** The rows read against the uncapped raw records, in History's order. */
function compareRecords(actual, data, expected) {
  const byId = new Map(
    data.records.filter((row) => row.kind !== "recovery").map((row) => [row.id, row]),
  );
  const byDay = new Map(
    data.records.filter((row) => row.kind === "recovery").map((row) => [row.day, row]),
  );
  const records = actual.map((row) => {
    if (!row.href) {
      assert(row.date, "A non-link History row did not identify its recovery date.");
      const raw = byDay.get(row.date);
      assert(raw, `Unexpected recovery date ${row.date}.`);
      // A figure keeps its unit and a dot its fact with no-break spaces; the words are the same.
      assert.equal(
        row.readings?.replaceAll("\u00a0", " "),
        [raw.readings, raw.notes].filter(Boolean).join(" · "),
        `Recovery readings/notes disagree on ${row.date}.`,
      );
      return raw;
    }
    const href = new URL(row.href, baseURL);
    assert.equal(href.origin, appAddress.origin);
    const match = /^\/(workouts|training\/activities)\/([0-9a-f-]{36})$/.exec(href.pathname);
    assert(match, `Unexpected History record link ${row.href}.`);
    const raw = byId.get(match[2]);
    assert(raw, `History displayed an unexpected record ${match[2]}.`);
    assert.equal(match[1], raw.kind === "workout" ? "workouts" : "training/activities");
    assert.equal(href.searchParams.get("from"), "history");
    assert(
      row.badges.includes(labels[raw.kind]),
      `The ${raw.kind} badge is missing for ${raw.id}.`,
    );
    return raw;
  });
  const recordIds = records.map(key);
  const expectedIds = expected.map(key);
  assert.equal(
    new Set(recordIds).size,
    recordIds.length,
    "History repeated a record in this month.",
  );
  assert.deepEqual(
    recordIds,
    expectedIds,
    "History's displayed IDs/order disagree with the uncapped raw records.",
  );
  return {
    expectedCount: expectedIds.length,
    displayedCount: recordIds.length,
    recordIds,
    expectedIds,
    byKind: Object.fromEntries(
      Object.keys(labels).map((value) => [
        value,
        records.filter((row) => row.kind === value).length,
      ]),
    ),
    truncated: false,
  };
}

async function checkKindTransitions(page, data, window, engine) {
  for (const kind of Object.keys(labels)) {
    await filterButton(page).click();
    const dialog = filterDialog(page);
    await dialog.getByLabel("Activity", { exact: true }).selectOption(kind);
    await page.waitForURL((address) => address.searchParams.get("kind") === kind);
    await dialog.getByRole("button", { name: "Close sheet", exact: true }).click();
    const records = await checkRecords(page, data, window, kind);
    const filters = await checkFilters(page, window, kind);
    report.kindFilters.push({
      engine,
      persona: data.profile.username,
      ...window,
      kind,
      ...records,
      filters,
      passed: true,
    });
  }
  await filterButton(page).click();
  const dialog = filterDialog(page);
  await dialog.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.waitForURL((address) => !address.searchParams.has("kind"));
  await dialog.getByRole("button", { name: "Close sheet", exact: true }).click();
  await checkRecords(page, data, window);
  await checkFilters(page, window);
}

const configs = [{ name: "chromium", indices: months.map((_, index) => index) }];
if (process.env.AUDIT_HISTORY_WEBKIT_SAMPLE === "true" && !skipDevice("iphone", "webkit"))
  configs.push({ name: "webkit", indices: sampleIndices });
report.skipped = skippedDevices;
try {
  for (const config of configs) {
    const browser = await launch(config.name);
    try {
      for (const username of usernames) {
        const data = await snapshot(username);
        const before = fingerprint(data);
        const context = await browser.newContext({
          ...devices[config.name === "webkit" ? "iPhone 13" : "Pixel 7"],
          baseURL,
          // This compares server reads. SW routing and private caches have separate suites.
          serviceWorkers: "block",
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const seen = new Set();
        let current;
        try {
          await login(page, username);
          await enterHistory(page);
          for (const index of config.indices) {
            const window = months[index];
            current = window;
            const started = performance.now();
            const status = await applyDates(page, window);
            const records = await checkRecords(page, data, window);
            const filters = await checkFilters(page, window);
            assert.deepEqual(errors, [], "History produced browser runtime errors.");
            for (const id of records.recordIds) {
              assert(!seen.has(id), `Record ${id} was repeated across monthly windows.`);
              seen.add(id);
            }
            report.results.push({
              engine: config.name,
              persona: username,
              timeZone: data.profile.time_zone,
              ...window,
              navigation: "native-date-form",
              status,
              url: page.url(),
              durationMs: Math.round(performance.now() - started),
              ...records,
              filters,
              passed: true,
            });
            if (index === 0 || nativeIndices.has(index))
              await page.screenshot({
                path: `${folder}/${config.name}-${username}-${window.month}.png`,
                fullPage: true,
                animations: "disabled",
              });
            if (config.name === "chromium" && index === months.length - 1)
              await checkKindTransitions(page, data, window, config.name);
            if (report.results.length % 12 === 0) {
              await persist();
              console.log(
                `PASS ${report.results.length} monthly windows; latest ${config.name}/${username}/${window.month}: ${records.displayedCount} records.`,
              );
            }
          }
          await page.waitForLoadState("networkidle");
          assert.deepEqual(errors, [], "History produced browser runtime errors.");
          const after = fingerprint(await snapshot(username));
          assert.equal(
            after,
            before,
            "The account's raw history/profile zone changed during this read-only audit.",
          );
          if (config.name === "chromium")
            assert.deepEqual(
              [...seen].sort(),
              data.records.map(key).sort(),
              "The monthly windows did not cover the complete raw history.",
            );
          report.accountCoverage.push({
            engine: config.name,
            persona: username,
            months: config.indices.length,
            displayedUniqueRecords: seen.size,
            rawRecordsInSeededWindow: data.records.length,
            unchanged: before === after,
            fingerprint: after,
          });
          await persist();
        } catch (error) {
          report.errors.push({
            engine: config.name,
            persona: username,
            window: current,
            url: page.url(),
            error: error.stack,
            pageErrors: errors,
          });
          await page
            .screenshot({
              path: `${folder}/failure-${config.name}-${username}.png`,
              fullPage: true,
            })
            .catch(() => {});
          throw error;
        } finally {
          await page.waitForLoadState("networkidle").catch(() => {});
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  const expectedWindows = usernames.length * months.length;
  assert.equal(report.results.filter((row) => row.engine === "chromium").length, expectedWindows);
  report.completedAt = new Date().toISOString();
  report.passed = true;
  console.log(
    `PASS all ${expectedWindows} account/month windows and ${report.kindFilters.length} native sport filter checks. Raw history unchanged.`,
  );
} catch (error) {
  report.passed = false;
  if (report.errors.length === 0) report.errors.push({ error: error.stack });
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await persist();
  await sql.end();
}
