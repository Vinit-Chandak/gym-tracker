import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { gyms } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { COACH_CONTRACT_VERSION } from "@/domain/coaching-workflow";
import { handleCoachServiceRequest } from "@/server/coach-service";

/**
 * The worker boundary at cutover (plan §8.5).
 *
 * Two things have to be true at once, and they are easy to get wrong in opposite directions.
 * A worker running a stale clone must be turned away before it spends an attempt discovering
 * that its field names are gone. And the retired v3 write paths must stay retired whatever
 * else is switched off — a rollout flag flipped during an incident cannot be allowed to
 * resurrect a writer that has no way to name a swim.
 */

const TOKEN = "synthetic-workflow-service-token";
let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("COACH_SERVICE_TOKEN", TOKEN);
});

function call(
  path: string[],
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  return handleCoachServiceRequest(
    t.db,
    new Request(`https://app.test/api/coach/service/${path.join("/")}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    path,
  );
}

async function athlete() {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  await withUser(t.db, user.id, (tx) =>
    tx
      .insert(gyms)
      .values({ userId: user.id, name: "My gym", slug: "my-gym", kind: "gym", isDefault: true }),
  );
  return user;
}

/** AT-API-07: the contract says which versions it will accept, not merely which it is. */
it("advertises the versions a worker may speak", async () => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  const response = await call(["workflow", "contract"]);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { version: number; supportedVersions: number[] };
  expect(body.version).toBe(COACH_CONTRACT_VERSION);
  expect(body.supportedVersions).toContain(COACH_CONTRACT_VERSION);
  expect(body.supportedVersions).not.toContain(3);
});

/** AT-COACH-10: a v3 worker is refused before it claims anything. */
it("turns away a worker declaring the retired contract", async () => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  const response = await call(["workflow", "queue"], {
    headers: { "x-coach-contract-version": "3" },
  });
  expect(response.status).toBe(409);
  const body = (await response.json()) as { error: string; detail: string };
  expect(body.error).toBe("upgrade_required");
  expect(body.detail).toContain(String(COACH_CONTRACT_VERSION));
});

it("accepts a worker declaring the current contract", async () => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  const response = await call(["workflow", "queue"], {
    headers: { "x-coach-contract-version": String(COACH_CONTRACT_VERSION) },
  });
  expect(response.status).toBe(200);
});

it("refuses a version that is not a number at all", async () => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  const response = await call(["workflow", "queue"], {
    headers: { "x-coach-contract-version": "four" },
  });
  expect(response.status).toBe(409);
});

/**
 * AT-COACH-10: once the workflow API is serving, the v3 paths are closed — writes included.
 *
 * A v3 plan names a day and a gym, and there is no honest way to read that as one occurrence
 * out of a Tuesday that has two. An old worker that keeps posting gets told to upgrade and
 * writes nothing.
 */
it("closes the legacy write paths once the workflow API is serving", async () => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  const user = await athlete();
  const response = await call(["users", user.id, "attempts"], {
    method: "POST",
    body: { trigger: "nightly", status: "planned" },
  });
  expect(response.status).toBe(409);
});

/** Until then the legacy service is still the one in use, and its reads keep working. */
it("still serves the legacy read path with the workflow flag off", async () => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "false");
  const response = await call(["due"]);
  expect(response.status).toBe(200);
});

it("requires the service token whatever the rollout says", async () => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  const response = await handleCoachServiceRequest(
    t.db,
    new Request("https://app.test/api/coach/service/workflow/contract"),
    ["workflow", "contract"],
  );
  expect(response.status).toBe(401);
});

/** The workflow API is a deployment switch of its own; off means off, not "fall back to v3". */
it("reports the workflow API as unavailable rather than falling back", async () => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "false");
  const response = await call(["workflow", "contract"]);
  expect(response.status).toBe(503);
});
