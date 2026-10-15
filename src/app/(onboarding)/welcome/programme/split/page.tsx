import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readSetupState, setupStepsOf } from "@/server/queries/setup-state";
import { listExercises } from "@/server/repositories/exercises";

import { SplitBuilder } from "./split-builder";

export const metadata: Metadata = { title: "Your split" };

/** Board Your split: someone who already trains sets down the split they follow. */
export default async function WelcomeSplitPage() {
  const user = await requireProfiledUser();
  const profile = await getRequestProfile(user.id, user.email, user.displayName);
  const { state, library } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [state, library] = await Promise.all([
        readSetupState(tx, user.id, profile.trainingExperience),
        listExercises(tx),
      ]);
      return { state, library: library.filter((exercise) => exercise.isActive) };
    },
    { readOnly: true },
  );
  if (state.experience === null || state.sports === null || !state.sports.includes("strength"))
    redirect("/welcome");
  if (!state.place) redirect("/welcome/gym");

  return (
    <SplitBuilder
      steps={setupStepsOf(state)}
      library={library}
      today={todayInTimeZone(profile.timeZone)}
    />
  );
}
