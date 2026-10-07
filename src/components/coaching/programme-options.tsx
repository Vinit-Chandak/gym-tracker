"use client";
import { coachingAction } from "./client-action";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NavRow } from "@/components/ui/nav-row";
import { chooseTrainingModeAction } from "@/server/actions/coaching-workflow";

/**
 * The two ways to get a programme (board Plan): rows, each its glyph, what it is, and a line on
 * what that means. On the first run the third way, not having one, is the foot's.
 */
export function ProgrammeOptions({
  onboarding = false,
}: {
  onboarding?: boolean;
  /** Kept for callers inside a box; the rows draw no box of their own. */
  nested?: boolean;
}) {
  const base = onboarding ? "/welcome/programme" : "/profile/programme";
  return (
    <ul>
      <NavRow
        href={`${base}/create` as Route}
        glyph="coach"
        label="Create with the coach"
        sub="Answer a few questions and the coach writes it."
      />
      <NavRow
        href={`${base}/manual` as Route}
        glyph="edit"
        label="Build it yourself"
        sub="Choose your own days, exercises and targets."
      />
    </ul>
  );
}

/** The first run's way past having a programme: log workouts as they come. */
export function JustTrackButton() {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = saving || navigating;
  return (
    <>
      <button
        type="button"
        disabled={busy}
        className="text-action w-full"
        onClick={async () => {
          setSaving(true);
          const result = await coachingAction(() => chooseTrainingModeAction("track"));
          if (result.ok) startNavigation(() => router.push("/today"));
          else setError(result.error);
          setSaving(false);
        }}
      >
        Just track my workouts
      </button>
      {error && (
        <p role="alert" className="type-meta-small font-semibold">
          {error}
        </p>
      )}
    </>
  );
}
