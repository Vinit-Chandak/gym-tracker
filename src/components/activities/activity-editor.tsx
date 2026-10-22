"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Glyph } from "@/components/ui/glyphs";
import type { EnduranceSport } from "@/domain/activity";
import { DRAFT_LIMITS } from "@/domain/activity-limits";
import {
  ageWarnings,
  changedFields,
  clearDraft,
  expireDrafts,
  newDraft,
  readDrafts,
  restoreDraft,
  saveDraft,
  type ActivityDraft,
} from "@/lib/activity-drafts";
import type { SportUnits } from "@/lib/distance-units";
import { formatIsoDate } from "@/lib/format";
import type { PlannedLap } from "@/lib/run-laps";
import { originQuery, type NavOrigin } from "@/lib/nav";
import { formValues, type FormState } from "@/server/validation/form";
import type { SaveActivityState } from "@/server/actions/activities";
import type { PlanTarget } from "./activity-form-fields";
import { RunningForm } from "./running-form";
import { CyclingForm } from "./cycling-form";
import { SwimmingForm } from "./swimming-form";

type Props = {
  userId: string;
  sport: EnduranceSport;
  initial: Record<string, string>;
  action: (previous: FormState, form: FormData) => Promise<SaveActivityState>;
  submissionKey: string;
  activityId?: string;
  /** The tab the corrected record was opened from, which the saved record reopens under. */
  origin?: NavOrigin | null;
  expectedRevision?: number;
  occurrence?: { id: string; revisionId: string; planId?: string | null } | null;
  target?: PlanTarget | null;
  submitLabel: string;
  /** A corrected record's unconfirmed legacy effort, offered as "As recorded" (LOG-03). */
  keptEffort?: { value: number | null } | null;
  /**
   * How the athlete reads the sport: a recorded distance opens in their unit (a run's or a
   * ride's road unit, a swim's pool unit), and a run's or a ride's climb in feet beside miles.
   */
  units?: SportUnits;
  /** A planned run's steps, which its laps can be laid out from (ADR 0059). */
  plannedLaps?: readonly PlannedLap[];
};

const subscribe = () => () => {};
// Wait for hydration before reading account-scoped storage; server output never restores a draft.
export function ActivityEditor(props: Props) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  // Search-parameter navigation can reuse this component for a different sport or session.
  // Reset only when identity changes; a refresh of the same session must retain its pinned
  // revision and retry key so it cannot silently overwrite newer work.
  const identity = JSON.stringify([
    props.userId,
    props.sport,
    props.activityId ?? null,
    props.occurrence?.id ?? null,
    props.initial.entryDate ?? null,
  ]);
  return hydrated ? (
    <StoredEditor key={identity} {...props} />
  ) : (
    <p role="status">Opening your activity…</p>
  );
}

/** Identity comes from the draft, never from a field edited in the DOM. */
const IDENTITY_FIELDS = [
  "submissionKey",
  "expectedRevision",
  "occurrenceId",
  "revisionId",
  "planId",
  "sport",
];

function withoutIdentity(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !IDENTITY_FIELDS.includes(key)),
  );
}

/**
 * The start a restored new log kept from its draft, when that is not the moment the form would
 * open on. It is kept only because the athlete set it (or because a draft from before changes
 * were told apart says they did), and it is said aloud either way.
 */
function keptStart(draft: ActivityDraft, opening: Record<string, string>): string | null {
  const startedAt = draft.values.startedAt ?? "";
  return draft.activityId === null && startedAt && startedAt !== (opening.startedAt ?? "")
    ? startedAt
    : null;
}

/**
 * What the form says about its draft, after the last field: kept on this device (the check
 * glyph), or not kept (the warning glyph, and what to do instead).
 */
type DraftNotice = { kept: boolean; text: string };

/**
 * What the form says about a draft it has just restored: that it did, when it says it started
 * if that is not now (When opens with it, in view), and whether it is close to the age at which
 * this device lets it go.
 */
function restoredNotice(draft: ActivityDraft, opening: Record<string, string>): DraftNotice {
  const startedAt = keptStart(draft, opening);
  const restored = startedAt
    ? `Draft restored, started ${formatIsoDate(startedAt.slice(0, 10))}, ${startedAt.slice(11, 16)}.`
    : "Draft restored.";
  const expiring = ageWarnings([draft]).some((warning) => warning.reason === "expiring");
  return {
    kept: true,
    text: expiring ? `${restored} Save soon: drafts last ${DRAFT_LIMITS.ageDays} days.` : restored,
  };
}

/** Not kept, and why where it is known; the page holds what is typed until it is saved. */
const NOT_KEPT = "Draft not kept. Stay on this page until you save.";

