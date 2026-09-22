import type { EnduranceSport } from "@/domain/activity";
import { DRAFT_LIMITS } from "@/domain/activity-limits";

/**
 * Unsent endurance input, kept on this device (plan §5.3).
 *
 * A draft is not an activity: it has no adherence, no statistics and no place in the coach's
 * evidence. It exists so that a reload, a dead battery or a tunnel does not cost somebody the
 * numbers they just typed. What is stored is the raw input — the strings, in the units they
 * were typed in — so restoring it shows exactly what was on screen rather than a rounded
 * reconstruction of it.
 *
 * Nothing here ever discards unsent work to make room. When the account is at its limit the
 * save is refused and the caller says so; the athlete decides what goes. A draft written by a
 * version this build does not understand is quarantined, not guessed at.
 */

export const DRAFT_SCHEMA_VERSION = 1;
const PREFIX = "overload:activity-draft";
const QUARANTINE_PREFIX = "overload:activity-draft-quarantine";

export type ActivityDraft = {
  schemaVersion: number;
  draftId: string;
  userId: string;
  sport: EnduranceSport;
  /** Reused on every retry of this draft, so a repeat cannot become a second activity. */
  submissionKey: string;
  /** Exactly what was typed, field by field, including the chosen units. */
  values: Record<string, string>;
  /** The occurrence being logged, with the revision pinned when the form opened. */
  occurrence: { id: string; revisionId: string; draftToken: string | null } | null;
  /** The activity being corrected, and the version this edit was started from. */
  activityId: string | null;
  expectedRevision: number | null;
  dirtyFields: string[];
  updatedAt: string;
};

/** Per account and per draft: another account signed in here can never read these. */
export function draftKey(userId: string, draftId: string): string {
  return `${PREFIX}:v${DRAFT_SCHEMA_VERSION}:${userId}:${draftId}`;
}

function quarantineKey(key: string): string {
  return key.replace(PREFIX, QUARANTINE_PREFIX);
}

/** The part of `Storage` this needs, so it can be tested without a browser. */
export type DraftStore = {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function keysFor(store: DraftStore, prefix: string): string[] {
  const keys: string[] = [];
  for (let index = 0; index < store.length; index++) {
    const key = store.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

function accountPrefix(userId: string): string {
  return `${PREFIX}:v${DRAFT_SCHEMA_VERSION}:${userId}:`;
}

export type SaveDraftResult =
  { ok: true; evicted: never[] } | { ok: false; reason: "too_large" | "too_many" | "unavailable" };

/**
 * Writes a draft, or says why it could not.
 *
 * "too_many" is a full account, not a licence to delete the oldest: the caller warns, and the
 * athlete chooses. "unavailable" is a private window or a blocked store, where the form still
 * works and only the safety net is missing.
 */
export function saveDraft(store: DraftStore, draft: ActivityDraft): SaveDraftResult {
  const payload = JSON.stringify(draft);
  if (payload.length > DRAFT_LIMITS.bytes) return { ok: false, reason: "too_large" };
  const key = draftKey(draft.userId, draft.draftId);
  try {
    const existing = keysFor(store, accountPrefix(draft.userId));
    if (!existing.includes(key) && existing.length >= DRAFT_LIMITS.perAccount)
      return { ok: false, reason: "too_many" };
    store.setItem(key, payload);
    return { ok: true, evicted: [] };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export type ReadDraftsResult = {
  drafts: ActivityDraft[];
  /** Keys whose contents could not be read as a draft of this version. */
  quarantined: string[];
};

function isDraft(value: unknown): value is ActivityDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<ActivityDraft>;
  return (
    draft.schemaVersion === DRAFT_SCHEMA_VERSION &&
    typeof draft.draftId === "string" &&
    typeof draft.userId === "string" &&
    ["running", "cycling", "swimming"].includes(draft.sport ?? "") &&
    typeof draft.submissionKey === "string" &&
    typeof draft.values === "object" &&
    draft.values !== null &&
    !Array.isArray(draft.values) &&
    Object.values(draft.values).every((value) => typeof value === "string") &&
    (draft.occurrence === null ||
      (typeof draft.occurrence === "object" &&
        typeof draft.occurrence.id === "string" &&
        typeof draft.occurrence.revisionId === "string" &&
        (draft.occurrence.draftToken === null ||
          typeof draft.occurrence.draftToken === "string"))) &&
    (draft.activityId === null || typeof draft.activityId === "string") &&
    (draft.expectedRevision === null ||
      (Number.isInteger(draft.expectedRevision) && (draft.expectedRevision ?? -1) >= 0)) &&
    Array.isArray(draft.dirtyFields) &&
    draft.dirtyFields.every((field) => typeof field === "string") &&
    typeof draft.updatedAt === "string" &&
    Number.isFinite(Date.parse(draft.updatedAt))
  );
}

/** This account's drafts, newest first. Anything unreadable is set aside, never discarded. */
export function readDrafts(store: DraftStore, userId: string): ReadDraftsResult {
  const drafts: ActivityDraft[] = [];
  const quarantined: string[] = [];
  for (const key of keysFor(store, accountPrefix(userId))) {
    const raw = store.getItem(key);
    if (raw === null) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      quarantine(store, key, raw);
      quarantined.push(key);
      continue;
    }
    if (!isDraft(parsed) || parsed.userId !== userId || draftKey(userId, parsed.draftId) !== key) {
      quarantine(store, key, raw);
      quarantined.push(key);
      continue;
    }
    drafts.push(parsed);
  }
  drafts.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
  return { drafts, quarantined };
}

/** Moved aside under its own key, with its text intact for recovery or export. */
function quarantine(store: DraftStore, key: string, raw: string): void {
  try {
    store.setItem(quarantineKey(key), raw);
    store.removeItem(key);
  } catch {
    // A store that will not take the copy keeps the original where it is.
  }
}

export function readQuarantined(store: DraftStore, userId: string): { key: string; raw: string }[] {
  const prefix = accountPrefix(userId).replace(PREFIX, QUARANTINE_PREFIX);
  return keysFor(store, prefix)
    .map((key) => ({ key, raw: store.getItem(key) ?? "" }))
    .filter((entry) => entry.raw.length > 0);
}

/**
 * Clears a draft once the save it belongs to is acknowledged.
 *
 * Only the exact snapshot that was sent: if another tab has edited the draft since, its newer
 * `updatedAt` does not match and the newer input survives.
 */
export function clearDraft(
  store: DraftStore,
  userId: string,
  draftId: string,
  acknowledgedAt?: string,
): boolean {
  const key = draftKey(userId, draftId);
  const raw = store.getItem(key);
  if (raw === null) return false;
  if (acknowledgedAt !== undefined) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isDraft(parsed) && parsed.updatedAt !== acknowledgedAt) return false;
    } catch {
      return false;
    }
  }
  store.removeItem(key);
  return true;
}

