# Overload multisport acceptance tests

Status: planning specification for Gate B review, 19 September 2026. These tests are proposed, not executed.

Read with [the implementation plan](MULTISPORT_IMPLEMENTATION_PLAN.md) and [decision register](MULTISPORT_DECISIONS.md). The plan's field matrix, constraints, route matrix and migration policy are normative. Tests below verify behaviour rather than mirroring implementation details.

## 1. Evidence, environment and fixtures

Existing infrastructure inspected: Vitest 5, PGlite, Testing Library, jsdom, 115 tracked test files, and real migration application through src/db/test/pglite.ts. No Playwright dependency exists. No application tests, type generation, build, server, migration, seed or coach job was run for this planning task.

Execution during implementation must use an isolated local/test database, synthetic accounts and test-only authentication. Do not inherit production credentials or use a preview merely because it is named preview. Disable external dispatch/notifications and use deterministic clocks. Production migration verification is a separately authorised operator step with aggregate output and private sample checks.

Fixture requirements:

- At least two isolated athletes, each with owned programmes/resources, plus an approved follower, a pending follower and an unrelated user.
- Existing strength-only, running-only, mixed, archived and historical partway-cycle programmes, including rest slots and copied revision events.
- Legacy reported/unconfirmed/null effort, zero distance, precision edge cases, symptoms/notes, recovery rows, gym/workout links and different time zones.
- A programme with two same-day runs, a swim and strength; standalone scheduled activities; an ad hoc log on the same date.
- An indoor cyclist with no distance/HR/power; a swimmer with 25m and 25yd pools, unknown distance and optional active time.
- More than 200 runs and more than 500 training records, enough to reveal accidental list-limit aggregates.
- Open strength sessions/set drafts, endurance drafts, stale browser versions, old prepared plans, pending proposals, queued/claimed/completed jobs and retry receipts.
- Deliberate duplicates/orphans/cross-owner links only in isolated migration fixtures, including the 0011 event-without-run case. Do not relax current live constraints to create fixtures.

Layers: D = pure domain; DB = schema/migration/RLS; S = repository/action/API; UI = component/navigation; E = end-to-end or recorded manual browser/PWA journey. No E claim can be inferred from a source read or snapshot update.

## 2. Planning and baseline integrity

| Test ID | Decisions / phase | Layer | Required outcome |
| --- | --- | --- | --- |
| AT-BASE-01 | TEST-02 / planning | Inspection | Only the three authorised Markdown documents are created/changed; output/ and all existing application/planning content remain intact |
| AT-BASE-02 | OP-01 / P0 | Inspection | Implementation records branch/SHA/dirty tree and production app/schema separately; newer work is reconciled rather than assumed merged |
| AT-BASE-03 | TEST-01 / P0 | Inspection | Test runner, scripts and isolated credentials are checked before execution; typecheck/build generation is not misreported as read-only inspection |
| AT-BASE-04 | All exclusions / every phase | Review | No nutrition/calorie targets, GPS/maps, wearables, new sports, native app, new social network, live endurance timer or unapproved integration enters scope |

## 3. Navigation and onboarding

| Test ID | Decisions | Layer | Given / action / expected result |
| --- | --- | --- | --- |
| AT-NAV-01 | NAV-01/02, SCOPE-01 | UI/E | Navigation has Today, Training, History, Progress, Profile. No independent Runs primary section; all endurance sports use canonical shared routes |
| AT-NAV-02 | TODAY-01 | S/UI | Today contains today's scheduled strength/endurance only, including multiple same-sport cards. Ad hoc actuals and earlier incomplete endurance work are absent |
| AT-NAV-03 | SCHED-01/03 | D/UI | A missed swim does not delay the next strength projection, running or next swim. Strength's own existing shift/rest sequence remains intact |
| AT-NAV-04 | NAV-01, SCHED-08 | UI/E | Training offers logging, scheduling, templates, programme and standalone schedule; History owns actuals; Progress owns aggregates. No duplicate full actual list in Training |
| AT-NAV-05 | NAV-03 | UI/E | Detail opened from Today/History/Training/Programme/shared page returns to the valid origin and highlights its tab; edit returns to detail. Direct completed link defaults History |
| AT-NAV-06 | NAV-03/04 | S/UI | Unknown sport, repeated singleton parameters, conflicting sport/occurrence/template and unsafe return URL are rejected visibly. No fallback to a different plan |
| AT-NAV-07 | NAV-04 | S/E | /runs, /runs/new, detail and edit resolve through the old-to-new matrix. ?planned resolves exactly its durable ID; foreign/missing/deleted/ambiguous targets never select the first remaining run |
| AT-NAV-08 | NAV-04 | S/UI | Profile programme/routine and existing settings aliases preserve validated draft/job/view parameters; preview pages/metadata/action redirects no longer advertise separate Runs |
| AT-NAV-09 | NAV-01 | UI/E | Empty Training/Today/History states offer the relevant next action. Disabled sport history remains reachable through filters; a new swimmer need not visit a gym page |
| AT-ONBOARD-01 | SCOPE-02, ONBOARD-01 | S/UI/E | Endurance-only user can enter and log without gym, lifting programme, strength frequency or irrelevant measurements |
| AT-ONBOARD-02 | ONBOARD-01, COACH-01 | UI/S | Goal text is the primary coach entry; typed/dictated text survives navigation. Beginner can say a goal without knowing a sport; coach asks essentials and presents included sports for confirmation |
| AT-ONBOARD-03 | ONBOARD-02 | UI/E | More options reveals per-sport experience/access/budget and optional metrics; beginner can complete essentials without filling advanced values |
| AT-ONBOARD-04 | SPORT-01, COACH-03 | S/UI | Disabling a shortcut preserves history/templates/plans and explains that fact. Removing a programme sport needs a programme confirmation; overall coach-off prevents job mutations |
| AT-ONBOARD-05 | COACH-01 | S | A coach result adding an unrequested/unconfirmed sport cannot activate automatically. No founder-specific gym, injury, equipment or availability appears as a universal default |

