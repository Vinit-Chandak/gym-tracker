// One reproducible local stack: six complete calendar months and the current partial month.
// The underlying runner rejects remote databases and disables external coach dispatch.
import { spawn } from "node:child_process";

const command = process.argv[2] ?? "setup";
const scripts = {
  all: "audit-suite",
  screens: "audit-browser",
  history: "audit-history",
  interactions: "audit-interactions",
  inventory: "audit-inventory",
  ...Object.fromEntries(
    [
      "account",
      "programme",
      "bookmarks",
      "legacy-routes",
      "ui-controls",
      "activity-time",
      "workout",
      "flows",
      "recovery",
      "food",
      "quick-food",
    ].map((name) => [name, `audit-${name}`]),
  ),
};
const script = scripts[command] ?? "audit";
const env = {
  ...process.env,
  AUDIT_DATABASE_URL:
    process.env.AUDIT_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_20261007",
  AUDIT_PORT: process.env.AUDIT_PORT ?? "3107",
  AUDIT_AUTH_PORT: process.env.AUDIT_AUTH_PORT ?? "54327",
  AUDIT_OUTPUT_DIR: process.env.AUDIT_OUTPUT_DIR ?? "output/audit-2026-10-07",
  AUDIT_HISTORY_MONTHS: "7",
  AUDIT_EXTENDED_PERSONAS: "true",
  AUDIT_REALISTIC_HISTORY: "true",
  AUDIT_SEED_THROUGH: process.env.AUDIT_SEED_THROUGH ?? "2026-10-07",
};
env.AUDIT_BASE_URL ??= `http://localhost:${env.AUDIT_PORT}`;
const child = spawn(
  process.execPath,
  [`scripts/dev/${script}.mjs`, ...(script === "audit" ? [command] : [])],
  { env, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
