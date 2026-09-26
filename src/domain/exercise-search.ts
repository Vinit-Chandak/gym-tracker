/**
 * Finding an exercise by what somebody calls it (ADR 0029).
 *
 * The coach looks exercises up by the athlete's own words, and the athlete does not type the
 * library's name: "Bayesian bicep curls" is the Bayesian cable curl, and asking them which
 * name they saved it under is a question the library could have answered. So a search is
 * forgiving on purpose. Words are compared without case or punctuation, a plural matches
 * its singular, a word matches the start of a longer one, and an exercise ranks by how many
 * of the words it matches, so the closest names come first and a near miss still appears.
 */

const IGNORED = new Set(["a", "an", "and", "the", "with", "on", "of", "for", "to", "in"]);

/** One word as the search compares it: lower case, and a plural cut to its singular. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("ves")) return `${word.slice(0, -3)}f`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "" && !IGNORED.has(word))
    .map(stem);
}

function wordsMatch(asked: string, known: string): boolean {
  if (asked === known) return true;
  if (asked.length >= 3 && known.startsWith(asked)) return true;
  return known.length >= 4 && asked.startsWith(known);
}

export type Searchable = {
  name: string;
  slug: string;
  movementPattern: string;
  primaryMuscles: readonly string[];
  modality: string;
};

/**
 * How well an exercise answers a query: the number of the query's words it matches, with a
 * match in the name worth more than one found only in its muscles or pattern. Zero is no
 * match at all.
 */
export function searchScore(query: readonly string[], exercise: Searchable): number {
  const name = searchWords(`${exercise.name} ${exercise.slug}`);
  const rest = searchWords(
    [exercise.movementPattern, exercise.modality, ...exercise.primaryMuscles].join(" "),
  );
  let score = 0;
  for (const asked of query) {
    if (name.some((known) => wordsMatch(asked, known))) score += 2;
    else if (rest.some((known) => wordsMatch(asked, known))) score += 1;
  }
  return score;
}
