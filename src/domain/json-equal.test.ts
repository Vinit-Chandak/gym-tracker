import { describe, expect, it } from "vitest";

import { jsonEqual } from "./json-equal";

describe("content equality for stored JSON", () => {
  /** The bug this exists for: jsonb sorts keys, the schema does not. */
  it("ignores the order an object's keys arrive in", () => {
    const fromJsonb = {
      note: null,
      paceNote: "Conversational",
      progressionNote: null,
      symptomStopRule: "Stop if the shin complains.",
    };
    const fromSchema = {
      paceNote: "Conversational",
      progressionNote: null,
      symptomStopRule: "Stop if the shin complains.",
      note: null,
    };
    expect(JSON.stringify(fromJsonb)).not.toEqual(JSON.stringify(fromSchema));
    expect(jsonEqual(fromJsonb, fromSchema)).toBe(true);
  });

  it("still reports a value that actually changed", () => {
    expect(jsonEqual({ paceNote: "Easy", note: null }, { note: null, paceNote: "Hard" })).toBe(
      false,
    );
  });

  it("reports a key one side does not have", () => {
    expect(jsonEqual({ paceNote: "Easy" }, { paceNote: "Easy", note: null })).toBe(false);
    expect(jsonEqual({ paceNote: "Easy" }, { note: "Easy" })).toBe(false);
  });

  /** Absence, matching JSON.stringify: a key set to undefined does not survive storage. */
  it("treats a key set to undefined as absent", () => {
    expect(jsonEqual({ paceNote: "Easy", note: undefined }, { paceNote: "Easy" })).toBe(true);
    expect(jsonEqual({ note: undefined }, {})).toBe(true);
  });

  /** Order in an array is content: steps happen in sequence and a range reads low to high. */
  it("keeps array order significant", () => {
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual([1, 2], [1, 2])).toBe(true);
    expect(jsonEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("compares nested structures by content", () => {
    const a = { nodes: [{ id: "one", target: { kind: "distance", metres: [50, 50] } }] };
    const b = { nodes: [{ target: { metres: [50, 50], kind: "distance" }, id: "one" }] };
    expect(jsonEqual(a, b)).toBe(true);
  });

  it("does not confuse an object with an array or with null", () => {
    expect(jsonEqual({}, [])).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
    expect(jsonEqual(null, null)).toBe(true);
  });

  it("compares primitives by value", () => {
    expect(jsonEqual("a", "a")).toBe(true);
    expect(jsonEqual(1, "1")).toBe(false);
    expect(jsonEqual(null, undefined)).toBe(false);
  });
});

describe("values that are not plain JSON", () => {
  /** A Date has no keys of its own, so comparing it key by key would call any two equal. */
  it("compares dates by their value, as JSON.stringify does", () => {
    expect(jsonEqual(new Date("2026-09-21"), new Date("2026-09-21"))).toBe(true);
    expect(jsonEqual(new Date("2026-09-21"), new Date("2026-09-22"))).toBe(false);
    expect(jsonEqual({ at: new Date("2026-09-21") }, { at: "2026-09-21T00:00:00.000Z" })).toBe(
      true,
    );
  });
});