## 4. Sport fields, units and actual effort

For every input case, test UI schema and server validation; intrinsic consistency must also fail at the database boundary when bypassing the action. Test just below/at/above each declared bound, null, zero where allowed, negative, non-finite, malformed string, oversized text and wrong-sport fields. Do not duplicate every validation test at every visual component.

| Test ID | Decisions | Layer | Given / action / expected result |
| --- | --- | --- | --- |
| AT-LOG-01 | RUN-01, LOG-02 | D/S/UI | Run requires positive distance and duration. 5 km in 30 minutes derives 6:00/km; single entered duration is never labelled moving time |
| AT-LOG-02 | LOG-01, RUN-01 | UI/S | Running form supports outdoor/treadmill and retained symptom readings. Cycling/swimming neither require nor receive running shin fields |
| AT-LOG-03 | CYCLE-01 | D/S/UI | Indoor ride with 30-minute duration and null distance saves, views, edits and deletes correctly; speed remains absent, no dummy distance/gym required |
| AT-LOG-04 | CYCLE-01, UNIT-02 | D/S | Explicit cycling distance zero remains zero and derives overall speed zero; unknown remains null. Power/cadence/HR may be omitted independently |
| AT-LOG-05 | SWIM-01, UNIT-01 | D/S/UI | Sixteen lengths of a 25m pool yields 400m. Sixteen lengths of 25yd yields 400yd/365.76m; one length means one direction, not a round trip |
| AT-LOG-06 | SWIM-01 | D/UI | Manual distance and length-derived distance cannot both be authoritative. Switching method explicitly clears incompatible asserted totals; custom pool size persists exactly |
| AT-LOG-07 | SWIM-01/02 | D/S/UI | Pool/open-water record may omit distance/stroke. Elapsed duration remains useful; no pace is fabricated. Pool fields cannot assert open-water lengths |
| AT-LOG-08 | SWIM-02 | D/S | 400yd with 8 minutes actual swimming time yields 2:00/100yd regardless of 10-minute elapsed time. active > elapsed is rejected; absent active time gives no active pace |
| AT-LOG-09 | SWIM-02, STRUCT-02 | D/UI | Prescribed rests never become actual rest. Elapsed-active gap is only unclassified non-swimming time, not measured interval rest |
| AT-LOG-10 | LOG-03, ACTUAL-01 | UI/S/DB | New endurance save requires explicit reported effort 1–10 or Not sure. Coach target RPE never prepopulates it; Not sure stores null/unknown |
| AT-LOG-11 | LOG-03, MIG-02 | DB/S | Legacy effortReported=false with numeric effort stays unconfirmed across migration/read/edit of unrelated notes. New certainty requires explicit athlete reporting |
| AT-LOG-12 | ACTUAL-01 | UI/E | Opening plan/template shows prescription separately while actual distance/duration/effort are blank. Context such as pool/environment can preselect without claiming actual performance |
| AT-LOG-13 | UNIT-01/02 | D/DB | Exactly 1 mile = 1609.344m and 1 yard = .9144m. Repeated unit changes/notes edits do not drift canonical or original quantities; comparisons use unrounded values |
| AT-LOG-14 | UNIT-02 | D/S/UI | Large entries within caps request confirmation, not silent truncation. Sport caps differ; valid long cycling/swimming logs do not inherit running's old cap |
| AT-LOG-15 | UNIT-02, MIG-02 | DB/S | Old valid or grandfathered values outside new UI limits remain unchanged through migration and notes-only edits. Client cannot manufacture legacy provenance to bypass new validation |
| AT-LOG-16 | FIELD-01 | S/UI | Optional bike/trainer/pool/venue is owner-scoped, private and gym-independent. Editing its default later does not rewrite saved measurement/context snapshots |
| AT-LOG-17 | TIME-01 | D/S/UI | Save across midnight/DST preserves intended actual instant, zone and date. Ambiguous local time requires offset; invalid IANA zone/future actual beyond tolerance rejected |
| AT-LOG-18 | LOG-01/03 | S/UI | Existing strength RIR/set effort and check-in flow remain; no extra universal endurance RPE question is forced into the strength logger |
| AT-LOG-19 | CYCLE-01, PROGRESS-02 | D/UI | Unknown/unassisted/assisted cycling are distinct; missing assistance is never silently unassisted. Advanced fields obey units/max-vs-average consistency |

