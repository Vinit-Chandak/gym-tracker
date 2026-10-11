import { expect, it } from "vitest";
import {
  sportsOnOffer,
  warningsForSport,
  summaryForSport,
  writtenSummaryForSport,
} from "./sport-scope";
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

it("tells a written summary from the stock fallback", () => {
  expect(
    writtenSummaryForSport({ sportSummaries: { workout: "Keep the arm targets." } }, "workout"),
  ).toBe("Keep the arm targets.");
  // Nothing written is nothing to show: the screen decides what, if anything, stands in.
  expect(writtenSummaryForSport({}, "workout")).toBeNull();
  expect(writtenSummaryForSport({ sportSummaries: { run: "Easy." } }, "workout")).toBeNull();
});

it("offers the sports done, in the switch's order, and the one a link asked for", () => {
  // Rides and lifting, in whatever order they were found: never a swimming tab nobody swims.
  expect(sportsOnOffer(["cycle", "workout"])).toEqual(["workout", "cycle"]);
  expect(sportsOnOffer(new Set(["run", "workout", "run"] as const))).toEqual(["workout", "run"]);
  // A link to swimming still lands on swimming, beside what was done.
  expect(sportsOnOffer(["workout"], "swim")).toEqual(["workout", "swim"]);
  expect(sportsOnOffer(["workout"], "workout")).toEqual(["workout"]);
  // Somebody who has done nothing yet opens on lifting, as the screens always did.
  expect(sportsOnOffer([])).toEqual(["workout"]);
  expect(sportsOnOffer([], "run")).toEqual(["run"]);
});
