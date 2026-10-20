"use client";

import type { Route } from "next";
import { useActionState, useState, useTransition, type ReactNode } from "react";

import { Button, LinkButton, type ButtonVariant } from "@/components/ui/button";
import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import { Field, Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import type { SlotPart } from "@/domain/types";
import { keepsOutcomeOnDisconnect } from "@/lib/offline-submit";
import {
  completeRestSlotAction,
  pickUpFromTodayAction,
  skipSlotAction,
  type ActionResult,
} from "@/server/actions/sessions";

import { CoachRequestPanel, type CoachGym } from "./coach-actions";

const INITIAL: ActionResult = { ok: true };

/** What went wrong, in ink, led by the warning glyph: never red, never a pigment. */
function ActionError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 type-meta font-semibold">
      <Glyph name="warn" className="mt-px glyph-18" />
      <span className="min-w-0 [overflow-wrap:break-word]">{children}</span>
    </p>
  );
}

/** What More options needs to offer the coach: where it can plan, and whether it may today. */
export type CoachOptions = {
  gyms: CoachGym[];
  requestsLeft: number;
  /** A request is already under way, so another would only queue behind it. */
  pending: boolean;
  hasPlan: boolean;
  workflow?: boolean;
};

/**
 * Where Start goes: the check-in, which is what creates the session (DESIGN.md, The session),
 * so a Start that goes no further leaves nothing behind. A programme day carries its day, its
 * place in the cycle and, from Train another day, the cycle it was chosen from.
 */
export function startHref(start: {
  gymId: string;
  programDayId?: string;
  dayIndex?: number;
  fromCycleIndex?: number;
}): Route {
  const params = new URLSearchParams({ gym: start.gymId });
  if (start.programDayId !== undefined && start.dayIndex !== undefined) {
    params.set("day", start.programDayId);
    params.set("index", String(start.dayIndex));
    if (start.fromCycleIndex !== undefined) params.set("cycle", String(start.fromCycleIndex));
  }
  return `/workouts/start?${params}` as Route;
}

/** Primary Start for a planned day at the chosen gym: on to its check-in. */
export function StartPlannedButton({
  gymId,
  programDayId,
  dayIndex,
  label,
  variant = "primary",
  dayName,
  fromCycleIndex,
  glyph,
  className,
}: {
  gymId: string | null;
  programDayId: string;
  dayIndex: number;
  label: string;
  variant?: ButtonVariant;
  /** Leads the label: the play glyph on the day's own Start workout. */
  glyph?: GlyphName;
  className?: string;
  /** The cycle the athlete is looking at, when they chose the day from a list of one cycle. */
  fromCycleIndex?: number;
  /**
   * Names the day when the visible label is shared by several buttons on one screen. It is
   * added to the label rather than replacing it, so that saying what the button says still
   * reaches it: an accessible name that leaves the visible words out answers to neither.
   */
  dayName?: string;
}) {
  const name = dayName ? `${label}: ${dayName}` : undefined;
  const words = (
    <>
      {glyph && <Glyph name={glyph} className="glyph-20" />}
      {label}
    </>
  );
  // Without a gym there is nowhere to train: the button stands, held, until one is chosen.
  if (gymId === null)
    return (
      <Button
        size="lg"
        variant={variant}
        aria-label={name}
        className={className ?? "w-full"}
        disabled
      >
        {words}
      </Button>
    );
  return (
    <LinkButton
      href={startHref({ gymId, programDayId, dayIndex, fromCycleIndex })}
      size="lg"
      variant={variant}
      aria-label={name}
      className={className ?? "w-full"}
    >
      {words}
    </LinkButton>
  );
}

/** An unplanned session at the chosen gym: on to its check-in. */
export function StartAdHocButton({
  gymId,
  primary = false,
}: {
  gymId: string | null;
  /** The screen's one action, for an athlete who logs their own workouts. */
  primary?: boolean;
}) {
  const label = primary ? "Start a workout" : "Start an unplanned session";
  const variant = primary ? "primary" : "secondary";
  const size = primary ? "lg" : undefined;
  if (gymId === null)
    return (
      <Button variant={variant} size={size} className="w-full" disabled>
        {label}
      </Button>
    );
  return (
    <LinkButton href={startHref({ gymId })} variant={variant} size={size} className="w-full">
      {label}
    </LinkButton>
  );
}