function StoredEditor(props: Props) {
  const router = useRouter();
  const fresh = () => ({
    ...newDraft({
      userId: props.userId,
      sport: props.sport,
      values: { ...props.initial, entryContextDate: props.initial.entryDate ?? "" },
      activityId: props.activityId ?? null,
      expectedRevision: props.expectedRevision ?? null,
      occurrence: props.occurrence ? { ...props.occurrence, draftToken: null } : null,
    }),
    submissionKey: props.submissionKey,
  });
  const [initialDraft, setInitialDraft] = useState(() => {
    try {
      // Drafts past the age limit go before anything is read, so they neither reopen nor
      // hold one of the account's places for good.
      expireDrafts(localStorage, props.userId);
      const stored = readDrafts(localStorage, props.userId).drafts.find(
        (draft) =>
          draft.userId === props.userId &&
          draft.sport === props.sport &&
          draft.activityId === (props.activityId ?? null) &&
          (draft.occurrence?.id ?? null) === (props.occurrence?.id ?? null) &&
          ((draft.values.entryContextDate ?? draft.values.entryDate) || null) ===
            (props.initial.entryDate ?? null),
      );
      return stored ? restoreDraft(stored, props.initial) : fresh();
    } catch {
      return fresh();
    }
  });
  const current = useRef(initialDraft);
  const [notice, setNotice] = useState<DraftNotice | null>(() =>
    initialDraft.dirtyFields.length ? restoredNotice(initialDraft, props.initial) : null,
  );
  // A restored log whose start is not now opens the details, so When is in view.
  const [startKept, setStartKept] = useState(
    () => initialDraft.dirtyFields.length > 0 && keptStart(initialDraft, props.initial) !== null,
  );
  // What the form showed when it opened, read from the form itself, so a field counts as
  // changed only when the athlete changed it — not because the form posts a default the
  // opening values never named.
  const wrapper = useRef<HTMLDivElement>(null);
  const opened = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    const form = wrapper.current?.querySelector("form");
    opened.current = form ? withoutIdentity(formValues(new FormData(form))) : null;
  }, [initialDraft.draftId]);
  function persist(values: Record<string, string>): ActivityDraft {
    const raw = { ...withoutIdentity(values), entryContextDate: props.initial.entryDate ?? "" };
    // What a restored draft had already changed, and what differs from how the form opened
    // now; a change typed and then undone is no change.
    const dirtyFields = [
      ...new Set([
        ...initialDraft.dirtyFields,
        ...changedFields(raw, opened.current ?? props.initial),
      ]),
    ];
    const draft = {
      ...current.current,
      values: raw,
      dirtyFields,
      updatedAt: new Date().toISOString(),
    };
    current.current = draft;
    try {
      // Nothing changed from how the form opened is nothing to keep, and it takes no place.
      if (dirtyFields.length === 0) {
        clearDraft(localStorage, props.userId, draft.draftId);
        setNotice(null);
        return draft;
      }
      const result = saveDraft(localStorage, draft);
      setNotice(
        result.ok
          ? { kept: true, text: "Draft kept" }
          : {
              kept: false,
              text:
                result.reason === "too_many"
                  ? `Draft not kept: this device holds ${DRAFT_LIMITS.perAccount} drafts already. Stay on this page until you save.`
                  : NOT_KEPT,
            },
      );
    } catch {
      setNotice({ kept: false, text: NOT_KEPT });
    }
    return draft;
  }
  function changed(event: FormEvent<HTMLDivElement>) {
    const form = (event.target as HTMLInputElement).form;
    if (form)
      queueMicrotask(() => {
        if (form.isConnected) persist(formValues(new FormData(form)));
      });
  }
  const action = async (state: FormState, data: FormData): Promise<FormState> => {
    const sent = persist(formValues(data));
    const result = await props.action(state, data);
    if (result.savedActivityId) {
      try {
        clearDraft(localStorage, props.userId, sent.draftId, sent.updatedAt);
      } catch {
        /* Saving the activity succeeded even if storage is blocked. */
      }
      // The record opens saying it was kept (DESIGN.md, Inputs and choices: a record kept): a
      // new one with Undo, a correction without, since undoing it would delete the record.
      const query = originQuery(props.origin ?? null);
      const saved = `saved=${props.activityId ? "changed" : "new"}`;
      router.replace(
        `/progress/activities/${result.savedActivityId}${query ? `${query}&${saved}` : `?${saved}`}`,
      );
    }
    return result;
  };
  const shared = {
    action,
    initial: {
      ...initialDraft.values,
      recordedTimeZone:
        initialDraft.values.recordedTimeZone ?? props.initial.recordedTimeZone ?? "UTC",
    },
    submissionKey: initialDraft.submissionKey,
    occurrence: initialDraft.occurrence,
    expectedRevision: initialDraft.expectedRevision,
    target: props.target,
    submitLabel: props.submitLabel,
    keptEffort: props.keptEffort ?? null,
    openDetails: startKept || Boolean(props.initial.entryDate),
  };
  // Said after the last field, so nothing moves down when the first thing typed keeps a draft.
  const draftNotice = notice ? (
    <div className="draft-notice">
      <p role="status" className="flex items-start gap-1.5 type-meta text-ink-2">
        <Glyph name={notice.kept ? "check" : "warn"} className="mt-0.5 glyph-16" />
        <span className="min-w-0 [overflow-wrap:break-word]">{notice.text}</span>
      </p>
      <button
        type="button"
        className="text-action"
        onClick={() => {
          try {
            clearDraft(localStorage, props.userId, current.current.draftId);
          } catch {
            return;
          }
          const next = fresh();
          current.current = next;
          setInitialDraft(next);
          setStartKept(false);
          setNotice(null);
        }}
      >
        Discard draft
      </button>
    </div>
  ) : null;
  return (
    <div ref={wrapper} onChange={changed}>
      {props.sport === "running" && (
        <RunningForm
          key={initialDraft.draftId}
          {...shared}
          notice={draftNotice}
          readIn={props.units?.distanceUnit}
          plannedLaps={props.plannedLaps}
        />
      )}
      {props.sport === "cycling" && (
        <CyclingForm
          key={initialDraft.draftId}
          {...shared}
          notice={draftNotice}
          readIn={props.units?.distanceUnit}
        />
      )}
      {props.sport === "swimming" && (
        <SwimmingForm
          key={initialDraft.draftId}
          {...shared}
          notice={draftNotice}
          readIn={props.units?.poolUnit}
        />
      )}
    </div>
  );
}
