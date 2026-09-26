// Run the complete app, including a production build, against a dedicated local database.
// Explicit overrides prevent .env.local from selecting hosted data or firing a real routine.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const database =
  process.env.AUDIT_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/overload_audit";
const target = new URL(database);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname)
) {
  throw new Error(
    "Audit commands require a loopback database named overload_audit (optional _suffix).",
  );
}
const port = process.env.AUDIT_PORT ?? "3100";
const env = {
  ...process.env,
  DATABASE_URL: database,
  DIRECT_DATABASE_URL: database,
  SEED_DATABASE_URL: database,
  AUTH_STUB_DATABASE_URL: database,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "dev-anon-key",
  NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
  SUPABASE_JWKS: "",
  SUPABASE_SERVICE_ROLE_KEY: "dev-service-role-key",
  COACH_WORKFLOW_ENABLED: "true",
  COACH_SERVICE_TOKEN: "local-audit-coach-service-token",
  COACH_ROUTINE_FIRE_URL: "",
  COACH_ROUTINE_FIRE_TOKEN: "",
};
function run(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Command exited ${code}`)),
    );
  });
}
const tsx = "node_modules/tsx/dist/cli.mjs";
const next = "node_modules/next/dist/bin/next";
switch (process.argv[2]) {
  case "setup": {
    const adminUrl = new URL(database);
    adminUrl.pathname = "/postgres";
    const admin = postgres(adminUrl.toString(), { max: 1 });
    try {
      const name = target.pathname.slice(1);
      if (!(await admin`select 1 from pg_database where datname = ${name}`).length)
        await admin.unsafe(`create database "${name}"`);
    } finally {
      await admin.end();
    }
    const sql = postgres(database, { max: 1 });
    try {
      await sql.unsafe(await readFile("scripts/dev/auth-stub.sql", "utf8"));
    } finally {
      await sql.end();
    }
    await run(tsx, ["src/db/migrate.ts"]);
    await run(tsx, ["src/db/seed/run.ts"]);
    await run(tsx, ["src/db/backfill-multisport.ts"]);
    await run(tsx, ["scripts/dev/seed-people.ts"]);
    await run(tsx, ["src/db/backfill-multisport.ts"]);
    await run(tsx, ["scripts/dev/seed-audit.ts"]);
    await run(tsx, ["src/db/backfill-multisport.ts"]);
    await run(tsx, ["scripts/dev/seed-audit.ts"]);
    break;
  }
  case "seed":
    await run(tsx, ["scripts/dev/seed-people.ts"]);
    await run(tsx, ["src/db/backfill-multisport.ts"]);
    await run(tsx, ["scripts/dev/seed-audit.ts"]);
    break;
  case "auth":
    await run("scripts/dev/auth-stub.mjs");
    break;
  case "build":
    await run(next, ["build"]);
    break;
  case "start":
    await run(next, ["start", "--port", port]);
    break;
  case "dev":
    await run(next, ["dev", "--port", port]);
    break;
  case "verify-db":
    await run(tsx, ["src/db/multisport-audit.ts"]);
    await run(tsx, ["src/db/programme-schedule-audit.ts"]);
    break;
  default:
    throw new Error("Use setup, seed, auth, build, start, dev, or verify-db.");
}
