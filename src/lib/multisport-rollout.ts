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

/**
 * The ordered stages of the cutover (plan §10.4), as something a build can be asked about.
 *
 * The order is the whole safety argument, and an order that lives only in a runbook is an
 * order somebody skips a step of at two in the morning. So it is data: each stage says what
 * capabilities belong to it, and `stageOf` reads a set of capabilities back as the stage they
 * describe. A combination that matches no stage is a misconfiguration, which is exactly what
 * a deployment wants to hear before it serves a request rather than after.
 */
export const CUTOVER_STAGES = [
  {
    id: "legacy",
    /** Nothing new. The app behaves exactly as it did before any of this existed. */
    capabilities: { canonicalWrites: false, sharedNavigation: false, newSports: false },
    summary: "Legacy tables are authoritative. No canonical write, no new route, no new sport.",
  },
  {
    id: "bridge",
    /**
     * M1 is deployed and the app understands the new contracts, but legacy is still the
     * writer. This is the stage the backfill runs under, and the stage an abort returns to.
     */
    capabilities: { canonicalWrites: false, sharedNavigation: true, newSports: false },
    summary:
      "Shared navigation is on for reading; legacy remains the writer and no new sport is offered.",
  },
  {
    id: "canonical",
    /** Write authority has moved. The new sports are not offered until coaching is ready. */
    capabilities: { canonicalWrites: true, sharedNavigation: true, newSports: false },
    summary: "Canonical activities are the authority. Cycling and swimming are not yet offered.",
  },
  {
    id: "complete",
    capabilities: { canonicalWrites: true, sharedNavigation: true, newSports: true },
    summary: "All four sports, with the coaching that was promised for them.",
  },
] as const;

export type CutoverStage = (typeof CUTOVER_STAGES)[number]["id"];

/**
 * Which stage a set of capabilities is, or null for a combination the order does not allow.
 *
 * Canonical writes without the shared navigation is the interesting null: the athlete would
 * be writing occurrences with no screen that can read them. The gate already refuses new
 * sports without a writer; this refuses the mirror image.
 */
export function stageOf(capabilities: MultisportCapabilities): CutoverStage | null {
  const stage = CUTOVER_STAGES.find(
    (candidate) =>
      candidate.capabilities.canonicalWrites === capabilities.canonicalWrites &&
      candidate.capabilities.sharedNavigation === capabilities.sharedNavigation &&
      candidate.capabilities.newSports === capabilities.newSports,
  );
  return stage?.id ?? null;
}

/** Whether the release is at or past the point where canonical data is the authority. */
export function pastSwitch(capabilities: MultisportCapabilities): boolean {
  return capabilities.canonicalWrites;
}

export type StageProblem = { code: string; detail: string };

/**
 * What is wrong with a configuration, in the terms the rollout order uses.
 *
 * Returns problems rather than throwing: a deployment check wants every reason at once, and
 * a start-up that dies on the first one makes the second invisible.
 */
export function stageProblems(capabilities: MultisportCapabilities): StageProblem[] {
  const problems: StageProblem[] = [];
  if (capabilities.canonicalWrites && !capabilities.sharedNavigation)
    problems.push({
      code: "writer_without_screens",
      detail:
        "Canonical writes are on while the shared navigation is off: occurrences would be written with nothing able to read them. Turn on MULTISPORT_SHARED_NAV, or turn the writer off.",
    });
  if (capabilities.newSports && !capabilities.canonicalWrites)
    problems.push({
      code: "sports_without_writer",
      detail:
        "Cycling and swimming need a canonical writer; there is nowhere for a ride or a swim to be recorded.",
    });
  return problems;
}

/**
 * The stages a transition may legitimately pass through.
 *
 * Forward one step at a time, and backward only to the bridge — which is the abort described
 * in §10.6, taken before the first canonical write. Going backward from `canonical` is not
 * listed, because by then an old app cannot represent what has been written and the recovery
 * is a rehearsed replay rather than a flag change.
 */
const FORWARD: Record<CutoverStage, readonly CutoverStage[]> = {
  legacy: ["bridge"],
  bridge: ["legacy", "canonical"],
  canonical: ["complete"],
  complete: [],
};

export function canTransition(from: CutoverStage, to: CutoverStage): boolean {
  return from === to || FORWARD[from].includes(to);
}

/** Why a transition is refused, for an operator who is mid-cutover and needs the reason. */
export function transitionProblem(from: CutoverStage, to: CutoverStage): string | null {
  if (canTransition(from, to)) return null;
  if (from === "canonical" || from === "complete")
    return `Going back from ${from} to ${to} cannot be done with a switch: canonical activities exist that an earlier release cannot represent. Use the rehearsed recovery in the runbook (§10.6).`;
  return `The rollout order does not go from ${from} to ${to}. The stages are ${CUTOVER_STAGES.map((stage) => stage.id).join(" → ")}.`;
}
