import { SubmitButton } from "@/components/ui/form";
import { Dumbbell, ExternalLink } from "@/components/ui/icons";
import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";

import { AvailabilityBadge } from "@/components/availability-badge";
import { FriendsBoardCard } from "@/components/friends-board-card";
import { ExerciseBestsTiles } from "@/components/records-card";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClassName, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeroCard } from "@/components/ui/hero-card";
import { InfoTip } from "@/components/ui/info-tip";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import type { Resolution } from "@/domain/equipment-resolution";
import { performanceSeries } from "@/domain/analytics";
import { topWithYou } from "@/domain/leaderboard";
import { isComparable, primaryMetric } from "@/domain/shared-stats";
import { formatSets } from "@/domain/sets";
import { formatDay, formatKilograms } from "@/lib/format";
import { setInUnit } from "@/lib/units";
import {
  EXERCISE_CATEGORY_LABELS,
  EXERCISE_MODALITY_LABELS,
  LOAD_PORTABILITY_HELP,
  LOAD_PORTABILITY_LABELS,
  LOAD_UNIT_LABELS,
  MEASURE_COLUMN_LABELS,
  MUSCLE_LABELS,
  rangeLabel,
  restLabel,
  rirMeaning,
} from "@/lib/labels";
import { setPreferredMachineAction } from "@/server/actions/availability";
import { requireUser } from "@/server/auth";
import { loadCircle, rankExercise } from "@/server/queries/leaderboard";
import { getRequestProfile } from "@/server/queries/request-profile";
import { recentPerformances } from "@/server/queries/comparable";
import {
  exerciseAvailability,
  type ExerciseGymAvailability,
} from "@/server/repositories/availability";
import { getExercise, type ExerciseProgramUsage } from "@/server/repositories/exercises";
import { readExerciseBests } from "@/server/repositories/shared-stats";
import { readWorkouts, TRAINING_RECORD_LIMIT } from "@/server/repositories/training-data";
import { parseDateRangeOrDefault } from "@/server/validation/date-range";
import { requireUuid } from "@/server/validation/params";

import { ExerciseTrend } from "./exercise-trend";

export const metadata: Metadata = { title: "Exercise" };

function prescription(usage: ExerciseProgramUsage): string {
  const range =
    usage.prescriptionType === "duration"
      ? rangeLabel(usage.durationMinSeconds, usage.durationMaxSeconds, " s")
      : usage.prescriptionType === "distance"
        ? rangeLabel(usage.distanceMinMeters, usage.distanceMaxMeters, " m")
        : rangeLabel(usage.repMin, usage.repMax);
  const volume = `${usage.sets} × ${range}`;
  const side = usage.perSide ? " per side" : "";
  return `${volume}${side} @ ${rangeLabel(usage.rirMin, usage.rirMax)} RIR, rest ${restLabel(usage.restMinSeconds, usage.restMaxSeconds)}`;
}

function availabilityDetail(entry: ExerciseGymAvailability): string {
  const r: Resolution = entry.resolution;
  switch (r.status) {
    case "direct":
      return r.equipmentInstance ? `On ${r.equipmentInstance.name}` : "Free weights or bodyweight";
    case "fallback":
      return `Do ${entry.resolvedExerciseName}${r.equipmentInstance ? ` on ${r.equipmentInstance.name}` : ""} instead`;
    case "unknown":
      return `Needs: ${entry.missingTypes.map((t) => t.name).join(" or ")}. Add the machine to this gym, or mark it as not available.`;
    case "unavailable":
      return "This gym is marked as not having the equipment, and no fallback fits.";
  }
}

