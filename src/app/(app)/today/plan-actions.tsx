"use client";

import { ChevronRight } from "@/components/ui/icons";
import Link from "@/components/ui/app-link";
import { useActionState, useState, useTransition } from "react";

import { Button, type ButtonVariant } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { Sheet } from "@/components/ui/sheet";
import type { SlotPart } from "@/domain/types";
import { cn } from "@/lib/utils";
import {
  completeRestSlotAction,
  discardSessionAction,
  skipSlotAction,
  startAdHocSessionAction,
  startPlannedSessionAction,
  type ActionResult,
} from "@/server/actions/sessions";

import { CoachRequestPanel, type CoachGym } from "./coach-actions";

const INITIAL: ActionResult = { ok: true };

/** What More options needs to offer the coach: where it can plan, and whether it may today. */
export type CoachOptions = {
  gyms: CoachGym[];
  requestsLeft: number;
  /** A request is already under way, so another would only queue behind it. */
  pending: boolean;
  hasPlan: boolean;
};

/** Primary Start button for a planned day at the default gym. */
export function StartPlannedButton({
  gymId,
  programDayId,
  dayIndex,
  label,
  variant = "primary",
  dayName,
  fromCycleIndex,
}: {
  gymId: string | null;
  programDayId: string;
  dayIndex: number;
  label: string;
  variant?: ButtonVariant;
  /** The cycle the athlete is looking at, when they chose the day from a list of one cycle. */
  fromCycleIndex?: number;
  /**
   * Names the day when the visible label is shared by several buttons on one screen. It is
   * added to the label rather than replacing it, so that saying what the button says still
   * reaches it: an accessible name that leaves the visible words out answers to neither.
   */
  dayName?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      variant={variant}
      aria-label={dayName ? `${label}: ${dayName}` : undefined}
      className="w-full"
      disabled={gymId === null || pending}
      onClick={() => {
        if (!gymId) return;
        startTransition(() =>
          startPlannedSessionAction(gymId, programDayId, dayIndex, fromCycleIndex),
        );
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
  coach = null,
}: {
  gymId: string | null;
  /** The session that can be skipped. Null on a rest day, which is completed instead. */
  skip: { dayIndex: number; dayName: string } | null;
  /** The coach's options, when the athlete has switched the coach on for a lifting day. */
  coach?: CoachOptions | null;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<"skip" | "coach" | null>(null);
  const [pending, startTransition] = useTransition();
  // The workout half only: a day that also runs keeps its run, which is skipped on its own.
  const [state, formAction, skipping] = useActionState(
    skipSlotAction.bind(null, skip?.dayIndex ?? 0, "session"),
    INITIAL,
  );
  const close = () => {
    setOpen(false);
    setAsking(null);
  };
  const coachRow = coach && !coach.pending;
  const coachLabel = coach?.hasPlan ? "Re-plan with the coach" : "Ask the coach for a plan";
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
        title={
          asking === "skip" && skip
            ? `Skip ${skip.dayName}?`
            : asking === "coach"
              ? "Plan with the coach"
              : "More options"
        }
      >
        {asking === "coach" && coach ? (
          <CoachRequestPanel
            gyms={coach.gyms}
            requestsLeft={coach.requestsLeft}
            onDone={close}
            onBack={() => setAsking(null)}
          />
        ) : asking === "skip" && skip ? (
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
            <Button variant="ghost" className="w-full" onClick={() => setAsking(null)}>
              Back
            </Button>
          </form>
        ) : (
          <ul className="min-w-0 ruled-list">
            <li>
              <Link href="/today/choose" className={PRESSABLE_ROW_CLASS} onClick={close}>
                <span className="min-w-0 flex-1 font-medium">Train another day</span>
                <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
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
            {coachRow && (
              <li>
                <button
                  type="button"
                  onClick={() => setAsking("coach")}
                  disabled={coach.requestsLeft <= 0 || coach.gyms.length === 0}
                  className={cn(PRESSABLE_ROW_CLASS, "disabled:opacity-45")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{coachLabel}</span>
                    {coach.requestsLeft <= 0 && (
                      <span className="block text-sm text-ink-muted">
                        No requests left today; the coach plans overnight.
                      </span>
                    )}
                  </span>
                  <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
                </button>
              </li>
            )}
            {skip && (
              <li>
                <button
                  type="button"
                  onClick={() => setAsking("skip")}
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

/**
 * Skips one half of a day on its own, with its reason. The run and the workout are separate
 * tasks, so each has its own way out: skipping the run leaves the workout owed, and vice versa.
 */
export function SkipPartButton({
  dayIndex,
  part,
  title,
  label,
}: {
  dayIndex: number;
  part: SlotPart;
  /** What the sheet asks, e.g. "Skip today's run?". */
  title: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, skipping] = useActionState(
    skipSlotAction.bind(null, dayIndex, part),
    INITIAL,
  );
  const [handled, setHandled] = useState<ActionResult>(INITIAL);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="w-full" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
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
            {skipping ? "Skipping…" : label}
          </Button>
        </form>
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
