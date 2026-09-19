import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { backfillMultisport } from "@/db/backfill-multisport";
import { occurrenceVersions, plannedOccurrences } from "@/db/schema";
import { seedLegacyAccount, type LegacyAccount } from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import {
  endurancePrescriptionSchema,
  prescriptionTotals,
  simplePrescription,
} from "@/domain/activity-prescription";
import { toMetres } from "@/lib/distance-units";

import {
  archiveTemplate,
  createTemplate,
  getTemplate,
  getTemplateRevision,
  listTemplates,
  reviseTemplate,
  TemplateNotFoundError,
} from "./activity-templates";

/** AT-STRUCT-01 and AT-STRUCT-06: templates are versioned, and editing one is not a rewrite. */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

const fifties = () =>
  endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport: "swimming",
    nodes: [
      {
        kind: "repeat",
        id: "block",
        repetitions: 8,
        restBetweenMs: 20_000,
        steps: [
          {
            kind: "step",
            id: "fifty",
            phase: "work",
            action: "swim",
            target: { kind: "distance", metres: [50, 50] },
          },
        ],
      },
    ],
  });

async function account(email: string): Promise<LegacyAccount> {
  const user = await t.createAuthUser(email);
  const seeded = await seedLegacyAccount(t.db, user, { logPlannedRun: false, logAdHocRun: false });
  await backfillMultisport(t.db, { userId: seeded.userId });
  return seeded;
}

describe("writing a template", () => {
  it("stores the session as written and reads it back whole", async () => {
    const owner = await account("swimmer@example.test");

    const created = await withUser(t.db, owner.userId, (tx) =>
      createTemplate(tx, owner.userId, {
        sport: "swimming",
        name: "8 × 50",
        prescription: fifties(),
      }),
    );

    const template = await withUser(t.db, owner.userId, (tx) =>
      getTemplate(tx, owner.userId, created.id),
    );
    expect(template).toMatchObject({ sport: "swimming", name: "8 × 50", version: 1 });
    const totals = prescriptionTotals(template!.prescription);
    expect(totals.distanceMetres).toBe(400);
    expect(totals.prescribedRestMs).toBe(140_000);
  });

  it("lists this account's templates and nobody else's", async () => {
    const mine = await account("mine@example.test");
    const theirs = await account("theirs@example.test");
    await withUser(t.db, mine.userId, (tx) =>
      createTemplate(tx, mine.userId, {
        sport: "running",
        name: "Easy 5k",
        prescription: simplePrescription("running", { distanceMetres: [5000, 5000] }),
      }),
    );

    expect(
      await withUser(t.db, theirs.userId, (tx) => listTemplates(tx, theirs.userId), {
        readOnly: true,
      }),
    ).toEqual([]);
    const ours = await withUser(t.db, mine.userId, (tx) => listTemplates(tx, mine.userId), {
      readOnly: true,
    });
    expect(ours.map((template) => template.name)).toEqual(["Easy 5k"]);
  });
});