export default async function ExercisePage(props: PageProps<"/exercises/[exerciseId]">) {
  const { exerciseId } = await props.params;
  requireUuid(exerciseId);
  const user = await requireUser();
  const params = await props.searchParams;
  const requestProfile = await getRequestProfile(user.id, user.email);
  // The chart's window, and the same default Progress opens on: the last twelve weeks.
  const { range, error: rangeError } = parseDateRangeOrDefault(
    {
      from: typeof params.from === "string" ? params.from : undefined,
      to: typeof params.to === "string" ? params.to : undefined,
    },
    requestProfile.timeZone,
  );
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const exercise = await getExercise(tx, user.id, exerciseId);
      if (!exercise) return null;
      // Records exist only for movements whose load means the same everywhere (plan §3.13);
      // a machine's numbers stay with its machine, in the trend below. The same movements are
      // the ones friends are ranked on, so one read of the circle's bests serves both.
      const circle = isComparable(exercise)
        ? await loadCircle(tx, { id: user.id, username: requestProfile.username })
        : [];
      const [availability, performances, charted, bests, profile] = await Promise.all([
        exerciseAvailability(tx, user.id, exerciseId, exercise),
        recentPerformances(tx, user.id, exerciseId),
        // Only the sessions this movement was actually in, so the trend costs a page about
        // one exercise a read about one exercise.
        readWorkouts(tx, user.id, range, 0, TRAINING_RECORD_LIMIT, {
          exerciseId,
          completedOnly: true,
        }),
        circle.length > 0
          ? readExerciseBests(
              tx,
              circle.map((person) => person.id),
              exerciseId,
            )
          : new Map(),
        requestProfile,
      ]);
      // The Friends' leaderboard (plan §3.12) once there is someone to rank against and
      // anyone in the circle has logged the movement; nothing dead ships.
      const board =
        circle.length > 1 ? rankExercise(circle, bests, new Map(), primaryMetric(exercise)) : [];
      return {
        exercise,
        availability,
        performances,
        bests: bests.get(user.id) ?? [],
        board: board.some((row) => row.value !== null) ? topWithYou(board, user.id, 3) : [],
        series: performanceSeries(charted.workouts, profile.timeZone, exerciseId),
        timeZone: profile.timeZone,
        unit: profile.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const),
      };
    },
    { readOnly: true },
  );
  if (!data) notFound();
  const { exercise, availability, performances, bests, board, series, timeZone, unit } = data;
  // One machine's loads are not another's, so each is its own series and the corner picker
  // chooses between them. Only the chosen one's points cross the wire.
  const machines = series.map(({ id, name, machine, unit: loadUnit }) => ({
    id,
    name,
    machine,
    unit: loadUnit,
  }));
  const wanted = typeof params.series === "string" ? params.series : undefined;
  const selected = series.find((s) => s.id === wanted) ?? series[0] ?? null;
  // What one set of this movement counts, and the range it is normally worked in.
  const measure = exercise.defaultPrescriptionType;
  const measureRange: [number | null, number | null] =
    measure === "duration"
      ? [exercise.defaultDurationMinSeconds, exercise.defaultDurationMaxSeconds]
      : measure === "distance"
        ? [exercise.defaultDistanceMinMeters, exercise.defaultDistanceMaxMeters]
        : [exercise.defaultRepMin, exercise.defaultRepMax];

  return (
    <>
      <PageHeader title={exercise.name} backHref="/exercises" />
      <PageContent>
        {/* The movement, led by the range it is worked in: its kind, the muscles it trains,
            and its default targets as figures, in lifting's colour. The name is the bar's. */}
        <HeroCard tone="lift">
          <div className="flex items-start justify-between gap-3">
            <p className="flex min-h-7 min-w-0 items-center gap-2 text-sm font-semibold text-ink-muted">
              <Dumbbell aria-hidden />
              <span className="min-w-0">
                {EXERCISE_CATEGORY_LABELS[exercise.category]},{" "}
                {EXERCISE_MODALITY_LABELS[exercise.modality].toLowerCase()}
              </span>
            </p>
            {!exercise.isActive && <Badge tone="danger">Excluded</Badge>}
          </div>
          <div>
            <p className="tabular-nums">
              <span className="font-display text-display-l">
                {rangeLabel(measureRange[0], measureRange[1])}
              </span>{" "}
              <span className="text-xl font-semibold">
                {MEASURE_COLUMN_LABELS[measure].toLowerCase()}
              </span>
            </p>
            <p className="mt-2 text-callout [overflow-wrap:anywhere] text-ink-muted first-letter:uppercase">
              {exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m].toLowerCase()).join(", ")}
              {exercise.secondaryMuscles.length > 0 &&
                `, also ${exercise.secondaryMuscles
                  .map((m) => MUSCLE_LABELS[m].toLowerCase())
                  .join(", ")}`}
            </p>
            <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
              <span className="min-w-0">
                {LOAD_PORTABILITY_LABELS[exercise.loadPortability]},{" "}
                {exercise.movementPattern.replace(/_/g, " ")} pattern
              </span>
              <InfoTip label="About load comparability" className="-my-2">
                {LOAD_PORTABILITY_HELP[exercise.loadPortability]}
              </InfoTip>
            </p>
          </div>

          <StatTileRow className="grid-cols-3 border-t border-line pt-4 @min-[27rem]:grid-cols-3">
            <StatTile
              label="RIR"
              value={exercise.defaultRir === null ? "—" : String(exercise.defaultRir)}
              info={exercise.rirNote ?? rirMeaning(measure)}
            />
            <StatTile
              label="Rest"
              value={restLabel(exercise.defaultRestSeconds, exercise.defaultRestSeconds)}
            />
            <StatTile
              label="Load jump"
              value={
                exercise.defaultLoadIncrement === null
                  ? exercise.loadPortability === "global"
                    ? "—"
                    : "Machine"
                  : formatKilograms(exercise.defaultLoadIncrement, unit)
              }
            />
          </StatTileRow>

          {exercise.formNotes && (
            <p className="text-sm whitespace-pre-line">{exercise.formNotes}</p>
          )}
          {exercise.formUrl && (
            <a
              href={exercise.formUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonClassName("secondary", "md", "w-full")}
            >
              Form guide
              <ExternalLink aria-hidden />
            </a>
          )}
        </HeroCard>

        <Card>
          <h2 className="text-headline font-semibold">Equipment</h2>
          {exercise.requiresEquipment ? (
            <ol className="list-inside list-decimal space-y-1 text-sm">
              {exercise.equipmentOptions.map((option) => (
                <li key={option.equipmentTypeId}>{option.typeName}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-muted">No equipment needed.</p>
          )}
        </Card>

        {exercise.programUsage.length > 0 && (
          <Card>
            <h2 className="text-headline font-semibold">In your programme</h2>
            <ul className="ruled-list">
              {exercise.programUsage.map((usage) => (
                <li
                  key={usage.programExerciseId}
                  className="space-y-0.5 py-2.5 first:pt-0 last:pb-0"
                >
                  <p className="font-semibold">{usage.dayName}</p>
                  <p className="text-sm text-ink-muted tabular-nums">{prescription(usage)}</p>
                  {(usage.targetLoadNote || usage.progressionNotes) && (
                    <p className="text-sm text-ink-subtle">
                      {[usage.targetLoadNote, usage.progressionNotes].filter(Boolean).join(". ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <ExerciseBestsTiles exercise={exercise} bests={bests} unit={unit} />

        {board.length > 0 && (
          <FriendsBoardCard
            exercise={exercise}
            metric={primaryMetric(exercise)}
            rows={board}
            you={user.id}
            unit={unit}
          />
        )}

        {rangeError && (
          <p role="alert" className="text-sm text-danger">
            {rangeError}
          </p>
        )}
        <ExerciseTrend range={range} machines={machines} selected={selected} />

        <Card>
          <h2 className="flex items-center gap-1 text-headline font-semibold">
            Recent sessions
            {exercise.loadPortability !== "global" && (
              <InfoTip label="About recent sessions">
                Progression compares sets on the same machine only; other machines are listed for
                reference.
              </InfoTip>
            )}
          </h2>
          {performances.length === 0 ? (
            <p className="text-sm text-ink-muted">Not logged yet.</p>
          ) : (
            <ul className="-mx-[var(--panel-padding)] ruled-list">
              {performances.map((performance) => (
                <li key={performance.workoutExerciseId}>
                  <Link
                    href={`/workouts/${performance.workoutSessionId}`}
                    className="block space-y-0.5 px-[var(--panel-padding)] py-2.5 transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
                  >
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-semibold">
                        {formatDay(performance.performedAt, timeZone)}
                      </span>
                      <span className="min-w-0 truncate text-ink-muted">
                        {performance.gymName}
                        {performance.equipmentInstanceName
                          ? `, ${performance.equipmentInstanceName}`
                          : ""}
                      </span>
                    </div>
                    <p className="text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
                      {formatSets(
                        performance.sets.map((set) =>
                          exercise.loadPortability === "global" ? setInUnit(set, unit) : set,
                        ),
                        (loadUnit) => LOAD_UNIT_LABELS[loadUnit],
                      )}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Section title="Availability by gym">
          {availability.length === 0 && (
            <p className="text-sm text-ink-muted">Add a gym to see where this exercise fits.</p>
          )}
          {availability.map((entry) => (
            <Card key={entry.gym.id}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h3 className="min-w-0 font-semibold [overflow-wrap:anywhere]">{entry.gym.name}</h3>
                <AvailabilityBadge status={entry.resolution.status} />
              </div>
              <p className="text-sm text-ink-muted">{availabilityDetail(entry)}</p>
              {exercise.requiresEquipment && entry.machines.length > 0 && (
                <form
                  key={entry.preferredInstanceId ?? "automatic"}
                  action={setPreferredMachineAction.bind(null, exercise.id, entry.gym.id)}
                  className="space-y-1.5"
                >
                  <label
                    htmlFor={`preferred-machine-${entry.gym.id}`}
                    className="block text-sm font-semibold text-ink-muted"
                  >
                    Preferred machine here
                  </label>
                  {/* The select carries the long machine names, so it takes the row. */}
                  <div className="flex items-center gap-2">
                    <Select
                      id={`preferred-machine-${entry.gym.id}`}
                      name="equipmentInstanceId"
                      className="min-w-0 flex-1"
                      defaultValue={entry.preferredInstanceId ?? ""}
                    >
                      <option value="">Automatic</option>
                      {entry.machines.map((machine) => (
                        <option key={machine.id} value={machine.id}>
                          {machine.name}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton variant="secondary" size="md" className="w-auto shrink-0">
                      Save
                    </SubmitButton>
                  </div>
                </form>
              )}
              <LinkButton href={`/gyms/${entry.gym.id}/programme`} variant="ghost" size="sm">
                Programme fit
              </LinkButton>
            </Card>
          ))}
        </Section>
      </PageContent>
    </>
  );
}
