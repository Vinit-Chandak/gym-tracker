/**
 * `npm run sim:coach` — replays every persona day by day and writes what the coach was refused.
 *
 * SIM_DAYS (default 28) sets how long the coach runs; SIM_PERSONAS (comma-separated names)
 * narrows the cast; SIM_OUT (default `coach-sim-report` under the system temp directory) is
 * where the report, the job log and one sample context per job kind are written.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";

import { CoachSimulation } from "./coach-simulator";
import { PERSONAS } from "./personas";
import { contextFileName, summarize } from "./report";

const TOKEN = "simulated-coach-service-token";
const days = Number(process.env.SIM_DAYS ?? 28);
const only = process.env.SIM_PERSONAS?.split(",").map((name) => name.trim());
const out = process.env.SIM_OUT ?? join(tmpdir(), "coach-sim-report");

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  vi.stubEnv("COACH_SERVICE_TOKEN", TOKEN);
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
});
afterAll(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await t.close();
});

it("coaches every persona without a refusal it cannot answer", async () => {
  const sim = new CoachSimulation(t, { set: (at) => vi.setSystemTime(at) }, TOKEN);
  for (const persona of PERSONAS.filter((p) => !only || only.includes(p.name)))
    await sim.enrol(persona);
  await sim.run(days);

  mkdirSync(out, { recursive: true });
  const report = summarize(sim.jobs, sim.findings);
  writeFileSync(join(out, "report.md"), report.markdown);
  writeFileSync(join(out, "jobs.json"), JSON.stringify(sim.jobs, null, 2));
  writeFileSync(join(out, "findings.json"), JSON.stringify(sim.findings, null, 2));
  writeFileSync(join(out, "dispatches.json"), JSON.stringify(sim.dispatches, null, 2));
  for (const [kind, sample] of sim.samples)
    writeFileSync(join(out, contextFileName(kind)), JSON.stringify(sample, null, 2));
  console.info(`Coach simulation report: ${join(out, "report.md")}\n${report.headline}`);
  // The simulation's verdict: every job either accepted, or refused only with an answerable issue.
  expect(report.unanswerable).toEqual([]);
});
