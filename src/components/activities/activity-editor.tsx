"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import type { PoolUnit } from "@/lib/distance-units";
import { formatIsoDate } from "@/lib/format";
import { originQuery, type NavOrigin } from "@/lib/nav";
import { formValues, type FormState } from "@/server/validation/form";
import type { SaveActivityState } from "@/server/actions/activities";
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
  target?: { title: string; lines: string[] } | null;
  submitLabel: string;
  /** A corrected record's unconfirmed legacy effort, offered as "As recorded" (LOG-03). */
  keptEffort?: { value: number | null } | null;
  /** The unit the athlete reads swims in, which a swim's distance is also said in. */
  poolUnit?: PoolUnit;
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
 * What the form says about a draft it has just restored: that it did, when it says it started
 * if that is not now, and whether it is close to the age at which this device lets it go.
 */
function restoredNotice(draft: ActivityDraft, opening: Record<string, string>): string {
  const parts = ["Restored your unsaved activity from this device."];
  const startedAt = keptStart(draft, opening);
  if (startedAt)
    parts.push(
      `It still says it started ${formatIsoDate(startedAt.slice(0, 10))}, ${startedAt.slice(11, 16)}. If that is wrong, change When above.`,
    );
  if (ageWarnings([draft]).some((warning) => warning.reason === "expiring"))
    parts.push(`Save it soon: unsaved activities are kept here for ${DRAFT_LIMITS.ageDays} days.`);
  return parts.join(" ");
}

function StoredEditor(props: Props) {
  const router = useRouter();
  const fresh = () => ({
    ...newDraft({
      userId: props.userId,
      sport: props.sport,
      values: props.initial,
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
          (draft.occurrence?.id ?? null) === (props.occurrence?.id ?? null),
      );
      return stored ? restoreDraft(stored, props.initial) : fresh();
    } catch {
      return fresh();
    }
  });
  const current = useRef(initialDraft);
  const [notice, setNotice] = useState(() =>
    initialDraft.dirtyFields.length ? restoredNotice(initialDraft, props.initial) : "",
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
    const raw = withoutIdentity(values);
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
        setNotice("");
        return draft;
      }
      const result = saveDraft(localStorage, draft);
      setNotice(
        result.ok
          ? "Unsaved activity kept on this device."
          : result.reason === "too_many"
            ? `This device already keeps ${DRAFT_LIMITS.perAccount} unsaved activities, so this one is not kept. Keep this page open until you save.`
            : "Could not keep a draft on this device. Keep this page open until you save.",
      );
    } catch {
      setNotice("Could not keep a draft on this device. Keep this page open until you save.");
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
      router.replace(
        `/training/activities/${result.savedActivityId}${originQuery(props.origin ?? null)}`,
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
    openDetails: startKept,
  };
  // Said after the last field, so nothing moves down when the first thing typed keeps a draft.
  const draftNotice = notice ? (
    <div className="draft-notice">
      <p role="status" className="type-meta text-ink-2">
        {notice}
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
          setNotice("");
        }}
      >
        Discard unsaved changes
      </button>
    </div>
  ) : null;
  return (
    <div ref={wrapper} onChange={changed}>
      {props.sport === "running" && (
        <RunningForm key={initialDraft.draftId} {...shared} notice={draftNotice} />
      )}
      {props.sport === "cycling" && (
        <CyclingForm key={initialDraft.draftId} {...shared} notice={draftNotice} />
      )}
      {props.sport === "swimming" && (
        <SwimmingForm
          key={initialDraft.draftId}
          {...shared}
          notice={draftNotice}
          readIn={props.poolUnit}
        />
      )}
    </div>
  );
}
