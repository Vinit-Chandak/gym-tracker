import { eq, isNull, or } from "drizzle-orm";
import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { exercises } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { prescriptionTypeOf, type ProgramBlueprint } from "@/domain/program-blueprint";
import { progress } from "@/domain/schedule";
import { requireUser } from "@/server/auth";
import { sharedWarmupProtocols } from "@/server/queries/reference";
import { getProgramDraft } from "@/server/repositories/program-drafts";
import { getSchedule, type ProgramDayPlan } from "@/server/repositories/schedule";

import { CycleDay } from "../../../cycle-day";

export const metadata: Metadata = { title: "Full programme" };

/**
 * A change's whole programme, drawn exactly as Cycle draws the one being trained.
 *
 * The change screen shows only what differs; this is for the athlete who wants to see the
 * whole of what they would be training — after the difference, not instead of it. Runs are
 * shown for the week the athlete is in, as Cycle shows them.
 */
function daysOf(
  blueprint: ProgramBlueprint,
  names: ReadonlyMap<string, string>,
  warmups: ReadonlyMap<string, string>,
  week: number,
): ProgramDayPlan[] {
  return [...blueprint.days]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((day) => {
      const run = day.includesRun
        ? (blueprint.runs.find(
            (entry) => entry.weekIndex === week && entry.dayOfWeek === day.dayOfWeek,
          ) ?? null)
        : null;
      return {
        day: {
          id: `day-${day.dayIndex}`,
          dayOfWeek: day.dayOfWeek,
          dayIndex: day.dayIndex,
          name: day.name,
          focus: day.focus || null,
          includesLifting: day.includesLifting,
          includesRun: day.includesRun,
          timeNote: day.timeNote || null,
          effortNote: day.effortNote || null,
          notes: day.notes || null,
          warmupProtocolId: null,
        },
        exercises: day.exercises.map((exercise, index) => ({
          programExerciseId: `${day.dayIndex}-${index}`,
          exerciseId: exercise.exerciseSlug,
          name: names.get(exercise.exerciseSlug) ?? exercise.exerciseSlug,
          sets: exercise.sets,
          prescriptionType: prescriptionTypeOf(exercise),
          repMin: exercise.reps?.[0] ?? null,
          repMax: exercise.reps?.[1] ?? null,
          durationMinSeconds: exercise.duration?.[0] ?? null,
          durationMaxSeconds: exercise.duration?.[1] ?? null,
          distanceMinMeters: exercise.distance?.[0] ?? null,
          distanceMaxMeters: exercise.distance?.[1] ?? null,
          perSide: exercise.perSide ?? false,
          rirMin: exercise.rir?.[0] ?? null,
          rirMax: exercise.rir?.[1] ?? null,
          supersetGroup: exercise.supersetGroup ?? null,
        })),
        warmupName: day.warmupSlug ? (warmups.get(day.warmupSlug) ?? null) : null,
        run: run
          ? {
              id: `run-${run.weekIndex}-${run.dayOfWeek}`,
              durationMinMinutes: run.duration[0],
              durationMaxMinutes: run.duration[1],
              distanceMinKm: run.distanceKm?.[0] ?? null,
              distanceMaxKm: run.distanceKm?.[1] ?? null,
              rpeMin: run.rpe[0],
              rpeMax: run.rpe[1],
              paceNote: run.paceNote || null,
              progressionNote: run.progressionNote || null,
              stopRule: run.stopRule || null,
              comment: run.comment ?? null,
            }
          : null,
        status: "pending" as const,
        isNext: false,
      };
    });
}

export default async function DraftProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const draft = await getProgramDraft(tx, user.id, id);
      if (!draft) return null;
      const [library, warmups, schedule] = await Promise.all([
        tx
          .select({ slug: exercises.slug, name: exercises.name })
          .from(exercises)
          .where(or(isNull(exercises.userId), eq(exercises.userId, user.id))),
        sharedWarmupProtocols(tx),
        getSchedule(tx, user.id),
      ]);
      const week =
        schedule && schedule.program.id === draft.baseProgramId
          ? Math.min(progress(schedule.state).currentCycle, draft.blueprint.weeks)
          : 1;
      return { draft, library, warmups, week };
    },
    { readOnly: true },
  );
  if (!data) notFound();
  const days = daysOf(
    data.draft.blueprint,
    new Map(data.library.map((row) => [row.slug, row.name])),
    new Map(data.warmups.map((row) => [row.slug, row.name])),
    data.week,
  );
  const open = data.draft.status === "editing" || data.draft.status === "ready";
  return (
    <>
      <PageHeader
        title={open ? "With these changes" : "Full programme"}
        backHref={`/profile/programme/drafts/${data.draft.id}` as Route}
      />
      <PageContent>
        <Section title={`${data.draft.blueprint.name} · week ${data.week}`}>
          <ul className="space-y-3">
            {days.map((plan) => (
              <li key={plan.day.id}>
                <CycleDay plan={plan} />
              </li>
            ))}
          </ul>
        </Section>
      </PageContent>
    </>
  );
}
