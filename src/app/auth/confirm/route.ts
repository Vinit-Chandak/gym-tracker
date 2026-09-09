import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

/** Only same-origin app paths are accepted, so a crafted link cannot bounce elsewhere. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/today";
  return next;
}

/**
 * Where every link Supabase emails lands: confirmations, invitations, magic links and password
 * recovery. Supabase's default templates send a `code` to exchange; templates written against
 * the server-side flow send `token_hash` plus a `type`. Both are accepted, so the app works
 * whichever the project uses.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const failure = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, origin));

  if (!isSupabaseConfigured()) return failure("not-configured");

  // Supabase reports its own failures on the redirect itself (expired or already-used links).
  if (searchParams.get("error")) {
    return NextResponse.redirect(new URL("/forgot-password?error=link", origin));
  }

  const supabase = await createSupabaseServerClient();
  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? failure("link") : NextResponse.redirect(new URL(next, origin));
  }

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      return NextResponse.redirect(
        new URL(type === "recovery" ? "/forgot-password?error=link" : "/login?error=link", origin),
      );
    }
    return NextResponse.redirect(new URL(next, origin));
  }

  return failure("link");
}
