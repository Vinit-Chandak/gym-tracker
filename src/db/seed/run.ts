import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getMigrationDatabaseUrl } from "../../lib/env";
import * as schema from "../schema";
import { seedReferenceData } from "./reference";
import { seedUserStarterData } from "./starter";

async function main(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const url = getMigrationDatabaseUrl();
  const client = postgres(url, {
    max: 1,
    prepare: false,
    ...(/localhost|127\.0\.0\.1/.test(url) ? {} : { ssl: "require" as const }),
  });
  const db = drizzle(client, { schema });

  try {
    const reference = await seedReferenceData(db);
    console.log(
      `Reference data: ${reference.equipmentTypes} equipment types, ${reference.exercises} exercises, ` +
        `${reference.equipmentOptions} equipment options, ${reference.warmupProtocols} warm-up protocols.`,
    );

    const email = process.env.SEED_USER_EMAIL?.trim();
    if (!email) {
      console.log(
        "SEED_USER_EMAIL is not set, so gyms, equipment and the programme were not created. " +
          "Set it in .env.local and run again, or use Settings → Set up starter data in the app.",
      );
      return;
    }

    const users = await db.execute<{ id: string; email: string }>(
      sql`select id, email from auth.users where lower(email) = lower(${email}) limit 1`,
    );
    const user = users[0];
    if (!user) {
      console.error(
        `No Supabase Auth user has the email ${email}. Create it in the dashboard (SETUP.md, step 4) and run again.`,
      );
      process.exitCode = 1;
      return;
    }

    const starter = await seedUserStarterData(db, { id: user.id, email: user.email });
    console.log(
      `Starter data for ${user.email}: profile ${starter.profileCreated ? "created" : "already present"}, ` +
        `${starter.gymsCreated} gyms created, ${starter.equipmentCreated} machines created, ` +
        `programme ${starter.programCreated ? "created" : "already present"} (${starter.programId}).`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
