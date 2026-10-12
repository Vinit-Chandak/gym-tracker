import { describe, expect, it } from "vitest";

import { formatSharedLoad, formatSharedMetric } from "./format";

/** What a friend's page, a board and a head to head say a shared number is. */
describe("a shared load and best", () => {
  it("keeps a lifted load's hundredths in kilograms, and reads an estimate to the tenth", () => {
    // A friend's 38.75 kg skull crusher read "38.8 kg × 12".
    expect(formatSharedLoad(38.75, "kg", true)).toBe("38.75 kg");
    expect(formatSharedMetric("top_weight", 38.75, "kg", "m")).toBe("38.75 kg");
    expect(formatSharedMetric("top_weight", 60, "kg", "m")).toBe("60 kg");
    expect(formatSharedMetric("e1rm", 81.67, "kg", "m")).toBe("81.7 kg");
    // In pounds a load is a conversion, read to the tenth: 85 lb is kept as 38.56 kg.
    expect(formatSharedMetric("top_weight", 38.56, "lb", "m")).toBe("85 lb");
    expect(formatSharedLoad(38.75, "lb", true)).toBe("85.4 lb");
  });

  it("reads a set's volume whole, as every volume reads", () => {
    // 35 lb × 14 is 490 lb; kept as 222.32 kg, it came back "490.1 lb".
    expect(formatSharedMetric("best_set_volume", 222.32, "lb", "m")).toBe("490 lb");
    expect(formatSharedMetric("best_set_volume", 1012.5, "kg", "m")).toBe("1,013 kg");
  });

  it("reads a carry in the reader's length: metres as kept, yards whole (ADR 0056)", () => {
    expect(formatSharedMetric("longest_carry", 40, "kg", "m")).toBe("40\u00a0m");
    expect(formatSharedMetric("longest_carry", 1200, "kg", "m")).toBe("1,200\u00a0m");
    // 50 yd was kept as 45.7 m, and a friend in yards reads it back as 50 yd.
    expect(formatSharedMetric("longest_carry", 45.7, "lb", "yd")).toBe("50\u00a0yd");
    expect(formatSharedMetric("longest_carry", 40, "kg", "yd")).toBe("44\u00a0yd");
  });

  it("says a hold in seconds under a minute and as a clock from one", () => {
    expect(formatSharedMetric("longest_hold", 51, "kg", "m")).toBe("51 s");
    expect(formatSharedMetric("longest_hold", 102, "kg", "m")).toBe("1:42");
  });
});
