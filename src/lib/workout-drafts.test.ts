import { describe, expect, it } from "vitest";
import {
  draftKey,
  draftMatchesSet,
  readDrafts,
  removeDraft,
  writeDraft,
  type Draft,
  type DraftContext,
} from "./workout-drafts";

const context: DraftContext = {
  userId: "a",
  sessionId: "s",
  workoutExerciseId: "w",
  exerciseId: "e",
  equipmentId: "m",
};
const draft: Draft = {
  setIndex: 1,
  setType: "working",
  weight: "60",
  reps: "5",
  rir: "2",
  duration: "",
  distance: "",
  baseCompletedAt: null,
};
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
};
describe("unsaved set drafts", () => {
  it("restores exact input and isolates account, session and machine", () => {
    const s = storage();
    expect(writeDraft(s, context, draft)).toBe(true);
    expect(readDrafts(s, context)).toEqual([draft]);
    expect(readDrafts(s, { ...context, userId: "b" })).toEqual([]);
    expect(readDrafts(s, { ...context, equipmentId: "other" })).toEqual([]);
  });
  it("cleans confirmed rows and removes the whole key once all are saved", () => {
    const s = storage();
    writeDraft(s, context, draft);
    writeDraft(s, context, { ...draft, setIndex: 2 });
    removeDraft(s, context, 1);
    expect(readDrafts(s, context).map((d) => d.setIndex)).toEqual([2]);
    removeDraft(s, context, 2);
    expect(s.getItem(draftKey(context))).toBeNull();
  });
  it("does not erase a newer edit from another tab when an older request succeeds", () => {
    const s = storage();
    writeDraft(s, context, { ...draft, weight: "65" });
    removeDraft(s, context, 1, draft);
    expect(readDrafts(s, context)[0]?.weight).toBe("65");
  });
  it("recognizes an already committed retry without mistaking missing data for zero", () => {
    expect(
      draftMatchesSet(draft, {
        setType: "working",
        weight: 60,
        reps: 5,
        rir: 2,
        durationSeconds: null,
        distanceMeters: null,
      }),
    ).toBe(true);
    expect(
      draftMatchesSet(
        { ...draft, weight: "" },
        {
          setType: "working",
          weight: 0,
          reps: 5,
          rir: 2,
          durationSeconds: null,
          distanceMeters: null,
        },
      ),
    ).toBe(false);
  });
  it("tolerates malformed and unavailable browser storage", () => {
    const s = storage();
    s.setItem(draftKey(context), "broken");
    expect(readDrafts(s, context)).toEqual([]);
    s.setItem(draftKey(context), JSON.stringify([{ ...draft, setIndex: 99 }]));
    expect(readDrafts(s, context)).toEqual([]);
    expect(
      writeDraft(
        {
          ...s,
          setItem: () => {
            throw new Error("quota");
          },
        },
        context,
        draft,
      ),
    ).toBe(false);
  });
});
