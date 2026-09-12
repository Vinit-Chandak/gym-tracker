import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { CoachIntakeForm } from "@/components/coaching/intake-form";
import { ProgramBuilder } from "@/components/coaching/program-builder";
import { DraftPreview } from "@/components/coaching/draft-preview";
import { ProgrammeOptions } from "@/components/coaching/programme-options";
import { EquipmentStepForm } from "@/app/(onboarding)/welcome/equipment/equipment-step-form";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { EXERCISES } from "@/db/seed/data/exercises";
import { EQUIPMENT_TYPES } from "@/db/seed/data/equipment-types";
import { WARMUP_PROTOCOLS } from "@/db/seed/data/warmups";
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
  goal: "Build strength around a busy week",
  sessionsPerWeek: 3,
  minutesPerSession: 45,
  preferredDays: [1, 3, 5],
  reviewWeekday: 7,
  gymId: ID,
  recentTraining: "Returning after a break",
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

/** Synthetic visual fixtures only; the preview layout disables these routes in production. */
export default async function CoachingPreview({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; step?: string }>;
}) {
  const { view = "options", step = "0" } = await searchParams;
  return (
    <PreviewShell tab="/settings">
      <PageHeader title="Coaching preview" />
      <PageContent>
        <p className="text-xs text-ink-muted">Development preview with example data</p>
        <nav className="flex flex-wrap gap-3 text-sm text-accent" aria-label="Preview screens">
          {[
            ["options", "Choices"],
            ["intake", "Intake"],
            ["manual", "Builder"],
            ["draft", "Draft"],
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
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <a key={index} href={`?view=intake&step=${index}`}>
                  Step {index + 1}
                </a>
              ))}
            </nav>
            <CoachIntakeForm
              key={step}
              initial={{ id: ID, revision: 1, answers }}
              reports={[
                {
                  id: ID,
                  name: "Training-report.pdf",
                  mimeType: "application/pdf",
                  sizeBytes: 2048,
                },
              ]}
              gyms={[{ id: ID, name: "Example gym" }]}
              machines={[]}
              library={library}
              base="/settings/programme"
              configured
              initialStep={Math.min(5, Math.max(0, Number(step) || 0))}
            />
          </>
        )}
        {view === "manual" && (
          <ProgramBuilder
            initial={{ id: ID, revision: 1, blueprint }}
            library={library}
            warmups={[...WARMUP_PROTOCOLS]}
            base="/settings/programme"
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
              rationale:
                "A draft for your available training time. Review and edit the exercises and targets before starting.",
              uncertainties: [
                "Starting loads need calibration because no comparable training has been recorded.",
              ],
              activatedProgramId: null,
              createdAt: new Date("2026-09-12"),
              updatedAt: new Date("2026-09-12"),
            }}
            library={library}
            today="2026-09-12"
            base="/settings/programme"
            stale={false}
            assessment={null}
            currentBlueprint={null}
            machines={[]}
            preferredUnit="kg"
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
