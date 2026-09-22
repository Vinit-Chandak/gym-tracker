import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import type { DbOrTx } from "./types";

type JournalEntry = { idx: number; tag: string; when: number };

/** Drizzle compares timestamps, not filenames, with the database's latest migration. */
export function assertMigrationOrder(entries: readonly JournalEntry[]): void {
  let latest = -Infinity;
  for (const [index, entry] of entries.entries()) {
    if (entry.idx !== index || !Number.isSafeInteger(entry.when)) {
      throw new Error(`Invalid migration journal entry: ${entry.tag}`);
    }
    // Shipped history stays immutable. 0036 repairs this one known ordering error.
    const repairedLegacyEntry =
      entry.idx === 35 &&
      entry.tag === "0035_coach_job_attempt_budget" &&
      entry.when === 1790051828680;
    if (entry.when <= latest && !repairedLegacyEntry) {
      throw new Error(
        `Backdated migration ${entry.tag}: timestamp ${entry.when} must be greater than ${latest}. Upgraded databases would skip it.`,
      );
    }
    latest = Math.max(latest, entry.when);
  }
}

/** A successful migration command must leave every column the running app will query. */
export async function assertDatabaseSchema(db: DbOrTx): Promise<void> {
  const columns = await db
    .select({
      schema: sql<string>`table_schema`,
      table: sql<string>`table_name`,
      column: sql<string>`column_name`,
    })
    .from(sql`information_schema.columns`);
  const present = new Set(
    columns.map((column) => `${column.schema}.${column.table}.${column.column}`),
  );
  const missing = Object.values(schema)
    .filter((value) => is(value, PgTable))
    .flatMap((table) => {
      const config = getTableConfig(table);
      return config.columns
        .map((column) => `${config.schema ?? "public"}.${config.name}.${column.name}`)
        .filter((column) => !present.has(column));
    });
  if (missing.length > 0)
    throw new Error(
      `Database schema is incomplete; refusing to deploy. Missing columns: ${missing.sort().join(", ")}`,
    );
}
