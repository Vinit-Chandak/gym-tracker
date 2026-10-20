import { stable } from "./endurance-series";

/**
 * How an endurance programme runs, in the athlete's words (ADR 0058): Repeating when it asks for
 * the same work again and again, Progressive when its work changes as it builds.
 *
 * Endurance programmes do not store it: the builder's repeating and week-by-week views write the
 * same dated sessions. It is read from them instead. A programme is repeating when every session
 * it asks for appears more than once with exactly the same prescription; a single session that
 * is its own changes it into a progression. Withdrawn sessions ask for nothing and are not read.
 */
export function endurancePattern(
  sessions: readonly { prescription: unknown; withdrawn: boolean }[],
): "Repeating" | "Progressive" {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    if (session.withdrawn) continue;
    const key = stable(session.prescription);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts.size > 0 && [...counts.values()].every((count) => count > 1)
    ? "Repeating"
    : "Progressive";
}
