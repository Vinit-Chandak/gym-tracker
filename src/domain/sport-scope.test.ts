import { expect, it } from "vitest";
import { warningsForSport, summaryForSport } from "./sport-scope";
import { reviewPlan } from "./coach-review";
import { planRunSchema } from "./session-plan";

it("routes the stored 19 to 25 minute warning exclusively to running", () => {
  const warnings = reviewPlan({
    exercises: [],
    plannedSets: 0,
    run: { planned: planRunSchema.parse({ durationMinutes: 25 }), lastDurationMinutes: 19 },
  });
  expect(warningsForSport(warnings, "run")).toEqual([
    { code: "run_jump", message: "The run goes from 19 to 25 minutes, a jump of 32%." },
  ]);
  expect(warningsForSport(warnings, "workout")).toEqual([]);
});

it("uses the sport's summary and never guesses at legacy combined prose", () => {
  const plan = {
    summary: "Arms and a 25-minute run.",
    sportSummaries: { workout: "Keep the arm targets.", run: "Keep an easy pace." },
  };
  expect(summaryForSport(plan, "workout")).toBe("Keep the arm targets.");
  expect(summaryForSport(plan, "run")).toBe("Keep an easy pace.");
  expect(summaryForSport({}, "workout")).not.toContain("run");
  expect(summaryForSport({}, "run")).not.toContain("arms");
});
