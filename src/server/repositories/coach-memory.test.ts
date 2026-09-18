import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { coachMemos, coachNotes, coachPreferences, gyms, workoutSessions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { memoryPatchSchema } from "@/domain/coach-memory";
import { withUser } from "@/db/with-user";
import { saveCoachNotes } from "./coach-plans";
import { readCoachMemory, updateCoachMemory } from "./coach-memory";
import { sourceRevision } from "./coaching-state";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

it("retains messages, deduplicates retries and acknowledges extraction atomically", async () => {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@memo.test`);
  await withUser(t.db, user.id, async (db) => {
    const before = await sourceRevision(db, user.id);
    const first = crypto.randomUUID();
    await saveCoachNotes(db, user.id, "I prefer dumbbells.", first);
    await saveCoachNotes(db, user.id, "I prefer dumbbells.", first);
    await expect(saveCoachNotes(db, user.id, "Changed payload", first)).rejects.toThrow(
      /already used/,
    );
    const second = crypto.randomUUID();
    await saveCoachNotes(db, user.id, "I have 45 minutes on Mondays.", second);
    const memo = await readCoachMemory(db, user.id);
    expect(memo.notes.pending.map((note) => note.id).sort()).toEqual([first, second].sort());
    expect(await sourceRevision(db, user.id)).toBeGreaterThan(before);
    const id = crypto.randomUUID();
    await updateCoachMemory(
      db,
      user.id,
      {
        expectedRevision: 0,
        upsert: [
          {
            id,
            category: "preference",
            status: "reported",
            text: "Prefers dumbbells.",
            sport: "workout",
            sourceIds: [`note:${first}`],
            sourceQuote: { sourceId: `note:${first}`, text: "I prefer dumbbells." },
            reviewAfter: null,
          },
        ],
        reviewedNotes: [{ id: first, disposition: "remembered" }],
      },
      "coach",
    );
    const next = await readCoachMemory(db, user.id);
    expect(next.items).toHaveLength(1);
    expect(next.notes.pending.map((note) => note.id)).toEqual([second]);
    await db.delete(coachNotes).where(eq(coachNotes.id, first));
    expect((await readCoachMemory(db, user.id)).reviewDueItems.map((item) => item.id)).toEqual([
      id,
    ]);
  });
});

it("rejects another account's note as a quote or acknowledgment without changing the memo", async () => {
  const a = await t.createAuthUser(`${crypto.randomUUID()}@memo.test`);
  const b = await t.createAuthUser(`${crypto.randomUUID()}@memo.test`);
  const note = crypto.randomUUID();
  await withUser(t.db, a.id, (db) => saveCoachNotes(db, a.id, "Prefer mornings.", note));
  await withUser(t.db, b.id, async (db) => {
    expect((await readCoachMemory(db, b.id)).notes.pending).toEqual([]);
    await expect(
      updateCoachMemory(
        db,
        b.id,
        { expectedRevision: 0, reviewedNotes: [{ id: note, disposition: "remembered" }] },
        "coach",
      ),
    ).rejects.toThrow(/this athlete/);
    expect((await readCoachMemory(db, b.id)).memoryRevision).toBe(0);
    await expect(
      updateCoachMemory(
        db,
        b.id,
        {
          expectedRevision: 0,
          upsert: [
            {
              id: crypto.randomUUID(),
              category: "preference",
              status: "reported",
              text: "Prefers mornings.",
              sourceIds: [`note:${note}`],
              sourceQuote: { sourceId: `note:${note}`, text: "Prefer mornings." },
              reviewAfter: null,
            },
          ],
        },
        "coach",
      ),
    ).rejects.toThrow(/existing evidence/);
  });
});

it("keeps excess unread messages pending and preserves them after acknowledging a batch", async () => {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@memo.test`);
  await withUser(t.db, user.id, async (db) => {
    await db.insert(coachNotes).values(
      Array.from({ length: 55 }, (_, i) => ({
        userId: user.id,
        text: `Note ${i}`,
        createdAt: new Date(1700000000000 + i * 1000),
      })),
    );
    const before = await readCoachMemory(db, user.id);
    expect(before.notes.pending).toHaveLength(50);
    expect(before.notes.hasMorePending).toBe(true);
    expect(before.notes.recent[0]?.text).toBe("Note 54");
    await updateCoachMemory(
      db,
      user.id,
      {
        expectedRevision: 0,
        reviewedNotes: before.notes.pending.map((note) => ({
          id: note.id,
          disposition: "no_action",
          detail: "Nothing to change.",
        })),
      },
      "coach",
    );
    expect((await readCoachMemory(db, user.id)).notes.pending).toHaveLength(5);
    expect(await db.select().from(coachNotes)).toHaveLength(55);
    expect((await db.select().from(coachMemos))[0]?.memoryRevision).toBe(1);
  });
});

