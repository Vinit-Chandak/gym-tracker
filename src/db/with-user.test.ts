import { describe, expect, it, vi } from "vitest";

import type { Db, Tx } from "./types";
import { isConnectionError, withUser } from "./with-user";

function connectionError(code: string): Error {
  return Object.assign(new Error(`write ${code}`), { code });
}

/** A stand-in database whose transactions fail as scripted before handing over a fake `tx`. */
function fakeDb(failures: (Error | null)[]) {
  const tx = { execute: vi.fn(async () => []) } as unknown as Tx;
  let attempts = 0;
  const db = {
    transaction: vi.fn(async (fn: (tx: Tx) => Promise<unknown>) => {
      const failure = failures[attempts++] ?? null;
      if (failure) throw failure;
      return fn(tx);
    }),
  } as unknown as Db;
  return { db, tx, attempts: () => attempts };
}

describe("isConnectionError", () => {
  it("recognises the driver's and the socket's codes, however deeply wrapped", () => {
    expect(isConnectionError(connectionError("CONNECTION_CLOSED"))).toBe(true);
    expect(
      isConnectionError(new Error("Failed query", { cause: connectionError("ECONNRESET") })),
    ).toBe(true);
    expect(isConnectionError(Object.assign(new Error("dup"), { code: "23505" }))).toBe(false);
    expect(isConnectionError(new Error("plain"))).toBe(false);
    expect(isConnectionError("not an error")).toBe(false);
  });
});

describe("withUser", () => {
  it("retries once when the connection dies before any work ran", async () => {
    const { db, attempts } = fakeDb([connectionError("CONNECTION_CLOSED"), null]);
    const work = vi.fn(async () => "done");
    await expect(withUser(db, "user-1", work)).resolves.toBe("done");
    expect(attempts()).toBe(2);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("gives up after the second connection failure", async () => {
    const { db, attempts } = fakeDb([
      connectionError("ECONNRESET"),
      connectionError("ECONNRESET"),
      null,
    ]);
    await expect(withUser(db, "user-1", async () => "never")).rejects.toThrow(/ECONNRESET/);
    expect(attempts()).toBe(2);
  });

  it("does not retry other failures", async () => {
    const { db, attempts } = fakeDb([Object.assign(new Error("boom"), { code: "42P01" }), null]);
    await expect(withUser(db, "user-1", async () => "never")).rejects.toThrow("boom");
    expect(attempts()).toBe(1);
  });

  it("never repeats work that had already started when the connection died", async () => {
    const { db, attempts } = fakeDb([null, null]);
    const work = vi.fn(async () => {
      throw connectionError("CONNECTION_CLOSED");
    });
    await expect(withUser(db, "user-1", work)).rejects.toThrow(/CONNECTION_CLOSED/);
    expect(attempts()).toBe(1);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("sets the claims before handing the transaction to the caller", async () => {
    const { db, tx } = fakeDb([null]);
    const order: string[] = [];
    (tx.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push(order.length === 0 ? "claims" : "athlete lock");
      return [];
    });
    await withUser(db, "user-1", async () => {
      order.push("work");
      return null;
    });
    expect(order).toEqual(["claims", "athlete lock", "work"]);
  });
});
