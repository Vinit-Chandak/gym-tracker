import { searchWords } from "@/domain/exercise-search";

/**
 * Finding equipment by what somebody calls it (plan: discovery and recognition): its name, any
 * of its other names (local ones included) or a word of what it is for. Closest first: a name
 * or an alias that is the query, then one that starts with it, then one holding every word of
 * it, then a purpose that does.
 */
export type SearchableEquipment = {
  name: string;
  aliases: readonly string[];
  purpose?: string | null;
};

function normalised(text: string): string {
  return searchWords(text).join(" ");
}

function rankFor(item: SearchableEquipment, query: string): number | null {
  const asked = normalised(query);
  if (asked === "") return 4;
  const words = asked.split(" ");
  let best: number | null = null;
  const consider = (rank: number) => {
    if (best === null || rank < best) best = rank;
  };
  for (const [index, text] of [item.name, ...item.aliases].entries()) {
    const known = normalised(text);
    // The name a shade before an alias, so "Lat pulldown" leads with the machine of that name.
    const shade = index === 0 ? 0 : 0.5;
    if (known === asked || known.replace(/ /g, "") === asked.replace(/ /g, "")) consider(shade);
    else if (known.startsWith(asked)) consider(1 + shade);
    else if (words.every((word) => known.split(" ").some((k) => k.startsWith(word))))
      consider(2 + shade);
  }
  if (best !== null) return best;
  const purpose = normalised(item.purpose ?? "").split(" ");
  if (words.every((word) => word.length >= 3 && purpose.some((k) => k.startsWith(word)))) return 3;
  return null;
}

/** The equipment a query finds, closest first; everything, in its own order, for no query. */
export function searchEquipment<T extends SearchableEquipment>(
  items: readonly T[],
  query: string,
): T[] {
  if (normalised(query) === "") return [...items];
  return items
    .map((item) => ({ item, rank: rankFor(item, query) }))
    .filter((entry): entry is { item: T; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.item);
}

/**
 * When the query is exactly a name two or more items answer to ("Roman chair" is a
 * back-extension bench to one gym and a captain's chair to another), those items, so a screen
 * can show them side by side with their pictures rather than guessing. Empty otherwise.
 */
export function sameNameCandidates<T extends SearchableEquipment>(
  items: readonly T[],
  query: string,
): T[] {
  const asked = normalised(query);
  if (asked === "") return [];
  const answering = items.filter((item) =>
    [item.name, ...item.aliases].some((text) => normalised(text) === asked),
  );
  return answering.length > 1 ? answering : [];
}
