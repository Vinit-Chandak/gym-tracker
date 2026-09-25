import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { CoachIntakeForm } from "@/components/coaching/intake-form";
import { ProgramBuilder } from "@/components/coaching/program-builder";
import { ChangeDetail } from "@/components/coaching/change-detail";
import { DraftPreview } from "@/components/coaching/draft-preview";
import { ProgrammeOptions } from "@/components/coaching/programme-options";
import { EquipmentStepForm } from "@/app/(onboarding)/welcome/equipment/equipment-step-form";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { EXERCISES } from "@/db/seed/data/exercises";
import { EQUIPMENT_TYPES } from "@/db/seed/data/equipment-types";
import { WARMUP_PROTOCOLS } from "@/db/seed/data/warmups";
import { diffPrograms } from "@/domain/program-diff";
import { summariseProgramDiff } from "@/domain/program-change-summary";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { PreviewShell } from "../../preview-shell";

const ID = "00000000-0000-4000-8000-000000000001";
const blueprint = {
  ...STRENGTH_AESTHETICS_HYBRID_8WK,
  name: "Example personal programme",
  weeks: 2,
  notes: "An example showing how to review exercises and targets before starting a programme.",
  days: [
    {
      ...STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!,
      includesRun: false,
      exercises: STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!.exercises.slice(0, 3),
    },
  ],
  runs: [],
};
const answers = coachIntakeSchema.parse({
  track: "detailed",
  goal: "Build strength around a busy week",
  sessionsPerWeek: 3,
  minutesPerSession: 45,
  preferredDays: [1, 3, 5],
  trainingLocation: "gym",
  gymId: ID,
  heightCm: 178,
  weightKg: 74.5,
  ageYears: 31,
  recentTraining: "Incline bench 60 kg for 8. Squat 90 kg for 5.",
  prompt:
    "I want a programme with three training days, room for easy runs, and clear starting-load guidance. Please use my available equipment and explain the progression.",
});
const library = EXERCISES.map((exercise) => ({
  slug: exercise.slug,
  name: exercise.name,
  defaultPrescriptionType: exercise.measure ?? ("reps" as const),
  defaultRepMin: exercise.defaultRepMin ?? null,
  defaultRepMax: exercise.defaultRepMax ?? null,
  defaultDurationMinSeconds: exercise.defaultDurationMin ?? null,
  defaultDurationMaxSeconds: exercise.defaultDurationMax ?? null,
  defaultDistanceMinMeters: exercise.defaultDistanceMin ?? null,
  defaultDistanceMaxMeters: exercise.defaultDistanceMax ?? null,
  defaultRir: exercise.defaultRir ?? null,
  defaultRestSeconds: null,
}));

