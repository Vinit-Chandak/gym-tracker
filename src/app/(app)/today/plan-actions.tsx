"use client";

import { useActionState, useState, useTransition } from "react";

import { Button, type ButtonVariant } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import {
  completeRestSlotAction,
  discardSessionAction,
  skipSlotAction,
  startAdHocSessionAction,
  startPlannedSessionAction,
  type ActionResult,
} from "@/server/actions/sessions";

const INITIAL: ActionResult = { ok: true };

/** Primary Start button for a planned day at the default gym. */
export function StartPlannedButton({
  gymId,
  programDayId,
  dayIndex,
  label,
  variant = "primary",
  ariaLabel,
}: {
  gymId: string | null;
  programDayId: string;
  dayIndex: number;
  label: string;
  variant?: ButtonVariant;
  /** Names the day when the visible label is shared by several buttons on one screen. */
  ariaLabel?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      variant={variant}
      aria-label={ariaLabel}
      className="w-full"
      disabled={gymId === null || pending}
      onClick={() => {
        if (!gymId) return;
        startTransition(() => startPlannedSessionAction(gymId, programDayId, dayIndex));
      }}
    >
      {pending ? "Starting…" : label}
    </Button>
  );
}

export function StartAdHocButton({ gymId }: { gymId: string | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      className="w-full"
      disabled={gymId === null || pending}
      onClick={() => {
        if (!gymId) return;
        startTransition(() => startAdHocSessionAction(gymId));
      }}
    >
      {pending ? "Starting…" : "Ad hoc session"}
    </Button>
  );
}

/** "Skip this session" with an optional reason, in a bottom sheet. */
export function SkipSlotButton({ dayIndex, dayName }: { dayIndex: number; dayName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(skipSlotAction.bind(null, dayIndex), INITIAL);
  // Close the sheet once per successful submission (each action result is a new object).
  const [handled, setHandled] = useState<ActionResult>(INITIAL);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }

  return (
    <>
      <Button variant="ghost" className="w-full" onClick={() => setOpen(true)}>
        Skip this session
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Skip ${dayName}?`}>
        <form action={formAction} className="space-y-4">
          <p className="text-sm text-ink-muted">
            The day is marked as skipped and the programme moves on. Nothing later is dropped.
          </p>
          <Field label="Reason" hint="Optional">
            <Input name="reason" maxLength={200} placeholder="Travelling, unwell, …" />
          </Field>
          {!state.ok && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="danger" size="lg" className="w-full" disabled={pending}>
            {pending ? "Skipping…" : "Skip session"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

export function CompleteRestButton({ dayIndex }: { dayIndex: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await completeRestSlotAction(dayIndex);
            setError(result.ok ? null : result.error);
          })
        }
      >
        {pending ? "Saving…" : "Mark rest day done"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function DiscardSessionButton({ sessionId }: { sessionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await discardSessionAction(sessionId);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {pending ? "Discarding…" : "Discard empty session"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
