import { describe, expect, it } from "vitest";

import {
  ageWarnings,
  changedFields,
  clearAccountDrafts,
  clearDraft,
  draftKey,
  expireDrafts,
  newDraft,
  readDrafts,
  readQuarantined,
  restoreDraft,
  saveDraft,
  type ActivityDraft,
  type DraftStore,
} from "./activity-drafts";

/** A localStorage stand-in, with an optional ceiling so a full store can be tested. */
function memoryStore(
  options: { maxBytes?: number } = {},
): DraftStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      const total = [...map.entries()]
        .filter(([existing]) => existing !== key)
        .reduce((sum, [, item]) => sum + item.length, 0);
      if (options.maxBytes !== undefined && total + value.length > options.maxBytes)
        throw new Error("QuotaExceededError");
      map.set(key, value);
    },
    removeItem: (key) => void map.delete(key),
  };
}

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

const draft = (userId: string, overrides: Partial<ActivityDraft> = {}): ActivityDraft => ({
  ...newDraft({ userId, sport: "running", values: { distanceValue: "5", distanceUnit: "km" } }),
  ...overrides,
});

describe("keeping unsent input", () => {
  it("stores and restores exactly what was typed, units included", () => {
    const store = memoryStore();
    const mine = draft(ALICE, {
      values: { distanceValue: "5.2", distanceUnit: "mi", minutes: "43" },
    });
    expect(saveDraft(store, mine).ok).toBe(true);

    const { drafts } = readDrafts(store, ALICE);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.values).toEqual({ distanceValue: "5.2", distanceUnit: "mi", minutes: "43" });
    expect(drafts[0]!.submissionKey).toBe(mine.submissionKey);
  });

  /** AT-LIFE-06: one device, two accounts, and no leakage between them. */
  it("keeps each account's drafts to itself", () => {
    const store = memoryStore();
    saveDraft(store, draft(ALICE));
    saveDraft(store, draft(BOB));

    expect(readDrafts(store, ALICE).drafts).toHaveLength(1);
    expect(readDrafts(store, BOB).drafts).toHaveLength(1);
    // Signing out takes this account's work and leaves the other account's alone.
    expect(clearAccountDrafts(store, ALICE)).toBe(1);
    expect(readDrafts(store, ALICE).drafts).toEqual([]);
    expect(readDrafts(store, BOB).drafts).toHaveLength(1);
  });

  /** AT-LIFE-05: only the snapshot that was acknowledged is cleared. */
  it("does not erase a newer edit made while the save was in flight", () => {
    const store = memoryStore();
    const first = draft(ALICE);
    saveDraft(store, first);
    const sentAt = first.updatedAt;
    // Another tab edits the same draft while the first save is still in flight.
    saveDraft(store, {
      ...first,
      values: { distanceValue: "7" },
      updatedAt: "2026-09-19T10:00:00.000Z",
    });

    expect(clearDraft(store, ALICE, first.draftId, sentAt)).toBe(false);
    expect(readDrafts(store, ALICE).drafts[0]!.values).toEqual({ distanceValue: "7" });
    // Acknowledging the newer snapshot does clear it.
    expect(clearDraft(store, ALICE, first.draftId, "2026-09-19T10:00:00.000Z")).toBe(true);
    expect(readDrafts(store, ALICE).drafts).toEqual([]);
  });
});

