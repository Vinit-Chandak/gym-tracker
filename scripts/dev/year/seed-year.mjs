// A fresh local database holding six athletes and a year of their training (docs/audits).
// Drops and recreates only a loopback database named overload_audit_year; never anything else.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const database =
  process.env.YEAR_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_year";
const target = new URL(database);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.search !== "" ||
  target.hash !== "" ||
  !/^\/overload_audit_year(?:_[a-z0-9]+)*$/.test(target.pathname)
)
  throw new Error("The year is only written to a loopback database named overload_audit_year.");

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${args.join(" ")} exited ${code}`)),
    );
  });
}

const name = target.pathname.slice(1);
const adminUrl = new URL(database);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
try {
  await admin.unsafe(`drop database if exists "${name}" with (force)`);
  await admin.unsafe(`create database "${name}"`);
} finally {
  await admin.end();
}
const sql = postgres(database, { max: 1, onnotice: () => {} });
try {
  await sql.unsafe(await readFile("scripts/dev/auth-stub.sql", "utf8"));
} finally {
  await sql.end();
}
const env = { DATABASE_URL: database, DIRECT_DATABASE_URL: database };
await run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/db/migrate.ts"], env);
await run(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.year.config.mts"],
  {
    YEAR_DATABASE_URL: database,
    YEAR_NOW: process.env.YEAR_NOW ?? new Date().toISOString(),
    YEAR_OUT: process.env.YEAR_OUT ?? "output/year",
  },
);
await run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/db/programme-schedule-audit.ts"], env);
console.log(
  `\nReady: ${name}. Serve it with AUDIT_DATABASE_URL=${database} npm run audit:auth / audit:start.`,
);
