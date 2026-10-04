/**
 * The catalogue report (plan: catalogue reconciliation and expansion). Reproducible: it reads
 * the checked-in manifests and nothing else, so the same commit always writes the same report.
 *
 *   npx tsx scripts/catalogue-report.ts                 # writes docs/planning/catalogue-report.md
 *   npx tsx scripts/catalogue-report.ts --database URL  # also compares a database's slugs
 *
 * A database is only read, and only when it is on this machine: the report never reads
 * production credentials, and says plainly that a deployed catalogue was not compared.
 */
import { writeFile } from "node:fs/promises";

import postgres from "postgres";

import { EQUIPMENT_ART } from "../src/components/equipment-art/catalogue";
import { ASSUMED_EQUIPMENT } from "../src/db/seed/data/assumed-equipment";
import { EQUIPMENT_COMBINATIONS } from "../src/db/seed/data/equipment-combinations";
import { EQUIPMENT_DESCRIPTIONS } from "../src/db/seed/data/equipment-descriptions";
import { EQUIPMENT_PRESETS } from "../src/db/seed/data/equipment-presets";
import { EQUIPMENT_FAMILIES, EQUIPMENT_TYPES } from "../src/db/seed/data/equipment-types";
import { EXERCISE_ALIASES } from "../src/db/seed/data/exercise-aliases";
import {
  EXERCISES,
  MAPPING_CLASSES,
  requirementGroups,
  type MappingClass,
} from "../src/db/seed/data/exercises";
import { GUIDES, MEDIA } from "../src/db/seed/data/guides";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "../src/db/seed/data/program";
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

