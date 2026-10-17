import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "@/db/schema";
import { withUser } from "@/db/with-user";
import { programBlueprintSchema } from "@/domain/program-blueprint";
import { todayInTimeZone } from "@/domain/program-calendar";
import { adoptProgramme } from "@/server/repositories/program-drafts";
import { saveCoachNotes } from "@/server/repositories/coach-plans";
import { sourceRevision } from "@/server/repositories/coaching-state";

const database =
  process.env.AUDIT_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_coach";
const target = new URL(database);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.search ||
  target.hash ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname)
)
  throw new Error("Local audit only.");
const client = postgres(database, { max: 1 });
const db = drizzle(client, { schema: s });
async function main() {
  const [person] = await db.select().from(s.profiles).where(eq(s.profiles.username, "vinit"));
  if (!person) throw new Error("Run audit setup first.");
  await withUser(db, person.id, async (tx) => {
    for (const sport of ["running", "cycling", "swimming"] as const) {
      const [existing] = await tx
        .select()
        .from(s.programs)
        .where(
          and(
            eq(s.programs.userId, person.id),
            eq(s.programs.sport, sport),
            eq(s.programs.status, "active"),
          ),
        );
      if (existing) continue;
      const blueprint = programBlueprintSchema.parse({
        blueprintVersion: 1,
        sport,
        slug: `coach-audit-${sport}`,
        name: {
          running: "Build a comfortable 5K",
          cycling: "Weekend endurance rides",
          swimming: "Swim technique foundation",
        }[sport],
        weeks: 8,
        repeats: "weekly",
        days: [],
        runs: [],
        enduranceSessions: Array.from({ length: 8 }, (_, week) => ({
          lineageId: randomUUID(),
          name: "Easy practice",
          weekIndex: week + 1,
          dayOffset: week * 7,
          prescription: {
            prescriptionVersion: 1,
            sport,
            sessionTargets: { durationMs: [1_800_000, 1_800_000] },
          },
        })),
      });
      await adoptProgramme(tx, person.id, blueprint, {
        startDate: todayInTimeZone(person.timeZone),
      });
      await saveCoachNotes(
        tx,
        person.id,
        `I prefer relaxed ${sport} sessions on weekends.`,
        randomUUID(),
        sport,
      );
    }
    const [question] = await tx
      .select()
      .from(s.coachProgramRequests)
      .where(
        and(
          eq(s.coachProgramRequests.userId, person.id),
          eq(s.coachProgramRequests.summary, "Coach audit running question"),
        ),
      );
    if (question) {
      // This named fixture belongs to the browser audit; reset it so answer/withdraw can repeat.
      await tx
        .update(s.coachProgramRequests)
        .set({
          state: "needs_answer",
          detail: "Would Sunday morning or evening work best?",
          resolvedAt: null,
        })
        .where(eq(s.coachProgramRequests.id, question.id));
    } else {
      const noteId = randomUUID();
      await saveCoachNotes(tx, person.id, "Move my long run to Sunday.", noteId, "running");
      await tx.insert(s.coachProgramRequests).values({
        id: randomUUID(),
        userId: person.id,
        sport: "running",
        sourceId: `note:${noteId}`,
        quote: "Move my long run to Sunday.",
        summary: "Coach audit running question",
        state: "needs_answer",
        detail: "Would Sunday morning or evening work best?",
      });
    }
    await tx
      .update(s.programDrafts)
      .set({ sourceRevision: await sourceRevision(tx, person.id) })
      .where(eq(s.programDrafts.userId, person.id));
  });
  console.log(
    JSON.stringify(
      await db
        .select({ id: s.programs.id, sport: s.programs.sport, name: s.programs.name })
        .from(s.programs)
        .where(and(eq(s.programs.userId, person.id), eq(s.programs.status, "active"))),
    ),
  );
}
main().finally(() => client.end());
