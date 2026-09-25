import { and, asc, eq } from "drizzle-orm";

import { equipmentInstances, equipmentTypes, exercises, profiles } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { searchScore, searchWords } from "@/domain/exercise-search";
import { bandEmphasis, defaultBand, type BandEmphasis } from "@/domain/rep-bands";
import { sharedExercises } from "@/server/queries/reference";

import { libraryAtGym, type LibraryEntry } from "./coach-plans";
import { getCoachJob } from "./coaching-jobs";
import { CoachingError } from "./coaching-state";
import { getGym } from "./gyms";
import { loadLadders } from "./load-ladders";

/**
 * What a coaching run looks up while it works, instead of being handed all of it (ADR 0029).
 *
 * A job's context used to carry the whole exercise library and every machine at the gym on
 * every run — about 45,000 tokens of library alone, twice over for a session — when most
 * runs name a handful of them. Worse, it gave the coach one list to read at one moment:
 * a list that came through empty told it the athlete had no exercises at all. These reads
 * answer the question the coach actually has, when it has it, and only for the live attempt
 * of a job it has claimed.
 */

/** Only the attempt holding the job's lease may read on its behalf. */
export async function assertLiveAttempt(
  db: DbOrTx,
  userId: string,
  jobId: string,
  attemptId: string,
  now = new Date(),
): Promise<void> {
  const job = await getCoachJob(db, userId, jobId);
  if (
    !job ||
    job.status !== "claimed" ||
    job.attemptId !== attemptId ||
    !job.leaseUntil ||
    job.leaseUntil <= now
  )
    throw new CoachingError("Only the current claimed attempt can look this up.");
}

/** A location the athlete owns, or a refusal naming the problem. */
async function ownGym(db: DbOrTx, userId: string, gymId: string | null) {
  if (gymId === null) return null;
  const gym = await getGym(db, userId, gymId);
  if (!gym) throw new CoachingError("That location is not one of this athlete's.", 404);
  return gym;
}

export type ExerciseQuery = {
  /** The athlete's own words, or a name: matched forgivingly, closest first. */
  q?: string;
  /** One muscle group, as the library names it (`biceps`, `quads`, …). */
  muscle?: string;
  /** One movement pattern, as the library names it. */
  pattern?: string;
  /** The location to check availability at; none gives the library without availability. */
  gymId: string | null;
  /** Only exercises that can be done at `gymId` as things stand. */
  availableOnly?: boolean;
  limit: number;
  offset: number;
};

function lookupRow(entry: LibraryEntry, gymChecked: boolean, emphasis: BandEmphasis) {
  const band = defaultBand(entry, emphasis);
  return {
    slug: entry.slug,
    name: entry.name,
    own: entry.own,
    modality: entry.modality,
    pattern: entry.movementPattern,
    muscles: entry.primaryMuscles,
    portability: entry.loadPortability,
    /** What one set of it counts, so a carry is prescribed in metres rather than reps. */
    measure: entry.defaultPrescriptionType,
    defaults: {
      reps: [entry.defaultRepMin, entry.defaultRepMax],
      seconds: [entry.defaultDurationMinSeconds, entry.defaultDurationMaxSeconds],
      meters: [entry.defaultDistanceMinMeters, entry.defaultDistanceMaxMeters],
      rir: entry.defaultRir,
    },
    /**
     * The range a new slot of this exercise starts from: its own library range, or on a main
     * barbell lift the `repBands` band for this athlete's goal. Depart from it only for a
     * reason stated in the rationale.
     */
    band: { role: band.role, reps: band.reps, rir: band.rir, source: band.source },
    /** Null when no location was checked; otherwise whether it can be done there, and on what. */
    available: gymChecked ? entry.available : null,
    machine: gymChecked ? entry.machine : null,
  };
}

