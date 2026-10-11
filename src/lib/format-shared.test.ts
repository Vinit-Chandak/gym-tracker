import { describe, expect, it } from "vitest";

import { formatSharedLoad, formatSharedMetric } from "./format";

/** What a friend's page, a board and a head to head say a shared number is. */
describe("a shared load and best", () => {
  it("keeps a lifted load's hundredths in kilograms, and reads an estimate to the tenth", () => {
    // A friend's 38.75 kg skull crusher read "38.8 kg × 12".
    expect(formatSharedLoad(38.75, "kg", true)).toBe("38.75 kg");
    expect(formatSharedMetric("top_weight", 38.75, "kg")).toBe("38.75 kg");
    expect(formatSharedMetric("top_weight", 60, "kg")).toBe("60 kg");
    expect(formatSharedMetric("e1rm", 81.67, "kg")).toBe("81.7 kg");
    // In pounds a load is a conversion, read to the tenth: 85 lb is kept as 38.56 kg.
    expect(formatSharedMetric("top_weight", 38.56, "lb")).toBe("85 lb");
    expect(formatSharedLoad(38.75, "lb", true)).toBe("85.4 lb");
  });

  it("says a hold in seconds under a minute and as a clock from one", () => {
    expect(formatSharedMetric("longest_hold", 51, "kg")).toBe("51 s");
    expect(formatSharedMetric("longest_hold", 102, "kg")).toBe("1:42");
  });
});