/** Signing out clears this account's drafts and touches nobody else's. */
export function clearAccountDrafts(store: DraftStore, userId: string): number {
  const keys = keysFor(store, accountPrefix(userId));
  for (const key of keys) store.removeItem(key);
  return keys.length;
}

export type DraftWarning = { draftId: string; reason: "expiring" | "expired"; updatedAt: string };

/**
 * Drafts near the age limit, so the athlete is warned before anything goes.
 *
 * This reports; it does not delete. Removal is an explicit choice, because an unsent draft is
 * somebody's only copy of what they did.
 */
export function ageWarnings(
  drafts: readonly ActivityDraft[],
  now: Date = new Date(),
  warnWithinDays = 7,
): DraftWarning[] {
  const dayMs = 86_400_000;
  return drafts.flatMap((draft): DraftWarning[] => {
    const age = (now.getTime() - Date.parse(draft.updatedAt)) / dayMs;
    if (!Number.isFinite(age)) return [];
    if (age >= DRAFT_LIMITS.ageDays)
      return [{ draftId: draft.draftId, reason: "expired" as const, updatedAt: draft.updatedAt }];
    if (age >= DRAFT_LIMITS.ageDays - warnWithinDays)
      return [{ draftId: draft.draftId, reason: "expiring" as const, updatedAt: draft.updatedAt }];
    return [];
  });
}

/** A fresh draft for a form that has just been opened. */
export function newDraft(input: {
  userId: string;
  sport: EnduranceSport;
  values?: Record<string, string>;
  occurrence?: ActivityDraft["occurrence"];
  activityId?: string | null;
  expectedRevision?: number | null;
  now?: Date;
}): ActivityDraft {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    draftId: crypto.randomUUID(),
    userId: input.userId,
    sport: input.sport,
    submissionKey: crypto.randomUUID(),
    values: input.values ?? {},
    occurrence: input.occurrence ?? null,
    activityId: input.activityId ?? null,
    expectedRevision: input.expectedRevision ?? null,
    dirtyFields: [],
    updatedAt: (input.now ?? new Date()).toISOString(),
  };
}
