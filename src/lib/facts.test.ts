import { describe, expect, it } from "vitest";

import { FACT_SEPARATOR, holdFigures, holdHyphens, joinFacts, readsAs } from "./facts";

it("holds each dot to the fact after it, so a wrapped line never ends on a dot", () => {
  expect(joinFacts(["6 foods", "1 meal"])).toBe("6 foods · 1 meal");
  // The one place the line may break between two facts is before the dot.
  const line = joinFacts(["18:07", "PureGym Shoreditch", "Sleep 7.25 h"]);
  expect(line.split(FACT_SEPARATOR)).toEqual(["18:07", "PureGym Shoreditch", "Sleep 7.25 h"]);
  expect(line).not.toMatch(/· /);
});

it("holds a written range at its dash and a figure to its unit", () => {
  expect(holdFigures("60–75 min")).toBe("60\u2060–\u206075\u00a0min");
  expect(holdFigures("2.6–3.1 km")).toBe("2.6\u2060–\u20603.1\u00a0km");
  expect(holdFigures("Squat + hinge, then 20 min easy")).toBe(
    "Squat + hinge, then 20\u00a0min easy",
  );
  // A prescription, as a row shows it: "@ 1–" never ends a line, nor "@" or "1–2" its RIR.
  expect(holdFigures("3 × 10–12 per side @ 1–2 RIR")).toBe(
    "3 × 10\u2060–\u206012 per side @\u00a01\u2060–\u20602\u00a0RIR",
  );
  expect(holdFigures("32 kg · 3 × 30 m · RPE 7")).toBe("32\u00a0kg · 3 × 30\u00a0m · RPE\u00a07");
  // Words that are not a unit, and text with no figures, are left as they were.
  expect(holdFigures("Effort 2 of 5")).toBe("Effort 2 of 5");
  expect(holdFigures("Push + pull")).toBe("Push + pull");
});

it("holds a name together at its hyphens, and breaks it only between its words", () => {
  expect(holdHyphens("Archer push-up")).toBe("Archer push-\u2060up");
  expect(holdHyphens("Off-season Hypertrophy")).toBe("Off-\u2060season Hypertrophy");
  expect(holdHyphens("T-bar row")).toBe("T-\u2060bar row");
  // In brackets too: Programme fit read "Neutral-grip lat pulldown (D-" over "handles)".
  expect(holdHyphens("Neutral-grip lat pulldown (D-handles)")).toBe(
    "Neutral-\u2060grip lat pulldown (D-\u2060handles)",
  );
  // A hyphen that is not inside a word is left alone.
  expect(holdHyphens("Week 2 - deload")).toBe("Week 2 - deload");
});

it("lets a long compound break at a hyphen, so it never runs wider than a narrow line", () => {
  // Held whole it would be nineteen letters with no break; it keeps its short tail ("foot").
  expect(holdHyphens("Front-foot-elevated split squat")).toBe(
    "Front-\u2060foot-elevated split squat",
  );
  expect(holdHyphens("Half-kneeling cable chop")).toBe("Half-kneeling cable chop");
});

it("leaves out facts that say nothing", () => {
  expect(joinFacts([null, "2 sets", undefined, "", false, "40 min"])).toBe("2 sets · 40 min");
  expect(joinFacts([null, false])).toBe("");
});

describe("readsAs", () => {
  it("reads held figures as the words they are, case aside", () => {
    expect(readsAs("6 × 800 m", holdFigures("6 × 800\u00a0m"))).toBe(true);
    expect(readsAs("Tempo 20–25 min", holdFigures("tempo 20–25 min"))).toBe(true);
    expect(readsAs("Intervals: 6 × 800 m", "6 × 800 m")).toBe(false);
  });
});
