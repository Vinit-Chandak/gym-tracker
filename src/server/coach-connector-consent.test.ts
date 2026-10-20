import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  backup: vi.fn(),
  details: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/env", () => ({ getCoachBackupConnection: mocks.backup }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { oauth: { getAuthorizationDetails: mocks.details } },
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));

import { coachOAuthRedirect, readCoachConnectorConsent } from "./coach-connector-consent";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.backup.mockReturnValue({ ownerId: "owner", clientId: "client" });
  mocks.details.mockResolvedValue({
    data: { authorization_id: "request", client: { id: "client" }, user: { id: "owner" } },
    error: null,
  });
});

it("reads the consent only for the configured owner and client", async () => {
  expect((await readCoachConnectorConsent("request")).id).toBe("request");
  expect(mocks.details).toHaveBeenCalledWith("request");
  mocks.user.mockResolvedValueOnce({ id: "other-athlete" });
  await expect(readCoachConnectorConsent("request")).rejects.toThrow("not-found");
  mocks.details.mockResolvedValueOnce({
    data: { authorization_id: "request", client: { id: "other-client" }, user: { id: "owner" } },
    error: null,
  });
  await expect(readCoachConnectorConsent("request")).rejects.toThrow("not-found");
});

it.each(["", "x".repeat(201)])("treats a malformed authorization id as unavailable", async (id) => {
  await expect(readCoachConnectorConsent(id)).rejects.toThrow("not-found");
  expect(mocks.details).not.toHaveBeenCalled();
});

it("treats expired or missing authorization details as unavailable", async () => {
  mocks.details.mockResolvedValue({ data: null, error: new Error("Expired") });
  await expect(readCoachConnectorConsent("request")).rejects.toThrow("not-found");
});

it.each([
  "https://attacker.test/connector_platform_oauth_redirect",
  "http://chatgpt.com/connector_platform_oauth_redirect",
  "https://chatgpt.com/elsewhere",
  "https://chatgpt.com:444/connector/oauth/return",
  "https://user@chatgpt.com/connector/oauth/return",
  "https://chatgpt.com/connector/oauth/return#fragment",
])("refuses an unrelated callback %s", (url) => {
  expect(() => coachOAuthRedirect(url)).toThrow();
});

it("accepts the connector callback with its authorization result", () => {
  const url = "https://chatgpt.com/connector_platform_oauth_redirect?code=test&state=state";
  expect(coachOAuthRedirect(url)).toBe(url);
});
