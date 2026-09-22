"use client";

import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { EnduranceSport } from "@/domain/activity";
import {
  clearDraft,
  newDraft,
  readDrafts,
  saveDraft,
  type ActivityDraft,
} from "@/lib/activity-drafts";
import { formValues, type FormState } from "@/server/validation/form";
import type { SaveActivityState } from "@/server/actions/activities";
import { Button } from "@/components/ui/button";
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
  expectedRevision?: number;
  occurrence?: { id: string; revisionId: string; planId?: string | null } | null;
  target?: { title: string; lines: string[] } | null;
  submitLabel: string;
};

const subscribe = () => () => {};
// Wait for hydration before reading account-scoped storage; server output never restores a draft.
export function ActivityEditor(props: Props) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return hydrated ? <StoredEditor {...props} /> : <p role="status">Opening your activity…</p>;
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
      return (
        readDrafts(localStorage, props.userId).drafts.find(
          (draft) =>
            draft.userId === props.userId &&
            draft.sport === props.sport &&
            draft.activityId === (props.activityId ?? null) &&
            (draft.occurrence?.id ?? null) === (props.occurrence?.id ?? null),
        ) ?? fresh()
      );
    } catch {
      return fresh();
    }
  });
  const current = useRef(initialDraft);
  const [notice, setNotice] = useState(
    initialDraft.dirtyFields.length ? "Restored your unsaved activity from this device." : "",
  );
  function persist(values: Record<string, string>): ActivityDraft {
    // Identity comes from the draft, never from a field edited in the DOM.
    const raw = Object.fromEntries(
      Object.entries(values).filter(
        ([key]) =>
          ![
            "submissionKey",
            "expectedRevision",
            "occurrenceId",
            "revisionId",
            "planId",
            "sport",
          ].includes(key),
      ),
    );
    const draft = {
      ...current.current,
      values: raw,
      dirtyFields: Object.keys(raw),
      updatedAt: new Date().toISOString(),
    };
    current.current = draft;
    try {
      const result = saveDraft(localStorage, draft);
      setNotice(
        result.ok
          ? "Unsaved activity kept on this device."
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
      router.replace(`/training/activities/${result.savedActivityId}`);
    }
    return result;
  };
  const shared = {
    action,
    initial: initialDraft.values,
    submissionKey: initialDraft.submissionKey,
    occurrence: initialDraft.occurrence,
    expectedRevision: initialDraft.expectedRevision,
    target: props.target,
    submitLabel: props.submitLabel,
  };
  return (
    <div className="space-y-3" onChange={changed}>
      {notice && (
        <div className="space-y-1">
          <p role="status" className="text-sm text-ink-muted">
            {notice}
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              try {
                clearDraft(localStorage, props.userId, current.current.draftId);
              } catch {
                return;
              }
              const next = fresh();
              current.current = next;
              setInitialDraft(next);
              setNotice("");
            }}
          >
            Discard unsaved changes
          </Button>
        </div>
      )}
      {props.sport === "running" && <RunningForm key={initialDraft.draftId} {...shared} />}
      {props.sport === "cycling" && <CyclingForm key={initialDraft.draftId} {...shared} />}
      {props.sport === "swimming" && <SwimmingForm key={initialDraft.draftId} {...shared} />}
    </div>
  );
}
