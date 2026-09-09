import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "@/lib/env";

/** Reachable without a session. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password"];

/**
 * Reachable either way. `/auth/confirm` is where an email link lands and creates the session;
 * `/reset-password` runs on the session that link just created, so signing in must not bounce
 * the user off it.
 */
const NEUTRAL_PATHS = ["/auth/confirm", "/reset-password"];

function matches(paths: readonly string[], pathname: string): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function withCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  return to;
}

/**
 * Refreshes the Supabase session on every request and keeps training data private:
 * without a session the only screens on offer are signing in and signing up.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Coach routes verify their own revocable Bearer token and never use the browser session.
  if (pathname.startsWith("/api/coach/")) return NextResponse.next();
  const env = getSupabasePublicEnv();
  const isPublic = matches(PUBLIC_PATHS, pathname);
  const isNeutral = matches(NEUTRAL_PATHS, pathname);

  if (!env) {
    // Not configured yet: the auth screens explain what to set up.
    return isPublic || isNeutral
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (isNeutral) return response;
  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/" && pathname !== "/today") url.searchParams.set("next", pathname);
    return withCookies(response, NextResponse.redirect(url));
  }
  if (signedIn && isPublic) {
    return withCookies(response, NextResponse.redirect(new URL("/today", request.url)));
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons/|sw\\.js|offline\\.html|icon\\.svg|apple-icon\\.png|manifest\\.webmanifest|favicon\\.ico).*)",
  ],
};
