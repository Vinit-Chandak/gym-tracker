/**
 * A page left open across a deploy.
 *
 * The installed app keeps its page in memory for days (ADR 0050), so after a deploy the page an
 * athlete comes back to is often the release before. Moving between screens heals itself: Next
 * sees the new release and loads the whole page. Two things do not. A save names its server
 * action by an ID, which changes when the key the IDs are made from is renewed (every 14 days,
 * unless the deployment sets one) or the action moves, and the server answers an ID it no longer
 * knows with a refusal. And code the old page has not loaded yet may no longer be on the
 * server. Neither is fixed by trying again on the same page; loading the page afresh fixes
 * both, and the refused save never ran, so nothing is saved twice. Set drafts are on the device
 * before a save is sent, and come back after the reload.
 */

/**
 * Whether a save was refused because the server no longer knows this page's release: Next's
 * `UnrecognizedActionError`, recognised by its name rather than through
 * `unstable_isUnrecognizedActionError`, which lives in next/navigation, a module many screens'
 * tests replace with a stand-in.
 */
export function isOutOfDate(error: unknown): boolean {
  return error instanceof Error && error.name === "UnrecognizedActionError";
}

/** Whether code this page asked for could not be loaded: gone after a deploy, or offline. */
export function isMissingCode(error: unknown): boolean {
  return error instanceof Error && error.name === "ChunkLoadError";
}

const RELOADED_AT = "overload:reloaded-for-update";
/** A second failure this soon after reloading is not one that reloading fixes. */
const AGAIN_AFTER_MS = 60_000;

/**
 * Loads the page afresh to pick up the new release, and says whether it did. Once: if the same
 * failure comes back within a minute of the last reload, it is left to the screen to report,
 * rather than reloading in a loop. Without session storage there is no way to know that, so
 * nothing is reloaded at all.
 */
export function reloadForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT));
    if (Date.now() - last < AGAIN_AFTER_MS) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/**
 * The same for code that would not load, once the server is known to answer: offline, the page
 * reloaded would only be the offline screen, and the error screen already says to reconnect.
 * The question goes to a small public file, past the service worker's cache.
 */
export async function reloadForMissingCode(): Promise<boolean> {
  if (navigator.onLine === false) return false;
  try {
    await fetch("/offline.html", { method: "HEAD", cache: "no-store" });
  } catch {
    return false;
  }
  return reloadForUpdate();
}

/**
 * For an error screen: when what failed is one of the two a fresh page fixes, reload, once,
 * rather than offer Try again on a page that will fail the same way.
 */
export function reloadIfOutOfDate(error: unknown): void {
  if (isOutOfDate(error)) reloadForUpdate();
  else if (isMissingCode(error)) void reloadForMissingCode();
}
