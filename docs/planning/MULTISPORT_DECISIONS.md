# Overload multisport decision register

Status: submitted for Gate B review, 19 September 2026. Planning only; approval does not authorise implementation.

Read with [the implementation plan](MULTISPORT_IMPLEMENTATION_PLAN.md) and [acceptance tests](MULTISPORT_ACCEPTANCE_TESTS.md).

## Authority and interpretation

- BRIEF: fixed requirement in the user's complete inline brief.
- USER: explicitly answered during decision rounds. Later clarifications supersede earlier tentative wording.
- DELEGATED: selected by the planner under the user's final instruction: “Go with your own assumptions” and “Go with all the things or your recommendations.” These are recommendations chosen under delegation, not individual answers attributed to the user.
- OPEN-FACT: an operational fact not inspectable from source; deployment is gated until verified. Silence is not evidence of a fact.

The user asked for essentials suitable for beginners and optional metrics sufficient for more experienced athletes. Delegation settles the remaining design choices. It does not expand excluded initiatives, permit production changes, or authorise coding. There are no unapproved product recommendations being silently treated as individual user answers.

The earlier dictated labels “Code”/“code” refer to the coaching questions in context; “Live 02” refers to LIFE-02 and “Serial 04” to SCHED-04. They are recorded by subject below, without creating conflicting duplicate decisions.

Repository baseline: codex/coaching-review-improvement-plan at 766601693b27d2d607d65836d57b7d762230494f. Existing application code matches reference ad8fecac5ba8cb1b3e0a545784f50a1fa94f58a9; two later commits are planning documents. Initial untracked output/ is preserved. Evidence is source-level unless explicitly called documentation or unknown; no tests/runtime/production were exercised.

## 1. Product, navigation and entry

