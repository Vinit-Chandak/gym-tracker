import { describe, expect, it } from "vitest";

import { previewMachinesStep } from "@/app/(onboarding)/welcome/equipment/preview-step";

import { buildMachinesStep, type StepType } from "./machines-step";

describe("the machines step", () => {
  it("keeps a beginner to the preset's handful however large the catalogue grows", () => {
    const step = previewMachinesStep("gym", "new");
    const big: StepType[] = Array.from({ length: 500 }, (_, n) => ({
      id: `extra-${n}`,
      slug: `extra_${n}`,
      name: `Machine ${n}`,
      category: "machine",
      purpose: null,
      identification: null,
      aliases: [],
    }));
    const grown = buildMachinesStep({
      gym: step.gym,
      experience: "new",
      types: [
        ...big,
        ...step.basics.map((basic) => ({
          id: basic.typeIds[0]!,
          slug: basic.slug,
          name: basic.name,
          category: "free_weight" as const,
          purpose: null,
          identification: null,
          aliases: [],
        })),
      ],
      combinations: [],
      presets: [{ gymKind: "gym", experience: "new", items: [{ type: "extra_7" }] }],
      basics: new Set(step.basics.map((b) => b.typeIds[0]!)),
      machines: [],
      absentTypeIds: [],
    });
    expect(grown.suggestions.map((item) => item.name)).toEqual(["Machine 7"]);
    expect(step.suggestions.length).toBeGreaterThanOrEqual(8);
    expect(step.suggestions.length).toBeLessThanOrEqual(12);
    expect(grown.catalogue).toHaveLength(500);
  });

  it("suggests to beginners and outdoors only, and never offers the floor", () => {
    expect(previewMachinesStep("gym", "experienced").suggestions).toEqual([]);
    expect(previewMachinesStep("gym", null).suggestions).toEqual([]);
    expect(previewMachinesStep("home", "experienced").suggestions).toEqual([]);
    expect(previewMachinesStep("outdoor", "experienced").suggestions.map((i) => i.slug)).toEqual([
      "pull_up_bar",
      "dip_station",
      "flat_bench",
      "plyo_box",
    ]);
    for (const step of [previewMachinesStep("gym", "new"), previewMachinesStep("home", "new")])
      expect([...step.catalogue, ...step.suggestions].some((i) => i.slug === "bodyweight")).toBe(
        false,
      );
  });

  it("takes the basics out of a gym's list, and assumes nothing at home", () => {
    const gym = previewMachinesStep("gym", "experienced");
    expect(gym.basics).toHaveLength(18);
    expect(gym.catalogue.some((item) => item.slug === "pec_deck")).toBe(false);
    const home = previewMachinesStep("home", "experienced");
    expect(home.basics).toEqual([]);
    expect(home.catalogue.some((item) => item.slug === "dumbbells")).toBe(true);
  });

  it("offers each combination in the full list, and asks a family's variant", () => {
    const step = previewMachinesStep("gym", "new");
    expect(
      previewMachinesStep("gym", "experienced").catalogue.filter((i) => i.kind === "combination"),
    ).toHaveLength(3);
    const chestPress = step.suggestions.find((item) => item.key === "family:chest_press");
    expect(chestPress?.variants?.map((variant) => variant.slug)).toEqual([
      "chest_press_machine",
      "iso_lateral_press",
      "incline_press_machine",
    ]);
  });

  it("knows what the place already has, has archived, and has said is missing", () => {
    const step = previewMachinesStep("gym", "experienced", {
      active: ["smith_machine"],
      archived: ["hack_squat", "smith_machine"],
      absent: ["pec_deck"],
    });
    expect(step.activeTypeIds).toEqual(["smith_machine"]);
    // A type on an active machine is here, whatever else is archived.
    expect(step.archivedTypeIds).toEqual(["hack_squat"]);
    expect(step.absentTypeIds).toEqual(["pec_deck"]);
  });
});
