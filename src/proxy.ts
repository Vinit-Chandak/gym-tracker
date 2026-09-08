import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "@/lib/env";

const PUBLIC_PATHS = ["/login"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function withCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  return to;
}

/**
 * Refreshes the Supabase session on every request and keeps the app private:
 * unauthenticated visitors only ever see /login.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Coach routes verify their own revocable Bearer token and never use the browser session.
  if (pathname.startsWith("/api/coach/")) return NextResponse.next();
  const env = getSupabasePublicEnv();

  if (!env) {
    // Not configured yet: the login page explains what to set up.
    return isPublicPath(pathname)
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

  if (!signedIn && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/" && pathname !== "/today") url.searchParams.set("next", pathname);
    return withCookies(response, NextResponse.redirect(url));
  }
  if (signedIn && isPublicPath(pathname)) {
    return withCookies(response, NextResponse.redirect(new URL("/today", request.url)));
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons/|sw\\.js|offline\\.html|icon\\.svg|apple-icon\\.png|manifest\\.webmanifest|favicon\\.ico).*)",
  ],
};
