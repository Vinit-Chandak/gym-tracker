import { describe, expect, it } from "vitest";

import {
  equipmentState,
  evaluateExercise,
  inventoryAt,
  resolveExerciseAtGym,
  type EquipmentInstanceRef,
  type ExerciseRef,
  type RequirementRef,
} from "./equipment-resolution";
import type { ExerciseModality } from "./types";

const exercise = (
  id: string,
  modality: ExerciseModality = "machine",
  requiresEquipment = true,
): ExerciseRef => ({ id, modality, requiresEquipment });

const smithCalfRaise = exercise("smith-machine-calf-raise", "smith_machine");
const legPressCalfPress = exercise("leg-press-calf-press");
const barbellBench = exercise("barbell-bench-press", "barbell");
const sidePlank = exercise("side-plank", "bodyweight", false);
const pecDeckFly = exercise("pec-deck-fly");
const smithHipThrust = exercise("smith-hip-thrust", "smith_machine");
const dip = exercise("dip", "bodyweight");
const assistedDip = exercise("assisted-dip");
const latPulldown = exercise("lat-pulldown");
const seatedRow = exercise("seated-cable-row", "cable");
const safetyBarSquat = exercise("safety-bar-squat", "barbell");
const pushUp = exercise("push-up", "bodyweight", false);
const nordic = exercise("nordic-hamstring-curl", "bodyweight");

/** One alternative per argument; the first type of each is its primary. */
function needs(exerciseId: string, ...alternatives: string[][]): RequirementRef[] {
  return alternatives.flatMap((types, index) =>
    types.map((equipmentTypeId, position) => ({
      exerciseId,
      alternative: index + 1,
      equipmentTypeId,
      isPrimary: position === 0,
    })),
  );
}

const requirements: RequirementRef[] = [
  ...needs("smith-machine-calf-raise", ["smith_machine"]),
  ...needs("leg-press-calf-press", ["leg_press_45"], ["leg_press_horizontal"]),
  ...needs("barbell-bench-press", ["barbell", "flat_bench", "power_rack"]),
  ...needs("pec-deck-fly", ["pec_deck"]),
  ...needs("smith-hip-thrust", ["smith_machine", "flat_bench"]),
  ...needs("dip", ["dip_station"], ["gymnastic_rings"]),
  ...needs("assisted-dip", ["dip_machine"]),
  ...needs("lat-pulldown", ["lat_pulldown"], ["cable_station"]),
  ...needs("seated-cable-row", ["seated_row_cable"], ["cable_station"]),
  ...needs("safety-bar-squat", ["safety_squat_bar", "power_rack"]),
  ...needs("push-up", ["bodyweight"]),
  ...needs("nordic-hamstring-curl", ["glute_ham_raise"], ["bodyweight"]),
];

const fallbacks = [
  {
    gymId: null,
    fallbackExercise: legPressCalfPress,
    fallbackEquipmentTypeId: "leg_press_45",
    fallbackEquipmentInstanceId: null,
    rank: 1,
  },
  {
    gymId: null,
    fallbackExercise: legPressCalfPress,
    fallbackEquipmentTypeId: "leg_press_horizontal",
    fallbackEquipmentInstanceId: null,
    rank: 2,
  },
];

const gymA = { id: "gym-a", kind: "gym" } as const;
const gymB = { id: "gym-b", kind: "gym" } as const;
const gymC = { id: "gym-c", kind: "gym" } as const; // nothing registered yet
const home = { id: "home", kind: "home" } as const;
const outdoor = { id: "outdoor", kind: "outdoor" } as const;

const machine = (
  id: string,
  gymId: string,
  equipmentTypeId: string,
  name: string,
  more: Partial<EquipmentInstanceRef> = {},
): EquipmentInstanceRef => ({ id, gymId, equipmentTypeId, name, isActive: true, ...more });

const equipment: EquipmentInstanceRef[] = [
  machine("a-smith", "gym-a", "smith_machine", "Smith machine"),
  machine("a-leg-press-45", "gym-a", "leg_press_45", "45° leg press"),
  machine("a-pec-deck-1", "gym-a", "pec_deck", "Pec deck (window)"),
  machine("a-pec-deck-2", "gym-a", "pec_deck", "Pec deck (back)"),
  machine("b-leg-press-h", "gym-b", "leg_press_horizontal", "Horizontal leg press"),
  machine("b-smith-broken", "gym-b", "smith_machine", "Smith (out of order)", { isActive: false }),
];

