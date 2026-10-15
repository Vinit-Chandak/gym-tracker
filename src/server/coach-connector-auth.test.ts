import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authorizeCoachConnector, coachResourceMetadata } from "./coach-connector-auth";

const resource = "https://app.test/api/coach/mcp";
const claims = {
  sub: "owner",
  client_id: "chatgpt-client",
  iss: "https://project.supabase.co/auth/v1",
  role: "authenticated",
  aud: resource,
  exp: 2000000000,
};
beforeEach(() => {
  vi.stubEnv("COACH_BACKUP_ENABLED", "true");
  vi.stubEnv("COACH_BACKUP_OWNER_ID", "owner");
  vi.stubEnv("COACH_BACKUP_CLIENT_ID", "chatgpt-client");
  vi.stubEnv("COACH_BACKUP_RESOURCE_URL", resource);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-key");
});
afterEach(() => vi.unstubAllEnvs());

it("accepts only a live token for the owner, pinned client, issuer and exact resource", () => {
  expect(authorizeCoachConnector(claims, 1000)).toBe(true);
  expect(authorizeCoachConnector({ ...claims, aud: [resource] }, 1000)).toBe(true);
});
it.each([
  { sub: "another-athlete" },
  { client_id: "another-app" },
  { client_id: undefined },
  { iss: "https://attacker.test/auth/v1" },
  { role: "service_role" },
  { aud: "authenticated" },
  { aud: "https://app.test/api/coach/mcp/" },
  { exp: 1 },
])("rejects a wrong or expired identity: %j", (override) => {
  expect(authorizeCoachConnector({ ...claims, ...override }, 2000)).toBe(false);
});
it("allows the pinned connection to be verified while job execution is paused", () => {
  vi.stubEnv("COACH_BACKUP_ENABLED", "false");
  expect(authorizeCoachConnector(claims, 1000)).toBe(true);
  expect(coachResourceMetadata()?.resource).toBe(resource);
});
it("fails closed when incompletely configured", () => {
  vi.stubEnv("COACH_BACKUP_RESOURCE_URL", "http://app.test/api/coach/mcp");
  expect(authorizeCoachConnector(claims, 1000)).toBe(false);
  expect(coachResourceMetadata()).toBeNull();
});
it("publishes public discovery without including a service credential", () => {
  expect(coachResourceMetadata()).toEqual({
    resource,
    authorization_servers: ["https://project.supabase.co/auth/v1"],
    scopes_supported: ["openid", "email"],
    resource_name: "Overload house coach backup",
  });
});
