"use client";

import type { Route } from "next";
import Link from "@/components/ui/app-link";
import { useActionState, useState, useTransition, type ReactNode } from "react";

import { Button, LinkButton, type ButtonVariant } from "@/components/ui/button";
import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import { Field, Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import type { SlotPart } from "@/domain/types";
import { keepsOutcomeOnDisconnect } from "@/lib/offline-submit";
import {
  completeRestSlotAction,
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
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
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
export function StartAdHocButton({ gymId }: { gymId: string | null }) {
  const label = "Start an unplanned session";
  if (gymId === null)
    return (
      <Button variant="secondary" className="w-full" disabled>
        {label}
      </Button>
    );
  return (
    <LinkButton href={startHref({ gymId })} variant="secondary" className="w-full">
      {label}
    </LinkButton>
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
  const coachLabel = coach?.workflow
    ? coach.hasPlan
      ? "Prepare this session again"
      : "Prepare this session"
    : coach?.hasPlan
      ? "Re-plan with the coach"
      : "Ask the coach for a plan";
  // Close once per successful skip (each action result is a new object).
  const [handled, setHandled] = useState<ActionResult>(INITIAL);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) close();
  }

  const row = (glyph: GlyphName, label: ReactNode, sub?: ReactNode) => (
    <>
      <span className="grid w-5 shrink-0 place-items-center">
        <Glyph name={glyph} className="glyph-22" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[length:var(--ov-type-button)] font-semibold [overflow-wrap:anywhere]">
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
        aria-label="More options: another day, unplanned, the coach, skip"
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
            workflow={coach.workflow}
          />
        ) : asking === "skip" && skip ? (
          <form action={formAction} className="mt-2 space-y-4">
            <Field label="Reason" hint="Optional">
              <Input name="reason" maxLength={200} placeholder="Travelling, unwell, …" />
            </Field>
            {!state.ok && <ActionError>{state.error}</ActionError>}
            <Button type="submit" variant="danger" size="lg" className="w-full" disabled={skipping}>
              <Glyph name="skip" className="glyph-18" />
              {skipping ? "Skipping…" : "Skip session"}
            </Button>
            <Button variant="text" className="w-full" onClick={() => setAsking(null)}>
              Back
            </Button>
          </form>
        ) : (
          <ul className="mt-1 min-w-0">
            <li className="border-b border-hair">
              <Link href="/today/choose" className={ROW} onClick={close}>
                {row("calendar", "Train another day")}
              </Link>
            </li>
            <li className={coachRow ? "border-b border-hair" : undefined}>
              {gymId === null ? (
                <button type="button" disabled className={ROW}>
                  {row("plus", "Start an unplanned session")}
                </button>
              ) : (
                <Link href={startHref({ gymId })} className={ROW} onClick={close}>
                  {row("plus", "Start an unplanned session")}
                </Link>
              )}
            </li>
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
            {/* Skipping drops the day, so it stands apart from the rest, under a rule. */}
            {skip && (
              <li className="mt-3.5 border-t border-hair pt-1.5">
                <button type="button" onClick={() => setAsking("skip")} className={ROW}>
                  {row("skip", <span className="font-bold">Skip this session</span>)}
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