it("does not erase an existing legacy memo when notes are reviewed without new memory", async () => {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@memo.test`);
  await withUser(t.db, user.id, async (db) => {
    await db
      .insert(coachMemos)
      .values({ userId: user.id, overview: "Existing context awaiting verification." });
    const note = crypto.randomUUID();
    await saveCoachNotes(db, user.id, "Thanks.", note);
    await updateCoachMemory(
      db,
      user.id,
      {
        expectedRevision: 0,
        reviewedNotes: [{ id: note, disposition: "no_action", detail: "Nothing to change." }],
      },
      "coach",
    );
    expect((await readCoachMemory(db, user.id)).legacyOverview).toBe(
      "Existing context awaiting verification.",
    );
  });
});

it("treats a note written during training as a message, and closes it with an outcome", async () => {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@memo.test`);
  await withUser(t.db, user.id, async (db) => {
    const [gym] = await db
      .insert(gyms)
      .values({ userId: user.id, name: "My gym", slug: "my-gym", kind: "gym", isDefault: true })
      .returning();
    await db.insert(coachPreferences).values({ userId: user.id, mode: "coach" });
    const at = new Date();
    const [session] = await db
      .insert(workoutSessions)
      .values({
        userId: user.id,
        gymId: gym!.id,
        startedAt: at,
        completedAt: at,
        notes: "Can we add Bayesian curls? The cable version aggravates my elbow.",
      })
      .returning();
    const source = `workout:${session!.id}`;

    const waiting = await readCoachMemory(db, user.id);
    expect(waiting.notes.training.pending.map((note) => note.sourceId)).toEqual([source]);
    expect(waiting.notes.training.hasMore).toBe(false);

    // It is the athlete speaking, so it can carry a remembered preference of its own.
    // Exactly what the workflow route hands the memo write: a result it has already parsed.
    await updateCoachMemory(
      db,
      user.id,
      memoryPatchSchema.parse({
        expectedRevision: 0,
        upsert: [
          {
            id: crypto.randomUUID(),
            category: "preference",
            status: "reported",
            text: "The cable curl aggravates the elbow.",
            sourceIds: [source],
            sourceQuote: { sourceId: source, text: "The cable version aggravates my elbow." },
            reviewAfter: null,
          },
        ],
        reviewedNotes: [
          {
            id: source,
            disposition: "queued_for_review",
            detail: "Adding a slot needs your approval.",
          },
        ],
      }),
      "coach",
    );

    // Answered once, it never crowds a later job again, and the request brings the review in.
    const after = await readCoachMemory(db, user.id);
    expect(after.notes.training.pending).toEqual([]);
    expect(after.items).toHaveLength(1);
    const [preference] = await db
      .select()
      .from(coachPreferences)
      .where(eq(coachPreferences.userId, user.id));
    expect(preference?.reviewRequestedAt).not.toBeNull();
  });
});

it("says what became of a Tell the coach note, not merely that it was read", async () => {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@memo.test`);
  await withUser(t.db, user.id, async (db) => {
    const note = crypto.randomUUID();
    await saveCoachNotes(db, user.id, "Bench matters most to me.", note);
    await updateCoachMemory(
      db,
      user.id,
      {
        expectedRevision: 0,
        reviewedNotes: [{ id: note, disposition: "remembered" }],
      },
      "coach",
    );
    const [saved] = await db.select().from(coachNotes).where(eq(coachNotes.id, note));
    expect(saved).toMatchObject({ disposition: "remembered", dispositionDetail: "" });
    expect(saved?.reviewedAt).not.toBeNull();
  });
});
