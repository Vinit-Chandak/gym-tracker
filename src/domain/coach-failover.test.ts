import { expect, it } from "vitest";
import { backupStanding, COACH_FAILOVER_MS } from "./coach-failover";

const start = new Date("2026-10-14T23:30:00Z");
const job = {
  status: "queued",
  workerProvider: "claude" as const,
  backupTakenAt: null,
  primaryProgressAt: null,
  primaryFailedAt: null,
  dispatchStartedAt: null,
  nextAttemptAt: start,
  createdAt: start,
  leaseUntil: null,
};
const later = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

it("does not call silence a timeout before ten minutes", () => {
  expect(backupStanding(job, start, null, later(9.999)).eligible).toBe(false);
  expect(backupStanding(job, start, null, later(10)).eligible).toBe(true);
});
it("uses the scheduled boundary when the backup itself created the missed batch's jobs", () => {
  expect(backupStanding({ ...job, createdAt: later(11) }, start, null, later(11)).eligible).toBe(
    true,
  );
});
it("protects an unclaimed athlete while the primary batch is still working on another", () => {
  expect(backupStanding(job, start, later(9), later(11)).eligible).toBe(false);
});
it("measures an active claim's silence from its last call, independently of other athletes", () => {
  const active = { ...job, status: "claimed", primaryProgressAt: later(3), leaseUntil: later(23) };
  expect(backupStanding(active, start, later(12), later(12)).eligible).toBe(false);
  expect(backupStanding(active, start, later(12), later(13)).eligible).toBe(true);
});
it("waits ten minutes after a confirmed failure without letting other athletes mask it", () => {
  const failed = { ...job, status: "failed", primaryFailedAt: later(2) };
  expect(backupStanding(failed, start, later(11), later(11)).eligible).toBe(false);
  expect(backupStanding(failed, start, later(11), later(12)).eligible).toBe(true);
});
it.each(["succeeded", "needs_input", "superseded"])("never replays %s work", (status) => {
  expect(backupStanding({ ...job, status }, start, null, later(60)).eligible).toBe(false);
});
it("keeps the backup retry budget terminal rather than reviving it on every poll", () => {
  expect(
    backupStanding({ ...job, status: "failed", backupTakenAt: later(10) }, start, null, later(60))
      .eligible,
  ).toBe(false);
});
it("respects a backup retry's backoff and can recover an expired backup claim", () => {
  const backup = {
    ...job,
    workerProvider: "chatgpt" as const,
    backupTakenAt: later(10),
    nextAttemptAt: later(15),
  };
  expect(backupStanding(backup, start, null, later(14)).eligible).toBe(false);
  expect(backupStanding(backup, start, null, later(15)).eligible).toBe(true);
  expect(
    backupStanding({ ...backup, status: "claimed", leaseUntil: later(30) }, start, null, later(29))
      .eligible,
  ).toBe(false);
  expect(
    backupStanding({ ...backup, status: "claimed", leaseUntil: later(30) }, start, null, later(30))
      .eligible,
  ).toBe(true);
  expect(COACH_FAILOVER_MS).toBe(600000);
});