## 5. Structured prescriptions and templates

| Test ID | Decisions | Layer | Given / action / expected result |
| --- | --- | --- | --- |
| AT-STRUCT-01 | PLAN-01, STRUCT-01 | D/UI | Create/edit/archive a standalone endurance template containing warm-up/work/recovery/cool-down and one repeat level; archive keeps referenced prescriptions readable |
| AT-STRUCT-02 | STRUCT-01 | D/S | Reject nested repeats, invalid/empty/reversed targets, negative rest and limits above 100 authored nodes/100 repetitions/1,000 expanded steps/128 KB |
| AT-STRUCT-03 | STRUCT-01/02 | D/UI | 30-minute easy ride, 5 km run and 5×[2-minute run+1-minute walk] remain structured prescriptions; actuals are one session's independently entered totals |
| AT-STRUCT-04 | STRUCT-01, UNIT-01 | D/UI | 8×50m with 20s between reps derives 400m and seven rests/140s prescribed rest. It does not invent swim speed or complete planned duration |
| AT-STRUCT-05 | ACTUAL-01 | S/UI | Mixed time/distance targets with unknown conversion pace leave totals partially unknown; no invented pace or actual measurements |
| AT-STRUCT-06 | PLAN-01, SCHED-06 | S/DB | Template edit affects future selections only. Existing occurrence snapshot changes only through explicit reviewed application; completed actual interpretation stays fixed |
| AT-STRUCT-07 | SCOPE-01 | S/UI | Existing saved strength routines retain exercise targets, set/superset identity and gym selection behaviour in the shared template picker |
| AT-STRUCT-08 | STRUCT-02, LIFE-01 | UI/Review | No interval-result/timer UI falsely appears because the prescription supports repeats. Targets and results are labelled distinctly |
| AT-STRUCT-09 | STRUCT-01, MIG-02 | D/S | Legacy running duration plus distance ranges, pace/progression/shin-stop notes and prepared notes survive conversion without guessed intervals; typed running-specific instructions remain editable/displayable |
| AT-STRUCT-10 | DATA-02, UNIT-02 | D/S | Blueprint v2 validates 1–52 weeks, up to 31 strength slots, 10,000 endurance occurrences and 4 MiB payload. Two same-day occurrences are valid; duplicate identity or inconsistent initial week/date is rejected |

## 6. Scheduling, identity and lifecycle

