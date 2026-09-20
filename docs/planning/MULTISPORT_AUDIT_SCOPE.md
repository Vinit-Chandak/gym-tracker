# Overload multisport — audit scope

What the multisport release actually shipped, as of `main`. Written for an auditor who has
the repository and the three planning documents but was not present for the implementation.

**Specification:** [implementation plan](MULTISPORT_IMPLEMENTATION_PLAN.md) (§§1–16),
[decision register](MULTISPORT_DECISIONS.md) (77 decisions, `SCOPE-01` … `TEST-02`),
[acceptance tests](MULTISPORT_ACCEPTANCE_TESTS.md) (151 IDs, `AT-API-01` … `AT-STRUCT-10`).
[Rollout runbook](MULTISPORT_ROLLOUT_RUNBOOK.md) §0 records where the result diverges from
the plan on purpose.

**Baseline for any "what changed" diff:** `a0d45d188bad0faa784b3680da7277beab456a14`, the
commit the work started from. `git diff a0d45d1 main -- <path>` is the honest answer to
"did this file change", and is how every list below was produced.

**Landed in:** #40 (P1–P8), #41 (rollout flags removed), #42 (backfill moved into the deploy),
#43 (unrelated coach-review-interval fix carried over from #38).

**Suite:** 1,093 tests across 143 files, run against PGlite with the real migrations applied.
Green is not evidence about production data; no production database has been inspected.

---

## 1. Screens

### 1.1 New screens (14)

Every one of these is new since the baseline. Route on the left, file on the right.

| Route | File |
| --- | --- |
| `/training` | `src/app/(app)/training/page.tsx` |
| `/training/new` (`?sport=`, `?occurrence=`) | `src/app/(app)/training/new/page.tsx` |
| `/training/schedule` (`?sport=`) | `src/app/(app)/training/schedule/page.tsx` |
| `/training/scheduled` | `src/app/(app)/training/scheduled/page.tsx` |
| `/training/activities/<activityId>` | `src/app/(app)/training/activities/[activityId]/page.tsx` |
| `/training/activities/<activityId>/edit` | `src/app/(app)/training/activities/[activityId]/edit/page.tsx` |
| `/training/templates` | `src/app/(app)/training/templates/page.tsx` |
| `/training/templates/new` | `src/app/(app)/training/templates/new/page.tsx` |
| `/training/templates/<templateId>/edit` | `src/app/(app)/training/templates/[templateId]/edit/page.tsx` |
| `/training/programme` (`?sport=`) | `src/app/(app)/training/programme/page.tsx` |
| `/training/programme/occurrences/<occurrenceId>` | `src/app/(app)/training/programme/occurrences/[occurrenceId]/page.tsx` |
| `/profile/sports` | `src/app/(app)/profile/sports/page.tsx` |
| `/welcome/sports` | `src/app/(onboarding)/welcome/sports/page.tsx` |
| `/u/<username>/activities/<sharedStatId>` | `src/app/(app)/u/[username]/activities/[sharedStatId]/page.tsx` |

### 1.2 Existing screens changed by this release (11)

| Route | What changed |
| --- | --- |
| `/today` | Today's endurance occurrences alongside the strength card; links point at `/training/*` |
| `/history` | Cycling and swimming read from the canonical tables beside legacy workouts and runs |
| `/progress` | Per-sport totals from SQL aggregates (`readActivityTotals`) |
| `/u/<username>` | Per-sport shared projections; legacy `?sport=workout\|run` filters still translate |
| `/profile/programme` | Kept working (see §4 divergence 1) |
| `/profile/routines` | Kept working (see §4 divergence 2) |
| `/runs`, `/runs/new`, `/runs/<id>`, `/runs/<id>/edit` | Reduced to compatibility aliases (§1.3) |
| `/preview` | Shell preview updated for the new tab set |

Also changed, not a page: `src/app/(app)/layout.tsx` and `src/components/shell/bottom-nav.tsx`
— the second tab is **Training**, not Runs. `src/lib/nav.ts` now has one `NAV_ITEMS`.

### 1.3 Compatibility aliases

| Old route | Behaviour on `main` |
| --- | --- |
| `/runs` | redirect → `/training?sport=running` |
| `/runs/new` | redirect → `/training/new?sport=running` |
| `/runs/new?planned=<programRunId>` | resolves the durable legacy map → `/training/new?occurrence=<id>`; unresolved/foreign renders `LegacyUnavailable`, never another target |
| `/runs/<runId>` | resolves the owned mapped activity → `/training/activities/<id>` |
| `/runs/<runId>/edit` | → `/training/activities/<id>/edit` |

