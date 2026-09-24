import { cookies } from "next/headers";

import { parseSetChanges, SET_CHANGES_COOKIE } from "@/lib/set-changes";

/** The stamp of the browser's latest set change when it asked for the page being rendered. */
export async function seenSetChanges(): Promise<number> {
  try {
    return parseSetChanges((await cookies()).get(SET_CHANGES_COOKIE)?.value);
  } catch {
    // Outside a request (a script, a test) there are no cookies and nothing to compare with.
    return 0;
  }
}
