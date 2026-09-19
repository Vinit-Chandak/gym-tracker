import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backfillMultisport } from "@/db/backfill-multisport";
import {
  CONTRACT_WINDOWS,
  contractGates,
  contractMultisport,
} from "@/db/contract-multisport";
import { CUTOVER_MARKERS, markerAt, recordMarker } from "@/db/multisport-cutover";
import { activities, dailyRecovery, multisportMigrationLinks, profiles } from "@/db/schema";
import { seedLegacyAccount, type LegacyAccount } from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { validateMultisport } from "@/db/validate-multisport";
import { withUser } from "@/db/with-user";
import { handleCoachRequest } from "@/server/coach-api";
import { deleteRunAction, saveRunAction } from "@/server/actions/runs";
import { activityForLegacyRun } from "@/server/legacy-routes";
import { createCoachToken } from "@/server/repositories/coach-tokens";

/**
 * AT-MIG-15 and AT-API-06: the contraction, and everything it is not allowed to take with it.
 *
 * Two things are being tested and they pull in opposite directions. The gates have to hold —
 * a window that has not elapsed is not an argument — and, once they open, the drop has to
 * leave behind exactly the things the plan says survive it: recovery, the identifier map, the
 * resolution of a year-old `run:<uuid>`, and a working account deletion.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

async function ready(email: string): Promise<LegacyAccount> {
  const user = await t.createAuthUser(email);
  const account = await seedLegacyAccount(t.db, user);
  await backfillMultisport(t.db, { userId: account.userId });
  await validateMultisport(t.db);
  await recordMarker(t.db, CUTOVER_MARKERS.authoritySwitched);
  return account;
}

/** A date far enough in the future that every window has run. */
const afterTheWindows = (days = CONTRACT_WINDOWS.readApiDays + 1) =>
  new Date(Date.now() + days * 86_400_000);

const quietSince = () => new Date(Date.now() - CONTRACT_WINDOWS.quietDays * 86_400_000).toISOString();

describe("the gates", () => {
  it("refuses before authority has switched at all", async () => {
    const gates = await contractGates(t.db);
    expect(gates).toHaveLength(1);
    expect(gates[0]?.ok).toBe(false);
    expect(gates[0]?.detail).toContain("no switch marker");
  });

  /** AT-MIG-15: the windows are time, and time is not negotiable. */
  it("refuses while the compatibility windows are still running", async () => {
    await ready("too-soon@example.test");
    const gates = await contractGates(t.db, { legacyUsageAt: quietSince() });
    const windows = gates.filter((gate) => gate.name.includes("window"));
    expect(windows).toHaveLength(2);
    expect(windows.every((gate) => !gate.ok)).toBe(true);

    const report = await contractMultisport(t.db, { legacyUsageAt: quietSince() });
    expect(report.applied).toBe(false);
    expect(report.dropped).toEqual([]);
    // And the table is still there.
    const [row] = await t.db
      .execute<{ value: number }>(
        sql`select count(*)::int as value from information_schema.tables
            where table_schema = 'public' and table_name = 'runs'`,
      )
      .then((result) => (Array.isArray(result) ? result : result.rows));
    expect(row?.value).toBe(1);
  });

  /** OP-06: an unknown usage answer is not a quiet one. */
  it("refuses when nobody has said when the legacy surfaces were last used", async () => {
    await ready("unknown-usage@example.test");
    const gates = await contractGates(t.db, { now: afterTheWindows() });
    const usage = gates.find((gate) => gate.name.includes("legacy usage"));
    expect(usage?.ok).toBe(false);
    expect(usage?.detail).toContain("cannot be read from the database");
  });

  it("refuses while a legacy write has happened since the switch", async () => {
    const account = await ready("late-writer@example.test");
    await t.db.execute(sql`
      insert into public.runs
        (user_id, started_at, mode, distance_meters, duration_seconds, created_at)
      values (${account.userId}, now(), 'outdoor', 5000, 1800, now() + interval '1 day')
    `);
    const gates = await contractGates(t.db, {
      now: afterTheWindows(),
      legacyUsageAt: quietSince(),
    });
    const writer = gates.find((gate) => gate.name.includes("legacy writer"));
    expect(writer?.ok).toBe(false);
  });
});