| ID / question | Evidence and why it matters | Options and recommendation/tradeoff | Answer / authority | Consequences and affected files |
| --- | --- | --- | --- | --- |
| SCOPE-01 — What belongs in the shared experience? | nav.ts separates Runs; strength has a specialised logger. Screen ownership must be clear | Unified entry for four sports with retained strength logger, or endurance-only entry. Recommend unified entry without replacing strength tools | USER: Today shows scheduled activities from every sport; ad hoc work belongs elsewhere; preserve lifting | Plan §2; src/lib/nav.ts; Today, Training, workout routes; blocks screen ownership, resolved |
| SCOPE-02 — Can each sport work without lifting/gyms? | Intake and plans require lifting/gym context | Sport-only accounts, or require lifting setup. Recommend sport-only; broader onboarding/contracts | USER: yes, no dummy gyms or lifting programmes | §§2,6,8; coaching-workflow.ts, welcome flow, programme materialisation; resolved |
| SCOPE-03 — Which sports launch? | Current TRAINING_SPORTS has workout/run | Add running/cycling/swimming; more sports later. Do not expose an untyped Other shortcut | USER + BRIEF: retain strength; all three endurance sports. Running can be the first internal migration slice | sport-scope.ts; typed forms/schema; additional sports deferred under delegation |
| SCOPE-04 — Logging, planning or coaching? | Current running has all three with special constraints | Logging-only is smaller; full manual planning and coach support gives coherent capability. Recommend all three | USER: manual logs, structured planning, scheduling and programme inclusion for all required sports | §§2,5,7,8; blueprint, jobs, templates; final release cannot stop at manual-only |
| SCOPE-05 — What advanced features are deferred? | Data could support much more than current manual entry | Optional summary metrics now; per-interval actuals/live execution/imports later | DELEGATED: optional detailed metrics; no new sports, GPS, timers, integrations, sensor streams, TSS/SWOLF/FTP features | §4–5; protects scope and claims of capability |
| SPORT-01 — Enabled sports and disabling? | No general sport preference model | Preferences only, or disabling removes plans/data. Recommend preferences only; explicit programme edits | USER: allow selection. DELEGATED: hiding preserves history/templates/approved plans; coach still reviews programme sports | sport preferences, profile/onboarding; no destructive toggle |
| PLAN-01 — Standalone reusable templates? | Strength savedRoutines exists; endurance relies on programme runs | Programme-only or independent templates. Recommend reusable typed templates | USER: yes | §5; saved-routine.ts/manual-training.ts adapters; template versions and snapshots |
| NAV-01 — Tabs and responsibilities? | Five current tabs; Runs mixes logging/plans/history | A) Today/Training/History/Progress/Profile; B) Today/Activities/Progress/Profile with history embedded. Recommend A; more tabs but distinct jobs | USER: accepted shared navigation recommendation; DELEGATED: final label Training and detailed ownership | §2.3; nav.ts, shell, old Runs pages |
| NAV-02 — Shared paths or per-sport trees? | /runs is entrenched in links/actions/metadata | Shared /training routes with sport filter/forms, or /training/running etc. Recommend shared paths; typed components underneath | USER: shared sports paths; specialised strength /workouts may remain | §3; canonical activity IDs and old route matrix |
| NAV-03 — Origin/back/active tab behaviour? | All workouts currently activate Today | Fixed tab ownership or validated origin. Recommend origin enum; small routing complexity prevents wrong Back labels | DELEGATED: from=today/training/history/programme/shared, validated filters, direct actuals default History | nav.ts, page-header.tsx, every detail/action redirect; no arbitrary return URL |
| NAV-04 — Legacy UI link duration? | Stored links/bookmarks/coach text may contain /runs | Immediate removal, permanent separate UI, or temporary redirects. Recommend minimum 90 days + 30-day usage gate | DELEGATED: authenticated 307 resolvers, exact planned mapping, 404/409 when unavailable; small aliases may stay while used | §3.2; routes and durable mapping; API handled separately |
| TODAY-01 — Show unfinished earlier activities? | Sequence currently can carry whole mixed day forward | Backlog on Today, compact earlier list, or programme-only earlier work | USER: today only; no earlier section. Earlier incomplete work stays visible in full programme | §2/7; Today query and Cycle. Ad hoc activity never appears as a Today card |
| ONBOARD-01 — Core beginner planning entry? | Existing intake is lifting-oriented; user needs help selecting structure | Detailed questionnaire first or goal-first progressive follow-ups. Recommend goal first | USER: typed/dictated freeform goals are core; coach suggests then user confirms | intake-form.tsx, programme-options.tsx, SpeechTextarea; no separate voice/chat service |
| ONBOARD-02 — Separate advanced flow? | User wants simplicity without withholding optional metrics | Split beginner/advanced product or common flow with optional detail | DELEGATED: one flow, per-sport experience and More options; no ability-gated features | §2.4/4; clear defaults and unknown values |
| COACH-01 — Who selects programme sports? | Coach can create programmes; adding sports affects time/access | Coach auto-adds, or user requests/confirms included sports | USER: only requested/confirmed sports; never independently add one | blueprint creation/intake/draft review; no implicit sport consent |

Concrete navigation alternatives considered:

~~~text
Selected A
Today → scheduled execution
Training → log / schedule / templates / programme
History → actual activities
Progress → measures and adherence
Profile → account, privacy, sport preferences

Rejected B
Today → scheduled execution
Activities → log + templates + programme + history
Progress → measures
Profile → account
~~~

A keeps five familiar tabs and separates actual history from planning. B saves a tab but combines several different jobs on one page. Within A, sport filters beat nested sport route trees because the user's requested cross-sport programme and history remain navigable without separate products. The full route/parameter/back matrix is in plan §3, rather than being left as an implementation choice.

## 2. Scheduling, matching and lifecycle

