import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({ auth: { getClaims: vi.fn() } }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth }),
}));
vi.mock("@/lib/supabase/jwks", () => ({ getClaimsOptions: () => ({}) }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://auth.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  auth.getClaims.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const signedOut = () => auth.getClaims.mockResolvedValue({ data: null });
const signedIn = () => auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });

async function run(url: string, init?: RequestInit) {
  const { proxy } = await import("./proxy");
  return proxy(new NextRequest(new Request(url, init)));
}

const action = { method: "POST", headers: { "next-action": "7f3a9c" } };

it("sends a signed-out visitor to the sign-in screen, saying where they were going", async () => {
  signedOut();
  const response = await run("https://overload.example/history");
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("https://overload.example/login?next=%2Fhistory");
});

/**
 * A Server Action authorises itself — every one of this app's begins with `requireUser()` —
 * so redirecting its POST here only replaces the reply React is waiting for with a page it
 * cannot read. All it could then report was that something unexpected came back: a set saved
 * on an expired session said the connection was lost, and Retry never worked. Let through,
 * the action redirects, and the athlete arrives at the sign-in screen.
 */
it("lets a server action through to answer for itself, signed out or in", async () => {
  signedOut();
  const out = await run("https://overload.example/workouts/s1", action);
  expect(out.status).toBe(200);
  expect(out.headers.get("location")).toBeNull();

  signedIn();
  const authed = await run("https://overload.example/login", action);
  expect(authed.status).toBe(200);
  expect(authed.headers.get("location")).toBeNull();
});

it("still guards an ordinary POST that is not an action", async () => {
  signedOut();
  const response = await run("https://overload.example/workouts/s1", { method: "POST" });
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    "https://overload.example/login?next=%2Fworkouts%2Fs1",
  );
});

it("keeps a signed-in visitor away from the sign-in screen", async () => {
  signedIn();
  const response = await run("https://overload.example/login");
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("https://overload.example/today");
});

it("leaves the coach API and the confirmation link alone", async () => {
  signedOut();
  expect((await run("https://overload.example/api/coach/sessions")).status).toBe(200);
  expect((await run("https://overload.example/auth/confirm?token_hash=t")).status).toBe(200);
});
