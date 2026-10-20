import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { SetupCoach } from "@/components/coaching/setup-coach";
import { NavRow } from "@/components/ui/nav-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { placeInSentence } from "@/lib/setup-place";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { pendingFirstProgramme, readSetupState, setupStepsOf } from "@/server/queries/setup-state";

import { OnboardingFrame } from "../onboarding-frame";
import { LogOwnWorkouts } from "./log-own-workouts";

export const metadata: Metadata = { title: "Your plan" };

/**
 * Setup's last step for a lifter. Which one depends on "Which sounds like you?":
 *
 * - New to this (board Your first programme): the coach's questions, on one screen, with "Just
 *   log workouts for now" as the way past. A beginner is not handed a six-day template.
 * - Already trains (board How do you want to start?): logging their own workouts, the main
 *   action, since most arrive with a plan of their own; or their split, or the coach, each on
 *   its own screen. A ready-made programme to follow is not offered (ADR 0058).
 *
 * A programme the coach is writing, or has written, is listed at the top so it is never lost.
 */
export default async function WelcomeProgrammePage() {
  const user = await requireProfiledUser();
  const profile = await getRequestProfile(user.id, user.email, user.displayName);
  const { state, pending } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const state = await readSetupState(tx, user.id, profile.trainingExperience);
      return { state, pending: state.place ? await pendingFirstProgramme(tx, user.id) : null };
    },
    { readOnly: true },
  );
  if (state.experience === null || state.sports === null || !state.sports.includes("strength"))
    redirect("/welcome");
  if (!state.place) redirect("/welcome/gym");
  const place = state.place;
  const experienced = state.experience === "experienced";
  // Back follows the athlete's own path: the equipment step where they had one (B6).
  const back: Route = experienced || place.kind !== "gym" ? "/welcome/equipment" : "/welcome/gym";

  const waiting = pending && (
    <ul className="mt-3 border-y border-hair">
      {"draftId" in pending ? (
        <NavRow
          href={`/welcome/programme/drafts/${pending.draftId}` as Route}
          glyph="table"
          label="Your programme is ready"
          sub="Read it, then start it"
        />
      ) : (
        <NavRow
          href={`/welcome/programme/jobs/${pending.jobId}` as Route}
          glyph="coach"
          label="The coach is writing your programme"
          sub="See how it is getting on"
        />
      )}
    </ul>
  );

  if (!experienced)
    return (
      <OnboardingFrame
        steps={setupStepsOf(state)}
        current="plan"
        back={back}
        title="Your first programme"
        sub="The coach writes it around your week. You see it before it starts."
      >
        {waiting}
        <SetupCoach
          userId={user.id}
          profile={profile}
          place={place}
          runs={state.sports.includes("running")}
          detailed={false}
        />
      </OnboardingFrame>
    );

  return (
    <OnboardingFrame
      steps={setupStepsOf(state)}
      current="start"
      back={back}
      title="How do you want to start?"
      sub="Logging is enough: suggestions learn from every set you save. A plan can come any time."
    >
      {waiting}
      <ul className="mt-5 border-y border-hair">
        <NavRow
          href="/welcome/programme/split"
          glyph="edit"
          label="Set up my split"
          sub="Your days, and the exercises on each."
        />
        <NavRow
          href="/welcome/programme/create"
          glyph="coach"
          label="Let the coach write it"
          sub={`It already knows ${placeInSentence(place)} and that you train.`}
        />
      </ul>
      <LogOwnWorkouts />
    </OnboardingFrame>
  );
}
