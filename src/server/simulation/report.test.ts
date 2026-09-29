import { expect, it } from "vitest";

import type { JobRecord } from "./coach-simulator";
import { contextFileName, summarize } from "./report";

it("exports every sample kind to a distinct Windows-compatible filename", () => {
  const keys = [
    "create_program",
    "prepare_session",
    "prepare_session:endurance",
    "review_program",
  ].flatMap((kind) => [kind, `${kind}:largest`]);
  const names = keys.map(contextFileName);
  expect(new Set(names).size).toBe(keys.length);
  expect(names).toContain("context-prepare_session-endurance-largest.json");
  for (const name of names) expect(name).not.toMatch(/[<>:"/\\|?*\x00-\x1f]/);
});

const unclaimable = (claimState?: JobRecord["claimState"]): JobRecord => ({
  jobId: "queued-before-review",
  persona: "reviews-fail",
  day: 5,
  date: "2026-10-10",
  kind: "prepare_session",
  trigger: "daily",
  outcome: "unclaimable",
  submissions: 0,
  refusals: [],
  contextBytes: null,
  contextMs: null,
  claimState,
});

it("permits only confirmed review-replaced queue snapshots and reports their identities", () => {
  for (const error of [
    "A newer daily preparation replaced this attempt.",
    "A review re-planned this session.",
  ]) {
    const report = summarize(
      [unclaimable({ httpStatus: 200, status: "superseded", error, nextAttemptAt: null })],
      [],
    );
    expect(report.unanswerable).toEqual([]);
    expect(report.markdown).toContain(`queued-before-review: ${error}`);
  }
});

it("fails the verdict for unexplained claim failures, including a missing stored job", () => {
  for (const claimState of [
    undefined,
    { httpStatus: 200, status: null, error: null, nextAttemptAt: null },
    { httpStatus: 200, status: "queued", error: null, nextAttemptAt: null },
    { httpStatus: 200, status: "superseded", error: "Unknown cause", nextAttemptAt: null },
    {
      httpStatus: 500,
      status: "superseded",
      error: "A newer daily preparation replaced this attempt.",
      nextAttemptAt: null,
    },
  ])
    expect(summarize([unclaimable(claimState)], []).unanswerable).toHaveLength(1);
});
