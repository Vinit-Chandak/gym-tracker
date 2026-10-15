import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { COACH_CONTRACT_VERSION } from "@/domain/coaching-workflow";
import { handleCoachMcp } from "./coach-mcp";

let t: TestDatabase;
const resource = "https://app.test/api/coach/mcp";
const claims = {
  sub: "owner",
  client_id: "client",
  iss: "https://project.supabase.co/auth/v1",
  role: "authenticated",
  aud: resource,
  exp: 2000000000,
};
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  vi.stubEnv("COACH_BACKUP_ENABLED", "true");
  vi.stubEnv("COACH_BACKUP_OWNER_ID", "owner");
  vi.stubEnv("COACH_BACKUP_CLIENT_ID", "client");
  vi.stubEnv("COACH_BACKUP_RESOURCE_URL", resource);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-key");
});
afterEach(() => vi.unstubAllEnvs());
const verify = async () => claims;
function rpc(method: string, params?: unknown, headers?: Record<string, string>) {
  return handleCoachMcp(
    t.db,
    new Request(resource, {
      method: "POST",
      headers: {
        authorization: "Bearer synthetic-owner-token",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    { verify },
  );
}

it("requires authentication even for MCP initialization and tool discovery", async () => {
  const response = await handleCoachMcp(t.db, new Request(resource, { method: "POST" }));
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toContain("/api/coach/oauth/resource");
});
it("rejects another owner even with a cryptographically verified token", async () => {
  const response = await handleCoachMcp(
    t.db,
    new Request(resource, { headers: { authorization: "Bearer other" } }),
    { verify: async () => ({ ...claims, sub: "other" }) },
  );
  expect(response.status).toBe(401);
});
it("rejects foreign browser origins before invoking a tool", async () => {
  expect((await rpc("initialize", {}, { origin: "https://attacker.test" })).status).toBe(403);
});
it("negotiates the implemented stateless HTTP protocol", async () => {
  const result = await (await rpc("initialize", { protocolVersion: "2026-07-28" })).json();
  expect(result.result).toMatchObject({
    protocolVersion: "2025-11-25",
    capabilities: { tools: {} },
  });
  expect((await rpc("ping", {}, { "mcp-protocol-version": "unsupported" })).status).toBe(400);
  const older = await (await rpc("initialize", { protocolVersion: "2025-03-26" })).json();
  expect(older.result.protocolVersion).toBe("2025-03-26");
  const newer = await (
    await rpc(
      "initialize",
      { protocolVersion: "2026-07-28" },
      { "mcp-protocol-version": "2026-07-28" },
    )
  ).json();
  expect(newer.result.protocolVersion).toBe("2025-11-25");
});
it("exposes all workflow operations and keeps mutations authenticated", async () => {
  const body = await (await rpc("tools/list")).json();
  expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
    expect.arrayContaining([
      "coach_instructions",
      "coach_contract",
      "coach_dispatch",
      "coach_queue",
      "coach_claim",
      "coach_context",
      "coach_exercises",
      "coach_machines",
      "coach_attachment",
      "coach_result",
      "coach_fail",
      "coach_heartbeat",
    ]),
  );
  expect(
    body.result.tools.every(
      (tool: { securitySchemes: { type: string }[] }) => tool.securitySchemes[0]!.type === "oauth2",
    ),
  ).toBe(true);
  expect(
    body.result.tools.find((tool: { name: string }) => tool.name === "coach_result").annotations
      .readOnlyHint,
  ).toBe(false);
});
it("serves the shared worker instructions and the deployed contract through the adapter", async () => {
  const instructions = await (
    await rpc("tools/call", { name: "coach_instructions", arguments: {} })
  ).json();
  const value = JSON.parse(instructions.result.content[0].text);
  expect(value.workflow).toContain("## Process a claimed job");
  expect(value.transport).toContain("fresh subagent context per athlete");
  const contract = await (
    await rpc("tools/call", { name: "coach_contract", arguments: {} })
  ).json();
  expect(JSON.parse(contract.result.content[0].text).version).toBe(COACH_CONTRACT_VERSION);
});
it("rejects malformed arguments and unknown methods without calling a workflow", async () => {
  const invalid = await (
    await rpc("tools/call", { name: "coach_claim", arguments: { user: "bad", job: "bad" } })
  ).json();
  expect(invalid.result.isError).toBe(true);
  expect((await (await rpc("tools/call", { name: "unknown" })).json()).error.code).toBe(-32602);
  expect((await (await rpc("unknown")).json()).error.code).toBe(-32601);
});
it("pauses every connector operation with the workflow master switch", async () => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "false");
  expect((await rpc("initialize")).status).toBe(503);
});
it("verifies the authenticated connection while all coaching operations stay paused", async () => {
  vi.stubEnv("COACH_BACKUP_ENABLED", "false");
  expect((await rpc("initialize")).status).toBe(200);
  const profile = await (await rpc("tools/call", { name: "coach_profile" })).json();
  expect(JSON.parse(profile.result.content[0].text).nickname).toBe("Coaching paused");
  const contract = await (await rpc("tools/call", { name: "coach_contract" })).json();
  expect(JSON.parse(contract.result.content[0].text).version).toBe(COACH_CONTRACT_VERSION);
  for (const [name, args] of [
    ["coach_dispatch", {}],
    ["coach_queue", {}],
    ["coach_claim", { user: crypto.randomUUID(), job: crypto.randomUUID() }],
    [
      "coach_context",
      { user: crypto.randomUUID(), job: crypto.randomUUID(), attempt: crypto.randomUUID() },
    ],
  ] as const) {
    const result = await (await rpc("tools/call", { name, arguments: args })).json();
    expect(result.result.isError).toBe(true);
    expect(JSON.parse(result.result.content[0].text).error).toBe("The ChatGPT backup is disabled.");
  }
});

it("declares and returns ChatGPT's standard stable profile identity", async () => {
  const listed = await (await rpc("tools/list")).json();
  const definition = listed.result.tools.find(
    (tool: { name: string }) => tool.name === "coach_profile",
  );
  expect(definition).toMatchObject({
    _meta: { "openai/profile": true },
    outputSchema: { required: ["id"], additionalProperties: false },
  });
  const response = await (await rpc("tools/call", { name: "coach_profile" })).json();
  expect(response.result.structuredContent).toEqual({
    id: "owner",
    name: "Overload house coach backup",
    nickname: "Coaching enabled",
  });
  expect(JSON.parse(response.result.content[0].text)).toEqual(response.result.structuredContent);
});
