import { AsyncLocalStorage } from "node:async_hooks";

import { perfLogEnabled } from "../lib/env";

/**
 * Opt-in timing for the database layer, to see where a slow request spends its time in
 * production (ADR 0030). Nothing here runs unless `PERF_LOG=1`.
 *
 * Each transaction logs one line:
 *
 *   [perf] db read 41ms begin=2ms setup=4ms queries=5
 *
 * - `begin`: waiting for a pooled connection plus `BEGIN`. A new connection (TCP, TLS and the
 *   password exchange) shows up here.
 * - `setup`: the claims statement. The driver describes a parameterised statement before running
 *   it, which costs two network round trips, so half of `setup` is the app↔database round trip.
 * - `queries`: statements sent through Drizzle, the claims and lock included; `BEGIN` and
 *   `COMMIT` are not.
 *
 * The first transaction an instance runs also says how long ago the process started, which
 * separates a cold start from a slow query.
 */

type Timing = { queries: number; beginMs: number; setupMs: number };

const current = new AsyncLocalStorage<Timing>();
let warm = false;

/** A Drizzle logger that counts statements for the transaction being timed, if any. */
export const queryCounter = {
  logQuery(): void {
    const timing = current.getStore();
    if (timing) timing.queries += 1;
  },
};

/** Runs one transaction attempt, timing it when `PERF_LOG=1`; otherwise just runs it. */
export async function timeTransaction<T>(
  mode: "read" | "write",
  run: () => Promise<T>,
): Promise<T> {
  if (!perfLogEnabled()) return run();
  const timing: Timing = { queries: 0, beginMs: 0, setupMs: 0 };
  const started = performance.now();
  const cold = !warm;
  warm = true;
  try {
    return await current.run(timing, run);
  } finally {
    const total = Math.round(performance.now() - started);
    const uptime = cold ? ` cold uptime=${Math.round(process.uptime() * 1000)}ms` : "";
    console.log(
      `[perf] db ${mode} ${total}ms begin=${timing.beginMs}ms setup=${timing.setupMs}ms queries=${timing.queries}${uptime}`,
    );
  }
}

/** Marks the start of a transaction attempt; returns a function to call once it has begun. */
export function markBegin(): () => void {
  const timing = current.getStore();
  if (!timing) return () => {};
  const started = performance.now();
  return () => {
    timing.beginMs = Math.round(performance.now() - started);
  };
}

/** Times the claims statement, the one statement every transaction sends first. */
export async function timeSetup<T>(run: () => Promise<T>): Promise<T> {
  const timing = current.getStore();
  if (!timing) return run();
  const started = performance.now();
  try {
    return await run();
  } finally {
    timing.setupMs = Math.round(performance.now() - started);
  }
}
