import { isAuthPKCECodeVerifierMissingError, type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeAppPath } from "@/lib/safe-app-path";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

/**
 * Where a confirmed link goes. Everything that is not a password reset lands on Today, and an
 * account that has not finished setup is sent on to `/welcome` from there — so this does not
 * need to know which of the two a link belongs to.
 */
const AFTER_CONFIRM = "/today";
const AFTER_RECOVERY = "/reset-password";

/**
 * Whether the exchanged code came from a password reset.
 *
 * `exchangeCodeForSession` reads the flow back off the stored code verifier and returns it as
 * `redirectType`, but @supabase/auth-js 2.116 leaves it off `AuthTokenResponse`. It is read
 * defensively so a version that stops sending it treats the link as an ordinary confirmation
 * instead of failing: Profile → Password can still change a password from there.
 */
function isRecoveryFlow(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { redirectType?: unknown }).redirectType === "recovery"
  );
}

/**
 * Where every link Supabase emails lands: confirmations, invitations, magic links and password
 * recovery. Supabase's default templates send a `code` to exchange; templates written against
 * the server-side flow send `token_hash` plus a `type`. Both are accepted, so the app works
 * whichever the project uses — but only a `token_hash` link works in any browser, which is why
 * SETUP.md asks for those templates.
 *
 * A `code` can be exchanged only by the browser that asked for the email: the other half of it,
 * the code verifier, is a cookie that browser was given. A link opened anywhere else — on the
 * phone when the reset was asked for on a laptop, or in Safari when it was asked for from the
 * app on an iPhone's home screen, which keeps cookies of its own — cannot be finished here, and
 * the athlete is told that, rather than that the link has expired.
 *
 * The address the app hands Supabase carries no query string of its own. Supabase matches the
 * whole redirect URL, query included, against the project's Redirect URLs; a `?next=…` on the
 * end therefore failed to match the plain path an operator was told to allow-list, and Supabase
 * quietly fell back to the project's Site URL — which on a new project is `localhost:3000`.
 * Where a link is going is worked out here instead, from what the link itself is for. A `next`
 * is still honoured, because links sent before this change carry one.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const asked = safeAppPath(searchParams.get("next"));
  /**
   * Sends the athlete on without naming a host.
   *
   * Every destination here is a path inside the app, and the session this link just created
   * belongs to the host they are actually on. Both `nextUrl.origin` and `request.url` report
   * the origin the server was started with, which is not always that host: behind a proxy, on
   * a custom domain, or anywhere the two differ, an absolute redirect arrives at a different
   * origin without the cookie, and confirming an address lands back on the sign-in screen.
   * A relative location is resolved by the browser against where it already is.
   */
  const here = (path: string) =>
    new NextResponse(null, { status: 307, headers: { Location: path } });
  const go = (path: string) => here(asked ?? path);
  const failure = (reason: string) => here(`/login?error=${reason}`);

  if (!isSupabaseConfigured()) return failure("not-configured");

  const type = searchParams.get("type") as EmailOtpType | null;
  // Supabase reports its own failures on the redirect itself (expired or already-used links).
  // That address says what the link was for only when the project passes `type` through, so
  // only a link known to be a reset is sent back to ask for another; a confirmation is not.
  if (searchParams.get("error")) {
    return here(type === "recovery" ? "/forgot-password?error=link" : "/login?error=link");
  }

  const supabase = await createSupabaseServerClient();
  const code = searchParams.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    // The verifier went with the browser that asked, and with it what the link was for.
    if (error) return failure(isAuthPKCECodeVerifierMissingError(error) ? "browser" : "link");
    // The flow that sent the email is remembered alongside its code verifier, so a recovery
    // link is recognisable even though the address it came back to says nothing about it.
    // Supabase passes `type` through on some configurations; either signal is enough.
    return go(type === "recovery" || isRecoveryFlow(data) ? AFTER_RECOVERY : AFTER_CONFIRM);
  }

  const tokenHash = searchParams.get("token_hash");
  if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      return here(type === "recovery" ? "/forgot-password?error=link" : "/login?error=link");
    }
    return go(type === "recovery" ? AFTER_RECOVERY : AFTER_CONFIRM);
  }

  return failure("link");
}
