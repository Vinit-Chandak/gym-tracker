"use client";
import { coachingAction } from "./client-action";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import type { ActivitySport } from "@/domain/activity";
import { copyProgramAction, archiveProgramAction } from "@/server/actions/coaching-workflow";

/**
 * Editing is the everyday action. Replacement, duplication and archiving stay together under
 * More options. Archiving still explains which sessions it closes before it is confirmed.
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
    [archive, setArchive] = useState(false),
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
            : `/training/programmes/${result.value.sport}/edit?draft=${result.value.id}`) as Route,
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
          <LinkButton href={`/training/programmes/new?sport=${sport}`}>
            Plan your next programme
          </LinkButton>
        )}
        <Disclosure summary="More options" variant="inline" className="programme-management-more">
          <div className="space-y-2">
            {active && !finished && (
              <LinkButton
                href={`/training/programmes/new?sport=${sport}`}
                variant="secondary"
                className="w-full"
              >
                Replace programme
              </LinkButton>
            )}
            <Button variant="secondary" disabled={pending} onClick={() => copy(true)}>
              Duplicate programme
            </Button>
            {active &&
              (archive ? (
                <div className="space-y-3 rounded-control bg-surface-raised p-3 text-sm">
                  <p>
                    Archive this programme and stop scheduling its future sessions? Your completed
                    workouts remain in history. Its sessions still owed or skipped can then only be
                    logged on their own. You can duplicate the archived programme later.
                  </p>
                  <div className="grid gap-2 min-[420px]:grid-cols-2">
                    <Button
                      variant="danger"
                      disabled={pending}
                      onClick={async () => {
                        setBusy(true);
                        const result = await coachingAction(() => archiveProgramAction(id));
                        if (!result.ok) setError(result.error);
                        else router.refresh();
                        setArchive(false);
                        setBusy(false);
                      }}
                    >
                      Archive this programme
                    </Button>
                    <Button variant="ghost" onClick={() => setArchive(false)}>
                      Keep it
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className="flex w-full"
                  disabled={pending}
                  onClick={() => setArchive(true)}
                >
                  Archive programme
                </Button>
              ))}
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
