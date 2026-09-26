// Read-only comparison of every seeded month with the actual Progress History screen.
// No application reader is used for the expectations: these are uncapped raw DB records.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, webkit, devices, expect } from "@playwright/test";
import postgres from "postgres";

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
const usernames = ["vinit", "shreyash", "priya", "alex"];
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
  "Seed a valid 56-month history first.",
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
assert.equal(months.length, 56, "This audit must cover all 56 seeded months.");
assert.equal(fixtures.history.months, 56);

// Native date changes include a leap February, the latest DST start/end months, and the
// partial final month. Every other month still gets an independent browser GET.
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
    workouts: "Completed sessions, started_at interpreted in the profile's current time_zone.",
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
      tx`
        select w.id, w.started_at,
          to_char(w.started_at at time zone ${profile.time_zone}, 'YYYY-MM-DD') as day
        from workout_sessions w
        join gyms g on g.id=w.gym_id
        where w.user_id=${profile.id} and w.completed_at is not null
          and (w.started_at at time zone ${profile.time_zone})::date between ${from}::date and ${to}::date
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
function expectedFor(data, window, kind = "all") {
  return data.records
    .filter(
      (row) =>
        row.day >= window.from && row.day <= window.to && (kind === "all" || row.kind === kind),
    )
    .sort((a, b) => b.order.localeCompare(a.order));
}
const rangeURL = (window) =>
  `/progress/history?${new URLSearchParams({ from: window.from, to: window.to })}`;
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
  if (page.url() !== "about:blank") await page.waitForLoadState("networkidle");
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
  await expect(filterButton(page)).toHaveAttribute("aria-label", `Filters: ${rangeLabel(window)}`);
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

async function checkRecords(page, data, window, kind = "all") {
  await expect(
    page.getByRole("button", { name: "Progress section: History", exact: true }),
  ).toBeVisible();
  const count = page.getByRole("status").filter({ hasText: /^\d+ entr(?:y|ies)$/ });
  await expect(count).toHaveCount(1);
  const expected = expectedFor(data, window, kind);
  await expect(count).toHaveText(
    `${expected.length} ${expected.length === 1 ? "entry" : "entries"}`,
  );
  // Next's route announcer is an alert containing the page title, outside main.
  const alerts = (await page.getByRole("main").getByRole("alert").allTextContents())
    .map((text) => text.trim())
    .filter(Boolean);
  assert.deepEqual(alerts, [], "History rendered an error.");
  assert.equal(
    await page
      .getByRole("status")
      .filter({ hasText: /Showing the newest records only/ })
      .count(),
    0,
    "A monthly range was truncated.",
  );
  const actual = await count.evaluate((status) => {
    const list = status.parentElement.querySelector(":scope > ul");
    return list
      ? [...list.children].map((row) => {
          const link = row.querySelector(":scope > a");
          return {
            href: link?.getAttribute("href") ?? null,
            badges: link
              ? [...link.querySelectorAll("span")].map((span) => span.textContent.trim())
              : [],
            date: link
              ? null
              : row
                  .querySelector(":scope > div > p")
                  ?.textContent.match(/^Recovery · (\d{4}-\d{2}-\d{2})/)?.[1],
            readings: link
              ? null
              : row.querySelector(":scope > div > p:nth-child(2)")?.textContent.trim(),
            notes: link ? null : (row.querySelector(":scope > p")?.textContent.trim() ?? ""),
          };
        })
      : [];
  });
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
      assert.equal(row.readings, raw.readings, `Recovery readings disagree on ${row.date}.`);
      assert.equal(row.notes, raw.notes, `Recovery notes disagree on ${row.date}.`);
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

const configs = [{ name: "chromium", engine: chromium, indices: months.map((_, index) => index) }];
if (process.env.AUDIT_HISTORY_WEBKIT_SAMPLE === "true")
  configs.push({ name: "webkit", engine: webkit, indices: sampleIndices });
try {
  for (const config of configs) {
    const browser = await config.engine.launch({
      executablePath: config.name === "chromium" ? process.env.AUDIT_CHROMIUM_PATH : undefined,
    });
    try {
      for (const username of usernames) {
        const data = await snapshot(username);
        const before = fingerprint(data);
        const context = await browser.newContext({
          ...devices[config.name === "webkit" ? "iPhone 13" : "Pixel 7"],
          baseURL,
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
          for (const index of config.indices) {
            const window = months[index];
            const native = current !== undefined && nativeIndices.has(index);
            current = window;
            const started = performance.now();
            const status = native
              ? await applyDates(page, window)
              : await navigate(page, rangeURL(window));
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
              navigation: native ? "native-date-form" : "browser-get",
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
              "The 56 monthly windows did not cover the complete raw history.",
            );
          report.accountCoverage.push({
            engine: config.name,
            persona: username,
            months: config.indices.length,
            displayedUniqueRecords: seen.size,
            rawRecordsIn56Months: data.records.length,
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
  assert.equal(report.results.filter((row) => row.engine === "chromium").length, 224);
  report.completedAt = new Date().toISOString();
  report.passed = true;
  console.log(
    `PASS all 224 account/month windows and ${report.kindFilters.length} native sport filter checks. Raw history unchanged.`,
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
