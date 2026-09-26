/** Clone a ready local proposal onto a disposable programme-authoring account. */
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { withUser } from "@/db/with-user";
import { readProgramBlueprint } from "@/server/repositories/programs";
import { sourceRevision } from "@/server/repositories/coaching-state";

const database = process.env.SEED_DATABASE_URL ?? "";
const target = new URL(database);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.search !== "" ||
  target.hash !== "" ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname)
)
  throw new Error("Programme fixtures require an isolated loopback overload_audit database.");
const userId = process.argv[2] ?? "";
if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error("Pass the disposable account ID.");
const client = postgres(database, { max: 1, prepare: false });
const db = drizzle(client, { schema });
async function main() {
  try {
    const [person] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, userId));
    if (!person || !/^auditpr[a-z0-9]+$/.test(person.username))
      throw new Error(
        "Only this programme audit's disposable accounts may receive cloned proposals.",
      );
    const [template] = await db
      .select()
      .from(schema.programDrafts)
      .innerJoin(schema.profiles, eq(schema.profiles.id, schema.programDrafts.userId))
      .where(and(eq(schema.profiles.username, "vinit"), eq(schema.programDrafts.source, "weekly")))
      .limit(1);
    if (!template) throw new Error("Seed the local audit personas before cloning a proposal.");
    const result = await withUser(db, userId, async (tx) => {
      const [active] = await tx
        .select()
        .from(schema.programs)
        .where(and(eq(schema.programs.userId, userId), eq(schema.programs.status, "active")));
      if (!active) throw new Error("Activate the disposable account's own programme first.");
      const current = await readProgramBlueprint(tx, userId, active.id);
      if (!current?.blueprint.days[0]?.exercises[0])
        throw new Error("The programme needs an exercise.");
      const blueprint = structuredClone(current.blueprint);
      blueprint.days[0]!.exercises[0]!.sets += 1;
      await tx
        .update(schema.profiles)
        .set({ aiCoachEnabled: true })
        .where(eq(schema.profiles.id, userId));
      const [draft] = await tx
        .insert(schema.programDrafts)
        .values({
          userId,
          source: template.program_drafts.source,
          status: "ready",
          blueprint,
          baseProgramId: active.id,
          sourceRevision: await sourceRevision(tx, userId),
          headline: "Add one controlled set to your first exercise",
          rationale:
            "A local copy of the ready audit proposal, adapted to this account's own programme.",
          uncertainties: template.program_drafts.uncertainties,
        })
        .returning();
      return { id: draft!.id, baseProgramId: active.id, cloneSourceId: template.program_drafts.id };
    });
    console.log(JSON.stringify(result));
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