/** The library with nothing resolved against a location: shared rows and the athlete's own. */
async function unlocatedLibrary(db: DbOrTx, userId: string): Promise<LibraryEntry[]> {
  const [shared, own] = await Promise.all([
    sharedExercises(db),
    db.select().from(exercises).where(eq(exercises.userId, userId)).orderBy(asc(exercises.name)),
  ]);
  return [...shared, ...own]
    .filter((e) => e.isActive)
    .map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      own: e.userId !== null,
      modality: e.modality,
      category: e.category,
      movementPattern: e.movementPattern,
      primaryMuscles: e.primaryMuscles,
      loadPortability: e.loadPortability,
      defaultPrescriptionType: e.defaultPrescriptionType,
      defaultRepMin: e.defaultRepMin,
      defaultRepMax: e.defaultRepMax,
      defaultDurationMinSeconds: e.defaultDurationMinSeconds,
      defaultDurationMaxSeconds: e.defaultDurationMaxSeconds,
      defaultDistanceMinMeters: e.defaultDistanceMinMeters,
      defaultDistanceMaxMeters: e.defaultDistanceMaxMeters,
      defaultRir: e.defaultRir,
      available: false,
      machine: null,
    }));
}

/**
 * Exercises the athlete can choose from — the shared library and their own — matching the
 * query, closest first. With no words it lists everything the filters allow, by name.
 */
export async function lookupExercises(db: DbOrTx, userId: string, query: ExerciseQuery) {
  const gym = await ownGym(db, userId, query.gymId);
  const [athlete] = await db
    .select({ goal: profiles.trainingGoal })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const emphasis = bandEmphasis(athlete?.goal);
  const library = gym ? await libraryAtGym(db, userId, gym.id) : await unlocatedLibrary(db, userId);
  const words = searchWords(query.q ?? "");
  const matching = library
    .filter((entry) => !query.muscle || entry.primaryMuscles.includes(query.muscle as never))
    .filter((entry) => !query.pattern || entry.movementPattern === query.pattern)
    .filter((entry) => !gym || !query.availableOnly || entry.available)
    .map((entry) => ({ entry, score: words.length ? searchScore(words, entry) : 0 }))
    .filter((item) => words.length === 0 || item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.entry.available) - Number(a.entry.available) ||
        a.entry.name.localeCompare(b.entry.name),
    );
  const page = matching.slice(query.offset, query.offset + query.limit);
  return {
    gymId: gym?.id ?? null,
    query: query.q ?? null,
    total: matching.length,
    hasMore: query.offset + page.length < matching.length,
    items: page.map((item) => lookupRow(item.entry, gym !== null, emphasis)),
    meaning:
      "The shared library and the athlete's own exercises. A query matches the athlete's own words forgivingly and ranks the closest names first; nothing matching means the library has no such exercise, not that the list failed. Use the slug in a plan.",
  };
}

/**
 * The machines registered at one location, each with what is known about its loads
 * (ADR 0028): a stack's known stops, or the typed jump of plates and free weights.
 */
export async function lookupMachines(db: DbOrTx, userId: string, gymId: string) {
  const gym = await ownGym(db, userId, gymId);
  const machines = await db
    .select({
      id: equipmentInstances.id,
      name: equipmentInstances.name,
      type: equipmentTypes.name,
      typeSlug: equipmentTypes.slug,
      unit: equipmentInstances.unit,
      notes: equipmentInstances.notes,
    })
    .from(equipmentInstances)
    .innerJoin(equipmentTypes, eq(equipmentTypes.id, equipmentInstances.equipmentTypeId))
    .where(
      and(
        eq(equipmentInstances.userId, userId),
        eq(equipmentInstances.gymId, gym!.id),
        eq(equipmentInstances.isActive, true),
      ),
    )
    .orderBy(asc(equipmentInstances.name));
  const ladders = await loadLadders(
    db,
    userId,
    machines.map((machine) => machine.id),
  );
  return {
    gym: { id: gym!.id, name: gym!.name, kind: gym!.kind },
    machines: machines.map((machine) => {
      const ladder = ladders.get(machine.id);
      return {
        ...machine,
        /** A pin or cable stack, whose steps are learned from what is lifted on it. */
        stack: ladder?.stack ?? false,
        /** Help given rather than load lifted: a lower number is harder. */
        assisted: ladder?.assisted ?? false,
        /** Loads known to exist on it: logged on a stack, or listed by the athlete. */
        known: ladder?.known ?? [],
        /** The typed jump, for plates and free weights; a stack has none. */
        increment: ladder?.stack ? null : (ladder?.increment ?? null),
      };
    }),
    meaning:
      "Every active machine at this location. An empty list means nothing is registered here. Machine history never transfers between machines.",
  };
}