| ID / question | Evidence and why it matters | Options and recommendation/tradeoff | Answer / authority | Consequences and affected files |
| --- | --- | --- | --- | --- |
| SCHED-01 — Can missing one sport hold another back? | slotParts/slotStatus wait for both session and run | Combined-day lock, per-sport queues, or independent occurrences | USER: swimming cannot block running/lifting; activities progress independently. DELEGATED: retain lifting's own flexible sequence, separate dated endurance | §7; domain/schedule.ts, repository/schedule.ts; strength projection remains its own policy |
| SCHED-02 — Multiple same/mixed sport activities per day? | programRuns unique week+weekday and event part identity prohibit this | One per sport/day or distinct occurrence IDs | USER: allow multiple, including the same sport | Occurrence UUID/order and database uniqueness; never identity by sport/date |
| SCHED-03 — Fixed dates or flexible shifts for endurance? | Existing whole-sequence shifting does not fit late swims | Whole-day shift, independent queues, or fixed dates with explicit moves | USER accepted recommendation: dated endurance, late completion/reschedule allowed | Programme Cycle retains missed items; only chosen occurrence moves |
| SCHED-04 — Expire at week boundary? | User initially considered expiry then rejected it | Expire weekly or remain incomplete until acted on | USER: no week expiry; Wednesday can be logged Friday/later | Original-week adherence, actual-date volume; no scheduled expiry job |
| SCHED-05 — Multiple active programmes? | DB already enforces one active programme | Multiple concurrent programmes or one mixed programme | USER: one active mixed programme | programmes/family registry; standalone scheduling is not another programme |
| SCHED-06 — Revisions, skips, substitutions and historical work? | Current revisions copy events and carry plans by lineage | Mutate historical rows or immutable occurrence revisions | DELEGATED: preserve occurrence identity, immutable prescriptions; explicit skip/reopen/reschedule/cancel+replace; freeze completed/started/claimed work | §§6–8; program-revisions.ts, coach-plans.ts, program-patch.ts |
| SCHED-07 — Ordering, budgets and rest? | Existing rest slots and preferred days are part of sequence | Hard daily lock or independent work with availability warnings | DELEGATED: stable order, optional time, manual budget override; coach must fit confirmed budgets; rest does not forbid another sport | Calendar/scheduler/intake; no new universal cross-sport rest rule |
| SCHED-08 — Standalone scheduled activities? | User wants scheduling and programme inclusion as explicit choices | Force all plans into programme or support standalone occurrences | DELEGATED: both; standalone schedule has Upcoming/Earlier views; only active-programme work is coached | Training/schedule, Training/scheduled; no duplicate full programme list |
| LINK-01 — Automatic planned-to-actual matching? | Existing run selector can fallback; dates can coincide | Automatic match/suggestions or explicit selected target | USER: no matching or suggestions. Ad hoc stays ad hoc; selected planned log resolves exactly that ID | Save origin locked; no nearest-date/sport heuristic |
| LINK-02 — Several logs fulfilling one plan? | Raw runs can share programRunId; event may conflict silently | Many-to-one partial completion or one-to-one | USER: exactly one saved log per occurrence | DB uniqueness/receipt handling; several intervals remain one activity |
| LIFE-01 — Manual logs or live timer? | Current strength live flow exists; PWA cannot imply background recording | Manual only, timer, or both | USER: manual endurance logging; no live timer. Existing strength flow retained | No endurance start/pause/resume/background capture; draft is not an actual |
| LIFE-02 — Can a saved record be corrected/deleted? | Existing run edits/deletes have shared/completion side effects | Immutable logs or edits of same record | USER accepted clarification: edit/delete allowed; no second fulfilment; deletion reopens target | §5; transactional side effects; earlier “no changing” is not interpreted as permanent immutability |
| LIFE-03 — Partial or abandoned work? | No endurance in-progress entity today | Keep occurrence open until targets met, or explicit logged/ended early | DELEGATED: saved totals close selected occurrence; attainment separate. Unsaved form remains a draft | No silent partial multi-session completion |
| LIFE-04 — Change sport or link after save? | Cross-sport field changes invalidate metrics/privacy/evidence | Mutable sport/link with complex conversion, or stable origin | DELEGATED: sport and origin fixed; wrong sport/link corrected by explicit delete and new log. Measurements/environment editable | Simpler ownership/history; no hidden relinking UI |
| LIFE-05 — Draft/offline persistence? | Strength has protected local drafts; run form only memory | Online-only, local recovery, or full offline sync | DELEGATED: local versioned drafts and safe explicit retry, no offline-first rewrite | §5.3; per-account keys, 20 drafts/128 KB, warn before eviction, no private SW cache |
| LIFE-06 — Simultaneous saves and coach edits? | Owner serialization/job revisions help but planned forms are not protected | Blind last-write, optimistic conflict, or indefinite lock | DELEGATED: receipt + expected revision + 30-minute renewable occurrence claim; expired drafts require conflict review | withUser, activities/claims, coach acceptance; duplicate writes cannot settle two occurrences |
| TIME-01 — Backdating and time zones? | Actual instants exist; historical zone may not | Profile-zone reinterpretation or frozen actual-date context | DELEGATED: backdating allowed, save IANA/date/source snapshot; future actual start >5 min rejected; legacy zone uncertainty labelled | History/adherence split; DST validation; no arbitrary historical-age cutoff |

