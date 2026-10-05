/**
 * The catalogue report (plan: catalogue reconciliation and expansion). Reproducible: it reads
 * the checked-in manifests and nothing else, so the same commit always writes the same report.
 *
 *   npx tsx scripts/catalogue-report.ts                 # writes docs/planning/catalogue-report.md
 *   npx tsx scripts/catalogue-report.ts --database URL  # also compares a database's slugs
 *
 * A database is only read, and only when it is on this machine: the report never reads
 * production credentials, and says plainly that a deployed catalogue was not compared.
 *
 * Everything but the counts and the drafts' own section describes what production seeds: the
 * manifests without the catalogue additions awaiting the owner (`review: "draft"`), read through
 * the seed's own `referenceManifests`, so the report and the seed cannot disagree about a draft.
 */
import { writeFile } from "node:fs/promises";

import postgres from "postgres";

import { EQUIPMENT_ART } from "../src/components/equipment-art/catalogue";
import { ASSUMED_EQUIPMENT } from "../src/db/seed/data/assumed-equipment";
import { DRAFT_COMBINATION_ALIASES } from "../src/db/seed/data/equipment-combinations";
import {
  DRAFT_EQUIPMENT_ALIASES,
  EQUIPMENT_DESCRIPTIONS,
  PROPOSED_ALIAS_MOVES,
} from "../src/db/seed/data/equipment-descriptions";
import { EQUIPMENT_PRESETS } from "../src/db/seed/data/equipment-presets";
import { EQUIPMENT_FAMILIES, EQUIPMENT_TYPES } from "../src/db/seed/data/equipment-types";
import { DRAFT_EXERCISE_ALIASES } from "../src/db/seed/data/exercise-aliases";
import {
  EXERCISES,
  MAPPING_CLASSES,
  requirementGroups,
  type MappingClass,
} from "../src/db/seed/data/exercises";
import { GUIDES, MEDIA } from "../src/db/seed/data/guides";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "../src/db/seed/data/program";
import { referenceManifests } from "../src/db/seed/reference";
import { isLoopbackDatabase } from "../src/lib/drafts";

const OUTPUT = "docs/planning/catalogue-report.md";

const typeName = new Map(EQUIPMENT_TYPES.map((t) => [t.slug, t.name]));
const groupsText = (groups: string[][]) =>
  groups.map((group) => (group.length === 1 ? group[0] : `(${group.join(" + ")})`)).join(" · ");
