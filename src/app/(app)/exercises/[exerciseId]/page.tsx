import { SubmitButton } from "@/components/ui/form";
import { ExternalLink } from "@/components/ui/icons";
import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";

import { AvailabilityBadge } from "@/components/availability-badge";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClassName, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import type { Resolution } from "@/domain/equipment-resolution";
import { formatSets } from "@/domain/sets";
import { formatDay, formatKilograms } from "@/lib/format";
import {
  EXERCISE_CATEGORY_LABELS,
  EXERCISE_MODALITY_LABELS,
  LOAD_PORTABILITY_HELP,
  LOAD_PORTABILITY_LABELS,
  MEASURE_COLUMN_LABELS,
  MEASURE_UNIT_SUFFIX,
  MUSCLE_LABELS,
  rangeLabel,
  restLabel,
  rirMeaning,
} from "@/lib/labels";
import { setPreferredMachineAction } from "@/server/actions/availability";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { recentPerformances } from "@/server/queries/comparable";
import {
  exerciseAvailability,
  type ExerciseGymAvailability,
} from "@/server/repositories/availability";
import { getExercise, type ExerciseProgramUsage } from "@/server/repositories/exercises";
import { requireUuid } from "@/server/validation/params";

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
  return `${volume}${side} @ ${rangeLabel(usage.rirMin, usage.rirMax)} RIR · rest ${restLabel(usage.restMinSeconds, usage.restMaxSeconds)}`;
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
  const requestProfile = await getRequestProfile(user.id, user.email);
  const data = await withUser(getDb(), user.id, async (tx) => {
    const exercise = await getExercise(tx, user.id, exerciseId);
    if (!exercise) return null;
    const [availability, performances, profile] = await Promise.all([
      exerciseAvailability(tx, user.id, exerciseId, exercise),
      recentPerformances(tx, user.id, exerciseId),
      requestProfile,
    ]);
    return {
      exercise,
      availability,
      performances,
      timeZone: profile.timeZone,
      unit: profile.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const),
    };
  });
  if (!data) notFound();
  const { exercise, availability, performances, timeZone, unit } = data;
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
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{EXERCISE_CATEGORY_LABELS[exercise.category]}</Badge>
            <Badge>{EXERCISE_MODALITY_LABELS[exercise.modality]}</Badge>
            <Badge tone={exercise.loadPortability === "global" ? "success" : "accent"}>
              {LOAD_PORTABILITY_LABELS[exercise.loadPortability]}
            </Badge>
            <InfoTip label="About load comparability">
              {LOAD_PORTABILITY_HELP[exercise.loadPortability]}
            </InfoTip>
            {!exercise.isActive && <Badge tone="danger">Excluded</Badge>}
          </div>

          <div className="space-y-1">
            <p className="text-sm">
              <span className="text-ink-muted">Primary: </span>
              {exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")}
            </p>
            {exercise.secondaryMuscles.length > 0 && (
              <p className="text-sm">
                <span className="text-ink-muted">Also: </span>
                {exercise.secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")}
              </p>
            )}
            <p className="text-sm">
              <span className="text-ink-muted">Pattern: </span>
              {exercise.movementPattern.replace(/_/g, " ")}
            </p>
          </div>

          <StatTileRow>
            {/* Whatever this movement is actually counted in. A carry has no reps to show. */}
            <StatTile
              label={MEASURE_COLUMN_LABELS[measure]}
              value={rangeLabel(measureRange[0], measureRange[1], MEASURE_UNIT_SUFFIX[measure])}
            />
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
                  ? "Machine"
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
        </Card>

        <Card>
          <h2 className="text-base font-medium">Equipment</h2>
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
            <h2 className="text-base font-medium">In your programme</h2>
            <ul className="divide-y divide-line">
              {exercise.programUsage.map((usage) => (
                <li key={usage.programExerciseId} className="space-y-0.5 py-2">
                  <p className="text-sm font-medium">{usage.dayName}</p>
                  <p className="text-sm text-ink-muted tabular-nums">{prescription(usage)}</p>
                  {(usage.targetLoadNote || usage.progressionNotes) && (
                    <p className="text-xs text-ink-subtle">
                      {[usage.targetLoadNote, usage.progressionNotes].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <h2 className="flex items-center gap-1 text-base font-medium">
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
            <ul className="divide-y divide-line">
              {performances.map((performance) => (
                <li key={performance.workoutExerciseId}>
                  <Link
                    href={`/workouts/${performance.workoutSessionId}`}
                    className="block space-y-0.5 py-2"
                  >
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-medium">
                        {formatDay(performance.performedAt, timeZone)}
                      </span>
                      <span className="min-w-0 truncate text-ink-muted">
                        {performance.gymName}
                        {performance.equipmentInstanceName
                          ? ` · ${performance.equipmentInstanceName}`
                          : ""}
                      </span>
                    </div>
                    <p className="text-sm text-ink-muted tabular-nums">
                      {formatSets(performance.sets)}
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
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">{entry.gym.name}</h3>
                <AvailabilityBadge status={entry.resolution.status} />
              </div>
              <p className="text-sm text-ink-muted">{availabilityDetail(entry)}</p>
              {exercise.requiresEquipment && entry.machines.length > 0 && (
                <form
                  action={setPreferredMachineAction.bind(null, exercise.id, entry.gym.id)}
                  className="space-y-1.5"
                >
                  <label
                    htmlFor={`preferred-machine-${entry.gym.id}`}
                    className="block text-sm font-medium text-ink-muted"
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
