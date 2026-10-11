import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { coachJobs, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ActivitySport } from "@/domain/activity";
import type { GymKind, TrainingExperience } from "@/domain/types";
import { setupSteps, type SetupPath, type SetupStep } from "@/lib/setup-path";
import { listGyms } from "@/server/repositories/gyms";
import { enabledSportsFor, hasChosenSports } from "@/server/repositories/sport-preferences";

/** The place setup is about: the default gym, or the first place the athlete added. */
export type SetupPlace = { id: string; name: string; kind: GymKind; equipmentCount: number };

/** What setup has been told so far, read in one transaction for the step being drawn. */
export type SetupState = {
  experience: TrainingExperience | null;
  /** Null until the athlete has said which sports they train. */
  sports: ActivitySport[] | null;
  place: SetupPlace | null;
};

export async function readSetupState(
  tx: DbOrTx,
  userId: string,
  experience: TrainingExperience | null,
): Promise<SetupState> {
  const [chosen, enabled, places] = await Promise.all([
    hasChosenSports(tx, userId),
    enabledSportsFor(tx, userId),
    listGyms(tx, userId),
  ]);
  const active = places.filter((place) => place.isActive);
  const place = active.find((candidate) => candidate.isDefault) ?? active[0] ?? null;
  return {
    experience,
    sports: chosen ? enabled : null,
    place: place
      ? { id: place.id, name: place.name, kind: place.kind, equipmentCount: place.equipmentCount }
      : null,
  };
}

export function setupPathOf(state: SetupState): SetupPath {
  return {
    experience: state.experience,
    lifts: state.sports === null ? null : state.sports.includes("strength"),
    kind: state.place?.kind ?? null,
  };
}

export function setupStepsOf(state: SetupState): SetupStep[] {
  return setupSteps(setupPathOf(state));
}

/**
 * Where a programme the coach was asked for stands: still being written (or asking something),
 * or written and waiting to be read. Setup comes back to it, as the writing screen promises,
 * rather than asking the same questions again.
 */
export async function pendingFirstProgramme(
  tx: DbOrTx,
  userId: string,
): Promise<{ jobId: string } | { draftId: string } | null> {
  const [draft] = await tx
    .select({ id: programDrafts.id })
    .from(programDrafts)
    .where(
      and(
        eq(programDrafts.userId, userId),
        isNull(programDrafts.baseProgramId),
        inArray(programDrafts.status, ["editing", "ready"]),
      ),
    )
    .orderBy(desc(programDrafts.updatedAt))
    .limit(1);
  if (draft) return { draftId: draft.id };
  const [job] = await tx
    .select({ id: coachJobs.id })
    .from(coachJobs)
    .where(
      and(
        eq(coachJobs.userId, userId),
        eq(coachJobs.kind, "create_program"),
        inArray(coachJobs.status, ["queued", "claimed", "needs_input"]),
      ),
    )
    .orderBy(desc(coachJobs.createdAt))
    .limit(1);
  return job ? { jobId: job.id } : null;
}