The lifting interpretation is explicit: its own missed strength slot may still shift under the existing flexible sequence. It no longer waits for an endurance part. Endurance occurrences never automatically roll forward. This preserves the user's “lifting should go as it is” while removing cross-sport blocking and Today’s endurance backlog.

## 3. Measurements, structure and limits

| ID / question | Evidence and why it matters | Options and recommendation/tradeoff | Answer / authority | Consequences and affected files |
| --- | --- | --- | --- | --- |
| LOG-01 — Universal form/required measurements? | Existing run fields do not suit indoor cycling/swimming | One generic form or separate forms with common mechanics | USER: each sport has its own form and requirements | §4 full matrix; typed details, not one giant nullable object |
| LOG-02 — Running duration meaning? | Current pace derives from entered distance/time | Keep current single duration or add moving/elapsed controls | USER: retain current running duration/pace approach | No implied moving time; preserve old pace formatting |
| LOG-03 — Actual effort policy? | New runs require RPE; effortReported distinguishes old targets/unconfirmed values | Mandatory number, entirely optional, or number/Not sure | USER: number 1–10 or explicit Not sure; actual only | All endurance forms; never prefill from coach target; legacy false stays unconfirmed |
| UNIT-01 — Units and pool terminology? | Existing road pace/metres logic; pool context absent | One unit system or per-sport preference/per-entry units | USER accepted: km/mi; m/yd and pool size; one length = end to end | Exact conversions; preserve native inputs; strength kg/lb preference independent |
| RUN-01 — Duration-only running? | Existing distance and duration required | Permit unknown distance or retain current running contract | DELEGATED: require positive distance and duration; duration-only rides/swims remain possible | Beginner run form familiar; running pace always supported for new logs |
| CYCLE-01 — Cycling fields/advanced detail? | No cycling model | Minimal duration/distance only or optional summary detail | DELEGATED: duration required; distance optional; environment, optional assistance/resource/HR/power/cadence/elevation | Optional advanced fields; no sensors or invented distance/speed |
| SWIM-01 — Pool/open-water measurements? | No swimming model | Require lengths/stroke/distance or allow unknown | DELEGATED: environment and elapsed duration required; distance unknown/manual/lengths; pool unit+size required only for lengths; stroke optional | Distinct form; no fabricated lengths/stroke/access |
| SWIM-02 — Pace and rests? | Elapsed includes rest, so naive swim pace can mislead | Always elapsed pace or optional active-time pace | DELEGATED: optional time excluding rests; pace only from that when known; remainder not asserted rest | active <= elapsed; no target-rest subtraction |
| STRUCT-01 — Prescription structure? | Running plan mostly scalar/prose; advanced manual planning requested | Prose, flat steps + one repeat level, or arbitrary nesting | DELEGATED: steps/phases/time-or-distance/ranges/effort and one repeat level | §5: bounded payload, meaningful validated structure, no live execution |
| STRUCT-02 — Actual interval results? | None currently; adds UI/storage/measurement burden | Session totals or per-step actuals | DELEGATED: session totals only; actual may differ from target; preserve prescribed structure | Advanced per-interval actuals explicitly deferred |
| ACTUAL-01 — Prefill actuals from plans/templates? | Existing form preselects target distance/time | Prefill targets or blank actual measures | DELEGATED: actual measurements blank; target visible separately. Context such as sport/pool may preselect | No inadvertent target-as-performance; actual effort always explicit |
| UNIT-02 — Precision and numeric caps? | Running's 100 km/~10h caps are unsuitable as universal limits | Reuse old caps or choose independent engineering bounds | DELEGATED: §4.6 exact matrix, central parity. 7-day duration; 1,000 km run/swim, 10,000 km cycle; confirm unusually large entries | Limits are error guards, not training prescriptions; legacy outliers preserved unchanged |
| FIELD-01 — Optional title/notes/location/equipment? | Run notes/surface/links and gym constraints already exist | Force gym/general location or optional sport resources | DELEGATED: private title/notes/resource snapshots; pool/bike/trainer independent of gym; no maps | Preserve legacy links; no public custom location/title leak |

