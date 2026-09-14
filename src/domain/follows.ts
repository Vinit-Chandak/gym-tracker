import type { FollowStatus } from "./types";

/** What stands between two accounts, from the viewer's side. */
export type FollowRelation = {
  /** The viewer's follow of the other person, if any. */
  outgoing: FollowStatus | null;
  /** The other person's follow of the viewer, if any. */
  incoming: FollowStatus | null;
  /** Whether the other person approves requests (true) or accepts anyone (false). */
  followApproval: boolean;
};

/** The five things the follow button can say (plan §3.6). */
export type FollowButtonState = "follow" | "request" | "requested" | "following" | "follow_back";

/**
 * Which of the five the button shows. "Follow back" is the not-following case when the other
 * person already follows you; what a tap does is still decided by their approval setting.
 */
export function followButtonState(relation: FollowRelation): FollowButtonState {
  if (relation.outgoing === "accepted") return "following";
  if (relation.outgoing === "pending") return "requested";
  if (relation.incoming === "accepted") return "follow_back";
  return relation.followApproval ? "request" : "follow";
}

/** What a tap on a not-yet-following button leads to. */
export function followOutcome(relation: FollowRelation): "request" | "follow" {
  return relation.followApproval ? "request" : "follow";
}
