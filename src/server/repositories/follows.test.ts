import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { follows, profileDirectory } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import type { DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";

import {
  acceptFollow,
  circleIds,
  countRequests,
  declineFollow,
  followState,
  listFollowers,
  listFollowing,
  listRequests,
  removeFollower,
  requestFollow,
  unfollow,
} from "./follows";
import { getDirectoryProfile, searchDirectory } from "./people";

/**
 * Following (migration 0020) on the real migration: the two triggers that own `status`, the
 * four policies, `can_view_training()` and the directory's counts. Three accounts — alice,
 * bob and carol — each acting through `withUser`, as the app does.
 */
let t: TestDatabase;
let alice: string;
let bob: string;
let carol: string;

const as =
  (id: string) =>
  <T>(fn: (tx: DbOrTx) => Promise<T>) =>
    withUser(t.db, id, fn);

async function account(email: string, username: string): Promise<string> {
  const id = crypto.randomUUID();
  await t.client.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, email, JSON.stringify({ username })],
  );
  return id;
}

async function setApproval(id: string, approve: boolean): Promise<void> {
  await t.client.query("update profiles set follow_approval = $2 where id = $1", [id, approve]);
}

async function canView(viewer: string, owner: string): Promise<boolean> {
  const [row] = await as(viewer)((tx) =>
    tx
      .select({ ok: sql<boolean>`public.can_view_training(${owner})` })
      .from(profileDirectory)
      .limit(1),
  );
  return row!.ok;
}

const directory = (username: string) =>
  as(alice)((tx) => getDirectoryProfile(tx, username)).then((p) => p!);

/** Where `viewer` stands with the person called `username`. */
async function stateOf(viewer: string, username: string) {
  const target = await directory(username);
  return as(viewer)((tx) => followState(tx, viewer, target));
}

beforeAll(async () => {
  t = await createTestDatabase();
  alice = await account("alice@example.com", "alice");
  bob = await account("bob@example.com", "bob");
  carol = await account("carol@example.com", "carol");
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.client.query("delete from follows");
  await t.client.query("update profiles set follow_approval = true, share_training = true");
});

describe("asking to follow", () => {
  it("starts pending when the other person approves requests, whatever the client says", async () => {
    // The repository sends 'pending'; try 'accepted' straight at the table too.
    expect(await as(alice)((tx) => requestFollow(tx, alice, bob))).toBe("pending");
    await as(carol)((tx) =>
      tx.insert(follows).values({ followerId: carol, followeeId: bob, status: "accepted" }),
    );
    const rows = await t.client.query<{ follower_id: string; status: string; accepted_at: null }>(
      "select follower_id, status, accepted_at from follows where followee_id = $1 order by follower_id",
      [bob],
    );
    expect(rows.rows.map((row) => [row.status, row.accepted_at])).toEqual([
      ["pending", null],
      ["pending", null],
    ]);
  });

  it("is accepted at once when the other person accepts anyone", async () => {
    await setApproval(bob, false);
    expect(await as(carol)((tx) => requestFollow(tx, carol, bob))).toBe("accepted");
    const [row] = (
      await t.client.query<{ accepted_at: string | null }>(
        "select accepted_at from follows where follower_id = $1 and followee_id = $2",
        [carol, bob],
      )
    ).rows;
    expect(row!.accepted_at).not.toBeNull();
  });

  it("asking twice reports the row as it stands", async () => {
    await as(alice)((tx) => requestFollow(tx, alice, bob));
    await as(bob)((tx) => acceptFollow(tx, bob, alice));
    expect(await as(alice)((tx) => requestFollow(tx, alice, bob))).toBe("accepted");
  });

  it("cannot be done in someone else's name, or to yourself", async () => {
    await expect(as(alice)((tx) => requestFollow(tx, bob, alice))).rejects.toThrow();
    await expect(as(alice)((tx) => requestFollow(tx, alice, alice))).rejects.toSatisfy(
      (error: Error) => /follows_not_self_chk/.test(String((error.cause as Error)?.message)),
    );
  });
});

describe("answering a request", () => {
  beforeEach(async () => {
    await as(alice)((tx) => requestFollow(tx, alice, bob));
  });

  it("accepting stamps the time and shows in both lists", async () => {
    expect(await as(bob)((tx) => acceptFollow(tx, bob, alice))).toBe(true);
    expect(await stateOf(alice, "bob")).toMatchObject({ outgoing: "accepted", incoming: null });
    expect(await stateOf(bob, "alice")).toMatchObject({ outgoing: null, incoming: "accepted" });
    expect((await as(alice)((tx) => listFollowing(tx, alice))).map((p) => p.username)).toEqual([
      "bob",
    ]);
    expect((await as(bob)((tx) => listFollowers(tx, bob))).map((p) => p.username)).toEqual([
      "alice",
    ]);
    expect(await as(bob)((tx) => countRequests(tx, bob))).toBe(0);
  });

  it("only the person asked can accept, and only a pending request", async () => {
    // Alice cannot accept her own request: the update policy is the followee's.
    expect(await as(alice)((tx) => acceptFollow(tx, bob, alice))).toBe(false);
    await expect(
      as(alice)((tx) =>
        tx
          .update(follows)
          .set({ status: "accepted" })
          .where(sql`follower_id = ${alice}`),
      ),
    ).resolves.toBeDefined();
    expect(await as(bob)((tx) => countRequests(tx, bob))).toBe(1);
    // And an accepted follow cannot be sent back to pending.
    await as(bob)((tx) => acceptFollow(tx, bob, alice));
    await expect(
      t.client.query("update follows set status = 'pending' where follower_id = $1", [alice]),
    ).rejects.toThrow(/only be accepted/);
  });

  it("declining deletes the row, so they may ask again", async () => {
    expect((await as(bob)((tx) => listRequests(tx, bob))).map((p) => p.username)).toEqual([
      "alice",
    ]);
    await as(bob)((tx) => declineFollow(tx, bob, alice));
    expect(await as(bob)((tx) => listRequests(tx, bob))).toEqual([]);
    expect(await stateOf(alice, "bob")).toMatchObject({ outgoing: null });
    expect(await as(alice)((tx) => requestFollow(tx, alice, bob))).toBe("pending");
  });
});