Resolution lives in `src/server/legacy-routes.ts` (`activityForLegacyRun`,
`occurrenceForLegacyPlannedRun`), backed by `multisport_migration_links`.

### 1.4 Unchanged, but in blast radius

The strength logger is deliberately untouched and is the main regression surface
(`AT-REG-01` … `AT-REG-06`): `/workouts/<sessionId>` and its `check-in`, `finish`,
`add-exercise`, `exercises/<id>/substitute` descendants, plus `/today/choose`.
`src/server/repositories/sessions.ts` did change — it now opens, closes and discards a
canonical `activities` parent alongside the session.

---

## 2. Feature inventory, by plan phase

### P1 — Typed identities, measurements, versioned contracts
`src/domain/activity.ts` (four sports, statuses, outcomes, effort provenance, legacy
`workout`/`run` mapping), `activity-metrics.ts` (native distance, per-sport actuals),
`activity-limits.ts` (bounds, precision, confirmation thresholds),
`activity-prescription.ts` (prescription v1 + Zod), `occurrences.ts` (dispositions,
resolutions, adherence), `legacy-multisport.ts` (legacy decoders),
`src/lib/distance-units.ts`, `src/lib/activity-drafts.ts`.

### P2 — Storage and repeatable preservation
Migration **0026_multisport_expand**. Schema: `activities`, per-sport detail tables
(`running_activity_details`, `cycling_activity_details`, `swimming_activity_details`),
`planned_occurrences`, `occurrence_versions`, `occurrence_events`, `occurrence_edit_claims`,
`activity_templates`, `activity_resources`, `user_sport_preferences`,
`multisport_migration_links`, `multisport_migration_issues`, `program_families`.
`src/db/backfill-multisport.ts` (additive, resumable, idempotent, reconciling) and
`src/db/multisport-audit.ts` (read-only inventory; blocking vs non-blocking categories).

### P3 — Transactional running parity, strength preserved
`src/server/repositories/activities.ts` — one save/edit/delete boundary, submission receipts,
occurrence claiming, strength parent open/close/discard. `src/server/actions/activities.ts`.
`src/server/activity-effects.ts` (revalidation).

### P4 — Scheduling, shared navigation, sport forms
`src/server/repositories/occurrences.ts`, `activity-templates.ts`, `activity-resources.ts`,
`sport-preferences.ts`. Actions: `occurrences.ts`, `activity-templates.ts`,
`sport-preferences.ts`. Components under `src/components/activities/`: `running-form`,
`cycling-form`, `swimming-form`, `activity-form-fields`, `activity-summary`, `activity-plan`,
`prescription-editor`, `schedule-form`, `sport-choice`, `occurrence-actions`,
`today-activities`, `legacy-unavailable`.

### P5 — Sport-complete coaching
Migration **0027_multisport_coaching**. `src/domain/coach-sport-policy.ts` (per-sport
coverage, bounded changes), `src/domain/program-blueprint-v2.ts`,
`src/server/repositories/program-occurrences.ts` (`materialiseOccurrences` — blueprint →
occurrences, matched by lineage/week/order, past work frozen, dropped future work cancelled),
occurrence-scoped coaching jobs in `coaching-jobs.ts`, contract-version negotiation
(`X-Coach-Contract-Version`), v3 mutation paths closed once the workflow API serves.

### P6 — History, progress, social, read APIs
Migration **0028_multisport_sharing**. `src/server/repositories/activity-analytics.ts`
(SQL per-sport totals, paged activity reads), `activity-evidence.ts`, per-sport sharing
preferences and projections, `src/server/coach-api-v2.ts` (v2 read API; v1 kept and answers
`upgrade_required` where a ride or swim cannot be described).

### P7 / P8 — built, then removed
The staged-cutover machinery (capability flags, stage model, cutover markers, the M2
validation gate, the gated M3 contraction) was implemented and then deleted in #41 on the
owner's decision: the application is in development and the ceremony had a cost and no
benefit. **Do not audit against it.** Removed: `src/lib/multisport-rollout.ts`,
`src/db/multisport-cutover.ts`, `src/db/validate-multisport.ts`,
`src/db/contract-multisport.ts` and their four test files. The git history still holds them.

### Post-plan
Migration **0029_coach_review_anchor** and `reviewAnchor` in `coaching-jobs.ts` — an
unrelated coaching bug carried over from #38, not part of this plan. Audit separately or skip.

---

## 3. Data, APIs and operations

- **Migrations:** `0026_multisport_expand` → `0027_multisport_coaching` →
  `0028_multisport_sharing` → `0029_coach_review_anchor`.
