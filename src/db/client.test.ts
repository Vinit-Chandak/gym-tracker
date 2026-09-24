import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  CONNECT_TIMEOUT_MS,
  connectionConfig,
  poolConfig,
  releaseEveryTransaction,
  serializeQueries,
} from "./client";
import * as schema from "./schema";
import { isConnectionError } from "./with-user";

describe("connection settings from a database URL", () => {
  it("spells out every part, decoding the credentials", () => {
    expect(
      connectionConfig(
        "postgresql://postgres.abcd:p%40ss%2Fword@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
      ),
    ).toEqual({
      host: "aws-0-ap-south-1.pooler.supabase.com",
      port: 6543,
      user: "postgres.abcd",
      password: "p@ss/word",
      database: "postgres",
      ssl: { rejectUnauthorized: false },
    });
  });

  it("never lets sslmode in the URL turn on certificate verification", () => {
    const config = connectionConfig("postgres://u:p@db.example.com:5432/app?sslmode=require");
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config).not.toHaveProperty("sslmode");
  });

  it("connects to this machine without TLS", () => {
    expect(connectionConfig("postgres://postgres:postgres@127.0.0.1:5432/overload").ssl).toBe(
      false,
    );
    expect(connectionConfig("postgres://postgres:postgres@localhost/overload").port).toBe(5432);
  });

  it("passes on the settings pg understands, and defaults the database to the user", () => {
    const config = connectionConfig(
      "postgres://reader:x@db.example.com?application_name=overload&options=-c%20statement_timeout%3D5000",
    );
    expect(config).toMatchObject({
      database: "reader",
      application_name: "overload",
      options: "-c statement_timeout=5000",
    });
  });
});

describe("one query at a time on a connection", () => {
  function recordingClient() {
    const events: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        events.push(`start ${text}`);
        await new Promise((resolve) => setTimeout(resolve, text === "slow" ? 20 : 1));
        events.push(`end ${text}`);
        if (text === "bad") throw new Error("syntax error");
        return { rows: [text] };
      }),
    };
    return { client: client as unknown as pg.ClientBase, events };
  }

  it("runs queries started together one after another, in order", async () => {
    const { client, events } = recordingClient();
    serializeQueries(client);
    const results = await Promise.all([client.query("slow"), client.query("fast")]);
    expect(results.map((r) => r.rows[0])).toEqual(["slow", "fast"]);
    expect(events).toEqual(["start slow", "end slow", "start fast", "end fast"]);
  });

  it("carries on after a query fails, and hands the failure to its caller", async () => {
    const { client, events } = recordingClient();
    serializeQueries(client);
    const [bad, next] = await Promise.allSettled([client.query("bad"), client.query("next")]);
    expect(bad.status).toBe("rejected");
    expect(next).toMatchObject({ status: "fulfilled", value: { rows: ["next"] } });
    expect(events).toEqual(["start bad", "end bad", "start next", "end next"]);
  });
});

describe("transactions on the pool", () => {
  /**
   * A stand-in connection that answers like the server: its transaction status follows BEGIN,
   * COMMIT and ROLLBACK, and any statement scripted to fail does.
   */
  function fakePool(fail: (text: string) => Error | null) {
    let status: "I" | "T" | "E" = "I";
    const release = vi.fn();
    const client = {
      query: vi.fn(async (config: { text: string }) => {
        const text = config.text.trim().toLowerCase();
        const failure = fail(text);
        if (failure) {
          if (status === "T") status = "E";
          throw failure;
        }
        if (text.startsWith("begin")) status = "T";
        if (text === "commit" || text === "rollback") status = "I";
        return { rows: [], rowCount: 0, fields: [], command: text, oid: 0 };
      }),
      getTransactionStatus: () => status,
      release,
    };
    const pool = { connect: vi.fn(async () => client) } as unknown as pg.Pool;
    const db = drizzle(pool, { schema });
    releaseEveryTransaction(db, pool);
    return { db, pool, release, client };
  }

  it("commits on the checked-out connection and gives it back", async () => {
    const { db, release, client } = fakePool(() => null);
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        return "done";
      }),
    ).resolves.toBe("done");
    expect(client.query.mock.calls.map(([c]) => c.text)).toEqual(["begin", "select 1", "commit"]);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("still gives the connection back when BEGIN itself fails", async () => {
    const lost = new Error("Connection terminated unexpectedly");
    const { db, release } = fakePool((text) => (text === "begin" ? lost : null));
    const failure = await db.transaction(async () => "never").catch((error: unknown) => error);
    expect(failure).toBe(lost);
    expect(isConnectionError(failure)).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("throws what the server said when ROLLBACK fails on a dead connection, as before", async () => {
    const lost = new Error("Client has encountered a connection error and is not queryable");
    const { db } = fakePool((text) =>
      text === "select 5"
        ? new Error("Connection terminated unexpectedly")
        : text === "rollback"
          ? lost
          : null,
    );
    const failure = await db
      .transaction(async (tx) => {
        await tx.execute(sql`select 5`);
      })
      .catch((error: unknown) => error);
    expect(failure).toBe(lost);
  });

  it("rolls back and returns a working connection when the work fails", async () => {
    const { db, release, client } = fakePool((text) =>
      text === "select 2" ? new Error("duplicate key value") : null,
    );
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select 2`);
      }),
    ).rejects.toThrow();
    expect(client.query.mock.calls.map(([c]) => c.text)).toEqual(["begin", "select 2", "rollback"]);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("throws what the server said when COMMIT itself fails, as the other drivers do", async () => {
    const deferred = Object.assign(new Error("exactly one typed detail per activity"), {
      code: "23514",
    });
    const { db, release } = fakePool((text) => (text === "commit" ? deferred : null));
    const failure = await db
      .transaction(async (tx) => {
        await tx.execute(sql`select 4`);
      })
      .catch((error: unknown) => error);
    expect(failure).toBe(deferred);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("closes a connection that is still inside a transaction afterwards", async () => {
    const { db, release } = fakePool((text) =>
      text === "select 3" || text === "rollback" ? new Error("Connection terminated") : null,
    );
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select 3`);
      }),
    ).rejects.toThrow();
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0]![0]).toBeInstanceOf(Error);
  });
});

describe("the pool", () => {
  it("limits opening a connection, never waiting for a free one", () => {
    const config = poolConfig("postgres://u:p@db.example.com:6543/postgres");
    // pg-pool would apply its own timeout to a request queued for a busy pool's connection too.
    expect(config.connectionTimeoutMillis).toBeUndefined();
    const Client = config.Client as unknown as new (c: pg.ClientConfig) => pg.Client;
    const client = new Client({ host: "db.example.com" });
    expect(client).toBeInstanceOf(pg.Client);
    expect(
      (client as unknown as { _connectionTimeoutMillis: number })._connectionTimeoutMillis,
    ).toBe(CONNECT_TIMEOUT_MS);
    expect(config.max).toBe(5);
  });
});

describe("lost connections, as node-postgres reports them", () => {
  it("are recognised by message, however deeply wrapped", () => {
    expect(isConnectionError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(
      isConnectionError(
        new Error("Failed query: begin", {
          cause: new Error("Client has encountered a connection error and is not queryable"),
        }),
      ),
    ).toBe(true);
    expect(isConnectionError(new Error("Connection terminated due to connection timeout"))).toBe(
      false,
    );
  });
});
