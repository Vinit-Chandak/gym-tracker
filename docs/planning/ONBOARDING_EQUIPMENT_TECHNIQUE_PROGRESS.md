# Onboarding, equipment and technique: implementation log

The working record of building [the plan](ONBOARDING_EQUIPMENT_TECHNIQUE_PLAN.md), kept so another
session can resume. The plan and its owner decisions are the source of truth; this file says what
was built, the calls made where the plan left room, and what is next.

Branch: `claude/onboarding-equipment-technique`, cut from
`codex/onboarding-equipment-technique-proposal` with `main` (4f6a8b6) merged in on 4 October 2026.
Local only: Postgres 16 on 127.0.0.1 (`overload_audit`, seeded by `npm run audit:setup`;
`overload_audit_base` is an untouched copy of that baseline for migration rehearsals). Nothing here
has touched a hosted database, and nothing has been merged or deployed.

## Status

| Step | Scope                                                                                   | State       |
| ---- | --------------------------------------------------------------------------------------- | ----------- |
| 1    | Catalogue report, requirement model, basics, machine types, ADRs, atomic seed, tables   | done        |
| 2    | Resolver and every consumer, absence reconciliation, the coach's backup rule            | not started |
| 3    | Add several exercises (receipts) and pinned actions on Add machine                      | not started |
| 4    | Experience question, machine steps, combinations, workout confirmation                  | not started |
| 5    | Illustrations, guides, Technique, the coach's numbers in the header and list            | not started |
| 6    | Acceptance tests, screens, fresh review, draft PR                                       | not started |

## Calls made where the plan left room

- **Drafts.** Two gates, by kind of content:
  - Catalogue additions (new equipment types, exercises, combinations) carry `review: "draft"` in
    their manifest. `seedReferenceData(db, { drafts })` skips them (and anything pointing at them)
    unless `drafts` is true. The production deploy (`src/db/deploy.ts`) always passes `false`; the
    local seeder passes `true` only for a loopback database; tests pass `true`. A draft never
    reaches the production database, so no read path needs a filter.
  - Guides, demonstration links and illustrations carry a status in their own data. They reach
    every database but are shown only where drafts are on: `next dev`, or
    `OVERLOAD_SHOW_DRAFTS=1` (for a preview the owner reviews on a phone). Approving one is a
    one-line change to its manifest entry (status, reviewer, date) and a deploy.
- **How to log** lives on the exercise (`exercises.log_note`), not in the guide: it is existing,
  already-shipped data that must show whether or not a reviewed guide exists. A guide's renderer
  shows it under "How to log".
- **Gym basics** (owner decision) as assumed types at `kind = gym`: barbell, EZ bar, dumbbells,
  plates, flat, adjustable and decline benches, the power rack, pull-up bar, dip station,
  back-extension bench, cable station, lat pulldown, seated cable row, 45° leg press, leg
  extension, seated leg curl and pec deck. Where a basic is a family ("a leg press", "a leg
  curl"), the variant the built-in programme uses is the assumed one; the others are offered
  through "A different one".
- **Requirement groups** are written in the exercise manifest's `equipment` list: a string is a
  one-type alternative, an array is a group used together whose first type is the primary
  (recorded on the workout and keyed for history). A corrected entry keeps its old list in
  `correction.was` with its class, which is what the catalogue report reads.

## Step 1: what landed

- Migration `0045_equipment_requirements_and_guides`: additive tables (`assumed_equipment_types`,
  `exercise_equipment_requirements`, `equipment_instance_types`, `equipment_combinations` and
  their types, `equipment_presets`, `exercise_guides`, `exercise_media`), new columns
  (`equipment_types.aliases|purpose|identification|family|illustration`,
  `exercises.aliases|log_note`, `profiles.training_experience`), the display-type trigger and the
  machine-types backfill. Rehearsed on a copy of the populated local audit database (286 machines,
  14,299 sets): every machine kept its type, no set changed.
- Manifests: `assumed-equipment.ts` (gym basics), `equipment-combinations.ts` (the plan's three),
  `equipment-presets.ts` (gym extras for beginners, home starter, outdoor set),
  `equipment-descriptions.ts` and `exercise-aliases.ts` (drafted by a subagent; "Gravitron"
  removed as a brand, "Multi-gym" removed as misleading), families in `equipment-types.ts`, and
  120 corrected requirement groups in `exercises.ts`, each with `correction.was` and its class.
- `seedReferenceData` runs in one transaction with the drafts gate; `scripts/catalogue-report.ts`
  writes `docs/planning/catalogue-report.md` (reproducible; deployed catalogue unverified).
- ADR 0004 amended; ADR 0041 records basics, the backup rule and machines with several types.

## Next

See the status table; each step ends with `npm run check`, a commit and a push.
