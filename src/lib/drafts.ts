/**
 * Content awaiting the owner's review: drafted guides, candidate demonstrations and draft
 * drawings (plan: owner decisions, content and delivery). They are shown in development, and in
 * an environment that sets `OVERLOAD_SHOW_DRAFTS=1` (a production build run against a local
 * database), and nowhere else. Guides and demonstrations are also gated at seeding, as catalogue
 * additions are: only a local database or a test has them (see `seedReferenceData`), so a
 * signed-in client reading the tables directly finds none in production either.
 */
export function showsDrafts(): boolean {
  return process.env.NODE_ENV === "development" || process.env.OVERLOAD_SHOW_DRAFTS === "1";
}

/** Whether a database URL is on this machine, where drafts awaiting review may be seeded. */
export function isLoopbackDatabase(url: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}