| Test ID | Decisions | Layer | Given / action / expected result |
| --- | --- | --- | --- |
| AT-SCHED-01 | SCHED-01/02, DATA-02 | D/DB/S | Same date has strength, two runs and swim. Completing run A settles only occurrence A; other run, swim and strength remain independent |
| AT-SCHED-02 | SCHED-03/04, TIME-01 | D/S/UI | Wednesday swim logged Friday or next week resolves Wednesday's occurrence, appears in actual Friday history, and counts against original programme adherence; no week expiry |
| AT-SCHED-03 | TODAY-01, SCHED-03 | UI/S | Wednesday incomplete swim does not appear on Friday Today unless explicitly rescheduled Friday; accessible from earlier Programme Cycle |
| AT-SCHED-04 | SCHED-06 | D/S | Skip/reopen/reschedule one occurrence affects only that ID; old/new dates invalidate correct views. Reopening a skip does not duplicate an occurrence |
| AT-SCHED-05 | SCHED-01 | D | Existing strength rest slots, historical startDayIndex, shifted sequence and out-of-order completion retain their strength-only meaning; endurance does not hold or advance that sequence |
| AT-SCHED-06 | SCHED-05 | DB/S | Concurrent programme activations cannot create two active programmes. One mixed programme plus standalone scheduled work remains allowed |
| AT-SCHED-07 | LINK-01 | S/UI | Ad hoc run/swim on a planned date remains unlinked and does not prompt a match. Logging from a chosen occurrence links exactly that ID |
| AT-SCHED-08 | LINK-02 | DB/S | Concurrent logs for one occurrence yield one actual/completion and a readable conflict; one activity cannot satisfy multiple occurrences |
| AT-SCHED-09 | SCHED-06, COACH-08 | S/DB | Programme revision keeps completed/started/claimed prescriptions and historical lineage; changed future preparations superseded, unchanged ones preserved by exact identity |
| AT-SCHED-10 | SCHED-06 | S/UI | Replacing future running with cycling explicitly cancels old occurrence and creates new sport occurrence; no existing actual is relabelled |
| AT-SCHED-11 | SCHED-07 | UI/S | Manual schedule warns on time-budget conflict and allows deliberate override; coach output exceeding confirmed budgets is held for approval |
| AT-SCHED-12 | SCHED-08 | S/UI | Standalone occurrence appears on its date and in standalone Upcoming/Earlier view; it does not create a programme or receive programme coaching |
| AT-SCHED-13 | SCHED-06 | S/UI | New-block activation archives older pending future work without deletion; archived occurrences remain explicitly loggable but are not active coach/Today targets |
| AT-SCHED-14 | DATA-02, MIG-02 | DB/S | A migrated legacy-completed occurrence has no invented actual. It cannot be logged again until explicitly reopened; historical resolution remains traceable |
| AT-LIFE-01 | LIFE-02/03 | S/UI | Create/view/edit/delete each endurance sport. Edit changes the same ID; below-target or ended-early log resolves once; deletion reopens only its occurrence and removes projections |
| AT-LIFE-02 | LIFE-04 | S/UI | Sport/origin cannot change through edit or forged payload. Correcting wrong association requires explicit delete/re-log; old receipt cannot recreate removed log |
| AT-LIFE-03 | LIFE-05/06 | S/DB | Same submission key + same digest returns same success after timeout; changed digest conflicts; two tabs cannot create duplicate actuals |
| AT-LIFE-04 | LIFE-06 | S/UI | Two edits with same expected revision: first succeeds, second receives conflict with preserved local input, no last-write-wins loss |
| AT-LIFE-05 | LIFE-05 | UI/E | Reload/crash/offline preserves endurance input and units; reconnect does not auto-submit. Uncertain save checks receipt/retries same key; clears only acknowledged snapshot |
| AT-LIFE-06 | LIFE-05 | UI/E | Logout warns for unsaved work then clears only that account's drafts; another athlete cannot see them. Unknown/corrupt schema is recoverable, not silently parsed/discarded |
| AT-LIFE-07 | LIFE-05 | UI | Draft size/count/age limits warn before loss, preserve unsent content on quota failure, and never erase a newer tab's changes |
| AT-LIFE-08 | LIFE-06, COACH-08 | S/E | Planned log pins revision for renewable 30-minute claim; coach cannot overwrite it. Expiry releases scheduling but saving a changed/cancelled target prompts conflict resolution |
| AT-LIFE-09 | LIFE-01 | S/UI | Closing an unsaved endurance form creates no actual/volume/adherence; no live timer/background recording is implied |
| AT-LIFE-10 | LIFE-02, PROGRESS-02 | S/DB | Editing/backdating/deleting recomputes affected subsequent record flags, completion, shared stats, progress, caches and coach source revision atomically |

## 7. Database, ownership and strength regression

