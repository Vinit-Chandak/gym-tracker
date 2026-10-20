import { expect, it } from "vitest";

import {
  clockEntry,
  distanceParts,
  durationFromParts,
  formatDuration,
  joinDistance,
  parseDuration,
} from "./activity-form-fields";

it("writes digits typed on the number pad as the clock does, the colons placing themselves", () => {
  // 25:30 typed a digit at a time, each step as the field shows it.
  expect(["2", "25", "253", "2530"].map(clockEntry)).toEqual(["0:02", "0:25", "2:53", "25:30"]);
  expect(clockEntry("10530")).toBe("1:05:30");
  expect(clockEntry("102530")).toBe("10:25:30");
  // Each key arrives after the figure as it stands, which is re-read from its digits.
  expect(clockEntry("0:025")).toBe("0:25");
  expect(clockEntry("25:3")).toBe("2:53");
  expect(clockEntry("0:0")).toBe("");
  // A colon typed anyway changes nothing, and a seventh digit is not taken.
  expect(clockEntry("1:05:30")).toBe("1:05:30");
  expect(clockEntry("10:25:301")).toBe("10:25:30");
  expect(parseDuration(clockEntry("4500"))).toBe(2700);
});

it("keeps a distance's two parts, the point drawn between them", () => {
  expect(distanceParts("5.2")).toEqual({ whole: "5", fraction: "2" });
  expect(distanceParts("24,85")).toEqual({ whole: "24", fraction: "85" });
  expect(distanceParts("10")).toEqual({ whole: "10", fraction: "" });
  expect(distanceParts("")).toEqual({ whole: "", fraction: "" });
  expect(joinDistance("5", "2")).toBe("5.2");
  expect(joinDistance("5", "05")).toBe("5.05");
  expect(joinDistance("10", "")).toBe("10");
  expect(joinDistance("", "5")).toBe("0.5");
  expect(joinDistance("", "")).toBe("");
});

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
  // A tenth the record holds is read to the second, as its page reads it; the field keeps it.
  expect(durationFromParts("", "40", "12.5")).toBe("40:13");
  expect(durationFromParts("0", "32", "16.4")).toBe("32:16");
});
