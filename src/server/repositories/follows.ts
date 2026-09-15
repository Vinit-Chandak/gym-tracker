import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { follows, profileDirectory } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { FollowRelation } from "@/domain/follows";
import type { FollowStatus } from "@/domain/types";

import type { DirectoryProfile } from "./people";

/**
 * Follows (ADR 0026). Every function names the user ids it reads; the policies on `follows`
 * (either side may read, only the follower inserts, only the followee updates) are the
 * guarantee, not the filter. Status is set by the database triggers, never sent from here.
 */

const DIRECTORY_COLUMNS = {
  id: profileDirectory.id,
  username: profileDirectory.username,
  displayName: profileDirectory.displayName,
  joinedAt: profileDirectory.joinedAt,
  followApproval: profileDirectory.followApproval,
  followers: profileDirectory.followers,
  following: profileDirectory.following,
};

/** People are listed by what they are called, so a list reads like a contact list. */
const BY_NAME = [
  asc(sql`lower(coalesce(${profileDirectory.displayName}, ${profileDirectory.username}))`),
  asc(profileDirectory.username),
];

/** Where the viewer stands with one person. */
export async function followState(
  tx: DbOrTx,
  viewerId: string,
  target: Pick<DirectoryProfile, "id" | "followApproval">,
): Promise<FollowRelation> {
  const [relation] = await followRelations(tx, viewerId, [target]);
  return relation!;
}

/**
 * Where the viewer stands with each of several people, in one read of `follows`: both
 * directions between the viewer and the given ids.
 */
export async function followRelations(
  tx: DbOrTx,
  viewerId: string,
  targets: readonly Pick<DirectoryProfile, "id" | "followApproval">[],
): Promise<FollowRelation[]> {
  if (targets.length === 0) return [];
  const ids = targets.map((target) => target.id);
  const rows = await tx
    .select({
      followerId: follows.followerId,
      followeeId: follows.followeeId,
      status: follows.status,
    })
    .from(follows)
    .where(
      or(
        and(eq(follows.followerId, viewerId), inArray(follows.followeeId, ids)),
        and(eq(follows.followeeId, viewerId), inArray(follows.followerId, ids)),
      ),
    );
  const outgoing = new Map<string, FollowStatus>();
  const incoming = new Map<string, FollowStatus>();
  for (const row of rows) {
    if (row.followerId === viewerId) outgoing.set(row.followeeId, row.status);
    else incoming.set(row.followerId, row.status);
  }
  return targets.map((target) => ({
    outgoing: outgoing.get(target.id) ?? null,
    incoming: incoming.get(target.id) ?? null,
    followApproval: target.followApproval,
  }));
}

/** The people the viewer follows, accepted only, by name. */
export async function listFollowing(tx: DbOrTx, viewerId: string): Promise<DirectoryProfile[]> {
  return tx
    .select(DIRECTORY_COLUMNS)
    .from(follows)
    .innerJoin(profileDirectory, eq(profileDirectory.id, follows.followeeId))
    .where(and(eq(follows.followerId, viewerId), eq(follows.status, "accepted")))
    .orderBy(...BY_NAME);
}

/** The people who follow the viewer, accepted only, by name. */
export async function listFollowers(tx: DbOrTx, viewerId: string): Promise<DirectoryProfile[]> {
  return tx
    .select(DIRECTORY_COLUMNS)
    .from(follows)
    .innerJoin(profileDirectory, eq(profileDirectory.id, follows.followerId))
    .where(and(eq(follows.followeeId, viewerId), eq(follows.status, "accepted")))
    .orderBy(...BY_NAME);
}

export type FollowRequest = DirectoryProfile & { requestedAt: Date };

/** Requests waiting for the viewer's answer, newest first. */
export async function listRequests(tx: DbOrTx, viewerId: string): Promise<FollowRequest[]> {
  return tx
    .select({ ...DIRECTORY_COLUMNS, requestedAt: follows.createdAt })
    .from(follows)
    .innerJoin(profileDirectory, eq(profileDirectory.id, follows.followerId))
    .where(and(eq(follows.followeeId, viewerId), eq(follows.status, "pending")))
    .orderBy(desc(follows.createdAt));
}

/** How many requests are waiting: the one number the Profile tab shows about friends. */
export async function countRequests(tx: DbOrTx, viewerId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::integer` })
    .from(follows)
    .where(and(eq(follows.followeeId, viewerId), eq(follows.status, "pending")));
  return row?.n ?? 0;
}

/**
 * Asks to follow, or follows outright: the trigger decides from the target's setting and the
 * status it chose comes back. Asking twice changes nothing and reports the row as it stands.
 */
export async function requestFollow(
  tx: DbOrTx,
  viewerId: string,
  targetId: string,
): Promise<FollowStatus> {
  // The column is not null, so a value is required here; the trigger overwrites it.
  const [inserted] = await tx
    .insert(follows)
    .values({ followerId: viewerId, followeeId: targetId, status: "pending" })
    .onConflictDoNothing({ target: [follows.followerId, follows.followeeId] })
    .returning({ status: follows.status });
  if (inserted) return inserted.status;
  const [existing] = await tx
    .select({ status: follows.status })
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, targetId)));
  if (!existing) throw new Error("Follow could not be recorded");
  return existing.status;
}

/** Accepts a request made to the viewer. False when there was none to accept. */
export async function acceptFollow(
  tx: DbOrTx,
  viewerId: string,
  followerId: string,
): Promise<boolean> {
  const updated = await tx
    .update(follows)
    .set({ status: "accepted" })
    .where(
      and(
        eq(follows.followeeId, viewerId),
        eq(follows.followerId, followerId),
        eq(follows.status, "pending"),
      ),
    )
    .returning({ followerId: follows.followerId });
  return updated.length > 0;
}

/** Declines a request made to the viewer: the row goes, and they may ask again. */
export async function declineFollow(
  tx: DbOrTx,
  viewerId: string,
  followerId: string,
): Promise<void> {
  await tx
    .delete(follows)
    .where(
      and(
        eq(follows.followeeId, viewerId),
        eq(follows.followerId, followerId),
        eq(follows.status, "pending"),
      ),
    );
}

/** Unfollows, or withdraws a request: the viewer's own row, whatever its status. */
export async function unfollow(tx: DbOrTx, viewerId: string, targetId: string): Promise<void> {
  await tx
    .delete(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, targetId)));
}

/** Removes an accepted follower of the viewer. */
export async function removeFollower(
  tx: DbOrTx,
  viewerId: string,
  followerId: string,
): Promise<void> {
  await tx
    .delete(follows)
    .where(
      and(
        eq(follows.followeeId, viewerId),
        eq(follows.followerId, followerId),
        eq(follows.status, "accepted"),
      ),
    );
}

/** The viewer and the people they follow: who a leaderboard ranks (decision 3). */
export async function circleIds(tx: DbOrTx, viewerId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: follows.followeeId })
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.status, "accepted")));
  return [viewerId, ...rows.map((row) => row.id)];
}