| Test ID | Decisions | Layer | Required outcome |
| --- | --- | --- | --- |
| AT-DATA-01 | DATA-01/04 | DB | Exactly one correct typed detail per activity at transaction end. Missing child, wrong sport, two typed children or owner mismatch fails |
| AT-DATA-02 | DATA-02/04 | DB | Activity's occurrence and performed revision belong to each other, same owner and same sport. Foreign programme/day/family/template/resource links fail even through direct SQL under app role |
| AT-DATA-03 | DATA-04, LINK-02 | DB | Unique actual per occurrence and owner-scoped receipt key survive concurrent transactions; event table cannot invent independent completion |
| AT-DATA-04 | DATA-01, LIFE-06 | S/DB | Inject failure after parent/detail/event/shared-stat stages: all writes roll back. Ambiguous post-commit response is resolved by receipt, not unguarded replay |
| AT-DATA-05 | DATA-04 | DB/S | Authenticated athlete cannot read/write another athlete's raw details, prescriptions, templates, resources, receipts, claims or migration metadata; service context still enforces target athlete |
| AT-DATA-06 | DATA-05 | DB/S | Manual/legacy provenance and stable native units are retained. No provider API/credential/sensor storage appears |
| AT-DATA-07 | DATA-04 | DB/S | Direct authenticated table mutation without the server-write marker is denied; trusted actions still obey owner/sport constraints. Marker is transaction-local, absent on read-only/reused connections, and no exposed RPC can set it |
| AT-REG-01 | SCOPE-01, DATA-01 | D/S/UI | Existing strength create/start/check-in/log/finish/discard works, including supersets, substitutions, custom exercises, equipment fallback and missing equipment |
| AT-REG-02 | SCOPE-01 | D/S | Existing machine-specific and portable-equipment comparisons/progression remain identical; swimming/cycling resources do not enter load comparison |
| AT-REG-03 | LIFE-05 | UI/E | Existing strength dirty set drafts, exact acknowledgement handling, effortVersion, rest timer and resume strip survive bridge/cutover |
| AT-REG-04 | MIG-02 | DB/S | Original strength sessions/exercises/sets and recovery records retain IDs, counts, content and units; parent start/finish/discard is atomic |
| AT-REG-05 | PROGRESS-01 | D/S | Existing lifting volume/e1RM/records and shared duration rules remain; endurance does not inherit the strength four-hour stat cap |
| AT-REG-06 | SCOPE-01 | UI/E | Lifting-only user experiences no mandatory endurance fields, sport-only coach inputs, pool details or new manual-endurance lifecycle |

Extend existing suites: src/domain/schedule.test.ts, progression.test.ts, comparable-history.test.ts, program-blueprint.test.ts, session-plan.test.ts, program-change.test.ts, program-patch.test.ts; src/server/repositories/sessions.test.ts, programs.test.ts, program-revisions.test.ts, workout-equipment.test.ts, load-units.test.ts; src/lib/workout-drafts.test.ts; src/app/(app)/workouts/[sessionId]/exercise-logger.test.tsx. Proposed additional files are listed by phase in plan §11.

## 8. Coaching and external contracts