/** The gym basics, as the seed assumes them at a commercial gym. */
const BASICS = new Set([
  "barbell",
  "ez_bar",
  "dumbbells",
  "weight_plates",
  "flat_bench",
  "adjustable_bench",
  "decline_bench",
  "power_rack",
  "pull_up_bar",
  "dip_station",
  "back_extension_bench",
  "cable_station",
  "lat_pulldown",
  "seated_row_cable",
  "leg_press_45",
  "leg_extension",
  "leg_curl_seated",
  "pec_deck",
]);
const FREE = new Set(["bodyweight"]);

const base = {
  preferredEquipmentInstanceId: null,
  options: [],
  requirements,
  fallbacks,
  gymEquipment: equipment,
  freeEquipmentTypeIds: FREE,
};
const atGym = { ...base, assumedEquipmentTypeIds: BASICS };

describe("equipment resolution", () => {
  it("uses the Smith machine directly where one is registered", () => {
    const result = resolveExerciseAtGym({ ...atGym, exercise: smithCalfRaise, gym: gymA });
    expect(result).toMatchObject({
      status: "direct",
      basis: "confirmed",
      equipmentInstance: { id: "a-smith" },
    });
  });

  it("asks rather than swapping when the programme's fallback is all a gym is known to have", () => {
    // Gym B's Smith is out of order (archived), so nothing says whether one is there.
    const result = resolveExerciseAtGym({ ...atGym, exercise: smithCalfRaise, gym: gymB });
    expect(result).toMatchObject({ status: "unknown" });
    if (result.status === "unknown")
      expect(result.missingEquipmentTypeIds[0]).toBe("smith_machine");
  });

  it("falls back on the leg press once the Smith machine is known to be absent", () => {
    const result = resolveExerciseAtGym({
      ...atGym,
      exercise: smithCalfRaise,
      gym: gymB,
      absentEquipmentTypeIds: new Set(["smith_machine"]),
    });
    expect(result.status).toBe("fallback");
    if (result.status === "fallback") {
      expect(result.exercise.id).toBe("leg-press-calf-press");
      // The 45° leg press is a basic nobody marked absent; the horizontal one is registered.
      expect(result.fallback.rank).toBe(1);
      expect(result.basis).toBe("assumed");
    }
  });

  it("keeps a basic over a fallback the athlete set for this gym, which answers for the rest", () => {
    const gymSpecific = {
      gymId: "gym-c",
      fallbackExercise: sidePlank,
      fallbackEquipmentTypeId: null,
      fallbackEquipmentInstanceId: null,
      rank: 9,
    };
    // A basic is here until someone says otherwise, so a swap remembered once does not replace
    // a lift that can be done: the workout confirms a machine basic, and its Not here offers
    // the fallbacks.
    const basic = resolveExerciseAtGym({
      ...atGym,
      exercise: latPulldown,
      gym: gymC,
      fallbacks: [gymSpecific],
    });
    expect(basic).toMatchObject({
      status: "direct",
      basis: "assumed",
      exercise: { id: "lat-pulldown" },
    });
    const bench = resolveExerciseAtGym({
      ...atGym,
      exercise: barbellBench,
      gym: gymC,
      fallbacks: [gymSpecific],
    });
    expect(bench).toMatchObject({ status: "direct", exercise: { id: "barbell-bench-press" } });
    // Marked absent, the athlete's own answer comes first.
    const absent = resolveExerciseAtGym({
      ...atGym,
      exercise: latPulldown,
      gym: gymC,
      fallbacks: [gymSpecific],
      absentEquipmentTypeIds: new Set(["lat_pulldown", "cable_station"]),
    });
    expect(absent).toMatchObject({ status: "fallback", exercise: { id: "side-plank" } });
    // For a machine nobody has answered for, it is the answer, without asking.
    const unknown = resolveExerciseAtGym({
      ...atGym,
      exercise: smithCalfRaise,
      gym: gymC,
      fallbacks: [gymSpecific],
    });
    expect(unknown).toMatchObject({ status: "fallback", exercise: { id: "side-plank" } });
  });

  it("never resolves a slot's fallback as a fallback to itself", () => {
    // A workout row started on its slot's fallback is resolved against that slot's fallbacks.
    const own = {
      gymId: "gym-c",
      fallbackExercise: legPressCalfPress,
      fallbackEquipmentTypeId: null,
      fallbackEquipmentInstanceId: null,
      rank: 1,
    };
    // It is done as itself, so a machine basic is still asked about once.
    const row = resolveExerciseAtGym({
      ...atGym,
      exercise: legPressCalfPress,
      gym: gymC,
      fallbacks: [own, ...fallbacks],
    });
    expect(row).toMatchObject({
      status: "direct",
      basis: "assumed",
      primaryTypeId: "leg_press_45",
      equipmentInstance: null,
    });
    // Nothing answered for it: unknown, never "use itself".
    const unknown = resolveExerciseAtGym({
      ...atGym,
      exercise: smithCalfRaise,
      gym: gymC,
      fallbacks: [{ ...own, fallbackExercise: smithCalfRaise }],
    });
    expect(unknown).toMatchObject({
      status: "unknown",
      exercise: { id: "smith-machine-calf-raise" },
    });
  });

  it("honours a preferred machine at this gym over the alphabetical first match", () => {
    const auto = resolveExerciseAtGym({ ...atGym, exercise: pecDeckFly, gym: gymA });
    expect(auto).toMatchObject({ status: "direct", equipmentInstance: { id: "a-pec-deck-2" } });
    const preferred = resolveExerciseAtGym({
      ...atGym,
      exercise: pecDeckFly,
      gym: gymA,
      preferredEquipmentInstanceId: "a-pec-deck-1",
    });
    expect(preferred).toMatchObject({
      status: "direct",
      equipmentInstance: { id: "a-pec-deck-1" },
    });
  });

  it("uses a user's machine-level option before type matching", () => {
    const userOption = {
      exerciseId: "pec-deck-fly",
      equipmentTypeId: null,
      equipmentInstanceId: "a-pec-deck-1",
      preferenceRank: 0,
    };
    const result = resolveExerciseAtGym({
      ...atGym,
      exercise: pecDeckFly,
      gym: gymA,
      options: [userOption],
    });
    expect(result).toMatchObject({ status: "direct", equipmentInstance: { id: "a-pec-deck-1" } });
  });

  it("assumes the gym basics until they are marked absent", () => {
    const assumed = resolveExerciseAtGym({ ...atGym, exercise: barbellBench, gym: gymC });
    expect(assumed).toMatchObject({ status: "direct", basis: "assumed", equipmentInstance: null });
    expect(equipmentState(assumed)).toBe("assumed");
    // Marking the barbell absent now really rules out barbell work.
    const absent = resolveExerciseAtGym({
      ...atGym,
      exercise: barbellBench,
      gym: gymC,
      fallbacks: [],
      absentEquipmentTypeIds: new Set(["barbell"]),
    });
    expect(absent.status).toBe("unavailable");
    expect(equipmentState(absent)).toBe("absent");
  });

  it("does not assume a specialty bar because its exercise is a barbell exercise", () => {
    const result = resolveExerciseAtGym({
      ...atGym,
      exercise: safetyBarSquat,
      gym: gymC,
      fallbacks: [],
    });
    expect(result).toMatchObject({
      status: "unknown",
      missingEquipmentTypeIds: ["safety_squat_bar"],
    });
  });

  it("never resolves a Smith machine and bench from the bench alone", () => {
    const benchOnly = [machine("h-bench", "home", "flat_bench", "Bench")];
    const result = resolveExerciseAtGym({
      ...base,
      exercise: smithHipThrust,
      gym: home,
      fallbacks: [],
      gymEquipment: benchOnly,
    });
    expect(result).toMatchObject({ status: "unknown", missingEquipmentTypeIds: ["smith_machine"] });
    const both = resolveExerciseAtGym({
      ...base,
      exercise: smithHipThrust,
      gym: home,
      fallbacks: [],
      gymEquipment: [...benchOnly, machine("h-smith", "home", "smith_machine", "Smith")],
    });
    // The Smith machine, not the bench, is what the workout records.
    expect(both).toMatchObject({
      status: "direct",
      basis: "confirmed",
      equipmentInstance: { id: "h-smith" },
    });
  });

  it("no longer resolves a plain dip on the assisted dip machine", () => {
    const assistedOnly = [machine("h-assist", "home", "dip_machine", "Assisted dip")];
    expect(
      resolveExerciseAtGym({
        ...base,
        exercise: dip,
        gym: home,
        fallbacks: [],
        gymEquipment: assistedOnly,
      }).status,
    ).toBe("unknown");
    expect(
      resolveExerciseAtGym({
        ...base,
        exercise: assistedDip,
        gym: home,
        fallbacks: [],
        gymEquipment: assistedOnly,
      }),
    ).toMatchObject({ status: "direct", equipmentInstance: { id: "h-assist" } });
  });

  it("lets one combination machine stand for each of its types", () => {
    const combo = machine("c-combo", "gym-c", "lat_pulldown", "Lat pulldown and low row", {
      typeIds: ["lat_pulldown", "seated_row_cable"],
    });
    for (const planned of [latPulldown, seatedRow])
      expect(
        resolveExerciseAtGym({
          ...atGym,
          exercise: planned,
          gym: gymC,
          fallbacks: [],
          gymEquipment: [combo],
        }),
      ).toMatchObject({
        status: "direct",
        basis: "confirmed",
        equipmentInstance: { id: "c-combo" },
      });
  });

  it("reports what nobody has answered for at home and outdoors as unknown, not unavailable", () => {
    const atHome = resolveExerciseAtGym({
      ...base,
      exercise: barbellBench,
      gym: home,
      fallbacks: [],
    });
    expect(atHome).toMatchObject({
      status: "unknown",
      missingEquipmentTypeIds: ["barbell", "flat_bench", "power_rack"],
    });
    expect(resolveExerciseAtGym({ ...base, exercise: smithCalfRaise, gym: outdoor }).status).toBe(
      "unknown",
    );
  });

  it("treats exercises that need nothing as available everywhere", () => {
    for (const gym of [gymC, home, outdoor]) {
      expect(
        resolveExerciseAtGym({ ...base, exercise: sidePlank, gym, fallbacks: [] }),
      ).toMatchObject({ status: "direct", basis: "free" });
      expect(resolveExerciseAtGym({ ...base, exercise: pushUp, gym, fallbacks: [] })).toMatchObject(
        {
          status: "direct",
          basis: "free",
        },
      );
      // The floor is an alternative to the glute-ham developer.
      expect(resolveExerciseAtGym({ ...base, exercise: nordic, gym, fallbacks: [] })).toMatchObject(
        {
          status: "direct",
          basis: "free",
        },
      );
    }
  });

  it("lets presence win over a stale absence, and never resolves an archived machine", () => {
    const withAbsence = resolveExerciseAtGym({
      ...atGym,
      exercise: smithCalfRaise,
      gym: gymA,
      absentEquipmentTypeIds: new Set(["smith_machine"]),
    });
    expect(withAbsence).toMatchObject({ status: "direct", equipmentInstance: { id: "a-smith" } });
    const archivedOnly = resolveExerciseAtGym({
      ...atGym,
      exercise: smithCalfRaise,
      gym: gymB,
      fallbacks: [],
    });
    expect(archivedOnly.status).toBe("unknown");
  });

  it("turns unknown into unavailable once every way is marked absent", () => {
    const partly = resolveExerciseAtGym({
      ...base,
      exercise: smithCalfRaise,
      gym: gymC,
      absentEquipmentTypeIds: new Set(["smith_machine"]),
    });
    expect(partly).toMatchObject({
      status: "unknown",
      missingEquipmentTypeIds: ["leg_press_45", "leg_press_horizontal"],
    });
    const fully = resolveExerciseAtGym({
      ...base,
      exercise: smithCalfRaise,
      gym: gymC,
      absentEquipmentTypeIds: new Set(["smith_machine", "leg_press_45", "leg_press_horizontal"]),
    });
    expect(fully).toMatchObject({
      status: "unavailable",
      absentEquipmentTypeIds: ["smith_machine"],
    });
  });

  it("keeps confirmed, assumed, unknown and absent distinct", () => {
    const inventory = inventoryAt("gym-a", equipment, {
      assumed: BASICS,
      absent: new Set(["dip_station"]),
      free: FREE,
    });
    expect(evaluateExercise(pecDeckFly, inventory, requirements, [])).toMatchObject({
      state: "available",
      basis: "confirmed",
    });
    expect(evaluateExercise(latPulldown, inventory, requirements, [])).toMatchObject({
      state: "available",
      basis: "assumed",
      assumedTypeIds: ["lat_pulldown"],
    });
    expect(evaluateExercise(dip, inventory, requirements, [])).toMatchObject({
      state: "unknown",
      missing: ["gymnastic_rings"],
    });
    expect(evaluateExercise(assistedDip, inventory, requirements, [])).toMatchObject({
      state: "unknown",
    });
  });

  it("reads a flat type-level list as alternatives for an exercise with no groups", () => {
    const legacy = resolveExerciseAtGym({
      ...atGym,
      requirements: [],
      options: [
        {
          exerciseId: "pec-deck-fly",
          equipmentTypeId: "pec_deck",
          equipmentInstanceId: null,
          preferenceRank: 1,
        },
      ],
      exercise: pecDeckFly,
      gym: gymA,
    });
    expect(legacy).toMatchObject({ status: "direct", equipmentInstance: { id: "a-pec-deck-2" } });
  });
});
