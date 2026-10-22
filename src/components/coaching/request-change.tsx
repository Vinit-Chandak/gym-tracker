"use client";

import { useActionState, useState } from "react";

import { Disclosure } from "@/components/ui/disclosure";
import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { Field, Textarea } from "@/components/ui/input";
import { SavedNotice } from "@/components/ui/saved-notice";
import type { ActivitySport } from "@/domain/activity";
import { PLAN_LIMITS } from "@/domain/plan-limits";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { saveCoachNotesAction } from "@/server/actions/coach";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

/**
 * Asking the coach to change a programme, on the programme's own page (ADR 0058): what should
 * change, in the athlete's words, sent as a note for this programme alone. The coach reads it at
 * its next run, and what it proposes comes back to this page to review; the screen says only
 * that it was sent.
 *
 * `noteId` makes a send that is retried after a dropped connection the same note, as the AI
 * coach page's note is; once one is sent, the next note has an id of its own.
 */
export function RequestChange({ sport, noteId }: { sport: ActivitySport; noteId: string }) {
  const form = useKeptForm();
  const [state, formAction, sending] = useActionState(
    keepsFormOnDisconnect(saveCoachNotesAction),
    INITIAL_FORM_STATE,
  );
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ id: string; after: FormState }>({
    id: noteId,
    after: INITIAL_FORM_STATE,
  });
  const sent =
    state !== INITIAL_FORM_STATE && !state.fieldErrors && !state.formError && !state.values;
  if (sent && note.after !== state) {
    setNote({ id: crypto.randomUUID(), after: state });
    setText("");
  }
  return (
    <Disclosure
      summary="Request a change"
      defaultOpen={Boolean(state.fieldErrors || state.formError)}
    >
      <form ref={form} action={formAction} className="space-y-3">
        <input type="hidden" name="noteId" value={state.values?.noteId ?? note.id} />
        <input type="hidden" name="sport" value={sport} />
        <Field label="What should change?" error={state.fieldErrors?.userNotes}>
          <Textarea
            key={note.id}
            name="userNotes"
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={PLAN_LIMITS.memo}
            disabled={sending}
            placeholder="Move Thursday’s session to Friday."
            required
          />
        </Field>
        <FormError message={state.formError ?? state.fieldErrors?.sport} />
        <SubmitButton pendingLabel="Sending…" className="w-full" disabled={!text.trim()}>
          Send to the coach
        </SubmitButton>
        {sent && !text && <SavedNotice key={note.id}>Sent to the coach.</SavedNotice>}
      </form>
    </Disclosure>
  );
}
