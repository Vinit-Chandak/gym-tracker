"use client";
import { coachingAction } from "./client-action";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import type { ActivitySport } from "@/domain/activity";
import { copyProgramAction } from "@/server/actions/coaching-workflow";
import { RetireProgramme } from "./retire-programme";

/**
 * Editing is the everyday action. Replacement, duplication and ending the programme stay
 * together under More options, on the programme's own page (ADR 0058).
 */
export function ProgrammeTools({
  id,
  active = true,
  finished = false,
  sport = "strength",
}: {
  id: string;
  active?: boolean;
  /** Nothing but rest is left (ADR 0051): "Edit future programme" would edit nothing. */
  finished?: boolean;
  sport?: ActivitySport;
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const pending = busy || navigating;
  async function copy(duplicate: boolean) {
    setBusy(true);
    setError(null);
    const result = await coachingAction(() => copyProgramAction(id, duplicate));
    if (result.ok)
      startNavigation(() =>
        router.push(
          (result.value.sport === "strength"
            ? `/profile/programme/manual?draft=${result.value.id}`
            : `/plan/${result.value.sport}/edit?draft=${result.value.id}`) as Route,
        ),
      );
    else setError(result.error);
    setBusy(false);
  }
  return (
    <div className="space-y-2">
      <div className="programme-management">
        {active && !finished && (
          <Button variant="primary" disabled={pending} onClick={() => copy(false)}>
            {pending ? "Opening…" : "Edit programme"}
          </Button>
        )}
        {active && finished && (
          <LinkButton href={`/plan/new?sport=${sport}` as Route}>New programme</LinkButton>
        )}
        <Disclosure summary="More options" variant="inline" className="programme-management-more">
          <div className="space-y-2">
            {active && !finished && (
              <LinkButton
                href={`/plan/new?sport=${sport}` as Route}
                variant="secondary"
                className="w-full"
              >
                Replace programme
              </LinkButton>
            )}
            <Button variant="secondary" disabled={pending} onClick={() => copy(true)}>
              Duplicate programme
            </Button>
            {active && <RetireProgramme id={id} sport={sport} disabled={pending} />}
          </div>
        </Disclosure>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {navigating && (
        <p role="status" className="text-sm text-ink-2">
          Opening programme draft…
        </p>
      )}
    </div>
  );
}