describe("editing a template", () => {
  /** AT-STRUCT-06: what is already scheduled keeps the revision it copied. */
  it("writes a new revision and leaves a scheduled snapshot alone", async () => {
    const owner = await account("editor@example.test");
    const created = await withUser(t.db, owner.userId, (tx) =>
      createTemplate(tx, owner.userId, {
        sport: "running",
        name: "Easy 5k",
        prescription: simplePrescription("running", { distanceMetres: [5000, 5000] }),
      }),
    );
    // Something scheduled from the template as it stands now, copying its revision.
    const template = await withUser(t.db, owner.userId, (tx) =>
      getTemplate(tx, owner.userId, created.id),
    );
    const [occurrence] = await t.db
      .select({ id: plannedOccurrences.id })
      .from(plannedOccurrences)
      .where(eq(plannedOccurrences.userId, owner.userId))
      .limit(1);
    const scheduled = await withUser(t.db, owner.userId, async (tx) => {
      const [row] = await tx
        .insert(occurrenceVersions)
        .values({
          occurrenceId: occurrence!.id,
          userId: owner.userId,
          sport: "running",
          scheduledOn: "2026-09-20",
          schedulingZone: "Asia/Kolkata",
          prescription: template!.prescription,
          templateRevisionId: created.revisionId,
        })
        .returning({ id: occurrenceVersions.id, prescription: occurrenceVersions.prescription });
      return row!;
    });

    await withUser(t.db, owner.userId, (tx) =>
      reviseTemplate(tx, owner.userId, created.id, {
        prescription: simplePrescription("running", { distanceMetres: [8000, 8000] }),
      }),
    );

    const revised = await withUser(t.db, owner.userId, (tx) =>
      getTemplate(tx, owner.userId, created.id),
    );
    expect(revised!.version).toBe(2);
    expect(revised!.prescription.sessionTargets.distanceMetres).toEqual([8000, 8000]);
    // The revision that was copied is still readable, and still says five kilometres.
    const original = await withUser(t.db, owner.userId, (tx) =>
      getTemplateRevision(tx, owner.userId, created.revisionId),
    );
    expect(original!.prescription.sessionTargets.distanceMetres).toEqual([5000, 5000]);
    expect(scheduled.prescription?.sessionTargets.distanceMetres).toEqual([5000, 5000]);
  });

  it("refuses to revise a template this account does not have", async () => {
    const mine = await account("a@example.test");
    const theirs = await account("b@example.test");
    const created = await withUser(t.db, theirs.userId, (tx) =>
      createTemplate(tx, theirs.userId, {
        sport: "running",
        name: "Theirs",
        prescription: simplePrescription("running", { durationMs: [1_800_000, 1_800_000] }),
      }),
    );

    await expect(
      withUser(t.db, mine.userId, (tx) =>
        reviseTemplate(tx, mine.userId, created.id, {
          prescription: simplePrescription("running", { durationMs: [60_000, 60_000] }),
        }),
      ),
    ).rejects.toThrow(TemplateNotFoundError);
  });
});

describe("archiving a template", () => {
  it("takes it out of the picker and keeps its revisions readable", async () => {
    const owner = await account("archivist@example.test");
    const created = await withUser(t.db, owner.userId, (tx) =>
      createTemplate(tx, owner.userId, {
        sport: "cycling",
        name: "Easy spin",
        prescription: simplePrescription("cycling", { durationMs: [1_800_000, 1_800_000] }),
      }),
    );

    await withUser(t.db, owner.userId, (tx) => archiveTemplate(tx, owner.userId, created.id));

    const active = await withUser(t.db, owner.userId, (tx) => listTemplates(tx, owner.userId), {
      readOnly: true,
    });
    expect(active).toEqual([]);
    const all = await withUser(
      t.db,
      owner.userId,
      (tx) => listTemplates(tx, owner.userId, { includeArchived: true }),
      { readOnly: true },
    );
    expect(all).toHaveLength(1);
    // Anything that copied this revision can still read what it said.
    const revision = await withUser(t.db, owner.userId, (tx) =>
      getTemplateRevision(tx, owner.userId, created.revisionId),
    );
    expect(revision!.prescription.sessionTargets.durationMs).toEqual([1_800_000, 1_800_000]);
  });

  it("refuses to archive twice", async () => {
    const owner = await account("twice@example.test");
    const created = await withUser(t.db, owner.userId, (tx) =>
      createTemplate(tx, owner.userId, {
        sport: "swimming",
        name: "Lengths",
        prescription: simplePrescription("swimming", {
          distanceMetres: [toMetres(1000, "m"), toMetres(1000, "m")],
        }),
      }),
    );
    await withUser(t.db, owner.userId, (tx) => archiveTemplate(tx, owner.userId, created.id));
    await expect(
      withUser(t.db, owner.userId, (tx) => archiveTemplate(tx, owner.userId, created.id)),
    ).rejects.toThrow(TemplateNotFoundError);
  });
});
