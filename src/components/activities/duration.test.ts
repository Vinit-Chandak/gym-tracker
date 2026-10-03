import { expect, it } from "vitest";

import { durationFromParts, formatDuration, parseDuration } from "./activity-form-fields";

it("reads a duration as the clock writes it, and bare minutes", () => {
  expect(parseDuration("26:30")).toBe(1590);
  expect(parseDuration("1:10:00")).toBe(4200);
  expect(parseDuration("45")).toBe(2700);
  expect(parseDuration(" 0:45 ")).toBe(45);
});

it("keeps a tenth of a second, as a swim always could", () => {
  expect(parseDuration("40:12.5")).toBe(2412.5);
  expect(parseDuration("40:12,5")).toBe(2412.5);
  expect(formatDuration(2412.5)).toBe("40:12.5");
  expect(formatDuration(62.5)).toBe("1:02.5");
});

it("is not a duration when it is blank or not a time", () => {
  expect(parseDuration("")).toBeNull();
  expect(parseDuration("1:2:3:4")).toBeNull();
  expect(parseDuration("12.5")).toBeNull();
  expect(parseDuration("1.5:00")).toBeNull();
  expect(parseDuration("2h")).toBeNull();
});

it("writes hours only when there are some", () => {
  expect(formatDuration(0)).toBe("0:00");
  expect(formatDuration(1590)).toBe("26:30");
  expect(formatDuration(4200)).toBe("1:10:00");
});

it("shows the parts a form posted, and nothing for none", () => {
  expect(durationFromParts("", "", "")).toBe("");
  expect(durationFromParts("0", "42", "0")).toBe("42:00");
  expect(durationFromParts("1", "5", "")).toBe("1:05:00");
  expect(durationFromParts("", "40", "12.5")).toBe("40:12.5");
});
