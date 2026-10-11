import { describe, expect, it } from "vitest";

import { exerciseOnMachine, nameSaysEquipment, rangeLabel, restLabel } from "./labels";

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
    expect(restLabel(210, 210)).toBe("3.5 min");
    expect(restLabel(150, 210)).toBe("2.5–3.5 min");
    expect(restLabel(90, 90)).toBe("90 s");
    expect(restLabel(60, 90)).toBe("60–90 s");
    // A coach's rest off the half-minute keeps its seconds rather than rounding to "3.3 min".
    expect(restLabel(200, 200)).toBe("3 min 20 s");
    expect(restLabel(200, 240)).toBe("200–240 s");
    expect(restLabel(null, null)).toBe("—");
  });

  it("names the machine with an exercise only where the exercise's name does not already", () => {
    // Programme fit's fallbacks once read "Do Shoulder press machine on Shoulder press machine".
    expect(exerciseOnMachine("Shoulder press machine", "Shoulder press machine")).toBe(
      "Shoulder press machine",
    );
    expect(exerciseOnMachine("Smith machine bench press", "Smith machine")).toBe(
      "Smith machine bench press",
    );
    expect(exerciseOnMachine("Chest-supported row (machine)", "Chest-supported row machine")).toBe(
      "Chest-supported row (machine)",
    );
    expect(exerciseOnMachine("Lat pulldown", "Cable station")).toBe(
      "Lat pulldown on Cable station",
    );
    expect(exerciseOnMachine("Lat pulldown", null)).toBe("Lat pulldown");
    expect(nameSaysEquipment("Dumbbell curl", "Dumbbells")).toBe(true);
    expect(nameSaysEquipment("Hammer curl", "Dumbbells")).toBe(false);
  });
});
