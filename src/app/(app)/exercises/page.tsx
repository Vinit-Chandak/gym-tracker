import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { listExercises } from "@/server/repositories/exercises";

import { ExerciseLibrary } from "./exercise-library";

export const metadata: Metadata = { title: "Exercises" };

export default async function ExercisesPage() {
  const user = await requireUser();
  const exercises = await withUser(getDb(), user.id, (tx) => listExercises(tx));
  return (
    <>
      <PageHeader title="Exercises" backHref="/settings" />
      <PageContent>
        <ExerciseLibrary exercises={exercises} />
      </PageContent>
    </>
  );
}