/**
 * What else can be done about the session Today is offering: ask the coach, or skip it. One
 * quiet control rather than two buttons, because neither is what the screen is for — and
 * skipping asks for its reason in the same sheet rather than opening a second one on top of it.
 * Training a different day, or something unplanned, is Log's (ADR 0058). With neither option,
 * there is no control.
 */
export function MoreOptions({
  skip,
  coach = null,
}: {
  /**
   * The session that can be skipped. Null on a rest day, which is completed instead. `runOwed`
   * when the day also asks for a run still to do, which skipping the workout leaves on Today.
   */
  skip: { dayIndex: number; dayName: string; runOwed?: boolean } | null;
  /** The coach's options, when the athlete has switched the coach on for a lifting day. */
  coach?: CoachOptions | null;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<"skip" | "coach" | null>(null);
  // The workout half only: a day that also runs keeps its run, which is skipped on its own.
  const [state, formAction, skipping] = useActionState(
    keepsOutcomeOnDisconnect(skipSlotAction.bind(null, skip?.dayIndex ?? 0, "session")),
    INITIAL,
  );
  const close = () => {
    setOpen(false);
    setAsking(null);
  };
  const coachRow = coach && !coach.pending;
  // One wording whichever way the coach runs, and none of it "plan", which is Plan's (ADR 0058).
  const coachLabel = coach?.hasPlan ? "Prepare this session again" : "Prepare this session";
  // Close once per successful skip (each action result is a new object).
  const [handled, setHandled] = useState<ActionResult>(INITIAL);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) close();
  }
  if (!coachRow && !skip) return null;

  const row = (glyph: GlyphName, label: ReactNode, sub?: ReactNode) => (
    <>
      <span className="grid w-5 shrink-0 place-items-center">
        <Glyph name={glyph} className="glyph-22" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[length:var(--ov-type-button)] font-semibold [overflow-wrap:break-word]">
          {label}
        </span>
        {sub}
      </span>
      <Glyph name="chevronRight" className="glyph-20 text-ink-2" />
    </>
  );
  const ROW =
    "flex min-h-[calc(56px+var(--ov-grow))] w-full items-center gap-3 text-left disabled:text-ink-2";

  return (
    <>
      <Button
        variant="tonal"
        size="lg"
        aria-label={`More options: ${coachRow && skip ? "the coach, skip" : skip ? "skip" : "the coach"}`}
        aria-haspopup="dialog"
        className="pinned-more w-[var(--ov-button)] shrink-0 px-0"
        onClick={() => setOpen(true)}
      >
        <Glyph name="more" className="glyph-24" />
      </Button>
      <Sheet
        open={open}
        onClose={close}
        title={
          asking === "skip" && skip
            ? skip.runOwed
              ? "Skip the workout?"
              : `Skip ${skip.dayName}?`
            : asking === "coach"
              ? coachLabel
              : "More options"
        }
      >
        {asking === "coach" && coach ? (
          <CoachRequestPanel
            gyms={coach.gyms}
            requestsLeft={coach.requestsLeft}
            onDone={close}
            onBack={() => setAsking(null)}
            workflow={coach.workflow}
          />
        ) : asking === "skip" && skip ? (
          <form action={formAction} className="mt-2 space-y-4">
            {/* The workout alone: titled with the day's name, the sheet read as skipping all of it. */}
            {skip.runOwed && (
              <p className="type-body [overflow-wrap:break-word] text-ink-2">
                The run stays on Today. Skip it from its own card if you are not running either.
              </p>
            )}
            <Field label="Reason" hint="Optional">
              <Input name="reason" maxLength={200} placeholder="Travelling, unwell, …" />
            </Field>
            {!state.ok && <ActionError>{state.error}</ActionError>}
            <Button type="submit" variant="danger" size="lg" className="w-full" disabled={skipping}>
              <Glyph name="skip" className="glyph-18" />
              {skipping ? "Skipping…" : skip.runOwed ? "Skip workout" : "Skip session"}
            </Button>
            <Button variant="text" className="w-full" onClick={() => setAsking(null)}>
              Back
            </Button>
          </form>
        ) : (
          <ul className="mt-1 min-w-0">
            {coachRow && (
              <li>
                <button
                  type="button"
                  onClick={() => setAsking("coach")}
                  disabled={coach.requestsLeft <= 0 || coach.gyms.length === 0}
                  className={ROW}
                >
                  {row(
                    "coach",
                    coachLabel,
                    coach.requestsLeft <= 0 && (
                      <span className="type-meta-small text-ink-2">
                        No requests left today; the coach plans overnight.
                      </span>
                    ),
                  )}
                </button>
              </li>
            )}
            {/* Skipping drops the day's workout, so it stands apart from the coach, under a rule. */}
            {skip && (
              <li className={coachRow ? "mt-3.5 border-t border-hair pt-1.5" : undefined}>
                <button type="button" onClick={() => setAsking("skip")} className={ROW}>
                  {row(
                    "skip",
                    <span className="font-bold">
                      {skip.runOwed ? "Skip the workout" : "Skip this session"}
                    </span>,
                  )}
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
    keepsOutcomeOnDisconnect(skipSlotAction.bind(null, dayIndex, part)),
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
          {!state.ok && <ActionError>{state.error}</ActionError>}
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
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}

/**
 * After a gap, the waiting sequence is a long way behind the calendar. Rather than a large
 * "behind" number, Today offers to pick up from today (owner, 11 October 2026): the days missed
 * are skipped in one go, and the programme carries on from the day it has for today. Said in
 * full before anything is written, since every missed day becomes a skip.
 */
export function PickUpFromToday({
  missed,
  resumeDayName,
}: {
  missed: readonly { cycleIndex: number; dayIndex: number; name: string }[];
  /** The day the programme has for today, which Today offers next. */
  resumeDayName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, saving] = useActionState(
    keepsOutcomeOnDisconnect(pickUpFromTodayAction),
    INITIAL,
  );
  const [handled, setHandled] = useState<ActionResult>(INITIAL);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }
  const count = missed.length;
  const sessions = `${count} ${count === 1 ? "session" : "sessions"}`;
  const listed = missed.slice(0, 6);
  return (
    <>
      {/* The count's basis is its own width, so the button goes under it, at the end, before it
          would squeeze it: from a basis of zero it stood a letter a line beside it at 200% text. */}
      <div className="pick-up flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-auto type-meta [overflow-wrap:break-word] text-ink-2">
          <span className="figures">{count}</span> {count === 1 ? "session" : "sessions"} behind
        </p>
        <Button
          variant="secondary"
          className="ml-auto"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          Pick up from today
        </Button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Pick up from today">
        <form action={formAction} className="space-y-4">
          <p className="type-body [overflow-wrap:break-word]">
            Skip the {sessions} you missed and carry on from{" "}
            {resumeDayName ? <strong>{resumeDayName}</strong> : "the day planned for today"}. They
            stay in the programme as skipped.
          </p>
          <ul className="type-meta ruled-list">
            {listed.map((day) => (
              <li key={`${day.cycleIndex}:${day.dayIndex}`} className="flex gap-2 py-2">
                <span className="min-w-0 flex-1 [overflow-wrap:break-word]">{day.name}</span>
                <span className="shrink-0 text-ink-2">Cycle {day.cycleIndex}</span>
              </li>
            ))}
            {count > listed.length && (
              <li className="py-2 text-ink-2">and {count - listed.length} more</li>
            )}
          </ul>
          {!state.ok && <ActionError>{state.error}</ActionError>}
          <Button type="submit" size="lg" className="w-full" disabled={saving}>
            {saving ? "Skipping…" : `Skip ${sessions} and pick up`}
          </Button>
          <Button variant="text" className="w-full" onClick={() => setOpen(false)}>
            Keep them waiting
          </Button>
        </form>
      </Sheet>
    </>
  );
}
