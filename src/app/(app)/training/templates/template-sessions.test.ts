import { expect, it } from "vitest";

import { hasTemplateSports, templateSessions } from "./template-sessions";

it("names what a template is written for in the athlete's own sports", () => {
  // Meera runs and lifts: a template is a run to her, not "a run, ride or swim".
  expect(templateSessions(["strength", "running"])).toBe("a run");
  expect(templateSessions(["running", "swimming"])).toBe("a run or swim");
  expect(templateSessions(["swimming", "cycling", "running"])).toBe("a run, ride or swim");
  // With none on, what a template can be.
  expect(templateSessions(["strength"])).toBe("a run, ride or swim");
});

it("leads to templates only an athlete with a run, ride or swim on", () => {
  // Kenji, Jordan and Aarav lift and nothing else.
  expect(hasTemplateSports(["strength"])).toBe(false);
  expect(hasTemplateSports(["strength", "cycling"])).toBe(true);
});
