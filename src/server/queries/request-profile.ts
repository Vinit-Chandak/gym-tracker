import { cookies } from "next/headers";
import { cache } from "react";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ensureProfile, type Profile } from "./profile";
import { ProfileCache } from "./profile-cache";

/** How long one server instance may reuse a profile row it has read. */
export const PROFILE_CACHE_TTL_MS = 60_000;

/** Set by every profile write: the browser then carries the time of its last change. */
export const PROFILE_CHANGED_COOKIE = "overload-profile-changed";

const profiles = new ProfileCache<Profile>(PROFILE_CACHE_TTL_MS);

/** The moment of this browser's last profile write, or 0 when it never wrote one. */
async function lastProfileChange(): Promise<number> {
  try {
    const value = Number((await cookies()).get(PROFILE_CHANGED_COOKIE)?.value);
    return Number.isFinite(value) ? value : 0;
  } catch {
    // Outside a request (a script, a test) there are no cookies and nothing to honour.
    return 0;
  }
}

/**
 * The signed-in account's profile. React's cache shares one read across the layout and the page
 * of a render; the process-wide cache in `profile-cache.ts` spares the database altogether for a
 * minute per account.
 */
export const getRequestProfile = cache(
  async (id: string, email: string | null, displayName?: string | null): Promise<Profile> => {
    return profiles.read(id, await lastProfileChange(), () =>
      withUser(getDb(), id, (tx) => ensureProfile(tx, { id, email, displayName })),
    );
  },
);

/** Drops this instance's copy. Enough when the account itself is going away. */
export function forgetProfile(id: string): void {
  profiles.forget(id);
}

/**
 * For server actions that changed the profile: drops this instance's copy and stamps the browser,
 * so an instance that still holds an older copy re-reads on the next request too.
 */
export async function profileChanged(id: string): Promise<void> {
  forgetProfile(id);
  (await cookies()).set(PROFILE_CHANGED_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Long enough to outlive every instance's copy, short enough to disappear on its own.
    maxAge: (PROFILE_CACHE_TTL_MS / 1000) * 5,
  });
}