| Test ID | Decisions | Layer | Given / action / expected result |
| --- | --- | --- | --- |
| AT-COACH-01 | COACH-01/02, SCOPE-04 | D/S/E | Create strength-only, each sport-only, and mixed programmes from goal-first intake. Output contains only confirmed sports/access and can materialise without dummy gyms |
| AT-COACH-02 | COACH-02/03 | S | Every included sport gets review coverage when coach enabled, including manually created programmes. Sparse evidence produces a stated hold/question, not omitted coverage |
| AT-COACH-03 | COACH-04 | S | Ad hoc run/ride/swim affects workload/quiet-day evidence but creates no preparation target or completion match |
| AT-COACH-04 | COACH-05 | D/S | Cycling/swimming adjustment inside approved envelope can be automatic; missing/outside envelope or structural change becomes proposal. Running's percentages/shin rules never act as universal new-sport rules |
| AT-COACH-05 | COACH-05 | D/S | Independent fixtures cover improved/fatigued/sparse/incomparable/new-sport actuals and limited access/time. Unknown actual effort is not a confirmed success/failure signal |
| AT-COACH-06 | COACH-07 | S/DB | Two same-day swims and a run get separate target jobs/plans; dedupe repeats do not enqueue extra jobs. Athlete jobs remain serial; lease/three-attempt limits enforced |
| AT-COACH-07 | COACH-07/08 | S | Occurrence preparation can only change its exact target; cannot rewrite weekly structure, another sport, completed/started/claimed work or an archived programme |
| AT-COACH-08 | COACH-06/08 | S/DB | Result with old contract/policy/sourceRevision/programme/occurrence/prescription revision/consent/lease is rejected without writes; eligible replacement can be enqueued |
| AT-COACH-09 | COACH-07 | S/DB | Retry same accepted result returns receipt; different body with accepted key conflicts. Reclaimed lease rejects late worker |
| AT-COACH-10 | COACH-06/07 | S/E | Deployment pauses/drains/supersedes v3 work; completed reports/receipts remain readable. Old worker cannot mutate through workflow or legacy service even with rollout flag disabled |
| AT-COACH-11 | COACH-09 | D/S | Legacy run:<UUID> resolves owned actual; run:<weekday> guardrail scope maps separately to lineage/context. Duplicate same-day sports do not share the wrong baseline |
| AT-COACH-12 | COACH-09, LOG-03 | D/S | Memory/quotes retain source timestamps, effort provenance, sport tags and revisions. Edited/deleted source cannot remain current evidence; old conversion is not refreshed evidence |
| AT-COACH-13 | COACH-06/08 | S/UI | Old saved proposals/opening plans remain readable; lossless translation is explicit, stale/ambiguous activation blocked with regenerate/review action |
| AT-COACH-14 | COACH-02, SCHED-06 | S/UI | Full-programme change uses reviewed diff/approval; single future occurrence adjustment cannot bypass it. Existing agreed Cycle/Changes and next-daily-run request semantics preserved |
| AT-COACH-15 | COACH-07, TODAY-01 | S | Daily prep window is today/next 48h; overdue endurance requires exact request/reschedule; strength projection independent. Run-only/swim-only Today is not labelled Rest |
| AT-COACH-16 | COACH-03, DATA-04 | S/DB | Consent revocation during claim/context/result prevents acceptance; foreign athlete IDs or evidence cannot escape source scope |
| AT-COACH-17 | COACH-08, DATA-02 | S/DB/UI | Logged activity pins both its programme occurrence revision and the immutable daily coach preparation actually displayed. Later preparation/revision cannot alter historical targets; wrong-owner/occurrence/base-revision preparation ID is rejected |
| AT-API-01 | API-01 | S | v1 running/workout/recovery/exercise golden payloads preserve units, field names, ordering, effort and pagination for representable data; JSON does not become redirect HTML |
| AT-API-02 | API-01 | S | v1 programme with cycling/swimming or unrepresentable occurrences returns documented upgrade_required; v1 summary declares legacy coverage through docs/headers |
| AT-API-03 | API-02 | S | v2 activity/summary/programme/recovery/exercise routes return typed sport-complete data, stable timestamp+ID cursors and full SQL aggregates; no 500-row truncation disguised as total |
| AT-API-04 | API-02 | S | Page limits/range/zone/cursor/sport validation enforce documented 400 errors and coverage; owner can page/export all records without duplicate/omitted ties |
| AT-API-05 | API-01, DATA-04 | S | Read token remains unable to mutate, invalid/revoked token rejected, cache is private/no-store with Vary Authorization, no cross-athlete reads |
| AT-API-06 | API-01, NAV-04 | S/E | v1 remains during >=180-day usage-gated window; eventual removal gives 410 upgrade information. UI 90-day handling is independently tested |
| AT-API-07 | COACH-06/07 | S | scripts/coach workflow verifies version before claim, and legacy mutation scripts fail with upgrade message without sending incompatible writes |

## 9. Analytics, privacy and social regressions

| Test ID | Decisions | Layer | Required outcome |
| --- | --- | --- | --- |
| AT-STAT-01 | PROGRESS-01 | D/S | Distinct actual training days deduplicate mixed same-date activities; session count counts each actual once; distance and strength tonnage remain separate |
| AT-STAT-02 | PROGRESS-01 | D/S/UI | Full SQL totals match fixtures above old 200/500 limits. Paginated history/chart samples disclose coverage and never decide planned completion |
| AT-STAT-03 | PROGRESS-02 | D/S/UI | Whole-run >=1 km average-pace feature preserved with honest label; no fastest 5 km/segment from session totals |
| AT-STAT-04 | PROGRESS-02 | D/S | Cycling environment/assistance/resource and swimming environment/stroke/pool/protocol/time-basis comparisons remain separate. Missing context excludes performance claims but not counts |
| AT-STAT-05 | LOG-03, PROGRESS-01 | D/UI | Unknown/null/zero and confirmed/unconfirmed effort are displayed distinctly; mixed duration basis is labelled and never sold as a physiological workload score |
| AT-STAT-06 | SCHED-01/04 | D/S | Adherence uses original linked occurrence even when actual is late; incomplete/skipped/cancelled/legacy-completed clearly distinct. Strength no longer fails adherence because of unfinished run |
| AT-STAT-07 | LIFE-02, PROGRESS-02 | S | Edit/delete/backdate updates records and subsequent best flags, all period totals and affected cached views; no stale deleted best remains |
| AT-PRIV-01 | SOCIAL-02 | DB/S | Cycling/swimming sharing defaults off; existing strength/run choice unchanged. Global shareTraining=false overrides each sport preference |
| AT-PRIV-02 | SOCIAL-01/02 | S/UI | Opted-in new sports appear only with allowed date/sport/environment/count/duration/distance; no symptoms, free notes, coach notes, private title/location, effort or advanced metrics |
| AT-PRIV-03 | SOCIAL-01 | UI/S | Existing follow approval, strength/run feed/leaderboards/compare work. New sport controls are exhaustive; unknown sport never falls into a binary run branch |
| AT-PRIV-04 | SOCIAL-02, DATA-04 | S/DB | /u shared detail reads shared row only; guessed raw IDs and forged sport filters reveal neither raw existence nor private data |
| AT-PRIV-05 | SOCIAL-02 | S/UI | Disable sharing or delete activity: projections and profile/feed/leaderboard/compare caches update immediately; re-enable rebuilds only currently consented fields |
| AT-PRIV-06 | DATA-04 | DB/S | Account deletion cascades every new owner table/job/evidence/receipt/resource/projection/token; another account survives. Auth deletion failure is not reported as successful purge |
| AT-PRIV-07 | SOCIAL-02, API-02 | S | Owner read/export can include owned private data; public projection never reuses that serializer. Export/backups include new relationships without a new privileged API |

