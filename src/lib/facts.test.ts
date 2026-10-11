import { expect, it } from "vitest";

import { FACT_SEPARATOR, joinFacts } from "./facts";

it("holds each dot to the fact after it, so a wrapped line never ends on a dot", () => {
  expect(joinFacts(["6 foods", "1 meal"])).toBe("6 foods · 1 meal");
  // The one place the line may break between two facts is before the dot.
  const line = joinFacts(["18:07", "PureGym Shoreditch", "Sleep 7.25 h"]);
  expect(line.split(FACT_SEPARATOR)).toEqual(["18:07", "PureGym Shoreditch", "Sleep 7.25 h"]);
  expect(line).not.toMatch(/· /);
});

it("leaves out facts that say nothing", () => {
  expect(joinFacts([null, "2 sets", undefined, "", false, "40 min"])).toBe("2 sets · 40 min");
  expect(joinFacts([null, false])).toBe("");
});
