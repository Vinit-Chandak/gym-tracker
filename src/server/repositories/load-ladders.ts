import { and, eq, inArray, sql } from "drizzle-orm";

import { equipmentInstances, equipmentTypes, setLogs, workoutExercises } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { knownLoads, ladderFor, type LoadLadder } from "@/domain/load-steps";

/**
 * Each machine's ladder (ADR 0028): its own row, and every distinct weight ever logged on it
 * in its own unit. Two queries for any number of machines, read beside whatever else the
 * screen reads; nothing is stored, so correcting a mistyped set corrects the ladder too.
 */
export async function loadLadders(
  db: DbOrTx,
  userId: string,
  machineIds: readonly string[],
): Promise<Map<string, LoadLadder>> {
  const ids = [...new Set(machineIds)];
  if (ids.length === 0) return new Map();
  const [machines, logged] = await Promise.all([
    db
      .select({
        id: equipmentInstances.id,
        resistanceMode: equipmentInstances.resistanceMode,
        loadIncrement: equipmentInstances.loadIncrement,
        availableLoads: equipmentInstances.availableLoads,
        typeSlug: equipmentTypes.slug,
      })
      .from(equipmentInstances)
      .innerJoin(equipmentTypes, eq(equipmentTypes.id, equipmentInstances.equipmentTypeId))
      .where(and(eq(equipmentInstances.userId, userId), inArray(equipmentInstances.id, ids))),
    // Only the stacks learn from their logs, so only their weights are read.
    db
      .selectDistinct({
        machineId: workoutExercises.equipmentInstanceId,
        weight: sql<number>`${setLogs.weight}::float8`.mapWith(Number),
      })
      .from(setLogs)
      .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
      .innerJoin(
        equipmentInstances,
        eq(equipmentInstances.id, workoutExercises.equipmentInstanceId),
      )
      .where(
        and(
          eq(workoutExercises.userId, userId),
          inArray(workoutExercises.equipmentInstanceId, ids),
          eq(equipmentInstances.resistanceMode, "selectorized"),
          eq(setLogs.unit, equipmentInstances.unit),
          sql`${setLogs.weight} > 0`,
        ),
      ),
  ]);
  const byMachine = new Map<string, number[]>();
  for (const row of logged) {
    if (!row.machineId) continue;
    const list = byMachine.get(row.machineId) ?? [];
    list.push(row.weight);
    byMachine.set(row.machineId, list);
  }
  return new Map(
    machines.map((machine) => [
      machine.id,
      ladderFor({
        resistanceMode: machine.resistanceMode,
        equipmentTypeSlug: machine.typeSlug,
        availableLoads: machine.availableLoads,
        loggedLoads: byMachine.get(machine.id) ?? [],
        loadIncrement: machine.loadIncrement,
      }),
    ]),
  );
}

/**
 * The heaviest and lightest working load each exercise has been lifted at on each machine, in the
 * machine's own unit, across every session (ADR 0047). The Next up box asks for the stop above
 * the best of these, so a lighter day does not ask for the stop above a load long since beaten,
 * nor stay quiet because that stop is known while the one above the best is not. Keyed
 * `machineId:exerciseId`.
 */
export async function bestLoads(
  db: DbOrTx,
  userId: string,
  pairs: readonly { machineId: string; exerciseId: string }[],
): Promise<Map<string, { heaviest: number; lightest: number }>> {
  const machineIds = [...new Set(pairs.map((pair) => pair.machineId))];
  const exerciseIds = [...new Set(pairs.map((pair) => pair.exerciseId))];
  if (machineIds.length === 0) return new Map();
  const rows = await db
    .select({
      machineId: workoutExercises.equipmentInstanceId,
      exerciseId: workoutExercises.exerciseId,
      heaviest: sql<number>`max(${setLogs.weight})::float8`.mapWith(Number),
      lightest: sql<number>`min(${setLogs.weight})::float8`.mapWith(Number),
    })
    .from(setLogs)
    .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
    .innerJoin(equipmentInstances, eq(equipmentInstances.id, workoutExercises.equipmentInstanceId))
    .where(
      and(
        eq(workoutExercises.userId, userId),
        inArray(workoutExercises.equipmentInstanceId, machineIds),
        inArray(workoutExercises.exerciseId, exerciseIds),
        inArray(setLogs.setType, ["working", "amrap", "failure"]),
        eq(setLogs.unit, equipmentInstances.unit),
        sql`${setLogs.weight} > 0`,
      ),
    )
    .groupBy(workoutExercises.equipmentInstanceId, workoutExercises.exerciseId);
  return new Map(
    rows.flatMap((row) =>
      row.machineId
        ? [
            [
              `${row.machineId}:${row.exerciseId}`,
              { heaviest: row.heaviest, lightest: row.lightest },
            ] as const,
          ]
        : [],
    ),
  );
}

/** A load that exists on this machine, added to the ones the athlete has confirmed. */
export async function confirmMachineLoad(
  db: DbOrTx,
  userId: string,
  machineId: string,
  load: number,
): Promise<number[] | null> {
  const [machine] = await db
    .select({ availableLoads: equipmentInstances.availableLoads })
    .from(equipmentInstances)
    .where(and(eq(equipmentInstances.id, machineId), eq(equipmentInstances.userId, userId)))
    .limit(1);
  if (!machine) return null;
  const loads = knownLoads(machine.availableLoads, [load]).slice(0, 200);
  await db
    .update(equipmentInstances)
    .set({ availableLoads: loads, updatedAt: new Date() })
    .where(and(eq(equipmentInstances.id, machineId), eq(equipmentInstances.userId, userId)));
  return loads;
}
