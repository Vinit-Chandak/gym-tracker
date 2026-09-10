"use client";

import { ChevronRight } from "lucide-react";
import Link from "@/components/ui/app-link";
import { useActionState, useState, useTransition } from "react";

import { Button, type ButtonVariant } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
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

/**
 * Everything Today can do other than the session it is offering: train a different day of
 * the cycle, log something outside the programme, or skip. One quiet control rather than
 * three buttons, because none of them is what the screen is for — and skipping asks for its
 * reason in the same sheet rather than opening a second one on top of it.
 */
export function MoreOptions({
  gymId,
  skip,
}: {
  gymId: string | null;
  /** The session that can be skipped. Null on a rest day, which is completed instead. */
  skip: { dayIndex: number; dayName: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, formAction, skipping] = useActionState(
    skipSlotAction.bind(null, skip?.dayIndex ?? 0),
    INITIAL,
  );
  const close = () => {
    setOpen(false);
    setAsking(false);
  };
  // Close once per successful skip (each action result is a new object).
  const [handled, setHandled] = useState<ActionResult>(INITIAL);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) close();
  }

  return (
    <>
      <Button variant="ghost" className="w-full" onClick={() => setOpen(true)}>
        More options
      </Button>
      <Sheet
        open={open}
        onClose={close}
        title={asking && skip ? `Skip ${skip.dayName}?` : "More options"}
      >
        {asking && skip ? (
          <form action={formAction} className="space-y-4">
            <Field label="Reason" hint="Optional">
              <Input name="reason" maxLength={200} placeholder="Travelling, unwell, …" />
            </Field>
            {!state.ok && (
              <p role="alert" className="text-sm text-danger">
                {state.error}
              </p>
            )}
            <Button type="submit" variant="danger" size="lg" className="w-full" disabled={skipping}>
              {skipping ? "Skipping…" : "Skip session"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setAsking(false)}>
              Back
            </Button>
          </form>
        ) : (
          <ul className="min-w-0 ruled-list">
            <li>
              <Link href="/today/choose" className={PRESSABLE_ROW_CLASS} onClick={close}>
                <span className="min-w-0 flex-1 font-medium">Train another day</span>
                <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
              </Link>
            </li>
            <li>
              <button
                type="button"
                disabled={gymId === null || pending}
                onClick={() => {
                  if (!gymId) return;
                  startTransition(() => startAdHocSessionAction(gymId));
                }}
                className={cn(PRESSABLE_ROW_CLASS, "disabled:opacity-45")}
              >
                <span className="min-w-0 flex-1 font-medium">
                  {pending ? "Starting…" : "Start an ad hoc session"}
                </span>
              </button>
            </li>
            {skip && (
              <li>
                <button
                  type="button"
                  onClick={() => setAsking(true)}
                  className={PRESSABLE_ROW_CLASS}
                >
                  <span className="min-w-0 flex-1 font-medium text-danger">Skip this session</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </Sheet>
    </>
  );
}

export function CompleteRestButton({
  dayIndex,
  label = "Mark rest day done",
}: {
  dayIndex: number;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await completeRestSlotAction(dayIndex);
            setError(result.ok ? null : result.error);
          })
        }
      >
        {pending ? "Saving…" : label}
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
