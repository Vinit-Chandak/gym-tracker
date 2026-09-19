# Overload multisport rollout runbook

Operator procedure for the release planned in [the implementation plan](MULTISPORT_IMPLEMENTATION_PLAN.md),
under [the decision register](MULTISPORT_DECISIONS.md) and verified by
[the acceptance tests](MULTISPORT_ACCEPTANCE_TESTS.md).

Implementation of phases P0–P8 is authorised. **Deployment is not.** Nothing in this file
authorises applying a migration to production, running a coaching job against real accounts,
or switching write authority. Each of those is a separate instruction.

## 0. What changed, and why this file is short

The plan described a staged production cutover: capability flags, an ordered switch, cutover
markers in the ledger, a validating M2 command and a gated M3 contraction, each with months of
compatibility window behind it. That machinery was built and then removed, on the decision of
the person who owns this application: it is in development, not serving anybody, and a staged
cutover for a database with no production traffic is ceremony that only costs reading.

What replaced it is the simplest thing that is also true. All four sports are on. Canonical
activities are the authority and there is no environment variable that says otherwise, because
there is no second authority to switch between. The old `/runs` screens are aliases onto the
shared ones. Nothing was dropped: migration 0026-0028, the backfill, the reconciliation and
the audit are all still here, and the legacy tables still hold every row they held.

What is gone is `src/lib/multisport-rollout.ts`, `src/db/multisport-cutover.ts`,
`src/db/validate-multisport.ts`, `src/db/contract-multisport.ts` and the three test files that
covered them. Sections 4 to 7 of this runbook went with them. If this application ever does
serve real accounts and a comparable migration is needed again, the plan's §10.4 still
describes the order and the git history still holds the implementation.

## 0a. The one command an operator runs

```
npm run db:audit:multisport        # read-only inventory; exit code 1 when something blocks
npm run db:backfill:multisport     # then the backfill, once
```

The backfill is idempotent and reconciles itself; running it twice writes nothing the second
time. Until it has run, existing runs and workouts have no canonical parent and so do not
appear in the shared Training and History surfaces. Everything logged after it is written
canonically from the start.

## 1. Implementation baseline (P0)

Recorded from the checkout the work started on, not inferred from a cached remote:

| Fact | Value |
| --- | --- |
| Repository | Vinit-Chandak/gym-tracker |
| Baseline branch | `codex/coaching-review-improvement-plan` |
| Baseline HEAD | `a0d45d188bad0faa784b3680da7277beab456a14` (19 September 2026) |
| Implementation branch | `claude/overload-multisport-overhaul-j7g2qh`, started at that commit |
| Working tree at start | clean; the three planning documents are committed on the baseline |
| Node / Next | v22.22.2 / 16.3.4 |
| Migration journal head at start | `0025_drop_personal_symptoms` |

