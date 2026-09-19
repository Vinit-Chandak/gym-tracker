/**
 * What of the multisport release is switched on here (plan §§10.4, 11 P4/P7).
 *
 * Everything is off unless an environment says otherwise, because the order of the rollout is
 * the whole safety story: legacy tables stay authoritative until the canonical writer is
 * switched on, and the new sports appear only once there is somewhere for them to be written.
 * A build that shows a swimming form while runs are still the source of truth would create
 * data the old model cannot represent — so `newSports` is refused unless `canonicalWrites`
 * is on, whatever the environment says.
 */

import type { ActivitySport } from "@/domain/activity";

export type MultisportCapabilities = {
  /** Canonical activities are the authority for new writes. */
  canonicalWrites: boolean;
  /** The shared Today/Training/History navigation and the /training routes. */
  sharedNavigation: boolean;
  /** Cycling and swimming are offered. Requires canonical writes. */
  newSports: boolean;
};

const on = (value: string | undefined): boolean =>
  value === "true" || value === "on" || value === "1";

export function multisportRollout(
  env: Record<string, string | undefined> = process.env,
): MultisportCapabilities {
  const all = on(env.MULTISPORT_ROLLOUT);
  const canonicalWrites = all || on(env.MULTISPORT_CANONICAL_WRITES);
  return {
    canonicalWrites,
    sharedNavigation: all || on(env.MULTISPORT_SHARED_NAV),
    // A capability check, not a preference: without a canonical writer there is nowhere for a
    // ride or a swim to go.
    newSports: canonicalWrites && (all || on(env.MULTISPORT_NEW_SPORTS)),
  };
}

/** The sports a build actually offers. Strength and running exist either way. */
export function enabledSports(capabilities: MultisportCapabilities): readonly ActivitySport[] {
  return capabilities.newSports
    ? ["strength", "running", "cycling", "swimming"]
    : ["strength", "running"];
}
