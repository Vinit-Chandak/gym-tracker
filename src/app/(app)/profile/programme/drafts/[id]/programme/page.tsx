import { eq, isNull, or } from "drizzle-orm";
import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PageContent } from "@/components/shell/page-content";
import { ActivityPlan } from "@/components/activities/activity-plan";
import { PageHeader } from "@/components/shell/page-header";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { exercises } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { prescriptionTypeOf, type ProgramBlueprint } from "@/domain/program-blueprint";
import { progress } from "@/domain/schedule";
import type { ExerciseModality } from "@/domain/types";
import { requireUser } from "@/server/auth";
import { sharedWarmupProtocols } from "@/server/queries/reference";
import { getProgramDraft } from "@/server/repositories/program-drafts";
import { getSchedule, type ProgramDayPlan } from "@/server/repositories/schedule";
import { readSportUnits } from "@/server/repositories/sport-preferences";

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
  names: ReadonlyMap<string, { name: string; modality: ExerciseModality }>,
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
          name: names.get(exercise.exerciseSlug)?.name ?? exercise.exerciseSlug,
          modality: names.get(exercise.exerciseSlug)?.modality ?? null,
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
        // A change not yet made has trained nothing.
        print: null,
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
      const [library, warmups, schedule, runUnits] = await Promise.all([
        tx
          .select({ slug: exercises.slug, name: exercises.name, modality: exercises.modality })
          .from(exercises)
          .where(or(isNull(exercises.userId), eq(exercises.userId, user.id))),
        sharedWarmupProtocols(tx),
        getSchedule(tx, user.id),
        readSportUnits(tx, user.id),
      ]);
      const week =
        schedule && schedule.program.id === draft.baseProgramId
          ? Math.min(progress(schedule.state).currentCycle, draft.blueprint.weeks)
          : 1;
      return { draft, library, warmups, week, runUnits };
    },
    { readOnly: true },
  );
  if (!data) notFound();
  if (data.draft.sport !== "strength")
    return (
      <>
        <PageHeader
          title={data.draft.blueprint.name}
          backHref={`/profile/programme/drafts/${data.draft.id}`}
        />
        <PageContent>
          {(data.draft.blueprint.enduranceSessions ?? []).map((session, index) => (
            <section
              key={`${session.lineageId}:${session.weekIndex}:${index}`}
              className="space-y-2"
            >
              <h2 className="font-medium">
                Week {session.weekIndex} · Day {session.dayOffset + 1}
              </h2>
              <ActivityPlan
                sport={session.prescription.sport}
                prescription={session.prescription}
                units={data.runUnits}
                showSource={false}
              />
            </section>
          ))}
        </PageContent>
      </>
    );
  const days = daysOf(
    data.draft.blueprint,
    new Map(data.library.map((row) => [row.slug, { name: row.name, modality: row.modality }])),
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
          {/* A list of folds is ruled rows that share their rules (DESIGN.md, Folds). */}
          <ul className="[&>li+li]:-mt-px">
            {days.map((plan) => (
              <li key={plan.day.id}>
                <CycleDay plan={plan} units={data.runUnits} />
              </li>
            ))}
          </ul>
        </Section>
      </PageContent>
    </>
  );
}
