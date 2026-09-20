import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../test/pglite";

/**
 * Migration 0029 fills in the review interval for accounts the old coach switch left without
 * one: `ai_coach_enabled` true and `consented_at` null, which every caller read as "no review,
 * ever". Their sessions were prepared and their memo written while their programme was never
 * reviewed.
 *
 * The migration has already run against empty tables by the time this database is built, which
 * proves it applies and says nothing about what it does with rows — and rows are the part that
 * can be wrong. So its own statements are read out of the file, not retyped, and replayed
 * against data that looks like it was written before the workflow existed.
 *
 * The two it must not touch matter as much as the one it fills. Writing an interval for an
 * account with the coach off would start a cadence nobody asked for, and overwriting an anchor
 * that is already there would replay reviews the athlete has already had.
 */
const BACKFILL = readFileSync(new URL("./0029_coach_review_anchor.sql", import.meta.url), "utf8")
  .split("--> statement-breakpoint")
  .map((statement) =>
    statement
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean);

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

async function backfill(): Promise<void> {
  for (const statement of BACKFILL) await t.client.exec(statement);
}

/** An account with the coach switched on, and a programme underway since `startDate`. */
async function athlete(
  email: string,
  options: { coachOn?: boolean; startDate?: string | null } = {},
): Promise<string> {
  const { coachOn = true, startDate = "2026-06-01" } = options;
  const { id } = await t.createAuthUser(email);
  await t.client.query("update profiles set ai_coach_enabled = $2 where id = $1", [id, coachOn]);
  await t.client.query(
    `insert into programs (user_id, family_id, slug, name, status, start_date)
     values ($1, gen_random_uuid(), $2, $2, 'active', $3)`,
    [id, email.split("@")[0], startDate],
  );
  return id;
}

async function preference(
  userId: string,
): Promise<{ consented_at: string | null; review_anchor_at: string | null } | undefined> {
  const result = await t.client.query<{
    consented_at: string | null;
    review_anchor_at: string | null;
  }>("select consented_at::text, review_anchor_at::text from coach_preferences where user_id = $1", [
    userId,
  ]);
  return result.rows[0];
}

describe("migration 0029 coach review anchor", () => {
  it("gives an account with no preferences row at all an interval from its programme", async () => {
    const id = await athlete("no-row@example.test");
    expect(await preference(id)).toBeUndefined();

    await backfill();

    const filled = await preference(id);
    expect(filled?.consented_at).toContain("2026-06-01");
  });

  it("fills a null interval on a row that already exists", async () => {
    const id = await athlete("null-anchor@example.test", { startDate: "2026-07-15" });
    await t.client.query(
      `insert into coach_preferences (user_id, mode, consented_at, review_anchor_at)
       values ($1, 'coach', null, null)`,
      [id],
    );

    await backfill();

    expect((await preference(id))?.consented_at).toContain("2026-07-15");
  });

  it("leaves an account with the coach switched off alone", async () => {
    const id = await athlete("coach-off@example.test", { coachOn: false });

    await backfill();

    expect(await preference(id)).toBeUndefined();
  });

  it("does not overwrite an interval that is already recorded", async () => {
    const id = await athlete("already@example.test", { startDate: "2026-01-01" });
    await t.client.query(
      `insert into coach_preferences (user_id, mode, consented_at)
       values ($1, 'coach', '2026-08-20T00:00:00Z')`,
      [id],
    );

    await backfill();

    expect((await preference(id))?.consented_at).toContain("2026-08-20");
  });

  /** An anchor is the later fact; a null `consented_at` beside one is not a gap to fill. */
  it("leaves a row whose review anchor is set but whose consent is null", async () => {
    const id = await athlete("anchored@example.test");
    await t.client.query(
      `insert into coach_preferences (user_id, mode, consented_at, review_anchor_at)
       values ($1, 'coach', null, '2026-09-01T00:00:00Z')`,
      [id],
    );

    await backfill();

    const row = await preference(id);
    expect(row?.consented_at).toBeNull();
    expect(row?.review_anchor_at).toContain("2026-09-01");
  });

  /** A programme with no start date still has a creation time, and an interval needs one. */
  it("falls back to when the programme was created", async () => {
    const id = await athlete("no-start@example.test", { startDate: null });

    await backfill();

    expect((await preference(id))?.consented_at).not.toBeNull();
  });

  it("is idempotent: a second run changes nothing", async () => {
    const id = await athlete("twice@example.test", { startDate: "2026-05-05" });
    await backfill();
    const first = await preference(id);

    await backfill();

    expect(await preference(id)).toEqual(first);
  });
});
