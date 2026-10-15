import { describe, expect, it } from "vitest";

import {
  backToSession,
  equipmentLoadLabel,
  exerciseOnMachine,
  nameSaysEquipment,
  programmeLabel,
  rangeLabel,
  restLabel,
  SESSION_CHROME_NAME_LIMIT,
  sessionChromeName,
  sessionName,
} from "./labels";

describe("labels", () => {
  it("formats rep and time ranges", () => {
    expect(rangeLabel(6, 10)).toBe("6–10");
    expect(rangeLabel(5, 5)).toBe("5");
    expect(rangeLabel(20, 45, " s")).toBe("20–45 s");
    expect(rangeLabel(null, null)).toBe("—");
  });

  it("names a workout by its programme day, else by the routine it was started from", () => {
    expect(sessionName("Upper A", null)).toBe("Upper A");
    expect(sessionName(null, "Push day at home")).toBe("Push day at home");
    expect(sessionName(undefined, undefined)).toBe("Unplanned session");
    // A programme day keeps its own name, whatever else the workout carries.
    expect(sessionName("Upper A", "Push day at home")).toBe("Upper A");
  });

  it("says a workout's name whole in the session's chrome only while it is short", () => {
    expect(sessionChromeName("Upper A")).toBe("Upper A");
    expect(sessionChromeName("Unplanned session")).toBe("Unplanned session");
    expect(sessionChromeName("Push day at the hotel")).toBe("Workout");
    expect(sessionChromeName("Hotel gym push day: ".padEnd(120, "and more "))).toBe("Workout");
    expect(sessionChromeName("A".repeat(SESSION_CHROME_NAME_LIMIT))).toBe(
      "A".repeat(SESSION_CHROME_NAME_LIMIT),
    );
    expect(backToSession("Lower A")).toBe("Back to Lower A");
    expect(backToSession("Unplanned session")).toBe("Back to Unplanned session");
    expect(backToSession("Push day at the hotel")).toBe("Back to the workout");
  });

  it("says a finished programme is complete wherever it is named", () => {
    expect(programmeLabel({ name: "Push Pull Legs", complete: false })).toBe("Push Pull Legs");
    expect(programmeLabel({ name: "Push Pull Legs", complete: true })).toBe(
      "Push Pull Legs (complete)",
    );
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

  it("calls a bench an accessory, not bodyweight, and a pull-up bar bodyweight", () => {
    expect(equipmentLoadLabel("accessory", "bodyweight")).toBe("Accessory");
    expect(equipmentLoadLabel("accessory", "free_weight")).toBe("Free weight");
    expect(equipmentLoadLabel("bodyweight", "bodyweight")).toBe("Bodyweight");
    expect(equipmentLoadLabel("machine", "plate_loaded")).toBe("Plate-loaded");
  });
});