All requirement/default/unit/validation/entered-versus-derived details are normative in plan §4. Bounds are delegated design choices, not numbers the user supplied or limits claimed by the researched apps. Unknown and explicit zero remain distinct.

## 4. Architecture, coaching and interfaces

| ID / question | Evidence and why it matters | Options and recommendation/tradeoff | Answer / authority | Consequences and affected files |
| --- | --- | --- | --- | --- |
| DATA-01 — Shared parent or separate roots? | History/completion/shared stats repeatedly union strength/runs | Common parent + typed details; endurance-only parent; copied tables; nullable JSON table | DELEGATED: common activity parent with existing strength detail tables retained. More migration effort, simpler identity/ownership downstream | §6 ER/contracts; schema and transactional lifecycle; full rewrite rejected |
| DATA-02 — Occurrence/version identity? | Week+weekday and cycle/day/part cannot distinguish repeated sessions | Date/sport identity or UUID occurrence + immutable revision | DELEGATED: UUID occurrence, lineage/family/cycle, prescription revision, unique actual, explicit event log | Schedule/programme/coach/API all use same identity |
| DATA-03 — Resource model? | Multi-gym machine identity must remain meaningful | Dummy gyms, arbitrary strings only, or optional owned resources | DELEGATED: lightweight pool/bike/trainer/venue identities and per-record snapshots; strength equipment unchanged | Separate resources table and ownership; no location tracking |
| DATA-04 — Integrity/privacy boundaries? | Existing RLS; some polymorphic/source links not FK-backed | App-only validation or DB owner/sport keys | DELEGATED: composite owner FKs, typed-detail constraints, RLS, atomic receipts/stats; one active programme | §6/9; ownership attacks fail below the UI layer |
| DATA-05 — Future import readiness? | Source references exist; no providers authorised | Build integration framework or minimal provenance | DELEGATED: manual/legacy source kind, original ID mapping, source revision/idempotency boundary only | No provider endpoints, streams or unused credential infrastructure |
| COACH-02 — Daily prep and periodic review scope? | v3 supports bounded adjustment and programme proposals | Logging-only new sports, optional per-sport review, or complete programme review | USER: preserve current daily/review behaviour for every included sport; it is not optional per sport | §8; all-sport coverage validated, sparse evidence can hold changes |
| COACH-03 — Overall coaching switch/manual programmes? | Existing AI consent flag | Remove switch or preserve overall consent | USER accepted: overall switch preserved; when on, included sports/manual programmes reviewed | Consent rechecked on jobs/results; no per-sport omission |
| COACH-04 — Ad hoc evidence? | Current running affects quiet-day/review evidence | Ignore ad hoc or use workload context | USER accepted: use context only; no automatic ad hoc coaching/plan matching | trainedOn/context/evidence include all actual sports |
| COACH-05 — New-sport automatic progression? | Running numerical/symptom policy is not transferable | Copy run rules, all changes approved, or approved adjustment envelopes | DELEGATED: automatic only inside user-approved cycling/swimming ranges; otherwise proposal. Retain existing strength/run safeguards | Sport policy/tests and proposal bounds; no universal safety percentage |
| COACH-06 — Contract and stored JSON migration? | v1 blueprint, v3 worker, optional single run, old summaries | In-place reinterpretation or explicit versions/adapters | DELEGATED: blueprint2, contract4, sessionPlan2, intake2, memory2, change-policy3; retain original old payloads | §8.1; scripts, services, skill and saved proposals move together |
| COACH-07 — Jobs/leases at rollout? | One daily target/user, 15-minute lease, three attempts | Translate old jobs live, drain forever, or pause/supersede | DELEGATED: pause/drain or expire then supersede v3; v4 jobs per occurrence/revision, serial athlete claim; reject old results | No worker skew mutations; 48-hour bounded preparation lookahead |
| COACH-08 — Revisions and started/prepared work? | carryPlansToRevision can move plans by day lineage | Rewrite everything or freeze historical/pinned work | DELEGATED: completed/started/claimed target frozen; changed future plans superseded; old proposals retained for explicit review | sourceRevision/target checks; no silent other-sport prescription rewrite |
| COACH-09 — Evidence/memory IDs? | run:<UUID> evidence and run:<weekday> scope are distinct | Rename all strings or keep durable aliases | DELEGATED: old IDs resolve through owner map; new activity IDs/revisions, sport-tagged memory, exact quote provenance | Retain historical reports; no false freshness during conversion |
| API-01 — Existing read API compatibility? | /api/coach/running documented and used by scripts | Break endpoints, silently alter JSON, or explicit v1 projection | DELEGATED: v1 >=180 days + usage gate; full-lossless programme translation or upgrade_required; no UI redirect substitute | §8.6; tokens remain read-only; v1 legacy-sport coverage documented |
| API-02 — New API pagination/export? | Bounded read APIs; summary sampling can truncate | Unbounded payload or cursor/aggregate separation | DELEGATED: v2 typed owner reads, 50/100 page size, full SQL aggregates, explicit date/coverage, paged export boundary | No new privileged API/export app; external consumer facts remain OP-06 |

