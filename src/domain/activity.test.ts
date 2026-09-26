import { describe, expect, it } from "vitest";

import {
  AD_HOC_ORIGIN,
  activityEvidenceId,
  describeEffort,
  effortOnCurrentScale,
  isConfirmedEffort,
  legacyEffort,
  legacySportOf,
  originFromStorage,
  parseEvidenceId,
  plannedOrigin,
  sportFromParam,
  sportOfLegacy,
  UNKNOWN_EFFORT,
} from "./activity";

describe("effort provenance", () => {
  /** AT-LOG-11: a number nobody confirmed stays a number nobody confirmed. */
  it("keeps a legacy unconfirmed rating out of the reported state", () => {
    const legacy = legacyEffort(5, false);
    expect(legacy).toEqual({ status: "legacy_unconfirmed", value: 2 });
    expect(isConfirmedEffort(legacy)).toBe(false);
    expect(describeEffort(legacy)).toBe("2/5 (unconfirmed)");
  });

  it("distinguishes a reported rating, an explicit Not sure, and nothing at all", () => {
    expect(legacyEffort(7, true)).toEqual({ status: "reported", value: 3 });
    expect(legacyEffort(null, true)).toEqual(UNKNOWN_EFFORT);
    expect(describeEffort(UNKNOWN_EFFORT)).toBe("Not sure");
    expect(describeEffort({ status: "legacy_unconfirmed", value: null })).toBe("Not recorded");
  });

  /** The same map migration 0033 ran, for the legacy tens still sitting in `runs.rpe`. */
  it("reads a rating written out of ten as one out of five", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(effortOnCurrentScale)).toEqual([
      1, 1, 1, 2, 2, 3, 3, 4, 4, 5,
    ]);
    // Halving alone would send a 1 to a 0, and "very easy" is not "no effort at all".
    expect(effortOnCurrentScale(1)).toBe(1);
    // The old column allowed a tenth; the new scale has no room for one.
    expect(effortOnCurrentScale(7.5)).toBe(3);
  });
});

describe("sport names from a URL", () => {
  it("accepts either vocabulary, and guesses at neither", () => {
    expect(sportFromParam("running")).toBe("running");
    expect(sportFromParam("run")).toBe("running");
    expect(sportFromParam("cycle")).toBe("cycling");
    expect(sportFromParam("swim")).toBe("swimming");
    expect(sportFromParam("workout")).toBe("strength");
    expect(sportFromParam("rowing")).toBeNull();
    expect(sportFromParam(undefined)).toBeNull();
  });
});

describe("sport names", () => {
  it("maps to and from the legacy discriminators without renaming stored history", () => {
    expect(legacySportOf("strength")).toBe("workout");
    expect(legacySportOf("running")).toBe("run");
    // `cycle` and `swim` joined the enum with this release, so both directions answer for
    // all four sports: a mapping that covered two silently called a ride a run.
    expect(legacySportOf("cycling")).toBe("cycle");
    expect(legacySportOf("swimming")).toBe("swim");
    expect(sportOfLegacy("workout")).toBe("strength");
    expect(sportOfLegacy("run")).toBe("running");
    expect(sportOfLegacy("cycle")).toBe("cycling");
    expect(sportOfLegacy("swim")).toBe("swimming");
  });

  /** AT-NAV-06: an unknown sport is refused rather than falling back to a familiar one. */
  it("reads old social filters and refuses anything else", () => {
    expect(sportFromParam("workout")).toBe("strength");
    expect(sportFromParam("run")).toBe("running");
    expect(sportFromParam("swimming")).toBe("swimming");
    expect(sportFromParam("rowing")).toBeNull();
    expect(sportFromParam("")).toBeNull();
    expect(sportFromParam(null)).toBeNull();
  });
});

describe("log origin", () => {
  it("has no half-linked state", () => {
    const planned = plannedOrigin("occ", "rev", "plan");
    expect(
      originFromStorage({
        occurrenceId: "occ",
        performedRevisionId: "rev",
        performedPlanId: "plan",
      }),
    ).toEqual(planned);
    // A row with only half a link is ad hoc, not a third kind of log.
    expect(
      originFromStorage({
        occurrenceId: "occ",
        performedRevisionId: null,
        performedPlanId: null,
      }),
    ).toEqual(AD_HOC_ORIGIN);
  });
});

describe("evidence identifiers", () => {
  /** AT-COACH-11: `run:<uuid>` is an activity, `run:<weekday>` is a guardrail's scope. */
  it("tells a legacy run from a legacy weekday scope, and guesses at neither", () => {
    const id = "6a5f1b12-0c62-4f0e-9a5a-6d4b1f2e3c44";
    expect(parseEvidenceId(`run:${id}`)).toEqual({ kind: "legacy_run", id });
    expect(parseEvidenceId("run:wednesday")).toEqual({
      kind: "legacy_run_weekday",
      weekday: "wednesday",
    });
    expect(parseEvidenceId(activityEvidenceId(id))).toEqual({ kind: "activity", id });
    expect(parseEvidenceId("swim:whatever")).toEqual({ kind: "unknown", raw: "swim:whatever" });
  });
});