const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const table = (head: string[], rows: string[][]) =>
  [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`),
  ].join("\n");
const code = (slug: string) => `\`${slug}\``;
const codes = (slugs: readonly string[]) => slugs.map(code).join(", ") || "none";

async function deployedComparison(url: string | undefined): Promise<string[]> {
  if (!url)
    return [
      "**Unverified.** No authorised read-only access to the deployed (production) catalogue was",
      "available, so missing or unexpected deployed slugs were not compared. Run this script with",
      "`--database <url>` against a database you may read to add that comparison; it refuses any",
      "database that is not on this machine.",
    ];
  if (!isLoopbackDatabase(url))
    throw new Error("The report only reads a database on this machine.");
  const sql = postgres(url, { max: 1 });
  try {
    const types = (await sql<{ slug: string }[]>`select slug from equipment_types`).map(
      (r) => r.slug,
    );
    const exercises = (
      await sql<{ slug: string }[]>`select slug from exercises where user_id is null`
    ).map((r) => r.slug);
    const missingTypes = EQUIPMENT_TYPES.filter((t) => !types.includes(t.slug)).map((t) => t.slug);
    const extraTypes = types.filter((slug) => !typeName.has(slug));
    const known = new Set(EXERCISES.map((e) => e.slug));
    const missingExercises = EXERCISES.filter((e) => !exercises.includes(e.slug)).map(
      (e) => e.slug,
    );
    const extraExercises = exercises.filter((slug) => !known.has(slug));
    return [
      `Compared with \`${new URL(url).pathname.slice(1)}\` on this machine (not production).`,
      "",
      `- Equipment types in the manifest but not the database: ${missingTypes.join(", ") || "none"}.`,
      `- Equipment types in the database but not the manifest: ${extraTypes.join(", ") || "none"}.`,
      `- Exercises in the manifest but not the database: ${missingExercises.join(", ") || "none"}.`,
      `- Shared exercises in the database but not the manifest: ${extraExercises.join(", ") || "none"}.`,
      "",
      "Drafts are seeded only into databases on this machine, so a draft listed as missing from",
      "another database is expected.",
    ];
  } finally {
    await sql.end();
  }
}

/** Every equipment name and alias as one environment seeds them, with whose each one is. */
function equipmentNames(manifests: ReturnType<typeof referenceManifests>) {
  const names = new Map<string, string[]>();
  const note = (text: string, owner: string) => {
    const key = normalise(text);
    names.set(key, [...(names.get(key) ?? []), owner]);
  };
  const kind = (draft: boolean, alias: string, drafted: readonly string[] = []) =>
    draft ? "alias, draft" : drafted.includes(alias) ? "drafted alias" : "alias";
  for (const t of manifests.types) {
    const draft = t.review === "draft";
    note(t.name, `type \`${t.slug}\`${draft ? " (draft)" : ""}`);
    for (const alias of manifests.equipmentAliases[t.slug] ?? [])
      note(alias, `type \`${t.slug}\` (${kind(draft, alias, DRAFT_EQUIPMENT_ALIASES[t.slug])})`);
  }
  for (const c of manifests.combinations) {
    const draft = c.review === "draft";
    note(c.name, `combination \`${c.slug}\`${draft ? " (draft)" : ""}`);
    for (const alias of c.aliases)
      note(
        alias,
        `combination \`${c.slug}\` (${kind(draft, alias, DRAFT_COMBINATION_ALIASES[c.slug])})`,
      );
  }
  return [...names].filter(([, owners]) => new Set(owners.map((o) => o.split(" (")[0])).size > 1);
}

/** Every exercise name and alias as one environment seeds them, with the exercises it names. */
function exerciseNames(manifests: ReturnType<typeof referenceManifests>) {
  const names = new Map<string, string[]>();
  for (const e of manifests.exercises) {
    const keys = [e.name, ...(manifests.exerciseAliases[e.slug] ?? [])].map(normalise);
    for (const key of new Set(keys)) names.set(key, [...(names.get(key) ?? []), e.slug]);
  }
  return [...names].filter(([, slugs]) => slugs.length > 1);
}

async function main() {
  const at = process.argv.indexOf("--database");
  const database = at > 0 ? process.argv[at + 1] : undefined;
  const lines: string[] = [];
  const push = (...more: string[]) => lines.push(...more);

  // What production seeds, and what a database on this machine seeds with the drafts.
  const published = referenceManifests({ drafts: false });
  const all = referenceManifests({ drafts: true });
  const draftTypes = all.types.filter((t) => t.review === "draft");
  const draftCombinations = all.combinations.filter((c) => c.review === "draft");
  const draftExercises = all.exercises.filter((e) => e.review === "draft");
  const draftTypeSlugs = new Set(draftTypes.map((t) => t.slug));
  const alternatives = (manifests: typeof all) =>
    manifests.exercises.reduce((n, e) => n + requirementGroups(e).length, 0);
  const together = (manifests: typeof all) =>
    manifests.exercises.filter((e) => requirementGroups(e).some((group) => group.length > 1))
      .length;
  const aliases = (manifests: typeof all) =>
    [
      ...Object.values(manifests.equipmentAliases),
      ...Object.values(manifests.exerciseAliases),
      ...manifests.combinations.map((c) => c.aliases),
    ].flat().length;
  const drafted = (map: Readonly<Record<string, readonly string[]>>) =>
    Object.values(map).flat().length;
  const draftedAliases =
    drafted(DRAFT_EQUIPMENT_ALIASES) +
    drafted(DRAFT_COMBINATION_ALIASES) +
    drafted(DRAFT_EXERCISE_ALIASES);
  const guideByExercise = new Map(GUIDES.map((g) => [g.exercise, g]));
  const mediaByExercise = new Map<string, number>();
  for (const item of MEDIA)
    mediaByExercise.set(item.exercise, (mediaByExercise.get(item.exercise) ?? 0) + 1);

  push(
    "# Catalogue report",
    "",
    "Generated by `npx tsx scripts/catalogue-report.ts` from the checked-in manifests; regenerate",
    "rather than edit. Counts are repository facts, not a production audit.",
    "",
    "## Reference counts",
    "",
    "Counts take in the catalogue additions awaiting the owner; the drafts column is what the",
    "production deploy leaves out until they are approved.",
    "",
    table(
      ["Record", "Count", "Of which drafts"],
      [
        [
          "Equipment types",
          String(all.types.length),
          String(all.types.length - published.types.length),
        ],
        [
          "Exercises",
          String(all.exercises.length),
          String(all.exercises.length - published.exercises.length),
        ],
        ["Inactive exercises", String(EXERCISES.filter((e) => e.isActive === false).length), "–"],
        [
          "Requirement alternatives",
          String(alternatives(all)),
          String(alternatives(all) - alternatives(published)),
        ],
        [
          "Exercises with types used together",
          String(together(all)),
          String(together(all) - together(published)),
        ],
        ["Corrected mappings", String(EXERCISES.filter((e) => e.correction).length), "–"],
        [
          "Combination machines",
          String(all.combinations.length),
          String(all.combinations.length - published.combinations.length),
        ],
        ["Families", String(Object.keys(EQUIPMENT_FAMILIES).length), "–"],
        ["Gym basics (assumed at a gym)", String(ASSUMED_EQUIPMENT.gym.length), "–"],
        ["Starter presets", String(EQUIPMENT_PRESETS.length), "–"],
        ["Aliases", String(aliases(all)), String(aliases(all) - aliases(published))],
        [
          "Guides",
          String(GUIDES.length),
          String(GUIDES.filter((g) => g.status === "draft").length),
        ],
        [
          "Demonstration links",
          String(MEDIA.length),
          String(MEDIA.filter((m) => m.status === "candidate").length),
        ],
        [
          "Drawings",
          String(Object.keys(EQUIPMENT_ART).length),
          String(Object.values(EQUIPMENT_ART).filter((a) => a.status === "draft").length),
        ],
      ],
    ),
    "",
    "## Deployed catalogue",
    "",
    ...(await deployedComparison(database)),
    "",
  );

  // The catalogue additions awaiting the owner, all in one place.
  const usedBy = (slug: string) =>
    all.exercises
      .filter((e) => requirementGroups(e).some((group) => group.includes(slug)))
      .map((e) => e.slug);
  const waiting = EXERCISES.filter((e) => e.review !== "draft").flatMap((e) => {
    const draftWays = requirementGroups(e).filter((group) =>
      group.some((slug) => draftTypeSlugs.has(slug)),
    );
    if (draftWays.length === 0) return [];
    const kept = published.exercises.find((p) => p.slug === e.slug)!;
    return [[code(e.slug), groupsText(requirementGroups(kept)), groupsText(draftWays)]];
  });
  const draftedRows = [
    ...Object.entries(DRAFT_EQUIPMENT_ALIASES).map(([slug, names]) => [
      `type ${code(slug)}`,
      names.join("; "),
    ]),
    ...Object.entries(DRAFT_COMBINATION_ALIASES).map(([slug, names]) => [
      `combination ${code(slug)}`,
      names.join("; "),
    ]),
    ...Object.entries(DRAFT_EXERCISE_ALIASES).map(([slug, names]) => [
      `exercise ${code(slug)}`,
      names.join("; "),
    ]),
  ];
  const itemKind = (slug: string) => (typeName.has(slug) ? "type" : "combination");
  push(
    "## Awaiting the owner's approval",
    "",
    "The catalogue additions researched in [catalogue-additions.md](catalogue-additions.md), each",
    'marked `review: "draft"` in its manifest. They are seeded only into a database on this machine',
    "and into tests that ask for drafts; the production deploy leaves them out, and with them every",
    "way to do an exercise and every alias that depends on them. Approving one is taking away its",
    '`review: "draft"`, or moving a drafted alias into the published entry; the list in',
    "`src/db/seed/seed.test.ts` (`AWAITING`) says what is still waiting.",
    "",
    `### Equipment types (${draftTypes.length})`,
    "",
    draftTypes.length
      ? table(
          ["Type", "Name", "Category", "Default", "Family", "Exercises on it"],
          draftTypes.map((t) => [
            code(t.slug),
            t.name,
            t.category,
            `${t.defaultResistanceMode}, ${t.defaultUnit}`,
            t.family ? code(t.family) : "–",
            codes(usedBy(t.slug)),
          ]),
        )
      : "None.",
    "",
    `### Combination machines (${draftCombinations.length})`,
    "",
    draftCombinations.length
      ? table(
          ["Combination", "Name", "Types, display type first", "Aliases"],
          draftCombinations.map((c) => [
            code(c.slug),
            c.name,
            c.types.map(code).join(", "),
            c.aliases.join("; ") || "–",
          ]),
        )
      : "None.",
    "",
    `### Exercises (${draftExercises.length})`,
    "",
    draftExercises.length
      ? table(
          ["Exercise", "Name", "Modality", "Measured in", "Equipment"],
          draftExercises.map((e) => [
            code(e.slug),
            e.name,
            e.modality,
            e.measure ?? "reps",
            groupsText(requirementGroups(e)),
          ]),
        )
      : "None.",
    "",
    `### Ways to do a published exercise on a draft type (${waiting.length})`,
    "",
    "Production keeps the published ways; each way below waits, whole, with its draft type.",
    "",
    waiting.length
      ? table(["Exercise", "Published ways", "Waiting with its type"], waiting)
      : "None.",
    "",
    `### Drafted aliases of published items (${draftedAliases})`,
    "",
    draftedRows.length ? table(["Item", "Aliases awaiting approval"], draftedRows) : "None.",
    "",
    `### Names to move on approval (${PROPOSED_ALIAS_MOVES.length})`,
    "",
    "The research would move these names to a draft item. Moving one now would take it out of",
    "production's search while the item it moves to is not there, so it stays where it is until",
    "the owner approves that item.",
    "",
    PROPOSED_ALIAS_MOVES.length
      ? table(
          ["Name", "Now on", "Moves to"],
          PROPOSED_ALIAS_MOVES.map((move) => [
            move.alias,
            `${itemKind(move.from)} ${code(move.from)}`,
            `${itemKind(move.to)} ${code(move.to)}`,
          ]),
        )
      : "None.",
    "",
  );

  // Mappings, every one classified, as production seeds them.
  push(
    "## Every mapping, classified",
    "",
    "Classes are the plan's (Mappings) plus the repairs the requirement model allowed. A group in",
    "brackets is used together, its first type the primary; `·` separates alternatives. This is",
    "what production seeds: the drafts, and the ways that wait for a draft type, are listed above.",
    "",
  );
  const counts = new Map<string, number>();
  const rows = published.exercises.map((e) => {
    const now = requirementGroups(e);
    const kinds: string[] = e.correction
      ? e.correction.kinds
      : now.length === 1
        ? ["unchanged: one way"]
        : ["unchanged: alternatives"];
    for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return [
      code(e.slug),
      kinds.join(", "),
      e.correction ? e.correction.was.join(", ") : "",
      groupsText(now),
    ];
  });
  push(
    table(
      ["Class", "Meaning", "Exercises"],
      [
        ...Object.entries(MAPPING_CLASSES).map(([kind, meaning]) => [
          code(kind),
          meaning,
          String(counts.get(kind) ?? 0),
        ]),
        [
          "unchanged: one way",
          "One type, or one group, and nothing to correct",
          String(counts.get("unchanged: one way") ?? 0),
        ],
        [
          "unchanged: alternatives",
          "Interchangeable types for the same movement",
          String(counts.get("unchanged: alternatives") ?? 0),
        ],
      ],
    ),
    "",
    "<details><summary>All exercises</summary>",
    "",
    table(["Exercise", "Class", "Was", "Now"], rows),
    "",
    "</details>",
    "",
  );
  const byClass = (kind: MappingClass) =>
    published.exercises.filter((e) => e.correction?.kinds.includes(kind)).map((e) => code(e.slug));
  for (const kind of Object.keys(MAPPING_CLASSES) as MappingClass[])
    push(`- **${kind}**: ${byClass(kind).join(", ") || "none"}`);
  push("");

  // Unused types, and types used only as a supporting implement.
  const groupsOf = (manifests: typeof all) =>
    manifests.exercises.flatMap((e) => requirementGroups(e));
  const asPrimary = new Set(groupsOf(published).map((group) => group[0]!));
  const anywhere = new Set(groupsOf(published).flat());
  const unused = published.types.filter((t) => !anywhere.has(t.slug)).map((t) => t.slug);
  const draftUses = unused.flatMap((slug) => {
    const users = usedBy(slug);
    return users.length ? [`${code(slug)} (${codes(users)})`] : [];
  });
  const draftsUnused = draftTypes.filter((t) => usedBy(t.slug).length === 0).map((t) => t.slug);
  push(
    "## Unused equipment types",
    "",
    `- Referenced by no exercise: ${codes(unused)}.`,
    `- Only ever a supporting implement, never a primary: ${codes(
      published.types
        .filter((t) => anywhere.has(t.slug) && !asPrimary.has(t.slug))
        .map((t) => t.slug),
    )}.`,
    `- Of the unused, those a draft exercise would use: ${draftUses.join(", ") || "none"}.`,
    `- Draft types no exercise uses: ${codes(draftsUnused)}.`,
    "",
  );

  // Duplicates and aliases, as production has them and as the drafts would add.
  const shared = equipmentNames(published);
  const sharedKeys = new Set(shared.map(([name]) => name));
  const sharedWithDrafts = equipmentNames(all).filter(([name]) => !sharedKeys.has(name));
  const sharedExercise = exerciseNames(published);
  const sharedExerciseKeys = new Set(sharedExercise.map(([name]) => name));
  const sharedExerciseWithDrafts = exerciseNames(all).filter(
    ([name]) => !sharedExerciseKeys.has(name),
  );
  push(
    "## Duplicate and alias candidates",
    "",
    "Equipment names and aliases that point at more than one item. Search shows such candidates",
    "side by side with their pictures rather than guessing.",
    "",
    shared.length
      ? table(
          ["Name", "Means"],
          shared.map(([name, owners]) => [name, owners.join("; ")]),
        )
      : "None.",
    "",
    "Once the drafts are seeded, also:",
    "",
    sharedWithDrafts.length
      ? table(
          ["Name", "Means"],
          sharedWithDrafts.map(([name, owners]) => [name, owners.join("; ")]),
        )
      : "None.",
    "",
    "Exercise names and aliases shared by more than one exercise:",
    "",
    sharedExercise.length
      ? table(
          ["Name", "Exercises"],
          sharedExercise.map(([name, slugs]) => [name, codes(slugs)]),
        )
      : "None.",
    "",
    "Once the drafts are seeded, also:",
    "",
    sharedExerciseWithDrafts.length
      ? table(
          ["Name", "Exercises"],
          sharedExerciseWithDrafts.map(([name, slugs]) => [name, codes(slugs)]),
        )
      : "None.",
    "",
  );

  // Guidance.
  const core = new Set(
    STRENGTH_AESTHETICS_HYBRID_8WK.days.flatMap((d) =>
      d.exercises.flatMap((e) => [
        e.exerciseSlug,
        ...(e.fallbacks ?? []).map((f) => f.exerciseSlug),
      ]),
    ),
  );
  const active = published.exercises.filter((e) => e.isActive !== false);
  const withoutGuide = active.filter((e) => !guideByExercise.has(e.slug));
  push(
    "## Guidance",
    "",
    table(
      ["State", "Exercises"],
      [
        ["Published guide", String(GUIDES.filter((g) => g.status === "published").length)],
        ["Draft guide awaiting review", String(GUIDES.filter((g) => g.status === "draft").length)],
        ["No guide yet (honest gap)", String(withoutGuide.length)],
        ["A How to log note", String(published.exercises.filter((e) => e.logNote).length)],
        [
          "A legacy form cue (shown until a guide is published)",
          String(published.exercises.filter((e) => e.formNotes).length),
        ],
        ["A legacy form link", String(published.exercises.filter((e) => e.formUrl).length)],
        ["At least one demonstration link", String(mediaByExercise.size)],
        ["Draft exercises awaiting approval (not counted above)", String(draftExercises.length)],
      ],
    ),
    "",
    `Template exercises and fallbacks without a guide: ${codes(
      [...core].filter((slug) => !guideByExercise.has(slug)),
    )}.`,
    "",
    `Guides without a demonstration link: ${codes(
      GUIDES.filter((g) => !mediaByExercise.has(g.exercise)).map((g) => g.exercise),
    )}.`,
    "",
  );

  // Assets, as the machines step shows them in production, then the drafts.
  const publishedTypes = new Set(published.types.map((t) => t.slug));
  const presetTypes = new Set(
    published.presets.flatMap((p) =>
      p.items.flatMap((item) =>
        "type" in item
          ? [item.type]
          : "family" in item
            ? (EQUIPMENT_FAMILIES[item.family]?.members ?? []).filter((slug) =>
                publishedTypes.has(slug),
              )
            : [item.combination],
      ),
    ),
  );
  const shown = new Set([
    ...presetTypes,
    ...published.assumed.filter((row) => row.gymKind === "gym").map((row) => row.slug),
    ...published.combinations.map((c) => c.slug),
  ]);
  push(
    "## Missing assets",
    "",
    `- Shown in the machines step (basics, presets, combinations) without a drawing: ${codes(
      [...shown].filter((slug) => !EQUIPMENT_ART[slug]),
    )}.`,
    `- Other types without a drawing: ${published.types.filter((t) => !shown.has(t.slug) && !EQUIPMENT_ART[t.slug]).length}.`,
    `- Draft types and combinations without a drawing: ${codes(
      [...draftTypes, ...draftCombinations].map((d) => d.slug).filter((s) => !EQUIPMENT_ART[s]),
    )}.`,
    `- Types without a description: ${codes(
      EQUIPMENT_TYPES.filter((t) => !EQUIPMENT_DESCRIPTIONS[t.slug]).map((t) => t.slug),
    )}.`,
    "",
  );

  await writeFile(OUTPUT, `${lines.join("\n")}\n`);
  console.log(`Wrote ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
