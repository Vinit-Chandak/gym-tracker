import { describe, expect, it } from "vitest";

import {
  formatDateTime,
  formatIsoDate,
  formatIsoDay,
  formatIsoWeekdayDay,
  formatTime,
} from "./format";

/**
 * These dates are rendered on the server and hydrated in the browser, and the two run different
 * builds of ICU. Where the weekday leads, some versions put a comma after it and some do not, so
 * anything that takes the formatter's own string renders differently in the two places and React
 * throws out the server's HTML on arrival. The separators have to be ours.
 */
describe("dates that have to read the same on the server and in the page", () => {
  it("writes a weekday date and time without a comma of the formatter's choosing", () => {
    const at = formatDateTime("2026-09-12T10:47:00Z", "Europe/London");
    expect(at).toBe("Sat 12 Sept, 11:47");
    expect(at.split(",")).toHaveLength(2);
  });

  it("writes weekday calendar dates the same way", () => {
    expect(formatIsoDate("2026-09-08")).toBe("Tue 8 Sept 2026");
    expect(formatIsoWeekdayDay("2026-09-11")).toBe("Fri 11 Sept");
    expect(formatIsoDay("2026-09-08")).toBe("8 Sept 2026");
  });

  it("keeps a plain time and an unreadable date as they were", () => {
    expect(formatTime("2026-09-12T10:47:00Z", "Europe/London")).toBe("11:47");
    expect(formatIsoDate("not-a-date")).toBe("not-a-date");
  });
});