## 5. Progress, privacy, rollout and validation

| ID / question | Evidence and why it matters | Options and recommendation/tradeoff | Answer / authority | Consequences and affected files |
| --- | --- | --- | --- | --- |
| PROGRESS-01 — Cross-sport totals? | Analytics currently strength/run; lifting adherence shares a day state | Universal score or meaningful common counts with sport measures | DELEGATED: counts/days/recorded duration common; distance/pace/tonnage/adherence per sport | §9; SQL totals independent of history caps; unknown counts disclosed |
| PROGRESS-02 — Comparable performance and records? | Whole-run averages, machine-specific strength, missing segment data | Broad mixed bests or context-specific honest metrics | DELEGATED: preserve existing strength/run features; new whole-session duration/distance and comparable context; no fake segments | Edited/deleted records recompute; unknown context excluded from performance claims |
| SOCIAL-01 — New sports in existing social surfaces? | Shared-stat infrastructure supports only workout/run | Defer all social visibility or add safe participation projection | DELEGATED: opt-in new-sport participation/count/time/distance in existing feed/profile/compare/boards; no speed/power competition or new social system | §9.2; explicit enums/UI; existing features preserved |
| SOCIAL-02 — Sharing defaults and sensitive fields? | Global shareTraining intentionally separate from raw private data | Automatically inherit all sharing or new sport opt-ins | DELEGATED: preserve current strength/run choice; cycle/swim opt out by default, global upper gate; no private notes/effort/advanced metrics/location | RLS, allowlisted projection, cache invalidation, account deletion |
| MIG-01 — Rollout style? | Existing deploy can migrate DB; open clients/workers persist | Single destructive switch or staged expansion then controlled cutover | DELEGATED: expand/backfill/verify/short write pause/switch/contract; one authority at a time | §10, P0–P8; no new-sport writes before switch, no indefinite dual writes |
| MIG-02 — What must survive? | Runs carry symptoms/links/provenance; recovery shares file; events copied across versions | Reset/restart or lossless field/identity mapping | BRIEF + DELEGATED: retain raw records, immutable history, all listed JSON/proposals/evidence/drafts; deterministic ID mapping | Migration table §10.2 is mandatory, not optional cleanup |
| MIG-03 — Existing duplicate/orphan ambiguity? | Schema permits ambiguities; production state unknown | Guess earliest/delete duplicates or evidence-based mapping and stop on uncertainty | DELEGATED: authoritative unique event may resolve; otherwise preserve all data and block affected reconciliation for factual review | No imagined production row condition; OP-02 gate |
| MIG-04 — Rollback after new writes? | Old app cannot represent cycling/swimming | Promise old-app rollback or preserve canonical data with replay/roll-forward | DELEGATED: pre-write legacy rollback; post-write compatible rollback/roll-forward or verified backup+full delta replay | §10.6; no lossless rollback claim without rehearsal |
| MIG-05 — Downtime/backups/retention assumptions? | No production access in planning | Assume empty DB/instant migration or bounded rehearsed pause | DELEGATED: valuable live data; maximum ten-minute planned write pause, tested backup/restore, no deletion to fit window | OP-01–05 factual gates. If rehearsal fails, redesign or obtain another window; no deployment authorised here |
| TEST-01 — Existing versus proposed tooling? | Vitest/PGlite/Testing Library/jsdom installed; no Playwright | Claim browser coverage now or propose needed tooling/manual checks | DELEGATED: existing isolated suite plus required browser/mobile/PWA journeys; browser runner optional implementation addition | §12.3/acceptance doc; no dependencies installed during planning |
| TEST-02 — Completion and release scope? | User forbids implementation without new instruction | Stop after plan or treat plan approval as coding permission | BRIEF: three planning files only; separate explicit implementation instruction required | No application tests/runtime run; final Gate B submission stops |