const LINEAGE = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
/** A base and a proposal covering every kind of change the diff can show. */
const CHANGE_BASE: ProgramBlueprint = {
  blueprintVersion: 1,
  slug: "example-block",
  name: "Example personal programme",
  weeks: 6,
  notes: "",
  runs: [
    {
      weekIndex: 1,
      dayOfWeek: 6,
      duration: [30, 30],
      rpe: [4, 5],
      paceNote: "Easy",
      progressionNote: "",
      stopRule: "",
    },
  ],
  days: [
    {
      dayIndex: 1,
      dayOfWeek: 1,
      name: "Upper",
      focus: "Press and pull",
      timeNote: "45 min",
      effortNote: "",
      notes: "",
      includesLifting: true,
      includesRun: false,
      warmupSlug: "",
      exercises: [
        {
          exerciseSlug: "barbell-bench-press",
          lineageId: LINEAGE(1),
          sets: 3,
          reps: [5, 8],
          rir: [1, 2],
          rest: [180, 180],
        },
        {
          exerciseSlug: "barbell-curl",
          lineageId: LINEAGE(2),
          sets: 3,
          reps: [8, 12],
          rir: [1, 2],
          rest: [90, 90],
        },
        {
          exerciseSlug: "cable-lateral-raise",
          lineageId: LINEAGE(3),
          sets: 2,
          reps: [12, 15],
          rir: [1, 2],
          rest: [60, 90],
        },
      ],
    },
    {
      dayIndex: 2,
      dayOfWeek: 3,
      name: "Lower",
      focus: "Squat and hinge",
      timeNote: "",
      effortNote: "",
      notes: "",
      includesLifting: true,
      includesRun: false,
      warmupSlug: "",
      exercises: [
        {
          exerciseSlug: "high-bar-squat",
          lineageId: LINEAGE(4),
          sets: 3,
          reps: [5, 8],
          rir: [1, 2],
          rest: [180, 240],
        },
      ],
    },
    {
      dayIndex: 3,
      dayOfWeek: 6,
      name: "Easy run",
      focus: "",
      timeNote: "",
      effortNote: "",
      notes: "",
      includesLifting: false,
      includesRun: true,
      warmupSlug: "",
      exercises: [],
    },
  ],
};
/** Computed once, so the preview can tag a changed line with the ask that produced it. */
const CHANGE_PROPOSED: ProgramBlueprint = {
  ...CHANGE_BASE,
  weeks: 8,
  days: [
    {
      ...CHANGE_BASE.days[0]!,
      timeNote: "50 min",
      exercises: [
        {
          ...CHANGE_BASE.days[0]!.exercises[0]!,
          sets: 4,
          rest: [180, 240],
          progressionNotes: "Add 2.5 kg once all four sets reach eight at the prescribed effort.",
        },
        {
          ...CHANGE_BASE.days[0]!.exercises[1]!,
          exerciseSlug: "cable-curl",
          reps: [10, 15],
        },
        {
          exerciseSlug: "cable-crunch",
          sets: 3,
          reps: [10, 15],
          rir: [1, 2],
          rest: [60, 90],
        },
      ],
    },
    {
      ...CHANGE_BASE.days[1]!,
      exercises: [
        CHANGE_BASE.days[1]!.exercises[0]!,
        // Moved here from the upper day, rather than removed there and invented here.
        CHANGE_BASE.days[0]!.exercises[2]!,
      ],
    },
    CHANGE_BASE.days[2]!,
  ],
  runs: [
    {
      ...CHANGE_BASE.runs[0]!,
      duration: [35, 35],
      distanceKm: [5, 5],
    },
  ],
};

const CHANGE_DIFF = diffPrograms(CHANGE_BASE, CHANGE_PROPOSED);
const EMPTY_CHANGE = diffPrograms(CHANGE_BASE, CHANGE_BASE);
/**
 * The operations the curl ask produced, found rather than hard-coded.
 *
 * A real decision names these IDs itself and the server refuses one that names an operation
 * the diff does not contain, so the preview derives them the same way rather than drifting.
 */
const CURL_OPERATION_IDS = CHANGE_DIFF.days
  .flatMap((day) => day.operations)
  .filter(
    (operation) =>
      (operation.kind === "added" ||
        operation.kind === "replaced" ||
        operation.kind === "retargeted") &&
      operation.to.exerciseSlug === "cable-curl",
  )
  .map((operation) => operation.id);

