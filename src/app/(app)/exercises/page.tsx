import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/button";

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
  const exercises = await withUser(getDb(), user.id, (tx) => listExercises(tx), { readOnly: true });
  return (
    <>
      <PageHeader
        title="Exercises"
        meta={`${exercises.filter((exercise) => exercise.isActive).length} in the library`}
        backHref="/profile"
        action={
          <LinkButton
            href="/exercises/new"
            variant="secondary"
            size="sm"
            aria-label="Add your own exercise"
          >
            Add
          </LinkButton>
        }
      />
      <PageContent>
        <ExerciseLibrary exercises={exercises} />
      </PageContent>
    </>
  );
}
