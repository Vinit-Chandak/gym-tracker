import { SubmitButton } from "@/components/ui/form";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";

import { AvailabilityBadge } from "@/components/availability-badge";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClassName, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import type { Resolution } from "@/domain/equipment-resolution";
import { formatSets } from "@/domain/sets";
import { formatDay } from "@/lib/format";
import {
  EXERCISE_CATEGORY_LABELS,
  EXERCISE_MODALITY_LABELS,
  LOAD_PORTABILITY_HELP,
  LOAD_PORTABILITY_LABELS,
  MUSCLE_LABELS,
  rangeLabel,
  restLabel,
} from "@/lib/labels";
import { setPreferredMachineAction } from "@/server/actions/availability";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { recentPerformances } from "@/server/queries/comparable";
import {
  exerciseAvailability,
  type ExerciseGymAvailability,
} from "@/server/repositories/availability";
import { getExercise, type ExerciseProgramUsage } from "@/server/repositories/exercises";
import { requireUuid } from "@/server/validation/params";

export const metadata: Metadata = { title: "Exercise" };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-surface-raised px-2 py-2 text-center">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function prescription(usage: ExerciseProgramUsage): string {
  const volume =
    usage.prescriptionType === "duration"
      ? `${usage.sets} × ${rangeLabel(usage.durationMinSeconds, usage.durationMaxSeconds, " s")}`
      : `${usage.sets} × ${rangeLabel(usage.repMin, usage.repMax)}`;
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
  const data = await withUser(getDb(), user.id, async (tx) => {
    const exercise = await getExercise(tx, user.id, exerciseId);
    if (!exercise) return null;
    const [availability, performances, profile] = await Promise.all([
      exerciseAvailability(tx, user.id, exerciseId),
      recentPerformances(tx, user.id, exerciseId),
      ensureProfile(tx, user),
    ]);
    return { exercise, availability, performances, timeZone: profile.timeZone };
  });
  if (!data) notFound();
  const { exercise, availability, performances, timeZone } = data;

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
            {!exercise.isActive && <Badge tone="danger">Excluded</Badge>}
          </div>
          <p className="text-sm text-ink-muted">
            {LOAD_PORTABILITY_HELP[exercise.loadPortability]}
          </p>

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

          <dl className="grid grid-cols-4 gap-2">
            <Stat label="Reps" value={rangeLabel(exercise.defaultRepMin, exercise.defaultRepMax)} />
            <Stat
              label="RIR"
              value={exercise.defaultRir === null ? "—" : String(exercise.defaultRir)}
            />
            <Stat
              label="Rest"
              value={restLabel(exercise.defaultRestSeconds, exercise.defaultRestSeconds)}
            />
            <Stat
              label="Load jump"
              value={
                exercise.defaultLoadIncrement === null
                  ? "Machine"
                  : `${exercise.defaultLoadIncrement} kg`
              }
            />
          </dl>

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
              <ExternalLink className="size-4" aria-hidden />
            </a>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-semibold">Equipment</h2>
          {exercise.requiresEquipment ? (
            <ol className="list-inside list-decimal space-y-1 text-sm">
              {exercise.equipmentOptions.map((option) => (
                <li key={option.equipmentTypeId}>{option.typeName}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-muted">No equipment needed.</p>
          )}
          {exercise.modality === "barbell" || exercise.modality === "dumbbell" ? (
            <p className="text-xs text-ink-subtle">Free weights count as available at every gym.</p>
          ) : null}
        </Card>

        {exercise.programUsage.length > 0 && (
          <Card>
            <h2 className="text-base font-semibold">In your programme</h2>
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
          <h2 className="text-base font-semibold">Recent sessions</h2>
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
          {exercise.loadPortability !== "global" && performances.length > 0 && (
            <p className="text-xs text-ink-subtle">
              Progression only compares sets on the same machine; other machines are listed for
              reference.
            </p>
          )}
        </Card>

        <SectionHeading title="Availability by gym" />
        {availability.length === 0 && (
          <p className="px-1 text-sm text-ink-muted">Add a gym to see where this exercise fits.</p>
        )}
        {availability.map((entry) => (
          <Card key={entry.gym.id}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{entry.gym.name}</h3>
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
              Programme fit at {entry.gym.name}
            </LinkButton>
          </Card>
        ))}
      </PageContent>
    </>
  );
}
