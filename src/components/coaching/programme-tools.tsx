"use client";
import { coachingAction } from "./client-action";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import type { ActivitySport } from "@/domain/activity";
import { copyProgramAction } from "@/server/actions/coaching-workflow";
import { RetireProgramme } from "./retire-programme";

/**
 * Editing is the everyday action, with More options beside it, one width each (DESIGN.md, The
 * Equal Actions Rule; owner, 28 October 2026). More options opens a sheet holding the programme's
 * notes and its rarer actions together: Replace, Duplicate and End (ADR 0058). A past programme's
 * one action, Duplicate programme, stands as itself: a sheet never holds a single action.
 */
export function ProgrammeTools({
  id,
  active = true,
  finished = false,
  sport = "strength",
  details,
}: {
  id: string;
  active?: boolean;
  /** Nothing but rest is left (ADR 0051): "Edit future programme" would edit nothing. */
  finished?: boolean;
  sport?: ActivitySport;
  /** The programme's notes and dates, read under More options rather than on the page. */
  details?: ReactNode;
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [more, setMore] = useState(false);
  const pending = busy || navigating;
  async function copy(duplicate: boolean) {
    setBusy(true);
    setError(null);
    const result = await coachingAction(() => copyProgramAction(id, duplicate));
    if (result.ok)
      startNavigation(() =>
        // Each sport's builder is under its programme's page, strength's too.
        router.push(`/plan/${result.value.sport}/edit?draft=${result.value.id}` as Route),
      );
    else setError(result.error);
    setBusy(false);
  }
  return (
    <div className="space-y-2">
      {/* A failure is said where the action was tapped: in the sheet while it is open, where
          the page behind its modal is neither seen nor heard. */}
      {!more && <FormError message={error ?? undefined} />}
      <div className="programme-management action-row">
        {active && !finished && (
          <Button variant="primary" disabled={pending} onClick={() => copy(false)}>
            {pending ? "Opening…" : "Edit programme"}
          </Button>
        )}
        {active && finished && (
          <LinkButton href={`/plan/new?sport=${sport}` as Route}>New programme</LinkButton>
        )}
        {active ? (
          <Button
            variant="tonal"
            aria-haspopup="dialog"
            onClick={() => {
              // An earlier failure on the page is not the sheet's to repeat.
              setError(null);
              setMore(true);
            }}
          >
            More options
          </Button>
        ) : (
          <Button variant="secondary" disabled={pending} onClick={() => copy(true)}>
            {pending ? "Opening…" : "Duplicate programme"}
          </Button>
        )}
      </div>
      {active && (
        <Sheet open={more} onClose={() => setMore(false)} title="More options">
          <div className="space-y-[var(--ov-gap-block)]">
            {details && (
              <section aria-labelledby={`${id}-details`} className="space-y-1">
                <h3 id={`${id}-details`} className="type-heading">
                  Programme details
                </h3>
                {details}
              </section>
            )}
            <div className="space-y-2">
              <FormError message={error ?? undefined} />
              {!finished && (
                <LinkButton
                  href={`/plan/new?sport=${sport}` as Route}
                  variant="secondary"
                  className="w-full"
                >
                  Replace programme
                </LinkButton>
              )}
              <Button
                variant="secondary"
                className="w-full"
                disabled={pending}
                onClick={() => copy(true)}
              >
                {pending ? "Opening…" : "Duplicate programme"}
              </Button>
              <RetireProgramme id={id} sport={sport} disabled={pending} />
            </div>
          </div>
        </Sheet>
      )}
      {/* The pressed button already reads "Opening…"; a screen reader hears where it goes. */}
      <p role="status" className="sr-only">
        {navigating ? "Opening programme draft…" : ""}
      </p>
    </div>
  );
}
