import { describe, expect, it } from "vitest";
import {
  adoptDrafts,
  draftKey,
  draftMatchesSet,
  moveDrafts,
  readDrafts,
  removeDraft,
  sessionDraftExercises,
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
  it("names each exercise holding drafts once, and only this session's", () => {
    const data = new Map<string, string>();
    const full = {
      get length() {
        return data.size;
      },
      key: (index: number) => [...data.keys()][index] ?? null,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
      clear: () => data.clear(),
    } as Storage;
    writeDraft(full, context, draft);
    writeDraft(full, context, { ...draft, setIndex: 2 });
    writeDraft(full, { ...context, workoutExerciseId: "x", equipmentId: null }, draft);
    writeDraft(full, { ...context, sessionId: "other" }, draft);
    expect(sessionDraftExercises(full, "a", "s")).toEqual(["w", "x"]);
  });

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

describe("drafts carried with the exercise", () => {
  it("moves unsaved rows to where a machine answer put the exercise, then drops the old key", () => {
    const store = storage();
    const before = { ...context, equipmentId: null };
    const after = { ...context, equipmentId: "new-machine" };
    writeDraft(store, before, draft);
    writeDraft(store, after, { ...draft, setIndex: 2, reps: "8" });
    expect(moveDrafts(store, before, after)).toBe(true);
    expect(store.getItem(draftKey(before))).toBeNull();
    const moved = readDrafts(store, after);
    expect(moved.map((row) => [row.setIndex, row.reps, row.carried ?? false])).toEqual([
      [2, "8", false],
      [1, "5", true],
    ]);
  });

  it("does nothing where there is nothing to carry, or nowhere new to carry it", () => {
    const store = storage();
    writeDraft(store, context, draft);
    expect(moveDrafts(store, context, context)).toBe(true);
    expect(readDrafts(store, context)).toHaveLength(1);
    expect(moveDrafts(store, { ...context, workoutExerciseId: "x" }, context)).toBe(true);
    expect(readDrafts(store, context)).toHaveLength(1);
  });
});

describe("drafts left under another exercise or machine", () => {
  const full = () => {
    const data = new Map<string, string>();
    return {
      get length() {
        return data.size;
      },
      key: (index: number) => [...data.keys()][index] ?? null,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
      clear: () => data.clear(),
    } as Storage;
  };

  it("takes them in, keeps its own, and drops the old keys", () => {
    const store = full();
    // Typed while the machine question was open, before Register with details answered it; and
    // typed on another machine before the exercise was swapped from it.
    const unregistered = { ...context, equipmentId: null };
    const swapped = { ...context, exerciseId: "other", equipmentId: "old" };
    writeDraft(store, unregistered, { ...draft, setIndex: 2, reps: "8" });
    writeDraft(store, swapped, { ...draft, setIndex: 3, reps: "6", carried: true });
    writeDraft(store, context, { ...draft, weight: "65" });
    // Another exercise of the workout keeps what is its own.
    const elsewhere = { ...context, workoutExerciseId: "x", equipmentId: null };
    writeDraft(store, elsewhere, draft);
    expect(adoptDrafts(store, context)).toBe(true);
    expect(store.getItem(draftKey(unregistered))).toBeNull();
    expect(store.getItem(draftKey(swapped))).toBeNull();
    expect(readDrafts(store, elsewhere)).toHaveLength(1);
    // The answer to the machine question moved the first, so it comes as the row it was; the
    // swapped one comes back as a draft to review.
    expect(
      readDrafts(store, context).map((row) => [row.setIndex, row.weight, row.reps, row.carried]),
    ).toEqual([
      [1, "65", "5", undefined],
      [2, "60", "8", true],
      [3, "60", "6", undefined],
    ]);
    // The session still counts each set once.
    expect(sessionDraftExercises(store, "a", "s")).toEqual(["w", "x"]);
  });

  it("changes nothing when nothing was left behind", () => {
    const store = full();
    writeDraft(store, context, draft);
    expect(adoptDrafts(store, context)).toBe(true);
    expect(readDrafts(store, context)).toEqual([draft]);
  });
});