describe("ending a follow", () => {
  beforeEach(async () => {
    await as(alice)((tx) => requestFollow(tx, alice, bob));
    await as(bob)((tx) => acceptFollow(tx, bob, alice));
  });

  it("the follower can unfollow, and withdraw a pending request the same way", async () => {
    await as(alice)((tx) => requestFollow(tx, alice, carol));
    await as(alice)((tx) => unfollow(tx, alice, bob));
    await as(alice)((tx) => unfollow(tx, alice, carol));
    expect(await as(alice)((tx) => listFollowing(tx, alice))).toEqual([]);
    expect(await as(carol)((tx) => countRequests(tx, carol))).toBe(0);
  });

  it("the followee can remove a follower", async () => {
    await as(bob)((tx) => removeFollower(tx, bob, alice));
    expect(await as(bob)((tx) => listFollowers(tx, bob))).toEqual([]);
  });

  it("a third person can neither see nor touch the row", async () => {
    const seen = await as(carol)((tx) => tx.select().from(follows));
    expect(seen).toEqual([]);
    await as(carol)((tx) => tx.delete(follows));
    expect(await as(bob)((tx) => listFollowers(tx, bob))).toHaveLength(1);
  });
});

describe("can_view_training", () => {
  it.each([
    // name, alice asked, bob accepted, bob approves requests, bob shares → alice may view
    ["nobody follows", false, false, true, true, false],
    ["request pending", true, false, true, true, false],
    ["accepted, sharing on", true, true, true, true, true],
    ["accepted, sharing off", true, true, true, false, false],
    ["anyone may follow, sharing on", true, false, false, true, true],
    ["anyone may follow, sharing off", true, false, false, false, false],
  ])("%s", async (_name, asked, accepted, approvalOn, shares, expected) => {
    await setApproval(bob, approvalOn);
    await t.client.query("update profiles set share_training = $2 where id = $1", [bob, shares]);
    if (asked) await as(alice)((tx) => requestFollow(tx, alice, bob));
    if (accepted) await as(bob)((tx) => acceptFollow(tx, bob, alice));
    expect(await canView(alice, bob)).toBe(expected);
    // Your own training, always; a follower's, never on the strength of their following you.
    expect(await canView(bob, bob)).toBe(true);
    expect(await canView(bob, alice)).toBe(false);
  });
});

describe("the directory and the circle", () => {
  it("counts accepted follows only, and the circle is you plus who you follow", async () => {
    await as(alice)((tx) => requestFollow(tx, alice, bob));
    await as(alice)((tx) => requestFollow(tx, alice, carol));
    await as(bob)((tx) => acceptFollow(tx, bob, alice));
    expect(await directory("alice")).toMatchObject({ followers: 0, following: 1 });
    expect(await directory("bob")).toMatchObject({ followers: 1, following: 0 });
    expect(await directory("carol")).toMatchObject({ followers: 0, following: 0 });
    expect(await as(alice)((tx) => circleIds(tx, alice))).toEqual([alice, bob]);
    expect(await as(carol)((tx) => circleIds(tx, carol))).toEqual([carol]);
  });

  it("finds people by the start of a username or of any word in a name, never you", async () => {
    await t.client.query("update profiles set display_name = $2 where id = $1", [
      bob,
      "Robert Builder",
    ]);
    const names = (query: string) =>
      as(alice)((tx) => searchDirectory(tx, alice, query)).then((rows) =>
        rows.map((row) => row.username),
      );
    expect(await names("bo")).toEqual(["bob"]);
    expect(await names("Build")).toEqual(["bob"]);
    expect(await names("obert")).toEqual([]);
    expect(await names("al")).toEqual([]);
    expect(await names("%")).toEqual([]);
    expect(await names("   ")).toEqual([]);
    expect(await names("carol@example.com")).toEqual(["carol"]);
    expect(await names("CAROL@EXAMPLE.COM")).toEqual(["carol"]);
    expect(await names("alice@example.com")).toEqual([]);
    expect(await names("nobody@example.com")).toEqual([]);
  });
});