Baseline verification, run before any change (isolated local environment, PGlite, no network
database):

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm test` | 120 files, 819 tests, pass (105.7s) |
| `npm run lint` | pass |
| `npm run format:check` | pass |

### Differences from the plan's recorded baseline

The plan was written against `766601693b27d2d607d65836d57b7d762230494f` with journal head
0023. The branch has since merged `main`. Two differences change implementation facts and are
recorded here rather than left to be discovered:

- Journal head is **0025**, so the additive migration M1 is numbered from 0026, not 0024.
- Migration `0025_drop_personal_symptoms` removed the six shin readings from `runs`. Plan
  §4.3's "six existing shin readings" no longer exist to preserve. Running keeps `surface`,
  `mode`, `notes` and its effort provenance; the symptom-stop rule survives as prescription
  text (`program_runs.stop_rule`), which is what the running prescription contract carries.
  No symptom column is re-created, and nothing is migrated from a table that is already gone.

### What each phase left behind

| Phase | Result | Suite after it |
| --- | --- | --- |
| P0 | Audit, fixtures and this runbook. No schema change. | 121 files, 827 tests |
| P1 | Typed sport, effort, measurements, prescriptions, occurrences, legacy decoders. | 128 files, 893 tests |
| P2 | Migration 0026, the canonical tables, the backfill and reconciliation. | 130 files, 924 tests |
| P3 | One save/edit/delete boundary; running parity; strength parents. | 134 files, 965 tests |
| P4 | Shared navigation, `/training` routes, per-sport forms, templates, scheduling. | 138 files, 1,002 tests |
| P5 | Occurrence-scoped coaching, sport policy, contract negotiation, v3 closure, migration 0027. | 142 files, 1,067 tests |
| P6 | SQL totals, per-sport sharing, the v2 read API, migration 0028 and the M2 command. | 145 files, 1,096 tests |
| P7 | The cutover stage model, the markers, and the ordered rehearsal. Removed afterwards — see §0. | 146 files, 1,105 tests |
| P8 | The gated contraction command and the v1 410. Removed afterwards — see §0. | 147 files, 1,115 tests |

Every run was `npm test` against PGlite with the real migrations applied, plus `npm run lint`,
`npm run format:check` and `npm run typecheck`. No network database was contacted.

## 2. Before the backfill touches real data

The staged cutover is gone, but two facts about a real database are not inferable from a
passing local suite (AT-REL-01), and the backfill is the one irreversible thing left:

- **A backup you have restored.** Not a backup you have. The backfill is additive and
  reconciles itself, but an untested restore is not a rollback plan.
- **The audit's answer, read by a person.** `npm run db:audit:multisport` against a restored
  copy, before the same command against the real one. Its blocking categories (§3) are cases
  where two records disagree about the same fact, and guessing which is right is how the wrong
  run gets attached to the wrong plan.

Everything else the original gates covered — pausing dispatch, draining worker leases,
rejecting old mutation versions, counting v1 clients — was about switching authority between
two live writers. There is only one writer now.

## 3. Inventory: the multisport audit

`src/db/multisport-audit.ts`. Read-only: every statement is a `select`, and a test asserts row
counts are unchanged after a full run with detail enabled.

```
npm run db:audit:multisport        # aggregate report; exit code 1 when blocked
```

It reads `MIGRATION_DATABASE_URL` (or `DATABASE_URL`) exactly as `db:migrate` does. Point it at
a restored copy first. `auditMultisport(db, { userId })` scopes to one account for support
work, and `{ detail: true }` adds owner and source identifiers — that form is the operator's
private report and does not leave the audit environment. Neither form reads notes, symptoms or
measurements.

Blocking categories stop the backfill until a person resolves them:

| Category | Why it blocks |
| --- | --- |
| `planned_run_duplicates` | Two raw runs claim one plan; only an authoritative completion event may decide (§10.3) |
| `slot_event_orphan_run` / `slot_event_orphan_session` | A completion names a record that no longer exists; an event may not invent an activity |
| `cross_owner_run_planned` / `cross_owner_run_session` / `cross_owner_slot_event_*` | A link crosses accounts; the raw record is kept and the link isolated, never reassigned |
| `shared_stat_missing_source` | A shared projection names a source that cannot be resolved |
| `unknown_blueprint_payload` | A stored draft matches no known contract; it is read by hand, not guessed |

Non-blocking categories are mapped deterministically and are reported so the numbers are
known in advance: `legacy_completion_without_run` (migration 0011's case → legacy-completed
resolution, no fabricated activity), `legacy_unconfirmed_effort`, `run_zero_distance`,
`run_outside_new_bounds`, `planned_run_without_program_day`, `unconfirmed_time_zone`,
`session_plan_run_payload`, and `id_collision_run_session` — where one UUID is both a run and
a session, the run keeps its id, the session's parent is minted, and the ledger records both.

`projection` states what the backfill will write, for the cardinality half of the
reconciliation contract: one canonical activity per raw run and per workout session, one
endurance occurrence per planned run, and the split of logged versus legacy-completed
resolutions. Strength keeps its own sequence projection and gets no occurrence rows (plan
§2.3); the backfill creates none for it.

## 3a. Programme occurrences (P5)

P4's plan line said blueprint materialisation writes explicit occurrences; it did not. P5
added it, because an occurrence-scoped coaching job has nothing to be scoped to otherwise.
`materialiseOccurrences` runs inside programme activation and matches existing occurrences by
lineage, week and order — so running it twice against the
same blueprint changes nothing. Completed, started and past work is frozen; future work the
new version no longer asks for is cancelled rather than deleted. Strength gets no occurrence
rows, as §2.3 requires and the backfill already assumed.

## 4. Manual journeys (P7)

No browser runner is installed, and none was added: the plan makes Playwright optional and
adding a dependency at cutover is not a cutover-time decision. These are the journeys a
person walks instead, in staging, before the switch. Record the date, the build, the device
and the result beside each; an unrecorded journey has not been done.

| Journey | What to do | What must be true |
| --- | --- | --- |
| AT-JOURNEY-01 | Lifting-only athlete opens scheduled strength from Today, changes gym equipment, logs supersets and RIR, reloads a dirty draft, finishes | The existing logger is unchanged; no endurance field appears; the draft survives the reload |
| AT-JOURNEY-02 | Follow an old `/runs/new?planned=<id>` link from a bookmark | It resolves to the same target through the shared form; the RPE is not prefilled from the plan |
| AT-JOURNEY-03 | Indoor cyclist logs 32 minutes with unknown distance, offline, then reconnects and retries | One activity, not two; no speed is shown; it is absent from Today and from the programme |
| AT-JOURNEY-04 | Pool swimmer logs 16 lengths of a 25 m pool, then a session in a 25 yd pool | 400 m and 400 yd, kept apart in the comparable bests; no pace is asserted from elapsed time |
| AT-JOURNEY-05 | Wednesday swim left undone, logged from the Cycle on Friday | Friday's Today does not carry it; adherence counts Wednesday; the actual is Friday's |
| AT-JOURNEY-06 | Beginner states a goal, confirms the sports the coach suggests | No sport is included without confirmation; no gym is required of a swimmer |
| AT-JOURNEY-07 | Two accounts on one device: A drafts a private swim and signs out; B signs in and follows A | B sees neither the draft nor the raw measurements; only the shared projection |

Device coverage for each (AT-REL-05): iOS Safari, Android Chrome, and the installed PWA.
Check the keyboard for numeric entry, an interrupted save, returning online, a reload, a
background-and-resume, the safe-area navigation, and signing out.

## 5. Rollback

There is no flag to turn back, and after the first ride or swim there is no earlier release to
return to: an older app cannot represent them. Roll forward with the database intact, or
restore a verified backup in isolation and replay the canonical delta into it. Never discard
cycling or swimming data to boot a running-only application.
