import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getMigrationDatabaseUrl } from "../../lib/env";
import * as schema from "../schema";
import { seedReferenceData } from "./reference";

/**
 * Seeds the data every account shares: equipment types, the exercise library, the equipment each
 * exercise can be done on, and the warm-up protocols. It creates no gyms, no machines and no
 * programmes — those belong to a user, who adds them in the app.
 */
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
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
