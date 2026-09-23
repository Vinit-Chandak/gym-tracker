import { DrizzleQueryError, type ExtractTablesWithRelations, type Logger } from "drizzle-orm";
import { drizzle, NodePgSession, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDialect } from "drizzle-orm/pg-core";
import pg from "pg";

import { getDatabaseUrl, perfLogEnabled } from "../lib/env";
import { queryCounter } from "./perf";
import * as schema from "./schema";

type Schema = typeof schema;

export type AppDatabase = NodePgDatabase<Schema>;

function needsSsl(url: string): boolean {
  return !/localhost|127\.0\.0\.1/.test(url);
}

/**
 * How long an unused connection stays open, in seconds.
 *
 * A new connection costs a TCP, TLS and password handshake before its first statement. With the
 * old 20-second limit nearly every set logged after a rest paid that again. Five minutes covers a
 * whole workout; a connection the pooler dropped in the meantime is removed from the pool when
 * pg notices, or noticed on first use and the transaction retried on a fresh one (see
 * `with-user.ts`).
 */
export const IDLE_TIMEOUT_SECONDS = 300;

/** How long a connection is used at all before it is replaced: postgres.js's shortest lifetime. */
const MAX_LIFETIME_SECONDS = 30 * 60;

/**
 * The connection settings in a database URL, spelled out for pg rather than passed to it as a
 * connection string.
 *
 * pg lets a connection string override every option given beside it, and reads
 * `sslmode=require` as full certificate verification. Supabase's certificates are signed by its
 * own authority, so a URL copied with that parameter would stop connecting. Encryption is set
 * here instead, as it was with postgres.js: required for anything but this machine, without
 * verifying the certificate. `application_name` and `options` are passed on; other parameters
 * in the URL are not connection settings pg understands, and are left out.
 */
export function connectionConfig(url: string): pg.ClientConfig {
  const parsed = new URL(url);
  const user = decodeURIComponent(parsed.username);
  const applicationName = parsed.searchParams.get("application_name");
  const options = parsed.searchParams.get("options");
  return {
    host: parsed.hostname.replace(/^\[(.*)\]$/, "$1"),
    port: parsed.port ? Number(parsed.port) : 5432,
    user,
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1) || user,
    ssl: needsSsl(url) ? { rejectUnauthorized: false } : false,
    ...(applicationName ? { application_name: applicationName } : {}),
    ...(options ? { options } : {}),
  };
}

/**
 * Runs one connection's queries one after another.
 *
 * Reads inside a transaction are often started together (`Promise.all`). A connection answers one
 * statement at a time whatever the caller does, and pg would queue them, but it warns that
 * queueing is deprecated and will stop in pg 9. Chaining them here puts the same statements on
 * the wire in the same order. Callback-style queries, which only the pool itself sends, keep
 * pg's own path.
 */
export function serializeQueries(client: pg.ClientBase): void {
  const query = client.query.bind(client) as (...args: unknown[]) => unknown;
  let tail: Promise<unknown> = Promise.resolve();
  client.query = ((...args: unknown[]) => {
    const submittable = typeof (args[0] as { submit?: unknown } | null)?.submit === "function";
    if (submittable || typeof args[args.length - 1] === "function") return query(...args);
    const run = () => query(...args);
    const result = tail.then(run, run);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }) as typeof client.query;
}

/**
 * Creates the app's Drizzle client on a node-postgres pool (ADR 0030).
 *
 * pg sends a statement and its values together, one round trip each; postgres.js, with prepared
 * statements off as Supabase's transaction pooler requires, asked for the parameter types first
 * and spent two. Statements stay unnamed, so nothing is prepared on a pooled server connection.
 */
export function createDatabase(url: string, options: { max?: number } = {}): AppDatabase {
  const pool = new pg.Pool({
    ...connectionConfig(url),
    max: options.max ?? 5,
    idleTimeoutMillis: IDLE_TIMEOUT_SECONDS * 1000,
    // Probe idle sockets often enough that a dead one is closed before it is handed out.
    keepAlive: true,
    keepAliveInitialDelayMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    maxLifetimeSeconds: MAX_LIFETIME_SECONDS,
  });
  pool.on("connect", (client) => {
    // A connection can also fail while it is checked out, between two queries. pg reports that
    // as an 'error' event, and an event nobody listens for ends the process. The failing query
    // still rejects, and the pool discards the connection when it is released.
    client.on("error", () => {});
    serializeQueries(client);
  });
  // A connection that closes while idle, which the pooler does, is dropped from the pool and
  // reported here; unheard, it too would end the process.
  pool.on("error", (error) => {
    if (perfLogEnabled()) console.log(`[perf] db idle connection closed: ${error.message}`);
  });
  // Counting statements costs a callback per query, so it is wired in only while timing.
  const logger = perfLogEnabled() ? queryCounter : undefined;
  const db = drizzle(pool, { schema, ...(logger ? { logger } : {}) });
  releaseEveryTransaction(db, pool, logger);
  return db;
}

/**
 * Runs each transaction on a connection checked out here, and always gives it back.
 *
 * Drizzle's own pool transaction sends `BEGIN` before the block that releases the connection. A
 * connection that died while idle fails exactly there, which is the case `withUser` retries, and
 * it was never returned: after five of those the pool had nothing left to hand out. Here the
 * transaction runs on a session bound to one checked-out connection, with Drizzle's own begin,
 * commit and rollback, and the connection is released whatever happens. It goes back into the
 * pool only if the server says it is outside any transaction; otherwise it is closed. pg-pool
 * also closes any connection that has failed.
 *
 * A deferred constraint is checked by `COMMIT`. postgres.js, and PGlite in the tests, sent that
 * themselves and threw the server's error as it was; Drizzle sends it here as a query and wraps
 * the failure in "Failed query: commit". That wrapper is taken off, so the error a caller sees
 * is the one it always saw.
 */
export function releaseEveryTransaction(db: AppDatabase, pool: pg.Pool, logger?: Logger): void {
  // The database's own dialect, so a transaction builds its SQL exactly as every other query.
  const { dialect } = db._.session as unknown as { dialect: PgDialect };
  const relational = {
    fullSchema: db._.fullSchema,
    schema: db._.schema!,
    tableNamesMap: db._.tableNamesMap,
  };
  db._.session.transaction = async (transaction, config) => {
    const client = await pool.connect();
    try {
      return await new NodePgSession<Schema, ExtractTablesWithRelations<Schema>>(
        client,
        dialect,
        relational,
        { logger },
      ).transaction(transaction, config);
    } catch (error) {
      throw error instanceof DrizzleQueryError && error.query === "commit" && error.cause
        ? error.cause
        : error;
    } finally {
      client.release(
        client.getTransactionStatus() === "I"
          ? undefined
          : new Error("A transaction left its connection unusable"),
      );
    }
  };
}

const globalForDb = globalThis as unknown as { __appDatabase?: AppDatabase };

/** Process-wide client for the running app (cached across hot reloads in development). */
export function getDb(): AppDatabase {
  globalForDb.__appDatabase ??= createDatabase(getDatabaseUrl());
  return globalForDb.__appDatabase;
}
