/**
 * `npm run year:seed` — six athletes, a year of training each, written to a local database.
 *
 * Run through `scripts/dev/year/seed-year.mjs`, which creates the target database first.
 * YEAR_NOW (an ISO instant, default the real now) is where the year stops; YEAR_DATABASE_URL is
 * the loopback database it is copied into; YEAR_OUT is where the report goes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";

import { exportToPostgres } from "./export";
import { PERSONAS } from "./personas";
import { YearSimulation } from "./year-simulator";

const now = new Date(process.env.YEAR_NOW ?? new Date().toISOString());
const target = process.env.YEAR_DATABASE_URL;
const out = process.env.YEAR_OUT ?? "output/year";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db, { drafts: true });
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
});
afterAll(async () => {
  vi.useRealTimers();
  await t.close();
});

it("trains six athletes for a year", async () => {
  const sim = new YearSimulation(t, { set: (at) => vi.setSystemTime(at) }, now);
  for (const persona of PERSONAS) await sim.enrol(persona);
  await sim.run();
  vi.useRealTimers();

  mkdirSync(out, { recursive: true });
  const summary = sim.summary();
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(out, "findings.json"), JSON.stringify(sim.findings, null, 2));
  const counts = target ? await exportToPostgres(t, target) : {};
  writeFileSync(join(out, "tables.json"), JSON.stringify(counts, null, 2));
  console.info(
    `Year simulated to ${now.toISOString()}: ${sim.findings.length} findings; report in ${out}.\n` +
      summary
        .map((athlete) => `  ${athlete.username}: ${JSON.stringify(athlete.stats)}`)
        .join("\n"),
  );
  expect(summary).toHaveLength(PERSONAS.length);
});
