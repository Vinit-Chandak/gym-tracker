// Repeatable production-browser audit. Start the isolated stack before running this.
// Read-only screen sweeps share two workers; mutation suites run sequentially because
// some deliberately exercise the same seeded empty account.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3101";
const database =
  process.env.AUDIT_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_56months";
const app = new URL(baseURL);
const db = new URL(database);
if (
  !["localhost", "127.0.0.1"].includes(app.hostname) ||
  !["http:", "https:"].includes(app.protocol) ||
  app.pathname !== "/" ||
  app.search ||
  app.hash ||
  app.username ||
  app.password ||
  !["localhost", "127.0.0.1"].includes(db.hostname) ||
  !["postgres:", "postgresql:"].includes(db.protocol) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(db.pathname) ||
  db.search ||
  db.hash
)
  throw new Error("Audit suite requires a loopback app and a dedicated audit database.");

const output = process.env.AUDIT_OUTPUT_DIR ?? "output/audit-56-months";
await mkdir(`${output}/suite-logs`, { recursive: true });
const env = {
  ...process.env,
  AUDIT_BASE_URL: baseURL,
  AUDIT_DATABASE_URL: database,
  AUDIT_OUTPUT_DIR: output,
  AUDIT_PRODUCTION: "true",
};
// Each case specifies its own configuration, regardless of a previous shell command.
for (const key of [
  "AUDIT_DEVICE",
  "AUDIT_BROWSER",
  "AUDIT_THEME",
  "AUDIT_FONT_SIZE",
  "AUDIT_EXPAND_DETAILS",
  "AUDIT_ROUTE_FILTER",
  "AUDIT_UI_CHECK_FILTER",
  "AUDIT_HISTORY_WEBKIT_SAMPLE",
])
  delete env[key];
const jobs = [];
function add(name, script, overrides = {}, args = []) {
  jobs.push({ name, script: `scripts/dev/${script}.mjs`, overrides, args });
}
add("database-before", "audit", {}, ["verify-db"]);
for (const device of ["android", "iphone", "narrow", "desktop"])
  add(`screens-${device}`, "audit-browser", { AUDIT_DEVICE: device });
add("screens-android-dark", "audit-browser", { AUDIT_DEVICE: "android", AUDIT_THEME: "dark" });
for (const device of ["narrow", "iphone"])
  add(`screens-${device}-large-text`, "audit-browser", {
    AUDIT_DEVICE: device,
    AUDIT_THEME: device === "iphone" ? "dark" : "light",
    AUDIT_FONT_SIZE: "32",
    AUDIT_EXPAND_DETAILS: "true",
  });
add("history", "audit-history", { AUDIT_HISTORY_WEBKIT_SAMPLE: "true" });
add("interactions", "audit-interactions");
for (const name of [
  "account",
  "programme",
  "bookmarks",
  "legacy-routes",
  "ui-controls",
  "activity-time",
])
  add(name, `audit-${name}`);
for (const device of ["android", "iphone"]) {
  for (const name of ["workout", "flows", "recovery"])
    add(`${name}-${device}`, `audit-${name}`, { AUDIT_DEVICE: device });
  const engine = device === "iphone" ? "webkit" : "chromium";
  for (const name of ["food", "quick-food"])
    add(`${name}-${engine}`, `audit-${name}`, { AUDIT_BROWSER: engine, AUDIT_DEVICE: device });
}
add("route-inventory", "audit-inventory");
add("database-after", "audit", {}, ["verify-db"]);

const filter = process.env.AUDIT_SUITE_FILTER ? new RegExp(process.env.AUDIT_SUITE_FILTER) : null;
const planned = jobs.filter((job) => !filter || filter.test(job.name));
if (!planned.length) throw new Error("AUDIT_SUITE_FILTER matched no suites.");
const previous =
  process.env.AUDIT_SUITE_RETRY_FAILED === "true"
    ? JSON.parse(await readFile(`${output}/suite-results.json`, "utf8"))
    : null;
if (
  previous &&
  (!previous.complete ||
    previous.baseURL !== baseURL ||
    previous.database !== db.pathname.slice(1) ||
    previous.filter !== (filter?.source ?? null))
)
  throw new Error("Retry requires a completed report for the same app, database and filter.");
const selected = planned.filter(
  (job) => !previous?.results.some((row) => row.name === job.name && row.passed),
);
const retryNames = new Set(selected.map((job) => job.name));
const report = previous
  ? {
      ...previous,
      complete: false,
      passed: false,
      retriedAt: new Date().toISOString(),
      attempts: [
        ...(previous.attempts ?? []),
        ...previous.results.filter((row) => retryNames.has(row.name)),
      ],
      results: previous.results.filter((row) => !retryNames.has(row.name)),
    }
  : {
      startedAt: new Date().toISOString(),
      baseURL,
      database: db.pathname.slice(1),
      filter: filter?.source ?? null,
      complete: false,
      passed: false,
      results: [],
    };
let writes = Promise.resolve();
const save = () => {
  const snapshot = JSON.stringify(report, null, 2);
  writes = writes.then(() => writeFile(`${output}/suite-results.json`, snapshot));
  return writes;
};
await save();
async function runJob(job) {
  const started = Date.now();
  const attempt = (report.attempts?.filter((row) => row.name === job.name).length ?? 0) + 1;
  const logPath = `${output}/suite-logs/${job.name}${attempt > 1 ? `-attempt-${attempt}` : ""}.log`;
  console.log(`START ${job.name} (${selected.indexOf(job) + 1}/${selected.length})`);
  const log = createWriteStream(logPath);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [job.script, ...job.args], {
      env: { ...env, ...job.overrides },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    log.on("error", (error) => {
      child.kill();
      reject(error);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => log.end(() => resolve(exitCode ?? 1)));
  });
  report.results.push({
    name: job.name,
    passed: code === 0,
    exitCode: code,
    durationMs: Date.now() - started,
    log: logPath,
  });
  await save();
  console.log(
    `${code === 0 ? "PASS" : "FAIL"} ${job.name} (${Math.round((Date.now() - started) / 1000)}s)`,
  );
}
for (let index = 0; index < selected.length;) {
  const batch = [selected[index++]];
  if (batch[0].name.startsWith("screens-") && selected[index]?.name.startsWith("screens-"))
    batch.push(selected[index++]);
  await Promise.all(batch.map(runJob));
}
report.complete = true;
report.passed = report.results.every((result) => result.passed);
report.completedAt = new Date().toISOString();
await save();
console.log(
  `${report.results.filter((result) => result.passed).length}/${planned.length} suites passed. ${output}/suite-results.json`,
);
if (!report.passed) process.exitCode = 1;