async function main() {
  const at = process.argv.indexOf("--database");
  const database = at > 0 ? process.argv[at + 1] : undefined;
  const lines: string[] = [];
  const push = (...more: string[]) => lines.push(...more);

  const published = <T extends { review?: "draft" }>(items: readonly T[]) =>
    items.filter((item) => item.review !== "draft").length;
  const groups = EXERCISES.map((e) => ({ exercise: e, groups: requirementGroups(e) }));
  const together = groups.filter((g) => g.groups.some((group) => group.length > 1));
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
    table(
      ["Record", "Count", "Of which drafts"],
      [
        [
          "Equipment types",
          String(EQUIPMENT_TYPES.length),
          String(EQUIPMENT_TYPES.length - published(EQUIPMENT_TYPES)),
        ],
        ["Exercises", String(EXERCISES.length), String(EXERCISES.length - published(EXERCISES))],
        ["Inactive exercises", String(EXERCISES.filter((e) => e.isActive === false).length), "–"],
        ["Requirement alternatives", String(groups.reduce((n, g) => n + g.groups.length, 0)), "–"],
        ["Exercises with types used together", String(together.length), "–"],
        ["Corrected mappings", String(EXERCISES.filter((e) => e.correction).length), "–"],
        [
          "Combination machines",
          String(EQUIPMENT_COMBINATIONS.length),
          String(EQUIPMENT_COMBINATIONS.length - published(EQUIPMENT_COMBINATIONS)),
        ],
        ["Families", String(Object.keys(EQUIPMENT_FAMILIES).length), "–"],
        ["Gym basics (assumed at a gym)", String(ASSUMED_EQUIPMENT.gym.length), "–"],
        ["Starter presets", String(EQUIPMENT_PRESETS.length), "–"],
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

  // Mappings, every one classified.
  push(
    "## Every mapping, classified",
    "",
    "Classes are the plan's (Mappings) plus the repairs the requirement model allowed. A group in",
    "brackets is used together, its first type the primary; `·` separates alternatives.",
    "",
  );
  const counts = new Map<string, number>();
  const rows = EXERCISES.map((e) => {
    const now = requirementGroups(e);
    const kinds: string[] = e.correction
      ? e.correction.kinds
      : now.length === 1
        ? ["unchanged: one way"]
        : ["unchanged: alternatives"];
    for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return [
      `\`${e.slug}\``,
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
          `\`${kind}\``,
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
    EXERCISES.filter((e) => e.correction?.kinds.includes(kind)).map((e) => `\`${e.slug}\``);
  for (const kind of Object.keys(MAPPING_CLASSES) as MappingClass[])
    push(`- **${kind}**: ${byClass(kind).join(", ") || "none"}`);
  push("");

  // Unused types, and types used only as a supporting implement.
  const asPrimary = new Set(groups.flatMap((g) => g.groups.map((group) => group[0]!)));
  const anywhere = new Set(groups.flatMap((g) => g.groups.flat()));
  push(
    "## Unused equipment types",
    "",
    `- Referenced by no exercise: ${
      EQUIPMENT_TYPES.filter((t) => !anywhere.has(t.slug))
        .map((t) => `\`${t.slug}\``)
        .join(", ") || "none"
    }.`,
    `- Only ever a supporting implement, never a primary: ${
      EQUIPMENT_TYPES.filter((t) => anywhere.has(t.slug) && !asPrimary.has(t.slug))
        .map((t) => `\`${t.slug}\``)
        .join(", ") || "none"
    }.`,
    "",
  );

  // Duplicates and aliases.
  const names = new Map<string, string[]>();
  const note = (text: string, owner: string) => {
    const key = normalise(text);
    names.set(key, [...(names.get(key) ?? []), owner]);
  };
  for (const t of EQUIPMENT_TYPES) {
    note(t.name, `type \`${t.slug}\``);
    for (const alias of EQUIPMENT_DESCRIPTIONS[t.slug]?.aliases ?? [])
      note(alias, `type \`${t.slug}\` (alias)`);
  }
  for (const c of EQUIPMENT_COMBINATIONS) {
    note(c.name, `combination \`${c.slug}\``);
    for (const alias of c.aliases) note(alias, `combination \`${c.slug}\` (alias)`);
  }
  const shared = [...names].filter(
    ([, owners]) => new Set(owners.map((o) => o.split(" (")[0])).size > 1,
  );
  const exerciseNames = new Map<string, string[]>();
  for (const e of EXERCISES) {
    const keys = [e.name, ...(EXERCISE_ALIASES[e.slug] ?? [])].map(normalise);
    for (const key of new Set(keys))
      exerciseNames.set(key, [...(exerciseNames.get(key) ?? []), e.slug]);
  }
  const sharedExercise = [...exerciseNames].filter(([, slugs]) => slugs.length > 1);
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
    "Exercise names and aliases shared by more than one exercise:",
    "",
    sharedExercise.length
      ? table(
          ["Name", "Exercises"],
          sharedExercise.map(([name, slugs]) => [name, slugs.map((s) => `\`${s}\``).join(", ")]),
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
  const active = EXERCISES.filter((e) => e.isActive !== false);
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
        ["A How to log note", String(EXERCISES.filter((e) => e.logNote).length)],
        [
          "A legacy form cue (shown until a guide is published)",
          String(EXERCISES.filter((e) => e.formNotes).length),
        ],
        ["A legacy form link", String(EXERCISES.filter((e) => e.formUrl).length)],
        ["At least one demonstration link", String(mediaByExercise.size)],
      ],
    ),
    "",
    `Template exercises and fallbacks without a guide: ${
      [...core]
        .filter((slug) => !guideByExercise.has(slug))
        .map((s) => `\`${s}\``)
        .join(", ") || "none"
    }.`,
    "",
    `Guides without a demonstration link: ${
      GUIDES.filter((g) => !mediaByExercise.has(g.exercise))
        .map((g) => `\`${g.exercise}\``)
        .join(", ") || "none"
    }.`,
    "",
  );

  // Assets.
  const presetTypes = new Set(
    EQUIPMENT_PRESETS.flatMap((p) =>
      p.items.flatMap((item) =>
        "type" in item
          ? [item.type]
          : "family" in item
            ? (EQUIPMENT_FAMILIES[item.family]?.members ?? [])
            : [item.combination],
      ),
    ),
  );
  const shown = new Set([
    ...presetTypes,
    ...ASSUMED_EQUIPMENT.gym,
    ...EQUIPMENT_COMBINATIONS.map((c) => c.slug),
  ]);
  push(
    "## Missing assets",
    "",
    `- Shown in the machines step (basics, presets, combinations) without a drawing: ${
      [...shown]
        .filter((slug) => !EQUIPMENT_ART[slug])
        .map((s) => `\`${s}\``)
        .join(", ") || "none"
    }.`,
    `- Other types without a drawing: ${EQUIPMENT_TYPES.filter((t) => !shown.has(t.slug) && !EQUIPMENT_ART[t.slug]).length}.`,
    `- Types without a description: ${
      EQUIPMENT_TYPES.filter((t) => !EQUIPMENT_DESCRIPTIONS[t.slug])
        .map((t) => `\`${t.slug}\``)
        .join(", ") || "none"
    }.`,
    "",
  );

  await writeFile(OUTPUT, `${lines.join("\n")}\n`);
  console.log(`Wrote ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
