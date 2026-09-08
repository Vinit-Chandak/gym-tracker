import { describe, expect, it } from "vitest";

import { rangeLabel, restLabel } from "./labels";

describe("labels", () => {
  it("formats rep and time ranges", () => {
    expect(rangeLabel(6, 10)).toBe("6–10");
    expect(rangeLabel(5, 5)).toBe("5");
    expect(rangeLabel(20, 45, " s")).toBe("20–45 s");
    expect(rangeLabel(null, null)).toBe("—");
  });

  it("formats rest targets", () => {
    expect(restLabel(180, 240)).toBe("3–4 min");
    expect(restLabel(120, 120)).toBe("2 min");
    expect(restLabel(90, 90)).toBe("90 s");
    expect(restLabel(60, 90)).toBe("60–90 s");
    expect(restLabel(null, null)).toBe("—");
  });
});
