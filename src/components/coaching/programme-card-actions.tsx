"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import type { ActivitySport } from "@/domain/activity";
import { copyProgramAction } from "@/server/actions/coaching-workflow";
import { coachingAction } from "./client-action";

export function ProgrammeCardActions({ id, sport }: { id: string; sport: ActivitySport }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
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
        <LinkButton
          href={`/training/programmes/new?sport=${sport}`}
          variant="ghost"
          aria-label={`Replace ${sport} programme`}
        >
          Replace programme
        </LinkButton>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
