import { AuthApiError, AuthPKCECodeVerifierMissingError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { supabase } = vi.hoisted(() => ({
  supabase: { verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn() },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: supabase }),
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://auth.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  supabase.verifyOtp.mockReset();
  supabase.exchangeCodeForSession.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

/**
 * The link lands wherever the athlete actually is. Both `nextUrl.origin` and `request.url`
 * report the origin the server was started with, which behind a proxy or on a custom domain is
 * not the host holding the session this link just created: an absolute redirect to the other
 * origin arrives without the cookie, and confirming an address lands back on signing in.
 */
async function confirm(url: string) {
  const { GET } = await import("./route");
  return GET(new NextRequest(new Request(url)));
}

it("sends a confirmed link on without naming a host", async () => {
  supabase.verifyOtp.mockResolvedValue({ error: null });
  const response = await confirm("https://overload.example/auth/confirm?token_hash=t&type=signup");
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/today");
});

it("sends a recovery link to the password screen, and a bad one back with its reason", async () => {
  supabase.verifyOtp.mockResolvedValue({ error: null });
  expect(
    (await confirm("https://overload.example/auth/confirm?token_hash=t&type=recovery")).headers.get(
      "location",
    ),
  ).toBe("/reset-password");

  supabase.verifyOtp.mockResolvedValue({ error: { message: "expired" } });
  expect(
    (await confirm("https://overload.example/auth/confirm?token_hash=t&type=recovery")).headers.get(
      "location",
    ),
  ).toBe("/forgot-password?error=link");
  expect(
    (await confirm("https://overload.example/auth/confirm?token_hash=t&type=signup")).headers.get(
      "location",
    ),
  ).toBe("/login?error=link");
  expect(
    (await confirm("https://overload.example/auth/confirm?nothing=here")).headers.get("location"),
  ).toBe("/login?error=link");
});

/**
 * A code is exchanged with a verifier kept in the browser that asked for the email. Opened in
 * any other — Safari, from an app on an iPhone's home screen — it cannot be, and saying the link
 * had expired sent the athlete round asking for another that would fail the same way.
 */
it("says a link was opened in another browser, rather than that it expired", async () => {
  supabase.exchangeCodeForSession.mockResolvedValue({
    data: { user: null, session: null, redirectType: null },
    error: new AuthPKCECodeVerifierMissingError(),
  });
  expect(
    (await confirm("https://overload.example/auth/confirm?code=c")).headers.get("location"),
  ).toBe("/login?error=browser");

  supabase.exchangeCodeForSession.mockResolvedValue({
    data: { user: null, session: null, redirectType: null },
    error: new AuthApiError("invalid flow state", 404, "flow_state_not_found"),
  });
  expect(
    (await confirm("https://overload.example/auth/confirm?code=c")).headers.get("location"),
  ).toBe("/login?error=link");
});

it("sends a failure Supabase reports back to the reset form only when the link was a reset", async () => {
  const failed = "error=access_denied&error_code=otp_expired";
  expect(
    (await confirm(`https://overload.example/auth/confirm?${failed}`)).headers.get("location"),
  ).toBe("/login?error=link");
  expect(
    (await confirm(`https://overload.example/auth/confirm?${failed}&type=recovery`)).headers.get(
      "location",
    ),
  ).toBe("/forgot-password?error=link");
  expect(supabase.exchangeCodeForSession).not.toHaveBeenCalled();
});