describe("what the contraction leaves behind", () => {
  /** AT-MIG-15: the drop happens, and takes only the retired writers with it. */
  it("drops the retired raw tables and keeps recovery and the identifier map", async () => {
    const account = await ready("contract@example.test");
    const recoveryBefore = await t.db
      .select({ id: dailyRecovery.id })
      .from(dailyRecovery)
      .where(eq(dailyRecovery.userId, account.userId));
    const linksBefore = await t.db
      .select({ id: multisportMigrationLinks.id })
      .from(multisportMigrationLinks)
      .where(eq(multisportMigrationLinks.userId, account.userId));
    expect(linksBefore.length).toBeGreaterThan(0);

    const report = await contractMultisport(t.db, {
      now: afterTheWindows(),
      legacyUsageAt: quietSince(),
    });
    expect(report.applied).toBe(true);
    expect(report.dropped).toEqual(["runs", "program_runs"]);

    const tables = await t.db
      .execute<{ table_name: string }>(
        sql`select table_name from information_schema.tables
            where table_schema = 'public'
              and table_name in ('runs', 'program_runs', 'daily_recovery',
                                 'multisport_migration_links', 'activities')
            order by table_name`,
      )
      .then((result) => (Array.isArray(result) ? result : result.rows));
    expect(tables.map((row) => row.table_name)).toEqual([
      "activities",
      "daily_recovery",
      "multisport_migration_links",
    ]);

    // Recovery is untouched, which is the point of naming it apart from the run table it was
    // only ever declared beside (MIG-02).
    const recoveryAfter = await t.db
      .select({ id: dailyRecovery.id })
      .from(dailyRecovery)
      .where(eq(dailyRecovery.userId, account.userId));
    expect(recoveryAfter).toEqual(recoveryBefore);

    const linksAfter = await t.db
      .select({ id: multisportMigrationLinks.id })
      .from(multisportMigrationLinks)
      .where(eq(multisportMigrationLinks.userId, account.userId));
    expect(linksAfter).toEqual(linksBefore);
  });

  /** AT-COACH-11: a year-old `run:<uuid>` still resolves after the table is gone. */
  it("still resolves a legacy run identifier once the table is dropped", async () => {
    const account = await ready("resolve@example.test");
    const runId = account.runIds[0]!;
    const before = await withUser(t.db, account.userId, (tx) =>
      activityForLegacyRun(tx, account.userId, runId),
    );
    expect(before).not.toBeNull();

    await contractMultisport(t.db, {
      now: afterTheWindows(),
      legacyUsageAt: quietSince(),
    });

    const after = await withUser(t.db, account.userId, (tx) =>
      activityForLegacyRun(tx, account.userId, runId),
    );
    expect(after).toBe(before);
    // And the activity it names is really there.
    const [activity] = await t.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.id, after!));
    expect(activity?.id).toBe(after);
  });

  /** AT-API-06: the retired version answers 410, and never a redirect. */
  it("answers 410 on v1 once the contraction has run, and still serves v2", async () => {
    const account = await ready("retired-api@example.test");
    const created = await withUser(t.db, account.userId, (tx) =>
      createCoachToken(tx, account.userId, "test", 30),
    );
    const call = (path: string) =>
      handleCoachRequest(
        t.db,
        new Request(`https://app.test/api/coach/${path}`, {
          headers: { authorization: `Bearer ${created.token}` },
        }),
        path.split("/"),
      );

    expect((await call("summary")).status).toBe(200);
    await contractMultisport(t.db, {
      now: afterTheWindows(),
      legacyUsageAt: quietSince(),
    });

    const gone = await call("summary");
    expect(gone.status).toBe(410);
    expect(gone.headers.get("Content-Type")).toContain("application/json");
    const body = (await gone.json()) as { error: string; upgradeTo: string };
    expect(body.error).toBe("gone");
    expect(body.upgradeTo).toBe("/api/coach/v2/activities");

    // v2 is unaffected: the data it reads was never in the dropped tables.
    expect((await call("v2/summary")).status).toBe(200);
  });

  /** AT-PRIV-06: deletion still takes the whole account with it after the contraction. */
  it("still deletes an account completely once the old tables are gone", async () => {
    const account = await ready("deletion@example.test");
    await contractMultisport(t.db, {
      now: afterTheWindows(),
      legacyUsageAt: quietSince(),
    });

    await t.db.execute(sql`delete from auth.users where id = ${account.userId}`);
    const remaining = await t.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, account.userId));
    expect(remaining).toEqual([]);
    const orphans = await t.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.userId, account.userId));
    expect(orphans).toEqual([]);
  });

  /** §10.1: after the switch, no old action may independently edit a retired run row. */
  it("closes the legacy run writers once authority has moved", async () => {
    vi.stubEnv("MULTISPORT_ROLLOUT", "true");
    try {
      const save = await saveRunAction(null, {}, new FormData());
      expect(save.formError).toContain("no longer saves");
      const removed = await deleteRunAction(crypto.randomUUID());
      expect(removed).toEqual({ ok: false, error: expect.stringContaining("no longer saves") });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("records that the contraction happened", async () => {
    await ready("marker@example.test");
    await contractMultisport(t.db, {
      now: afterTheWindows(),
      legacyUsageAt: quietSince(),
    });
    expect(await markerAt(t.db, CUTOVER_MARKERS.legacyContracted)).not.toBeNull();
  });
});
