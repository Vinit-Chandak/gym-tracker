# Overload multisport rollout runbook

Operator procedure for the release planned in [the implementation plan](MULTISPORT_IMPLEMENTATION_PLAN.md),
under [the decision register](MULTISPORT_DECISIONS.md) and verified by
[the acceptance tests](MULTISPORT_ACCEPTANCE_TESTS.md).

Implementation of phases P0–P4 is authorised. **Deployment is not.** Nothing in this file
authorises applying a migration to production, running a coaching job against real accounts,
or switching write authority. Each of those is a separate instruction.

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
| P0 | Audit, fixtures and this runbook. No schema change. | 128 files, 827 tests |
| P1 | Typed sport, effort, measurements, prescriptions, occurrences, legacy decoders. | 128 files, 893 tests |
| P2 | Migration 0026, the canonical tables, the backfill and reconciliation. | 130 files, 924 tests |
| P3 | One save/edit/delete boundary; running parity; strength parents. | 134 files, 965 tests |
| P4 | Shared navigation, `/training` routes, per-sport forms, templates, scheduling. | 138 files, 1,002 tests |

Every run was `npm test` against PGlite with the real migrations applied, plus `npm run lint`,
`npm run format:check` and `npm run typecheck`. No network database was contacted.

## 2. Factual gates (OP-01 – OP-06)

All six remain **unresolved**. They need a deployed environment, which this work has no access
to and no authorisation to inspect. They block deployment, not implementation.

| Gate | What must be established | Status |
| --- | --- | --- |
| OP-01 | Production/staging topology, database versions, applied journal, isolated staging database | Unresolved — no environment access |
| OP-02 | Row counts, duplicates, orphan/cross-owner links, payload variants | Tooling ready (§3); not run against any real database |
| OP-03 | Verified backup and a rehearsed isolated restore | Unresolved |
| OP-04 | Open sessions, browser versions, worker leases, read-API clients | Unresolved |
| OP-05 | Rehearsed pause inside the ten-minute ceiling | Unresolved |
| OP-06 | External export/read consumers absent from the repository | Unresolved |

A local suite passing is not evidence about production (AT-REL-01).

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

Blocking categories stop the backfill and the cutover gate until a person resolves them:

| Category | Why it blocks |
| --- | --- |
| `planned_run_duplicates` | Two raw runs claim one plan; only an authoritative completion event may decide (§10.3) |
| `slot_event_orphan_run` / `slot_event_orphan_session` | A completion names a record that no longer exists; an event may not invent an activity |
| `cross_owner_run_planned` / `cross_owner_run_session` / `cross_owner_slot_event_*` | A link crosses accounts; the raw record is kept and the link isolated, never reassigned |
| `shared_stat_missing_source` | The same-owner source constraint (M2) cannot be validated |
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

## 4. The capability gate

`src/lib/multisport-rollout.ts`. Everything new is off unless an environment says otherwise,
and the gate refuses combinations the rollout order forbids.

| Variable | What it turns on |
| --- | --- |
| `MULTISPORT_CANONICAL_WRITES` | Canonical activities become the authority for new writes: the save boundary, the strength parent, the activity routes |
| `MULTISPORT_SHARED_NAV` | The Training tab, the `/training` routes, the sports step in setup, and the redirects from `/runs` and `/profile/programme` |
| `MULTISPORT_NEW_SPORTS` | Cycling and swimming. **Refused unless canonical writes are on**, whatever the environment says — there would be nowhere to record them |
| `MULTISPORT_ROLLOUT` | All three at once |

Accepted values are `true`, `on` and `1`. Anything else is off, including `yes`.

With every switch off the app behaves exactly as it did: Runs is the second tab, `/runs` is
the running product, and the canonical tables sit there holding the backfill's projection
without being read for anything an athlete sees.

## 5. Ordered rollout (plan §10.4)

Not authorised here. Recorded so the order is fixed before anybody is under time pressure.

1. Resolve OP-01–06; take a private backup; rehearse a restore; record deployed app, worker
   and schema versions and every legitimate v1 client.
2. Deploy M1 (additive) and the bridge app with every switch in §4 off. Legacy tables stay
   authoritative and no new sport is exposed.
3. Run the audit, then the backfill, against a restored copy. Iterate until the reconciliation
   report passes. Only then run it against production.
4. Exercise all four sports in isolated staging, including an open strength session, an old
   browser bundle and a v3 worker.
5. Pause dispatch, drain or expire leases, announce the pause (ten minutes maximum). Let
   active strength sessions finish; never force-finish or discard one.
6. Reject old mutation versions, run the final delta backfill and reconciliation, apply M2.
   Abort before the switch if any required equality fails.
7. Turn on `MULTISPORT_CANONICAL_WRITES` and `MULTISPORT_SHARED_NAV`, deploy the compatible
   app and worker, resume writes, then enable `MULTISPORT_NEW_SPORTS` once the coaching side
   is ready for them. Record the first canonical write marker.
8. Monitor ownership errors, receipts and conflicts, orphan counts, coach coverage, version
   errors and aggregate drift. Reconcile again after the first cohort.
9. Complete the compatibility windows, then M3.

## 6. Compatibility windows

- UI aliases (`/runs`, `/profile/programme`, `/profile/routines`): **at least 90 days** after
  cutover. Review at day 90; removal needs 30 consecutive days with no legitimate legacy usage
  plus updated first-party links, stored coach links and documentation.
- Public read API v1: **at least 180 days**, with its own usage gate. Removal returns a
  documented 410, never a redirect to HTML or to v2.
- Each window starts at cutover, not at implementation. Record the dates here when they start.

## 7. Rollback

Before the first canonical write: stop, return to the bridge, keep the additive tables for
investigation. Legacy is still authoritative, so nothing has to be squeezed into an old shape.

After canonical writes: an old app cannot represent cycling or swimming. Prefer a previous
compatible canonical release, or roll forward with the database intact. If restoration is
unavoidable — pause writes and jobs, export the complete post-cutover canonical delta, restore
the verified backup in isolation, replay into a compatible schema, reconcile, resume. Never
discard cycling or swimming data to boot a running-only application.
