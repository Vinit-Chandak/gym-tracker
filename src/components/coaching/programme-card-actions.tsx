"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import type { ActivitySport } from "@/domain/activity";
import { copyProgramAction } from "@/server/actions/coaching-workflow";
import { coachingAction } from "./client-action";

export function ProgrammeCardActions({
  id,
  sport,
  finished = false,
}: {
  id: string;
  sport: ActivitySport;
  finished?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="training-programme-actions">
        <LinkButton
          href={`/training/programmes/${sport}`}
          variant="secondary"
          aria-label={`View ${sport} programme`}
        >
          View programme
        </LinkButton>
        {!finished && (
          <Button
            variant="ghost"
            aria-label={`Edit ${sport} programme`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await coachingAction(() => copyProgramAction(id, false));
                if (result.ok)
                  router.push(
                    (sport === "strength"
                      ? `/profile/programme/manual?draft=${result.value.id}`
                      : `/training/programmes/${sport}/edit?draft=${result.value.id}`) as Route,
                  );
                else setError(result.error);
              })
            }
          >
            {pending ? "Opening…" : "Edit"}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
