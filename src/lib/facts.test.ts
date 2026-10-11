import { expect, it } from "vitest";

import { FACT_SEPARATOR, holdFigures, holdHyphens, joinFacts } from "./facts";

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
  // Words that are not a unit, and text with no figures, are left as they were.
  expect(holdFigures("Effort 2 of 5")).toBe("Effort 2 of 5");
  expect(holdFigures("Push + pull")).toBe("Push + pull");
});

it("holds a name together at its hyphens, and breaks it only between its words", () => {
  expect(holdHyphens("Archer push-up")).toBe("Archer push-\u2060up");
  expect(holdHyphens("Off-season Hypertrophy")).toBe("Off-\u2060season Hypertrophy");
  // A hyphen that is not inside a word is left alone.
  expect(holdHyphens("Week 2 - deload")).toBe("Week 2 - deload");
});

it("leaves out facts that say nothing", () => {
  expect(joinFacts([null, "2 sets", undefined, "", false, "40 min"])).toBe("2 sets · 40 min");
  expect(joinFacts([null, false])).toBe("");
});
