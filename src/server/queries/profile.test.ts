import { describe, expect, it } from "vitest";

import { listSentence, missingProfileDetails } from "./profile";

const complete = {
  displayName: "Sam",
  bodyWeightKg: 74.5,
  heightCm: 178,
  dateOfBirth: "1994-03-21",
  trainingGoal: "build_muscle" as const,
};

describe("missing profile details", () => {
  it("says nothing about a profile that answered everything", () => {
    expect(missingProfileDetails(complete)).toEqual([]);
  });

  it("names what is missing, in the order the form asks for it", () => {
    expect(
      missingProfileDetails({
        ...complete,
        displayName: null,
        heightCm: null,
        trainingGoal: null,
      }),
    ).toEqual(["name", "height", "training goal"]);
  });

  it("counts an empty name as no name", () => {
    expect(missingProfileDetails({ ...complete, displayName: "" })).toEqual(["name"]);
  });

  it("does not ask for a sex, because declining to say is an answer", () => {
    // `sex` is not among the fields checked at all; a profile without one is complete.
    expect(missingProfileDetails(complete)).toEqual([]);
  });
});

describe("list sentence", () => {
  it("reads as a sentence at every length", () => {
    expect(listSentence([])).toBe("");
    expect(listSentence(["height"])).toBe("height");
    expect(listSentence(["height", "date of birth"])).toBe("height and date of birth");
    expect(listSentence(["height", "date of birth", "training goal"])).toBe(
      "height, date of birth and training goal",
    );
  });
});