## 6. Remaining factual gates

No unresolved product/design question remains after the user's delegation. These are factual release blockers, not assumed answers:

| ID | State | What must be established | Blocks |
| --- | --- | --- | --- |
| OP-01 | OPEN-FACT | Actual deployed app/schema and production/staging separation | Database/deployment execution |
| OP-02 | OPEN-FACT | Counts, duplicates, ambiguous links and historical JSON/data conditions | Constraint validation and cutover |
| OP-03 | OPEN-FACT | Verified backup, restore and post-write replay capability | Cutover and contract |
| OP-04 | OPEN-FACT | Open sessions, browser versions, worker leases and reader inventory | Safe bridge/cutover |
| OP-05 | OPEN-FACT | Rehearsed time within chosen ten-minute pause ceiling | Release scheduling; longer downtime is not silently assumed |
| OP-06 | OPEN-FACT | External export/read consumers absent from repository | Compatibility removal and export completeness |

If implementation discovers a product conflict that the decisions do not resolve, record it as open and return it for decision. If source or production inspection disproves a baseline assumption, update the evidence and affected phases before proceeding. Do not hide the conflict in an appendix while claiming readiness.

## 7. Decision-to-acceptance trace

| Decisions | Acceptance families |
| --- | --- |
| SCOPE/NAV/TODAY/SPORT/ONBOARD | AT-NAV, AT-ONBOARD, AT-JOURNEY |
| LOG/UNIT/FIELD/RUN/CYCLE/SWIM/ACTUAL | AT-LOG, AT-STAT, AT-PRIV |
| PLAN/STRUCT | AT-STRUCT, AT-SCHED |
| SCHED/LINK/LIFE/TIME | AT-SCHED, AT-LIFE, AT-DATA |
| DATA | AT-DATA, AT-MIG, AT-REG |
| COACH | AT-COACH, AT-API |
| API | AT-API, AT-REL |
| PROGRESS/SOCIAL | AT-STAT, AT-PRIV |
| MIG/OP | AT-MIG, AT-REL |
| TEST and all fixed exclusions | AT-BASE, AT-REG, AT-JOURNEY, release checklist |

Gate A is satisfied by explicit answers plus the final delegation for remaining choices. Gate B is this complete plan submitted for review. Neither gate authorises implementation.
