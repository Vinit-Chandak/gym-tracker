import type { DbOrTx } from "@/db/types";
import { bodyWeightRatio } from "@/domain/compare";
import { perKgBase, rank, type BoardMetric, type Ranked } from "@/domain/leaderboard";
import { listFollowing } from "@/server/repositories/follows";
import { getDirectoryProfile, type DirectoryProfile } from "@/server/repositories/people";
import type { ExerciseBest, SharedReading } from "@/server/repositories/shared-stats";

/** One row of a board before ranking: who, and their number, with the day a best was set. */
export type BoardRow = {
  key: string;
  username: string;
  displayName: string | null;
  value: number | null;
  occurredOn: string | null;
};

/**
 * Who a leaderboard ranks (decision 3): the viewer and the people they follow, by name, so
 * ties and the no-data tail read like a contact list. Followers not followed back are not
 * here; a friend who stopped sharing is here but the policies hand over nothing for them,
 * which is how they drop off the board.
 */
export async function loadCircle(
  tx: DbOrTx,
  viewer: { id: string; username: string },
): Promise<DirectoryProfile[]> {
  const [me, following] = await Promise.all([
    getDirectoryProfile(tx, viewer.username),
    listFollowing(tx, viewer.id),
  ]);
  const circle = me ? [me, ...following] : following;
  const name = (p: DirectoryProfile) => (p.displayName || p.username).toLowerCase();
  return circle.sort(
    (a, b) => name(a).localeCompare(name(b)) || a.username.localeCompare(b.username),
  );
}

/** Everyone in the circle ranked by one number; absent from `values` means nothing to rank. */
export function rankCircle(
  circle: readonly DirectoryProfile[],
  values: ReadonlyMap<string, { value: number; occurredOn?: string }>,
  lowerIsBetter = false,
): Ranked<BoardRow>[] {
  return rank(
    circle.map((person) => {
      const found = values.get(person.id);
      return {
        key: person.id,
        username: person.username,
        displayName: person.displayName,
        value: found?.value ?? null,
        occurredOn: found?.occurredOn ?? null,
      };
    }),
    lowerIsBetter,
  );
}

/**
 * Whether the per-kg rankings are on offer (§3.12): two or more people in the circle whose
 * body weight the viewer may read — which, by the policy, means the viewer shares theirs and
 * so does at least one friend.
 */
export function perKgAvailable(readings: ReadonlyMap<string, SharedReading>): boolean {
  return readings.size >= 2;
}

/**
 * The circle ranked on one movement's metric over all time, with the day each best was set.
 * A per-kg metric divides the load by each person's latest reading and lists only the people
 * whose reading the viewer holds; everyone else is left off rather than trailing as "—".
 */
export function rankExercise(
  circle: readonly DirectoryProfile[],
  bests: ReadonlyMap<string, readonly ExerciseBest[]>,
  readings: ReadonlyMap<string, SharedReading>,
  metric: BoardMetric,
): Ranked<BoardRow>[] {
  const base = perKgBase(metric);
  const values = new Map<string, { value: number; occurredOn: string }>();
  for (const person of circle) {
    const best = bests.get(person.id)?.find((b) => b.metric === (base ?? metric));
    if (!best) continue;
    if (base === null) {
      values.set(person.id, best);
      continue;
    }
    const ratio = bodyWeightRatio(best.value, readings.get(person.id)?.weightKg ?? null);
    if (ratio !== null) values.set(person.id, { value: ratio, occurredOn: best.occurredOn });
  }
  const listed = base === null ? circle : circle.filter((person) => readings.has(person.id));
  return rankCircle(listed, values);
}