- **Ownership:** composite owner+sport foreign keys throughout; RLS on every new table;
  all reads and writes go through `withUser(db, userId, fn, { readOnly })`.
- **APIs:** `/api/coach/*` (v1, reads preserved) and `/api/coach/v2/*`
  (`src/server/coach-api-v2.ts`); `/api/coach/service/*` for the worker.
- **Operations:** `npm run db:audit:multisport` (read-only). The backfill runs automatically
  in `db:deploy`, which `vercel.json` runs as part of the build, marked once complete in
  `data_backfills` as `multisport_canonical_v1`.

---

## 4. Known divergences from the plan — audit these first

Each is a deliberate decision, not an oversight, but each is a place where the plan and the
code disagree and an auditor reading only the plan will call it a defect.

1. **`/profile/programme` does not redirect** to `/training/programme` (plan §3.2 says 307).
   The Changes view (`?view=changes`), the archived-programme list and the template picker
   have no equivalent under `/training`, and four call sites link to `?view=changes`
   (`components/coaching/activity.tsx`, `profile/ai-coach/ai-coach-settings.tsx`,
   `coaching/draft-page.tsx`, `coaching/change-detail.tsx`). Redirecting would have made
   coach-change review unreachable. **Open question: where should Changes live?**
2. **`/profile/routines` does not redirect** to `/training/templates?sport=strength`
   (plan §3.2). `/training/templates` lists strength routines read-only; creating and editing
   one still needs `RoutineLibrary` at `/profile/routines`.
3. **`/training/programme` has no `?view=changes`** (plan §3.1). It accepts `?sport=` only.
4. **No `/training/programme/create`, `/manual`, `/drafts/<id>`, `/jobs/<id>`** (plan §3.1).
   Those destinations remain under `/profile/programme/*` and `/welcome/programme/*`.
5. **Legacy `/api/coach/service` writes are not permanently closed** (plan §3.2, `AT-COACH-10`).
   They are closed by `COACH_WORKFLOW_ENABLED`, as before. The plan's permanent closure was
   tied to the capability flag that #41 deleted; closing them outright would retire an API
   that four test files still exercise.
6. **P7/P8 machinery is gone**, as described above. `AT-MIG-12/13/15`, `AT-API-06`,
   `AT-REL-04` and the `OP-01` … `OP-06` gates no longer have code to test.
7. **Compatibility windows (90/180/30 days) do not exist.** Nothing expires anything.

---

## 4a. Audited, and what it found

Walked on a local stack — real PostgreSQL, migrations 0026–0029, the three seeded accounts,
the backfill run twice — with every screen driven in Chromium at 390 px and 1280 px. What
held up, and what did not, is in [the coaching audit's sibling](../coaching-audit.md) format:

**Held up.** Strength regression: the canonical parent opens `in_progress` with the session's
own start and date, closes `completed` with real elapsed time, and is deleted on discard.
Occurrence identity: created → logged → log_deleted, disposition back to `pending`, one
activity per occurrence enforced. The backfill: idempotent on a second run, 39 activities and
48 occurrences from 28 sessions and 11 runs, reconciling rather than duplicating what
`sessions.ts` already wrote. Compatibility aliases: all five resolve or refuse, and a bogus
`?planned=` renders `LegacyUnavailable` rather than another target. Ownership: a foreign
activity and its edit screen are both `notFound`.

**Fixed.** A settled occurrence claiming not to exist; the scheduled views counting only
standalone work while saying "Scheduled"; four raw ISO dates; `?sport=` meaning different
things on `/training` and `/u/<username>`; `legacySportOf`/`sportOfLegacy` answering for two
sports out of four; `scripts/dev/seed-people.ts` leaving canonical parents at seed time; the
audit tool citing deleted OP gates.

## 5. Suggested audit priorities

1. **Strength regression** (`AT-REG-*`) — the specialised logger is the thing users would
   most notice breaking, and `sessions.ts` now writes a canonical parent beside every session.
2. **Data preservation** (`AT-MIG-*`, `AT-DATA-*`) — no legacy row is dropped; every run and
   session gets exactly one canonical parent; the backfill is idempotent; blocking anomalies
   hold an account back rather than being guessed at.
3. **Ownership and privacy** (`AT-PRIV-*`) — RLS, composite keys, per-sport sharing, whether
   deleting an account still takes everything with it.
4. **Occurrence identity** (`AT-SCHED-*`) — one occurrence logged once, nothing rolling
   forward, prescriptions immutable per revision, stale writes rejected with 409.
5. **Navigation and compatibility** (`AT-NAV-*`) — the aliases above, bounded `from=` origins,
   no arbitrary return URLs.
6. **The divergences in §4.**
