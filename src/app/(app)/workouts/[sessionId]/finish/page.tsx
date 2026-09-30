import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { FreshAfterSets } from "@/components/fresh-after-sets";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Disclosure } from "@/components/ui/disclosure";
import { HeroCard } from "@/components/ui/hero-card";
import { Dumbbell, Trophy } from "@/components/ui/icons";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { formatSets } from "@/domain/sets";
import { formatMinutes, formatSharedMetric } from "@/lib/format";
import { finishSessionAction } from "@/server/actions/sessions";
import { fromKilograms, setInUnit } from "@/lib/units";
import { LOAD_UNIT_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { seenSetChanges } from "@/server/queries/set-changes";
import { getSessionDetail, type SessionDetail } from "@/server/repositories/sessions";
import { previousMaxima } from "@/server/repositories/shared-stats";
import { readWorkouts } from "@/server/repositories/training-data";
import { requireUuid } from "@/server/validation/params";

import { FinishForm } from "./finish-form";
import Loading from "./loading";
import { finishSummary, type FinishSummary } from "./summary";

export const metadata: Metadata = { title: "Finish session" };

/**
 * The session, and what finishing it now would record: read in the same transaction as the
 * session itself, the summary's session read the one finishing makes (`readWorkouts` by id),
 * and stamped with the moment the screen was drawn.
 */
async function load(userId: string, sessionId: string) {
  return withUser(
    getDb(),
    userId,
    async (tx) => {
      const [session, { workouts }] = await Promise.all([
        getSessionDetail(tx, userId, sessionId, { includeGuidance: false }),
        readWorkouts(tx, userId, null, 0, 1, { sessionId }),
      ]);
      const workout = workouts[0];
      // A finished session is sent back to itself, so it needs no summary of its own. The
      // bests are the one grouped read finishing makes, so the preview cannot disagree with it.
      const summary =
        session && !session.completedAt && workout
          ? finishSummary(
              workout,
              new Date(),
              await previousMaxima(
                tx,
                userId,
                workout.exercises.map((slot) => slot.exerciseId),
                workout.startedAt,
              ),
            )
          : null;
      return { session, summary };
    },
    { readOnly: true },
  );
}

/** One figure of the summary: the number in the display face, the word it counts after it. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <p className="min-w-0 tabular-nums">
      <span className="block font-display text-display-m [overflow-wrap:anywhere]">{value}</span>
      <span className="mt-1 block text-sm font-semibold text-ink-muted">{label}</span>
    </p>
  );
}

/**
 * The session, summed up before it is put away: what it was, the three figures that say how
 * it went, and any record it set, filled in lifting's colour. It is the moment the workout
 * was for, so it leads; the notes and the button come after it.
 */
function SummaryHero({
  session,
  summary,
  unit,
}: {
  session: SessionDetail;
  summary: FinishSummary | null;
  unit: "kg" | "lb";
}) {
  const worked = session.exercises.filter((exercise) => exercise.sets.length > 0).length;
  const total = session.exercises.length;
  const sets =
    summary?.workingSets ??
    session.exercises.reduce(
      (sum, exercise) => sum + exercise.sets.filter((set) => set.setType !== "warmup").length,
      0,
    );
  const records = summary?.records ?? [];
  return (
    <HeroCard tone="lift">
      <p className="flex min-h-7 min-w-0 items-center gap-2 text-sm font-semibold text-ink-muted tabular-nums">
        <Dumbbell aria-hidden />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {session.gym.name}
          {summary ? `, ${formatMinutes(summary.durationSeconds / 60)}` : ""}
        </span>
      </p>
      <h2 className="font-display text-display-l [overflow-wrap:anywhere]">
        {session.day?.name ?? "Ad hoc session"}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,6rem),1fr))] gap-x-4 gap-y-3">
        <Figure value={String(sets)} label={sets === 1 ? "set" : "sets"} />
        {summary && (
          <Figure
            value={Math.round(fromKilograms(summary.volumeKg, unit)).toLocaleString("en-GB")}
            label={`${unit} lifted`}
          />
        )}
        <Figure value={`${worked}/${total}`} label={total === 1 ? "exercise" : "exercises"} />
      </div>
      {records.length > 0 && (
        <ul className="space-y-2 border-t border-line pt-4">
          {records.map((record) => (
            <li key={`${record.exerciseId}-${record.metric}`} className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-[0.75rem] bg-surface-raised"
              >
                <Trophy />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold [overflow-wrap:anywhere]">
                  {record.exerciseName}
                </span>
                <span className="block text-sm text-ink-muted tabular-nums">
                  New {record.label.toLowerCase()},{" "}
                  {formatSharedMetric(record.metric, record.value, unit)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </HeroCard>
  );
}

/** Every exercise in the session and how it stands, in the order it was done. */
function Logged({ session, unit }: { session: SessionDetail; unit: "kg" | "lb" }) {
  const worked = session.exercises.filter((exercise) => exercise.sets.length > 0).length;
  return (
    <Disclosure
      summary="What you logged"
      meta={`${worked} of ${session.exercises.length} exercises`}
    >
      <ul className="-mt-1 ruled-list">
        {session.exercises.map((exercise) => (
          <li key={exercise.id} className="py-2.5">
            <p className="font-semibold [overflow-wrap:anywhere]">{exercise.exercise.name}</p>
            <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
              {exercise.sets.length > 0
                ? formatSets(
                    exercise.sets.map((set) => setInUnit(set, exercise.equipment?.unit ?? unit)),
                    (loadUnit) => LOAD_UNIT_LABELS[loadUnit],
                  )
                : exercise.skippedAt
                  ? `Skipped${exercise.notes ? `: ${exercise.notes}` : ""}`
                  : "Nothing logged"}
            </p>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

export default async function FinishPage(props: PageProps<"/workouts/[sessionId]/finish">) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const user = await requireUser();
  // Forward, after Back, brings this screen back as it was; after a set it is rendered again.
  const seen = await seenSetChanges();
  const [profile, { session, summary }] = await Promise.all([
    getRequestProfile(user.id, user.email),
    load(user.id, sessionId),
  ]);
  const unit = profile.preferredUnit === "lb" ? "lb" : "kg";
  if (!session) notFound();
  if (session.completedAt) redirect(`/workouts/${sessionId}`);

  return (
    <FreshAfterSets seen={seen} loading={<Loading />}>
      <PageHeader title="Finish session" backHref={`/workouts/${sessionId}`} />
      <PageContent>
        <SummaryHero session={session} summary={summary} unit={unit} />
        {session.exercises.length > 0 && <Logged session={session} unit={unit} />}

        <FinishForm
          userId={user.id}
          sessionId={sessionId}
          action={finishSessionAction.bind(null, sessionId)}
          unit={unit}
          initialBodyWeight={
            session.bodyWeightKg === null ? "" : String(fromKilograms(session.bodyWeightKg, unit))
          }
          // The profile's weight is always the newest reading (ADR 0020), so no query of its own.
          lastBodyWeight={
            profile.bodyWeightKg === null ? "" : String(fromKilograms(profile.bodyWeightKg, unit))
          }
        />
      </PageContent>
    </FreshAfterSets>
  );
}