## 10. Migration, deployment and rollback

| Test ID | Decisions | Layer | Given / action / expected result |
| --- | --- | --- | --- |
| AT-MIG-01 | MIG-01/02 | DB | Apply historical migrations unchanged, M1, legacy fixtures, backfill and M2 in isolation. Real old schemas/data are used, not only current model inserts |
| AT-MIG-02 | MIG-02, DATA-02 | DB | IDs preserved when possible; deliberate source collision yields stable namespaced map; every source/evidence/shared-stat consumer resolves the same canonical target |
| AT-MIG-03 | MIG-02 | DB | Field-by-field notes/symptoms/actual dates/units/nulls/effort/gym/workout/programme links match; dailyRecovery and all strength rows unchanged |
| AT-MIG-04 | MIG-03 | DB | Authoritative single completion among duplicate legacy links resolves only that source; other raw logs/legacy association retained. Ambiguous/conflicting candidates block reconciliation without arbitrary winner |
| AT-MIG-05 | MIG-03 | DB | Orphan/cross-owner links produce protected audit issues and block affected constraints; no foreign source attached or private data printed |
| AT-MIG-06 | MIG-02, SCHED-06 | DB | Copied completion events across versions map once where lineage/source proves equality; 0011 source-less completion remains legacy resolution without fake activity |
| AT-MIG-07 | MIG-02, COACH-06 | DB/S | v1 blueprints/day flags/programRuns/session/opening plans/templates/saved routines/proposals/memories all follow mapping table; incompatible payloads retained, not silently discarded |
| AT-MIG-08 | MIG-01/03 | DB | Re-run chunks/full backfill after interruption: no duplicate parent/detail/occurrence/event/stats/memory, unchanged correct totals/source timestamps; source-watermark changes safely rerun before switch |
| AT-MIG-09 | MIG-02, PROGRESS-01 | DB/S | Per-owner/period actual counts, distance/duration and privacy projections equivalent at recorded precision. Intentional independent-adherence change listed separately, not concealed as migration drift |
| AT-MIG-10 | TIME-01, MIG-03 | DB | Unknown historical zone labelled inferred; divergent legacy report dates surfaced for resolution instead of silently rewriting instants/date history |
| AT-MIG-11 | LIFE-05, MIG-02 | UI/E | Old strength local drafts survive; bridge run draft round-trip works; incompatible browser saves retain input and request refresh with no mutation |
| AT-MIG-12 | MIG-01 | DB/E | Before switch legacy is sole authority; after switch canonical is sole writer and old actions/service paths fail safely. No new-sport data enters legacy-only mode |
| AT-MIG-13 | MIG-04 | DB/E | Abort before first canonical write returns to legacy with equivalent data. After new-sport writes, recovery retains all new records/relationships through compatible app or tested delta replay |
| AT-MIG-14 | MIG-04 | DB/E | Restoration rehearsal verifies backup and replay checksum/cardinality/receipts; failure keeps writes paused, never deletes unsupported new-sport data to boot old app |
| AT-MIG-15 | MIG-01, NAV-04, API-01 | DB/S | M3 only after time/usage/reference gates; old raw tables removed without dropping recovery or breaking historical aliases/account deletion; applied migrations untouched |
| AT-REL-01 | OP-01–06 | Review | Environment/backup/anomaly/client/lease/window/export facts recorded before deployment; no production claim derives from local test success |
| AT-REL-02 | MIG-05 | E | Final delta/validation pause rehearses within ten minutes. Overrun aborts before switch or requires revised rollout/window; no undeclared indefinite downtime |
| AT-REL-03 | COACH-07, LIFE-05 | E | Open lifting session finishes through bridge or delays switch; no forced finish/discard. v3 queued/claimed work safely drains/expires/supersedes before v4 resumes |
| AT-REL-04 | SCOPE-04, COACH-02 | E | All four sports' promised logging/planning/coaching capability enabled and truthful; an internal partial build is not marked release-complete |
| AT-REL-05 | TEST-01 | E | iOS/Android browser and installed PWA: keyboard/unit entry, offline interruption, return online, reload, background/resume, safe-area navigation and logout tested; no reliable background timing claim |
| AT-REL-06 | TEST-01, DATA-04 | S/E | Representative populated queries have checked plans/latency and bounded pagination. Logs/telemetry reveal no credentials/private notes/athlete measurements |
| AT-REL-07 | MIG-01 | Review | Post-release monitor checks ownership errors, missing coverage, version failures and aggregate drift; first canonical write marker and rollback owner/procedure recorded |

