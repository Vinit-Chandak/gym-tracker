/**
 * Content awaiting the owner's review: drafted guides, candidate demonstrations and draft
 * drawings (plan: owner decisions, content and delivery). They are shown in development, and in
 * an environment that sets `OVERLOAD_SHOW_DRAFTS=1` (a preview the owner checks on a phone), and
 * nowhere else. Catalogue additions are gated earlier, at seeding: see `seedReferenceData`.
 */
export function showsDrafts(): boolean {
  return process.env.NODE_ENV === "development" || process.env.OVERLOAD_SHOW_DRAFTS === "1";
}

/** Whether a database URL is on this machine, where catalogue drafts may be seeded. */
export function isLoopbackDatabase(url: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}
