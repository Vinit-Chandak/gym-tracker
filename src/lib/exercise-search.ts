import { searchWords } from "@/domain/exercise-search";
import { groupByRegion } from "@/domain/muscles";
import type { ExerciseCategory, ExerciseModality, MuscleGroup } from "@/domain/types";

import {
  BODY_REGION_LABELS,
  EXERCISE_CATEGORY_LABELS,
  EXERCISE_MODALITY_LABELS,
  MUSCLE_LABELS,
} from "./labels";

export type SearchableExercise = {
  name: string;
  slug: string;
  category: ExerciseCategory;
  modality: ExerciseModality;
  movementPattern: string;
  primaryMuscles: readonly MuscleGroup[];
  secondaryMuscles: readonly MuscleGroup[];
};

/** One word of a query, and how loosely it may match. */
type AskedWord = {
  word: string;
  /**
   * The last word, still being typed: "pull u" is on its way to "pull-up", so it matches the
   * start of a name word of any length.
   */
  partial: boolean;
  /**
   * Typed as a plural, so finished: "lats" asks for the lats, not for anything "lateral".
   */
  whole: boolean;
};

function askedWords(query: string): AskedWord[] {
  const typed = query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ");
  // A space after the last word says it is finished as surely as a plural does.
  const stillTyping = /[a-z0-9]$/i.test(query);
  return typed.flatMap((raw, i) => {
    const [word] = searchWords(raw);
    if (!word) return [];
    const whole = word !== raw;
    return [{ word, whole, partial: !whole && stillTyping && i === typed.length - 1 }];
  });
}

/**
 * Whether a word of the query is this word of the exercise. A whole word, a prefix of three
 * letters or more, or, for the word still being typed and only against the name, any prefix:
 * "up" in "pull up" is not a search for the upper back, and letting it be one filled a search
 * for pull-ups with every row in the library.
 */
function wordMatches(asked: AskedWord, known: string, inName: boolean): boolean {
  if (asked.word === known) return true;
  if (asked.whole || !known.startsWith(asked.word)) return false;
  return asked.word.length >= 3 || (asked.partial && inName);
}

/**
 * Where the query, run together, starts among the name's words run together: null when it
 * does not, and otherwise whether it starts at the first word, whether it is all of them,
 * and whether it needed the unfinished last word to. Spacing and hyphens are how people differ
 * most in naming the same lift, so "pullup", "pull up" and "pull-up" are all the Pull-up.
 */
function compactMatch(
  asked: readonly AskedWord[],
  nameWords: readonly string[],
): { atStart: boolean; whole: boolean; partial: boolean } | null {
  const joined = asked.map((a) => a.word).join("");
  // A plural is cut only from a word long enough to be one, so "ups" in "pull-ups" survives
  // to here; the query run together is long enough to lose it.
  const compacts =
    joined.length > 3 && joined.endsWith("s") ? [joined, joined.slice(0, -1)] : [joined];
  const partial = asked.at(-1)?.partial ?? false;
  let best: { atStart: boolean; whole: boolean; partial: boolean } | null = null;
  for (let i = 0; i < nameWords.length; i += 1) {
    for (let j = i + 1; j <= nameWords.length; j += 1) {
      const run = nameWords.slice(i, j).join("");
      if (compacts.includes(run)) {
        return { atStart: i === 0, whole: i === 0 && j === nameWords.length, partial: false };
      }
      if (partial && !best && compacts.some((compact) => run.startsWith(compact))) {
        best = { atStart: i === 0, whole: false, partial: true };
      }
    }
  }
  return best;
}

/**
 * How well an exercise answers a query, lower being better; null when it does not.
 *
 * 0. The name is the query.
 * 1. The name starts with it.
 * 2. The name holds it, or starts with the word still being typed.
 * 3. The name holds every word of it, not necessarily together.
 * 4. Every word is in the name, the equipment, the movement or a primary muscle.
 * 5. Some word is only in a secondary muscle.
 *
 * Name matches (0–3) are what was asked for; the rest are exercises that work what was asked
 * about, which is what a search for "biceps" or "machine lats" wants.
 */
export function exerciseSearchRank(exercise: SearchableExercise, query: string): number | null {
  const asked = askedWords(query);
  if (asked.length === 0) return 4;

  const nameWords = searchWords(exercise.name);
  const name = searchWords(`${exercise.name} ${exercise.slug}`);
  const compact = compactMatch(asked, nameWords);
  if (compact) {
    if (compact.whole) return 0;
    if (compact.atStart && !compact.partial) return 1;
    return compact.atStart || !compact.partial ? 2 : 3;
  }
  if (asked.every((word) => name.some((known) => wordMatches(word, known, true)))) return 3;

  const primary = searchWords(
    [
      EXERCISE_CATEGORY_LABELS[exercise.category],
      EXERCISE_MODALITY_LABELS[exercise.modality],
      exercise.movementPattern,
      ...exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]),
    ].join(" "),
  );
  const secondary = searchWords(exercise.secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(" "));
  // A word found in the name here is one of several, the rest found elsewhere, so it is held
  // to the same standard as a muscle: "up" is the up of a chin-up, not the start of "upright".
  const matches = (word: AskedWord, known: readonly string[]) =>
    known.some((k) => wordMatches(word, k, false));
  let rank = 4;
  for (const word of asked) {
    if (matches(word, name) || matches(word, primary)) continue;
    if (matches(word, secondary)) rank = 5;
    else return null;
  }
  return rank;
}

/** Whether the query finds the exercise at all. */
export function matchesExerciseQuery(exercise: SearchableExercise, query: string): boolean {
  return exerciseSearchRank(exercise, query) !== null;
}

export type ExerciseSearchResult<T> = {
  /** Exercises whose name answers the query, closest first. */
  byName: T[];
  /** Exercises found by muscle, equipment or movement, primary muscles first. */
  byOther: T[];
};

/**
 * The exercises a query finds, ranked; null for an empty query, which finds everything in
 * the library's own order. Ties keep the order they came in, which is alphabetical.
 */
export function searchExercises<T extends SearchableExercise>(
  exercises: readonly T[],
  query: string,
): ExerciseSearchResult<T> | null {
  if (askedWords(query).length === 0) return null;
  const ranked = exercises
    .map((exercise) => ({ exercise, rank: exerciseSearchRank(exercise, query) }))
    .filter((entry): entry is { exercise: T; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank);
  return {
    byName: ranked.filter((entry) => entry.rank <= 3).map((entry) => entry.exercise),
    byOther: ranked.filter((entry) => entry.rank > 3).map((entry) => entry.exercise),
  };
}

export type ExerciseSection<T> = { key: string; title: string; items: T[] };

/**
 * What a list of exercises shows for a query: the library by body region when nothing is
 * typed, and the ranked results when something is. Grouping search results by region put an
 * "Assisted pull-up" above the Pull-up just because both are back exercises and "A" < "P".
 */
export function exerciseSections<T extends SearchableExercise>(
  exercises: readonly T[],
  query: string,
): ExerciseSection<T>[] {
  const results = searchExercises(exercises, query);
  if (!results) {
    return groupByRegion(exercises).map((group) => ({
      key: group.region,
      title: BODY_REGION_LABELS[group.region],
      items: group.items,
    }));
  }
  return [
    { key: "name", title: "Best matches", items: results.byName },
    { key: "other", title: "By muscle, equipment or movement", items: results.byOther },
  ].filter((section) => section.items.length > 0);
}
