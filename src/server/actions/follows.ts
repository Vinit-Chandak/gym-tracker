"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import type { FollowStatus } from "@/domain/types";
import { requireUser } from "@/server/auth";
import {
  acceptFollow,
  declineFollow,
  removeFollower,
  requestFollow,
  unfollow,
} from "@/server/repositories/follows";

/**
 * Following (ADR 0026). Each of these names the other person by id, checks it is one, acts as
 * the signed-in user under RLS, and refreshes every screen that shows the relationship: the
 * Profile tab (counts and the request badge), the Friends page, and every person's page.
 */

function personId(value: unknown): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new Error("Not a person");
  return parsed.data;
}

function followsChanged(): void {
  revalidatePath("/profile");
  revalidatePath("/profile/friends");
  revalidatePath("/u/[username]", "page");
}

/** Follows, or asks to: which one is the database's decision, and it comes back. */
export async function followAction(targetId: string): Promise<FollowStatus> {
  const user = await requireUser();
  const target = personId(targetId);
  const status = await withUser(getDb(), user.id, (tx) => requestFollow(tx, user.id, target));
  followsChanged();
  return status;
}

export async function unfollowAction(targetId: string): Promise<void> {
  const user = await requireUser();
  const target = personId(targetId);
  await withUser(getDb(), user.id, (tx) => unfollow(tx, user.id, target));
  followsChanged();
}

/** Withdraws a request that has not been answered: the same row, the same delete. */
export async function cancelRequestAction(targetId: string): Promise<void> {
  await unfollowAction(targetId);
}

export async function acceptRequestAction(followerId: string): Promise<void> {
  const user = await requireUser();
  const follower = personId(followerId);
  await withUser(getDb(), user.id, (tx) => acceptFollow(tx, user.id, follower));
  followsChanged();
}

export async function declineRequestAction(followerId: string): Promise<void> {
  const user = await requireUser();
  const follower = personId(followerId);
  await withUser(getDb(), user.id, (tx) => declineFollow(tx, user.id, follower));
  followsChanged();
}

export async function removeFollowerAction(followerId: string): Promise<void> {
  const user = await requireUser();
  const follower = personId(followerId);
  await withUser(getDb(), user.id, (tx) => removeFollower(tx, user.id, follower));
  followsChanged();
}