Migration scenarios with ambiguous historical facts deliberately have a blocking expected result. They are not tests for a silently chosen guessed “correct” record.

## 11. End-to-end example journeys

These use synthetic data. They are examples of product behaviour, not recommended training prescriptions.

| Journey ID | User and actions | Acceptance |
| --- | --- | --- |
| AT-JOURNEY-01 | Lifting-only athlete opens scheduled strength from Today, changes gym equipment as currently allowed, logs supersets/RIR, reloads a dirty draft and finishes | Existing logger/progression preserved; correct tab/back; parent/projections created once; no endurance intake fields or unfinished swim lock |
| AT-JOURNEY-02 | Existing runner follows an old /runs/new?planned link, sees exact migrated target, logs actual distance/time and Not sure, then corrects notes | Shared Training form, legacy target/ID preserved, no target-as-actual RPE, history/occurrence/coach evidence consistent; old run history pace unchanged |
| AT-JOURNEY-03 | Indoor cyclist chooses Just log without gym/programme, logs 32 minutes with unknown distance, optionally adds power/cadence, reloads offline draft and retries save | Duration useful by itself; no invented speed/HR; one actual despite retry; appears in History, absent Today and programme completion; new sharing off |
| AT-JOURNEY-04 | Pool swimmer creates 8×50m with 20s between reps template, schedules it, later logs 16 lengths in 25m pool and elapsed time only | Correct 400m, actual pace absent, planned rest separate, explicit effort answer. Second session in 25yd pool retains yards/context and doesn't claim equal performance |
| AT-JOURNEY-05 | Mixed programme has Wednesday swim and run, Thursday strength, Friday two rides. Swim remains undone; strength proceeds. User logs Wednesday swim on Friday from Cycle and logs only ride A | No overdue swim on Friday Today; late swim counts original adherence and Friday actual volume; ride B untouched; coach reviews all included sports with exact occurrence IDs |
| AT-JOURNEY-06 | Beginner states a goal without choosing a routine; coach asks access/experience/time, suggests sports and weekly commitment; user edits selection and confirms | User-led sport consent, manageable form, appropriate sport-only setup, every selected sport reviewed; advanced settings remain available without mandatory data |
| AT-JOURNEY-07 | Two accounts share a device; athlete A drafts a private swim, signs out after warning; athlete B signs in and follows A's public profile | B cannot see A's draft/raw measurements; only explicitly shared projection visible; account deletion removes A's full new-schema footprint |

## 12. Release acceptance and reporting

Implementation acceptance requires all relevant tests above and existing regressions to pass, with failures resolved or an explicit scope decision recorded. Any new material design question reopens its decision rather than being hidden behind a skipped test.

Execution report must identify exact commit, migrations, fixture version, environment isolation, commands/suites actually run, browser/device checks, failures and untested areas. Snapshot updates alone cannot establish data preservation, ownership or correct coach behaviour.

Release checklist:

- [ ] P0 factual gates satisfied and baseline reconciled.
- [ ] All four sports have promised manual planning/logging and appropriate coach coverage.
- [ ] Running primary product removed in favour of shared routes; strength specialised flow intact.
- [ ] Same-day/late/duplicate/concurrent/ownership cases pass.
- [ ] Numeric/effort/unit/unknown-data contracts pass without fabricated actuals.
- [ ] Historical data/relationships/recovery/JSON/evidence/drafts reconcile; repeat backfills stable.
- [ ] Existing readers, old URLs and old clients obey explicit compatibility behaviour.
- [ ] Privacy changes, deletion and every projection/cache are consistent.
- [ ] Backup, pause, version drain and post-write recovery rehearsed.
- [ ] Mobile/PWA and accessible beginner/optional-detail journeys checked.
- [ ] Remaining limitations and measured compatibility removal dates recorded.

Planning-task result: no boxes above are marked passed merely because this document exists. Implementation and runtime verification remain future authorised work.
