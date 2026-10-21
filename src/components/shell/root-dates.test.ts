import { expect, it } from "vitest";

import { dayAndMonth, weekDates, weekdayName } from "./root-dates";

/** As read: no-break spaces as spaces. */
const read = (text: string) => text.replace(/\u00a0/g, " ");

it("names a day by its weekday, and its date with the month whole", () => {
  expect(weekdayName("2026-10-21")).toBe("Wednesday");
  expect(read(dayAndMonth("2026-10-21", "2026"))).toBe("21 October");
  // A day in another year says its year, so an old day never reads as this year's.
  expect(read(dayAndMonth("2024-09-25", "2026"))).toBe("25 September 2024");
  // The date is held whole where a line wraps.
  expect(dayAndMonth("2026-10-21", "2026")).toBe("21\u00a0October");
});

it("says a week's dates once, the month and year only where they change", () => {
  expect(read(weekDates("2026-10-19", "2026-10-25", "2026"))).toBe("19 to 25 October");
  expect(read(weekDates("2026-09-28", "2026-10-04", "2026"))).toBe("28 September to 4 October");
  expect(read(weekDates("2025-12-29", "2026-01-04", "2026"))).toBe(
    "29 December 2025 to 4 January 2026",
  );
  expect(read(weekDates("2025-10-20", "2025-10-26", "2026"))).toBe("20 to 26 October 2025");
});
