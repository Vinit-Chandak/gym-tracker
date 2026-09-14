import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "drizzle-orm";

import { profileDirectory, profiles } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test/pglite";
import { withUser } from "../with-user";

/**
 * Migration 0019 gives every account a username and the SQL that keeps them honest: the
 * generator, the auth trigger, the directory view and the two lookups. All of it runs here on
 * the real migration, as it will in Supabase.
 */
let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

async function usernameOf(id: string): Promise<string> {
  const result = await t.client.query<{ username: string }>(
    "select username from profiles where id = $1",
    [id],
  );
  return result.rows[0]!.username;
}

async function generate(base: string, preferred: string | null): Promise<string> {
  const result = await t.client.query<{ name: string }>(
    "select public.generate_username($1, $2) as name",
    [base, preferred],
  );
  return result.rows[0]!.name;
}

async function available(candidate: string): Promise<boolean> {
  const result = await t.client.query<{ ok: boolean }>(
    "select public.username_available($1) as ok",
    [candidate],
  );
  return result.rows[0]!.ok;
}

/** Signs up the way Supabase does: an auth row, with whatever the form put in the metadata. */
async function signUp(email: string, metadata: Record<string, string> = {}): Promise<string> {
  const id = crypto.randomUUID();
  await t.client.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, email, JSON.stringify(metadata)],
  );
  return id;
}

describe("generate_username", () => {
  it("uses the preferred name when it is valid and free", async () => {
    expect(await generate("whatever", "Phani03 ")).toBe("phani03");
  });

  it("falls back to the email when the preferred name is taken, reserved or invalid", async () => {
    const taken = await signUp("first.taker@example.com", { username: "taken_name" });
    expect(await usernameOf(taken)).toBe("taken_name");
    expect(await generate("second", "taken_name")).toBe("second");
    expect(await generate("second", "coach")).toBe("second");
    expect(await generate("second", "no spaces")).toBe("second");
  });

  it("sanitises the email's local part the way usernameFromEmail does", async () => {
    expect(await generate("Vinit.Chandak", null)).toBe("vinit.chandak");
    expect(await generate("phani+gym", null)).toBe("phanigym");
    expect(await generate("..a...b..", null)).toBe("a.b");
    expect(await generate("jo", null)).toBe("jo0");
    expect(await generate("abcdefghijklmnopqrs.tuv", null)).toBe("abcdefghijklmnopqrs");
  });

  it("suffixes a namesake, oldest first", async () => {
    const first = await signUp("alex@one.example");
    const second = await signUp("alex@two.example");
    const third = await signUp("alex@three.example");
    expect(await usernameOf(first)).toBe("alex");
    expect(await usernameOf(second)).toBe("alex2");
    expect(await usernameOf(third)).toBe("alex3");
  });

  it("suffixes a reserved local part rather than granting it", async () => {
    expect(await generate("coach", null)).toBe("coach2");
  });

  it("keeps room for the suffix on a name at the length limit", async () => {
    const full = "a".repeat(20);
    await signUp(`${full}@example.com`);
    expect(await generate(full, null)).toBe(`${"a".repeat(19)}2`);
  });

  it("invents a name when the email offers nothing", async () => {
    expect(await generate("+++", null)).toMatch(/^athlete_[0-9a-f]{8}$/);
    expect(await generate("", null)).toMatch(/^athlete_[0-9a-f]{8}$/);
  });
});

describe("the sign-up trigger", () => {
  it("honours the username the form asked for", async () => {
    const id = await signUp("someone@example.com", { username: "Chosen.One", display_name: "S" });
    expect(await usernameOf(id)).toBe("chosen.one");
  });

  it("still creates the account, with a suffixed name, when the asked-for one is taken", async () => {
    await signUp("a@example.com", { username: "popular" });
    const id = await signUp("popular@example.com", { username: "popular" });
    expect(await usernameOf(id)).toBe("popular2");
  });
});

describe("the username column", () => {
  it("refuses a name that breaks the rules, whoever writes it", async () => {
    const id = await signUp("rules@example.com");
    for (const bad of ["ab", "Upper", "dot..dot", ".lead", "trail_", "profile"]) {
      await expect(
        t.client.query("update profiles set username = $2 where id = $1", [id, bad]),
      ).rejects.toThrow(/profiles_username_chk/);
    }
  });

  it("refuses a duplicate", async () => {
    const id = await signUp("dupe@example.com");
    await signUp("owner@example.com", { username: "owned" });
    await expect(
      t.client.query("update profiles set username = $2 where id = $1", [id, "owned"]),
    ).rejects.toThrow(/profiles_username_uq/);
  });
});

describe("username_available", () => {
  it("is true for a valid, unreserved, unused name and false otherwise", async () => {
    await signUp("used@example.com", { username: "in_use" });
    expect(await available("fresh.name")).toBe(true);
    expect(await available("  Fresh.Name ")).toBe(true);
    expect(await available("in_use")).toBe(false);
    expect(await available("IN_USE")).toBe(false);
    expect(await available("coach")).toBe(false);
    expect(await available("ab")).toBe(false);
    expect(await available("no spaces")).toBe(false);
  });
});

describe("profile_directory", () => {
  it("exposes only the listed columns", async () => {
    const result = await t.client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'profile_directory' order by ordinal_position`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "id",
      "username",
      "display_name",
      "joined_at",
      "follow_approval",
    ]);
  });

  it("shows every account to any signed-in account", async () => {
    const viewer = await signUp("viewer@example.com");
    const other = await signUp("other@example.com", { username: "other_person" });
    const seen = await withUser(t.db, viewer, (tx) =>
      tx.select({ id: profileDirectory.id, username: profileDirectory.username }).from(profileDirectory),
    );
    expect(seen.some((row) => row.id === other && row.username === "other_person")).toBe(true);
    // And the table behind it stays private: only your own row.
    const own = await withUser(t.db, viewer, (tx) => tx.select({ id: profiles.id }).from(profiles));
    expect(own.map((row) => row.id)).toEqual([viewer]);
  });
});

describe("find_profile_by_email", () => {
  async function find(candidate: string): Promise<Record<string, unknown>[]> {
    const result = await t.client.query<Record<string, unknown>>(
      "select * from public.find_profile_by_email($1)",
      [candidate],
    );
    return result.rows;
  }

  it("matches the exact address, case-insensitively, and returns a directory row", async () => {
    const target = await signUp("Findable@Example.com", { username: "findable" });
    const rows = await find("findable@example.com");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(target);
    expect(rows[0]!.username).toBe("findable");
    expect(Object.keys(rows[0]!)).not.toContain("email");
  });

  it("returns nothing for a partial match or for an account that opted out", async () => {
    const hidden = await signUp("hidden@example.com");
    await t.client.query("update profiles set discoverable_by_email = false where id = $1", [
      hidden,
    ]);
    expect(await find("hidden@example.com")).toHaveLength(0);
    expect(await find("findable")).toHaveLength(0);
  });

  it("may be called by a signed-in account", async () => {
    const viewer = await signUp("finder@example.com");
    const target = await signUp("reachable@example.com", { username: "reachable" });
    const rows = await withUser(t.db, viewer, (tx) =>
      tx
        .select({ id: sql<string>`id`, username: sql<string>`username` })
        .from(sql`public.find_profile_by_email(${"reachable@example.com"})`),
    );
    expect(rows).toEqual([{ id: target, username: "reachable" }]);
  });
});
