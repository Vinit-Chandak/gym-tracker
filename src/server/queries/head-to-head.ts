import type { DbOrTx } from "@/db/types";
import type { FollowRelation } from "@/domain/follows";
import { followState } from "@/server/repositories/follows";
import {
  getDirectoryProfile,
  getDirectoryProfileById,
  type DirectoryProfile,
} from "@/server/repositories/people";
import { canViewTraining } from "@/server/repositories/shared-stats";

export type HeadToHead = {
  /** The viewer, as the directory shows them: the left side of every comparison. */
  me: DirectoryProfile;
  /** The friend, the right side. */
  them: DirectoryProfile;
  relation: FollowRelation;
  /** Whether the viewer may see the friend's training; the policies' own answer. */
  visible: boolean;
};

/**
 * Who a comparison is between (plan §3.10): the viewer and the person at the handle. Null
 * when no such person exists, or when the handle is the viewer's own, which the page turns
 * into their profile. Reads the directory and the policies only; the training itself is read
 * by the screen that needs it. The viewer is found by id: a username from a cached profile
 * can be one they have just given up.
 */
export async function loadHeadToHead(
  tx: DbOrTx,
  viewerId: string,
  handle: string,
): Promise<HeadToHead | "self" | null> {
  const them = await getDirectoryProfile(tx, handle);
  if (!them) return null;
  if (them.id === viewerId) return "self";
  const [me, relation, visible] = await Promise.all([
    getDirectoryProfileById(tx, viewerId),
    followState(tx, viewerId, them),
    canViewTraining(tx, them.id),
  ]);
  if (!me) return null;
  return { me, them, relation, visible };
}

/** The one line said when a person's training cannot be shown (plan §3.14). */
export function hiddenTrainingLine(head: {
  them: Pick<DirectoryProfile, "username" | "displayName">;
  relation: Pick<FollowRelation, "outgoing">;
}): string {
  const name = head.them.displayName || head.them.username;
  if (head.relation.outgoing === "accepted") return `${name} keeps their training private.`;
  // Under a button that already says Requested, asking to follow would be asking twice.
  if (head.relation.outgoing === "pending")
    return `Waiting for @${head.them.username} to accept your request.`;
  return `Follow @${head.them.username} to see their training.`;
}