/** Synthetic visual fixtures only; the preview layout disables these routes in production. */
export default async function CoachingPreview({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; step?: string; track?: string }>;
}) {
  const { view = "options", step = "0", track = "detailed" } = await searchParams;
  return (
    <PreviewShell tab="/profile">
      <PageHeader title="Coaching preview" />
      <PageContent>
        <p className="text-xs text-ink-muted">Development preview with example data</p>
        <nav className="flex flex-wrap gap-3 text-sm text-accent" aria-label="Preview screens">
          {[
            ["options", "Choices"],
            ["intake", "Intake"],
            ["manual", "Builder"],
            ["draft", "Draft"],
            ["changes", "Changes"],
            ["unchanged", "No changes"],
            ["equipment", "Machines"],
          ].map(([value, label]) => (
            <a key={value} href={`?view=${value}`}>
              {label}
            </a>
          ))}
        </nav>
        {view === "options" && <ProgrammeOptions onboarding />}
        {view === "intake" && (
          <>
            <nav
              className="flex flex-wrap gap-3 text-sm text-accent"
              aria-label="Intake preview steps"
            >
              {(
                [
                  ["none", "Choices"],
                  ["guided", "Guided"],
                ] as const
              ).map(([value, label]) => (
                <a key={value} href={`?view=intake&track=${value}`}>
                  {label}
                </a>
              ))}
              {[0, 1, 2, 3, 4].map((index) => (
                <a key={index} href={`?view=intake&step=${index}`}>
                  Step {index + 1}
                </a>
              ))}
            </nav>
            <CoachIntakeForm
              key={`${track}-${step}`}
              initial={{
                id: ID,
                revision: 1,
                answers: {
                  ...answers,
                  track: track === "none" ? null : track === "guided" ? "guided" : "detailed",
                  minutesPerSession: track === "guided" ? null : answers.minutesPerSession,
                },
              }}
              reports={[
                {
                  id: ID,
                  name: "Training-report.pdf",
                  mimeType: "application/pdf",
                  sizeBytes: 2048,
                },
              ]}
              library={library}
              base="/profile/programme"
              configured
              initialStep={Math.min(4, Math.max(0, Number(step) || 0))}
            />
          </>
        )}
        {view === "manual" && (
          <ProgramBuilder
            initial={{ id: ID, revision: 1, blueprint }}
            library={library}
            warmups={[...WARMUP_PROTOCOLS]}
            base="/profile/programme"
          />
        )}
        {view === "draft" && (
          <DraftPreview
            draft={{
              id: ID,
              userId: ID,
              source: "ai",
              status: "ready",
              blueprint,
              openingPlan: null,
              jobId: null,
              intakeId: ID,
              baseProgramId: null,
              sourceRevision: 1,
              revision: 1,
              headline: "Your first draft, built around the time you said you have.",
              gateReasons: [],
              rationale:
                "A draft for your available training time. Review and edit the exercises and targets before starting.",
              uncertainties: [
                "Starting loads need calibration because no comparable training has been recorded.",
              ],
              activatedProgramId: null,
              closedAs: null,
              closedAt: null,
              revisionNoteId: null,
              createdAt: new Date("2026-09-12"),
              updatedAt: new Date("2026-09-12"),
            }}
            library={library}
            today="2026-09-12"
            base="/profile/programme"
            stale={false}
            machines={[]}
            preferredUnit="kg"
          />
        )}
        {(view === "changes" || view === "unchanged") && (
          <ChangeDetail
            draftId={ID}
            revision={2}
            author="coach"
            status="ready"
            outcome={null}
            headline="Swaps your barbell curl for a cable curl and adds a cable crunch."
            rationale="Bayesian cable curls go in on your upper day. Core work needs one answer before I can place it."
            uncertainties={[]}
            summary={summariseProgramDiff(view === "unchanged" ? EMPTY_CHANGE : CHANGE_DIFF)}
            names={Object.fromEntries(EXERCISES.map((e) => [e.slug, e.name]))}
            canContinue={false}
            requests={[
              {
                id: `${ID.slice(0, 35)}2`,
                quote: "Can I have Bayesian cable curls?",
                changeRefs: CURL_OPERATION_IDS,
              },
            ]}
            today="2026-09-19"
            base="/profile/programme"
          />
        )}
        {view === "equipment" && (
          <EquipmentStepForm
            gymId={ID}
            types={EQUIPMENT_TYPES.map((type, index) => ({
              ...type,
              id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            }))}
          />
        )}
      </PageContent>
    </PreviewShell>
  );
}