describe("limits", () => {
  /** AT-LIFE-07: a full account is reported, never quietly emptied. */
  it("refuses a new draft rather than evicting an unsent one", () => {
    const store = memoryStore();
    for (let index = 0; index < 20; index++) saveDraft(store, draft(ALICE));
    expect(readDrafts(store, ALICE).drafts).toHaveLength(20);

    const result = saveDraft(store, draft(ALICE));

    expect(result).toEqual({ ok: false, reason: "too_many" });
    expect(readDrafts(store, ALICE).drafts).toHaveLength(20);
  });

  it("still updates a draft that already exists when the account is full", () => {
    const store = memoryStore();
    const drafts = Array.from({ length: 20 }, () => draft(ALICE));
    for (const item of drafts) saveDraft(store, item);

    const updated = { ...drafts[0]!, values: { distanceValue: "9" } };
    expect(saveDraft(store, updated).ok).toBe(true);
    const stored = readDrafts(store, ALICE).drafts.find((item) => item.draftId === updated.draftId);
    expect(stored!.values).toEqual({ distanceValue: "9" });
    expect(readDrafts(store, ALICE).drafts).toHaveLength(20);
  });

  it("refuses one oversized draft", () => {
    const store = memoryStore();
    const huge = draft(ALICE, { values: { notes: "x".repeat(200_000) } });
    expect(saveDraft(store, huge)).toEqual({ ok: false, reason: "too_large" });
  });

  it("reports a store that will not take a write instead of pretending it worked", () => {
    const store = memoryStore({ maxBytes: 10 });
    expect(saveDraft(store, draft(ALICE))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("warns before an old draft reaches its age limit", () => {
    const now = new Date("2026-09-19T00:00:00.000Z");
    const fresh = draft(ALICE, { updatedAt: "2026-09-18T00:00:00.000Z" });
    const ageing = draft(ALICE, { updatedAt: "2026-06-26T00:00:00.000Z" });
    const old = draft(ALICE, { updatedAt: "2026-05-01T00:00:00.000Z" });

    const warnings = ageWarnings([fresh, ageing, old], now);

    expect(warnings.map((warning) => warning.reason)).toEqual(["expiring", "expired"]);
  });

  /** The age bound frees the account's places; younger drafts and other accounts are kept. */
  it("lets a draft go once it is past the age limit, and nothing younger", () => {
    const store = memoryStore();
    const now = new Date("2026-09-19T00:00:00.000Z");
    const ageing = draft(ALICE, { updatedAt: "2026-06-26T00:00:00.000Z" });
    const old = draft(ALICE, { updatedAt: "2026-05-01T00:00:00.000Z" });
    const othersOld = draft(BOB, { updatedAt: "2026-05-01T00:00:00.000Z" });
    for (const item of [ageing, old, othersOld]) saveDraft(store, item);

    expect(expireDrafts(store, ALICE, now)).toBe(1);
    expect(readDrafts(store, ALICE).drafts.map((item) => item.draftId)).toEqual([ageing.draftId]);
    expect(readDrafts(store, BOB).drafts).toHaveLength(1);
  });
});

describe("reopening a draft", () => {
  const opening = {
    startedAt: "2026-10-08T19:40",
    recordedTimeZone: "Europe/London",
    distanceValue: "",
    distanceUnit: "km",
    minutes: "",
  };

  it("counts only what differs from how the form opened", () => {
    expect(changedFields({ ...opening, distanceValue: "5" }, opening)).toEqual(["distanceValue"]);
    expect(changedFields({ ...opening, surface: "" }, opening)).toEqual([]);
    expect(changedFields(opening, opening)).toEqual([]);
  });

  /** A draft begun on Monday and reopened on Thursday starts on Thursday unless it was told otherwise. */
  it("opens an untouched start as now, and keeps what was typed", () => {
    const monday = draft(ALICE, {
      values: { ...opening, startedAt: "2026-10-05T07:10", distanceValue: "5" },
      dirtyFields: ["distanceValue"],
    });
    const restored = restoreDraft(monday, opening);
    expect(restored.values).toMatchObject({ startedAt: "2026-10-08T19:40", distanceValue: "5" });
  });

  it("keeps a start the athlete set, with the zone and hour it was set in", () => {
    const backdated = draft(ALICE, {
      values: {
        ...opening,
        startedAt: "2026-10-05T07:10",
        recordedTimeZone: "Asia/Tokyo",
        startedAtOffsetMinutes: "540",
        distanceValue: "5",
      },
      dirtyFields: ["startedAt", "distanceValue"],
    });
    expect(restoreDraft(backdated, opening).values).toMatchObject({
      startedAt: "2026-10-05T07:10",
      recordedTimeZone: "Asia/Tokyo",
      startedAtOffsetMinutes: "540",
    });
  });
});

describe("what it will not interpret", () => {
  it.each([
    { dirtyFields: undefined },
    { values: { minutes: 30 } },
    { sport: "strength" },
    { occurrence: {} },
    { expectedRevision: -1 },
    { updatedAt: "not a date" },
    { userId: BOB },
    { draftId: "another-draft" },
  ])("quarantines malformed or misfiled input: %j", (invalid) => {
    const store = memoryStore();
    const original = draft(ALICE);
    const key = draftKey(ALICE, original.draftId);
    const raw = JSON.stringify({ ...original, ...invalid });
    store.setItem(key, raw);

    expect(readDrafts(store, ALICE)).toEqual({ drafts: [], quarantined: [key] });
    expect(readQuarantined(store, ALICE)[0]!.raw).toBe(raw);
  });

  /** AT-LIFE-06: an unreadable draft is set aside with its text, not silently parsed. */
  it("quarantines corrupt and unknown-version drafts", () => {
    const store = memoryStore();
    store.setItem(draftKey(ALICE, "broken"), "{not json");
    store.setItem(
      draftKey(ALICE, "future"),
      JSON.stringify({ schemaVersion: 99, draftId: "future", userId: ALICE }),
    );
    saveDraft(store, draft(ALICE));

    const { drafts, quarantined } = readDrafts(store, ALICE);

    expect(drafts).toHaveLength(1);
    expect(quarantined).toHaveLength(2);
    const recoverable = readQuarantined(store, ALICE);
    expect(recoverable).toHaveLength(2);
    expect(recoverable.some((entry) => entry.raw === "{not json")).toBe(true);
  });
});
