# Overload multisport implementation plan

Status: implementation specification submitted for Gate B review, 19 September 2026.
Planning only. No implementation, migration, production inspection, deployment, or coaching run is authorised by this document or by approval of this plan.

Read with [the decision register](MULTISPORT_DECISIONS.md) and [acceptance tests](MULTISPORT_ACCEPTANCE_TESTS.md).
Explicit answers take priority over delegated decisions. The user subsequently authorised the planner to settle remaining choices using judgment, recommendations, and established app patterns. Those choices are labelled D in the register, not represented as individual user answers.

## 1. Baseline, evidence, and readiness

### 1.1 Checkout

- Repository: Vinit-Chandak/gym-tracker; product: Overload.
- Branch: codex/coaching-review-improvement-plan.
- HEAD: 766601693b27d2d607d65836d57b7d762230494f.
- Reference main: ad8fecac5ba8cb1b3e0a545784f50a1fa94f58a9, 18 September 2026.
- The two commits after that reference change only docs/planning/COACHING_REQUESTS_AND_PROGRAMME_DIFF_PLAN.md and docs/planning/COACH_TRAINING_REFERENCE.md. Application code at HEAD therefore matches the reference commit.
- Initial working tree: untracked output/ only. Do not modify, remove, commit, or use its database contents. The three multisport documents did not exist before this task.
- Cached origin/main is not proof of current remote or deployment. No fetch or production connection was made.
- OVERLOAD_MULTISPORT_PLANNING_AGENT_PROMPT.md was not found in the checkout; the complete inline user brief is the task authority.
- Root AGENTS.md and CLAUDE.md were read. No applicable nested instructions were found under the affected source/docs/scripts trees. Installed Next 16.3.4 guides for dynamic routes, mutation, redirect, and revalidatePath were consulted; implementation must use this installed documentation rather than assumed older conventions.

Inventory covered all 706 tracked paths using git ls-files, plus applicable instructions and relevant ignored-file existence checks. The appendix records the tracked inventory. Application dependency review followed imports, consumers, SQL, schemas, actions, scripts, fixtures and tests, not just run-named paths. Historical SQL was inspected as migration evidence, not as editable live code.

### 1.2 Evidence labels

- V: verified source/schema/SQL or repository metadata.
- D: documentation only, including prior design decisions not implemented.
- T: observed test/runtime result. There are no T claims in this planning task.
- U: unknown operational fact; must be verified before deployment.

No tests, build, type generation, development server, seed, migration, coach script, external mutation, dependency installation, commit or push was run. Existing tests were inspected. Source reads do not establish production row counts, data health, applied migration state, permissions in a deployed database, or enabled rollout flags.

### 1.3 Existing decisions and documentation disagreements

Preserve the six agreed decisions in COACHING_REQUESTS_AND_PROGRAMME_DIFF_PLAN.md: Programme → Cycle is the full programme home; Changes is the review/diff home; explicit programme requests are assessed on the next scheduled daily run; requested changes are proposed for approval; diffs group real changes by day; approval covers the reviewed set. This multisport plan adapts identities/contracts and the Cycle/Changes presentation but does not silently absorb the separate request-tracking implementation or the training-reference integration proposal. Those remain separately scoped work, with their approved behaviour retained as a compatibility requirement.

Disagreements verified against code:

| Documentation | Current code evidence | Treatment |
| --- | --- | --- |
| ADR 0007 describes older optional effort/navigation/schedule behaviour | runs action requires actual RPE; nav has five tabs; schedule waits for both parts | Use code baseline; intentionally change effort to rating or Not sure under LOG-03 |
| README/older Today documentation places running targets on Today | Today gates coach state on includesLifting; Runs owns the running plan card | Replace sport ownership under the approved Today/Training split |
| ADR 0025 describes weekday-derived review | coach-cadence/coaching-jobs use elapsed 7–10-day eligibility and actual quiet-day evidence | Preserve current cadence; do not resurrect an obsolete fixed weekday |
| coach-api documentation narrows e1RM to barbell | analytics/shared stats and ADR 0026 include dumbbell | Preserve current exercise-specific rules; correct docs during API phase |
| Older quiet-day wording refers to starting workouts | trainedOn checks non-warm-up sets and runs | Extend the actual-work test to cycling/swimming, including ad hoc work |
| Prior plans contain proposed requests/reference features | branch delta is documentation only | Do not describe these as already shipped |

### 1.4 Operational facts and release gates

Product and architecture choices are resolved by answers or explicit delegation. Implementation can be planned from this specification; deployment is not cleared. The following factual checks belong to P0 and the release checkpoint, rather than being invented:

| Gate | Unknown | Required resolution |
| --- | --- | --- |
| OP-01 | Actual production/staging projects, database versions and migration journal | Operator records environment topology and verifies staging has an isolated database; never assume a preview is isolated |
| OP-02 | Counts, duplicates, orphan/cross-owner links, old JSON variants, date inconsistencies | Read-only inventory and reconciliation report; apply the deterministic policy in §10 or halt on a case needing factual correction |
| OP-03 | Backup/PITR availability and tested recovery time | Verified backup and isolated restore rehearsal before switching writes |
| OP-04 | Active lifting sessions, open browsers, worker versions, live leases and read API clients | Census, bridge release, lease drain and compatibility checks |
| OP-05 | Acceptable downtime and actual migration duration | Plan for an off-peak write pause of at most ten minutes; rehearsal must demonstrate this. If not, redesign rollout or obtain a different window before deployment |
| OP-06 | Any external export pipeline not present in source | Inventory consumers; existing read tokens remain read-only, and private data exports use the versioned owner-scoped read contracts |

Assume nonempty, multi-user production with active programmes and valuable historical data. No loss, reset, or programme restart is an acceptable shortcut.

## 2. Scope, terminology, and experience

### 2.1 Release boundary

Ship strength, running, cycling and swimming in a shared experience. Running is migrated into it, not left as a separate product. All three endurance sports support manual logging, standalone scheduling, reusable templates, multi-week programmes, and coaching when the user enables coaching. Every sport in a coached programme is reviewed; sparse evidence may yield no change or a clarification, not silently omitted coverage.

Preserve the strength logger, check-ins, rest timer, supersets, custom exercises, gym equipment, portable/nonportable load rules, set drafts, effort semantics and exercise history.

No nutrition/calorie targets; wearable/health connections; native/watch apps; GPS recording, route maps, social-system replacement, import service, sensor streams or automatic activity detection. Walking in a run/walk prescription is a step, not a newly supported standalone sport. Walking/hiking, rowing, general cardio, mobility/yoga and Other as separate sports are deferred. Existing mobility/strength exercises remain available.

Beginner forms expose essentials. Optional details expose manual summary metrics for advanced users. Manual interval-by-interval results, nested repeat blocks, live endurance timing, zones/FTP testing, TSS/normalized power/SWOLF, race-segment records and live interval execution are deferred. This release does not promise parity with every feature in another app.

### 2.2 Vocabulary

| Term | Meaning |
| --- | --- |
| Sport | strength, running, cycling or swimming; UI labels Strength, Running, Cycling, Swimming |
| Activity / logged session | One actual bout of training, with one sport; may be planned or ad hoc |
| Workout | Retain where strength screens and legacy contracts use it; use Activity in shared screens, not a mechanical database-wide rename |
| Programme | One active, versioned, multi-week routine that may contain several sports |
| Template | Reusable prescription without a performance date or actual results |
| Slot lineage | The persistent training role across programme versions; distinct from weekday or sport |
| Scheduled occurrence | One identifiable intended performance, with its prescription revision and effective scheduled date |
| Session plan | Coach preparation for one exact future occurrence, not authority to rewrite the programme |
| Interval / step | A part of a prescription, such as work, recovery or warm-up; not another activity |
| Training day | A local calendar date containing zero or more activities; not a shared completion lock |
| Length | One trip from one end of a pool to the other; do not use an ambiguous lap input |

### 2.3 Navigation and screen ownership

Five tabs: Today / Training / History / Progress / Profile.

~~~text
Today
  Today's scheduled activities, ordered by chosen time/order
  [Strength: planned session] [Swimming: planned session]
  Each card has its own state and action
  Completed scheduled cards collapse into Completed, with actual date if different
  No earlier-activity section; no ad hoc activity cards
  Programme shortcut
  Empty: Nothing scheduled today → Open Training

Training
  Sport filter: All / Strength / Running / Cycling / Swimming
  Log an activity
  Schedule an activity
  Standalone schedule → Upcoming | Earlier
  Templates
  Current programme → Cycle | Changes
  Resume an ad hoc strength session or recover an endurance draft

Programme → Cycle
  Full programme, grouped by dates/weeks and filterable by sport
  Logged / incomplete / skipped / cancelled / legacy-completed status
  Open an earlier occurrence to log it late; reschedule or skip explicitly

History
  Actual completed activities by actual date
  Sport/date/environment filters; existing strength equipment/exercise filters
  Includes ad hoc and planned logs; detail/edit/delete

Progress
  Aggregate participation plus separate per-sport metrics and adherence
~~~

Training does not duplicate History's completed list or Today’s execution list. It is the entry and management page. Programme Cycle is the one full programme view. Existing profile links become shortcuts/compatibility redirects to its new home.

Today uses effective scheduled date, in the scheduling zone. Endurance does not automatically roll missed activities forward. Strength retains its flexible sequence: its own next pending slot is assigned to today under the existing shift/rest policy; only that strength projection may move, independently of endurance. Preserve the original projected date separately. This resolves the user's request to retain lifting behaviour while keeping old endurance work off Today; do not implement a cross-sport backlog section. Fixed-date standalone strength activities are displayed on their explicitly selected date.

An active ad hoc strength workout remains resumable from Training and the existing shell strip outside Today; it is excluded from Today. Planned strength can resume from its scheduled card. No endurance in-progress timer state is introduced.

### 2.4 Onboarding and sport preferences

Manual users: select sports, then Just log or Build a programme. No gym, body measurements, or coach intake is required for endurance logging.

Coach users start with a prominent typed/dictated goal: Tell the coach what you want to achieve. Sport preferences can be stated or left undecided. Ask only essential follow-ups before generating a draft; suggestions are proposals, not permission to activate unrequested sports. The review clearly lists included sports and weekly commitments. Confirmation authorises that programme. Existing SpeechTextarea/browser and keyboard dictation are reused; no new audio/chat infrastructure is implied.

Use one flow with More options, not an ability-gated beginner/advanced feature split. Experience is per sport. Collect goal, recent activity, restrictions, availability/time budget, selected sports, environment/access, and relevant sport knowledge. Strength asks for its gym/home equipment; swimming asks ability, pool/open-water access and known pool/stroke details; cycling asks indoor/outdoor, assistance and available bike/trainer. Unknown stays unknown. Preserve the current age/height/weight intake path for strength coaching; ask only relevant missing information for endurance, with unknown body measurements allowed when no derived prescription depends on them. Do not invent thresholds, swim competence, medical clearance, or equipment.

Enabled sports personalise shortcuts/default filters. Disabling one preserves history, templates and already approved programme commitments, with an explicit explanation. Removing a sport from a programme is a programme change requiring confirmation, not a preference side effect. Coaching remains one explicit overall switch; when enabled it covers every included programme sport, even for manually built programmes. Standalone/ad hoc work informs context but is not independently coached.

## 3. Routes, navigation context, and compatibility

### 3.1 Canonical route map

These are proposed new paths unless marked existing.

| Route | Responsibility |
| --- | --- |
| /today (existing) | Scheduled execution view described above |
| /training | Shared entry and management page; optional sport filter |
| /training/new?sport=running | Ad hoc entry using the selected sport form |
| /training/new?occurrence=<uuid> | Log that exact planned occurrence; sport inferred, association locked |
| /training/schedule?sport=swimming&template=<uuid> | Schedule a standalone activity or explicitly add one to the active programme |
| /training/scheduled | Upcoming/earlier standalone scheduled work; programme work remains in Programme Cycle |
| /training/activities/<activityId> | Owned activity detail; strength delegates to its specialised route |
| /training/activities/<activityId>/edit | Correct the same endurance record |
| /training/templates, /training/templates/new, /training/templates/<id>/edit | Reusable template management |
| /training/programme | Cycle view; ?view=changes selects Changes; sport/week filters |
| /training/programme/occurrences/<id> | Planned prescription, status, log/reschedule/skip; accessible for earlier dates |
| /training/programme/create, /manual, /drafts/<id>, /jobs/<id> | Programme creation and review destinations |
| /workouts/<sessionId> and existing descendants | Existing strength logger/check-in/finish/substitution routes |
| /history, /progress, /profile, /u/... (existing) | Continue with expanded sport awareness |
| /u/<username>/activities/<sharedStatId> | Shared-stat detail only, never a raw owned activity object |

Use a sport filter and typed form components, not separate run/cycle/swim route trees. Missing sport on /training/new opens the chooser; enabled sports are shown first. Unknown supplied sport or duplicate singleton parameters give a readable 400-style invalid-selection state, not silent fallback to strength/running. Existing social aliases sport=workout/run translate to strength/running during compatibility.

An occurrence and a template are different inputs. Reject conflicting sport/occurrence, foreign IDs, incompatible template sport, completed/cancelled occurrence, and ambiguous legacy mappings. Do not fall back to the first unlogged plan. Foreign and missing owned records both produce 404; stale writes produce 409. Deleting an activity makes its detail 404 and its occurrence loggable again unless cancelled by an explicit programme change.

Allow only a bounded navigation context: from=today|training|history|programme|shared, with validated sport/week/period/cursor values. Do not accept arbitrary return URLs. Back from edit goes to detail; detail returns to validated origin. Direct owned completed links default to History; direct unsaved/planned links default to Training/Programme. Active tab follows this origin rather than treating every workout route as Today. Shared detail returns to the person's page with Profile selected. Browser back continues to work normally.

### 3.2 Old-to-new matrix

| Old route/input | Compatibility result |
| --- | --- |
| /runs | 307 to /training?sport=running |
| /runs/new | 307 to /training/new?sport=running |
| /runs/new?planned=<programRunId> | Authenticate/resolve durable legacy map, then 307 to /training/new?occurrence=<id>; unresolved/foreign/deleted gives explanatory unavailable state, never another target |
| /runs/<runId> | Resolve owned mapped activity, then 307 to canonical detail; retain ID when feasible |
| /runs/<runId>/edit | Resolve owned mapped activity then 307 to canonical edit |
| /profile/programme and descendants | 307 to corresponding /training/programme destinations, preserving validated draft/job IDs and filters |
| /profile/routines | Shortcut/307 to /training/templates?sport=strength; existing saved routine storage still used |
| /today/choose | Retain strength choice behaviour, add correct return context; no run-only day labelled Rest |
| /settings/... existing aliases | Continue through existing profile compatibility, then new destinations where applicable |
| Legacy form POST/server action | Bridge supports safe running-only translation before cutover; after switch require new mutation contract or return refresh-required without mutation |
| /api/coach/running and other v1 reads | Keep v1 JSON contract through a read adapter; do not redirect an API response to HTML or v2 |
| /api/coach/service legacy writes | Refuse once new workflow is active, even if an old rollout flag is accidentally disabled |

UI aliases remain at least 90 days after cutover. Review at day 90; removal requires 30 consecutive days with no meaningful legitimate legacy usage plus updated first-party links, stored coach links and documentation. Keep a lightweight redirect if legitimate bookmarks remain; set a follow-up removal decision rather than indefinite parallel product code. Public read API v1 has a separate minimum 180-day window (§8).

Audit metadata, typed Routes, shell SECTION_LABELS/isNavItemActive, action redirects, revalidatePath, previews, programme links, social filters and persisted coach/request URLs. The installed Next docs specify async params, redirect outside caught mutation errors, and dynamic revalidation patterns with an explicit page/layout type. Avoid assertions that hide invalid route types.

## 4. Logging fields and measurement contracts

### 4.1 Shared mechanics, not a universal form

Forms: RunningForm, CyclingForm, SwimmingForm. Only date, effort, notes, validation presentation, unit controls and submission/draft mechanics are shared components. Sport-specific details remain typed columns/contracts.

Actual measurements start blank. Targets appear separately. Template values are prescriptions, never saved actual results. Defaults may choose units/environment from the user's preferences or selected occurrence, visibly; never default effort, heart rate, power, distance, duration or stroke performance.

Notation: R = required for a new completed log; O = optional; C = required when a particular input method is used. All quantities are entered manually unless labelled derived. Unknown is null, never a fabricated zero. Strength's existing set requirements remain separate.

### 4.2 Common field dictionary

| Field | Requirement and default | Storage/display | Validation/source |
| --- | --- | --- | --- |
| id, userId, sport | R; server/client-generated stable activity UUID; authenticated owner; immutable sport after save | UUIDs; new ActivitySport enum | Owner and sport checked in app and DB; no client-selected owner |
| startedAt, recordedTimeZone, occurredOn | R; local now offered, editable/backdatable | timestamptz + IANA zone + local date snapshot; local date/time UI | Valid local timestamp; DST ambiguity requires offset choice; future actual start beyond 5-minute clock tolerance rejected; no arbitrary historical age limit |
| timeZoneSource | R | entered/profile_at_entry/legacy_profile_snapshot | Legacy source uncertainty retained; changing profile zone does not rewrite saved dates |
| title | O, default sport/template title | text max 120 | Private custom text; shared title generated from approved sport labels |
| effortValue, effortStatus | R answer: 1–10 or Not sure | numeric(3,1), reported/unknown/legacy_unconfirmed | Explicit Not sure = null/unknown. No target prefill. Legacy unconfirmed values retained and never promoted automatically |
| notes | O, blank | text max 4000 for new edits | Private athlete text; old longer values retained unchanged during migration |
| occurrenceId, performedRevisionId, performedPlanId | All null for ad hoc; first two required for planned; prepared-plan ID only when used | UUID FKs | Exact same-owner/sport occurrence, base revision and optional immutable coach preparation; one actual per occurrence, no automatic matching |
| outcome | Default logged; optional ended_early | enum | Saving closes the occurrence even below target; attainment and completion are separate |
| sourceKind, sourceReference | R manual or legacy_manual; reference optional | bounded typed metadata | Original raw identity retained through migration map. No provider integration framework |
| revision, submissionKey | R server revision/client UUID | integer/UUID | Optimistic concurrency and idempotency; not sport measurements |

Start time precision remains minutes in the basic date control, with seconds supported when entered; retain existing timestamptz precision on migration. Record actual date independently of planned date. Backdating affects that actual period and invalidates later affected records/evidence, not another occurrence.

The required effort answer in this matrix applies to new endurance logs. Strength retains its existing set RIR/check-in semantics; a common parent does not introduce a mandatory extra session RPE or derive it from set targets. Parent session-level effort may be unknown where it was never recorded.

### 4.3 Running

| Field | Requirement/default | Storage/display | Validation/derivation |
| --- | --- | --- | --- |
| environment | R; selected occurrence/last used, otherwise outdoor | outdoor/treadmill | Explicit enum; preserve legacy mode |
| distance | R | canonical numeric(14,6) metres + original entered value/unit; km or miles | >0, max 1,000 km for new values; legacy zero retained but not eligible for pace |
| duration | R, blank | integer milliseconds; minutes/seconds, optional hours | Whole seconds; >0 through 7 days. One recorded duration; do not reinterpret as moving time |
| pace | Derived | seconds/km internally; display /km or /mile | recorded duration / recorded distance; preserve old one-decimal computed values through v1 formatting |
| six existing shin readings | O | integers 0–10 | Preserve side and pre/during/post; private and running-specific |
| surface | O, More details | bounded text max 80 | Preserve existing surface column even when old UI used notes |
| elevation gain / treadmill incline | O, More details | metres / percent | Gain 0–100,000m; incline -100 to 100%; not derived from a map |
| average/max HR, running cadence | O, More details | bpm / steps per minute | Common advanced bounds below; no automatic zones |

Retain run-specific history/symptom logic. Do not apply it to other sports. No separate moving/elapsed control for running, per explicit instruction.

### 4.4 Cycling

| Field | Requirement/default | Storage/display | Validation/derivation |
| --- | --- | --- | --- |
| environment | R, no fabricated first-use default | outdoor/indoor | Selected plan or last explicitly chosen setting may preselect |
| duration | R, blank | integer ms; h:mm:ss | Whole seconds, total recorded ride duration including stops, >0 through 7 days |
| distance | O | canonical metres + native value/unit; km/miles | 0–10,000 km; null unknown, zero explicitly reported zero |
| average speed | Derived only if distance known | m/s internally, km/h or mph | distance / recorded duration; label overall average, not moving speed |
| assistance | O, unknown default | unknown/unassisted/assisted | Unknown never silently treated as unassisted; private comparisons separate categories |
| bike/trainer | O, More details | owned resource ID plus display snapshot | No gym requirement; resource identity matters to comparable power/cadence |
| average power, average cadence | O, More details | watts / rpm | Power 0–5,000 W, cadence 0–300 rpm; zero valid, null unknown |
| average/max HR, elevation gain | O, More details | bpm / metres | No inferred sensors, normalized power or threshold testing |

### 4.5 Swimming

| Field | Requirement/default | Storage/display | Validation/derivation |
| --- | --- | --- | --- |
| environment | R | pool/open_water | Explicit choice; no GPS data needed |
| elapsed session duration | R | integer ms; h:mm:ss | Includes rests, >0 through 7 days; whole seconds basic entry, tenths allowed in detailed entry |
| swimming time excluding rests | O, More details | integer ms; supports tenths of a second | >0 and <= elapsed; never subtract prescribed rest to fabricate this |
| distance method | O | unknown/manual/lengths | One authoritative input method |
| manual distance | C for manual method | canonical metres plus original m/yd quantity | 0–1,000 km engineering ceiling; zero gives no pace |
| pool length and unit | C for lengths method, otherwise O | native decimal(14,6) m/yd and canonical metres | >0 through 1,000 native units; presets 25m/50m/25yd plus custom; no forced rounding to a standard pool |
| completed lengths | C for lengths method | positive integer, <=1,000,000 | distance = actual entered lengths × actual pool size; distance field read-only in this mode; switching to manual clears lengths as an asserted actual total |
| stroke | O, unspecified | freestyle/backstroke/breaststroke/butterfly/mixed/drill/unspecified | Mixed has no invented breakdown |
| pace | Derived if swimming time and positive distance known | seconds/100m or /100yd | swimming time / distance × 100 in chosen unit; elapsed-only records display duration, not an invented active pace |
| average/max HR, stroke count | O, More details | bpm / count | Stroke count integer 0–1,000,000, defined as athlete-reported total; no derived SWOLF without per-length times |
| pool/venue label | O | owned private resource/display snapshot | Pool size belongs to this record even if a resource default later changes |

Rest is not assumed equal to elapsed minus swim time: that gap may include other non-swimming time. Show it only as non-swimming time if useful, not as measured interval rest. Planned rests belong to the prescription.

Open-water logs reject the lengths method and pool-size/count assertions. They can use a private venue label and optional manually reported distance. No pool metadata is invented to support the shared form mechanics.

### 4.6 Units, bounds and precision

- Exact conversion factors: mile = 1,609.344 m; yard = 0.9144 m. Use decimal arithmetic for persisted conversion, retaining original entered value/unit. Do not repeatedly round on edits or preference changes.
- Canonical distance numeric(14,6); displayed road distance normally 2–3 decimals in km/mi, swim distance up to 2 decimals in m/yd, with fuller precision available in edit. Pool length accepts up to six decimals. Round derived display only, never each length before summing.
- Running/cycling display pace/speed to whole seconds/one decimal respectively; swimming pace to one decimal second. Calculations use stored precision. Records compare unrounded values.
- Average HR 20–300 bpm; max HR 20–300 bpm and >= average when both entered. These are input error guards, not medical training zones. Running cadence 0–400 steps/min; cycling cadence 0–300 rpm. Non-finite numbers always rejected.
- Large-entry confirmation warnings: running >100 km or >10 hours; cycling >500 km or >24 hours; swimming >20 km or >12 hours. These warn of likely entry/unit errors, are confirmable, and are not training prescriptions. Confirmed values within the engineering caps are accepted.
- Shared seven-day duration ceiling is a software bound chosen independently of the old running ten-hour control. Sport distance caps differ. Changed inputs enforce new bounds; historical values outside new UI limits are preserved and flagged for inspection rather than truncated. Notes-only edits do not coerce unchanged legacy measurements.
- One central typed limits module feeds UI, Zod and SQL checks. Database constraints enforce intrinsic ranges and consistency; legacy exceptions require a migration-only provenance state, not a user-settable bypass.
- Strength units and equipment/load comparability are unchanged. Do not derive distance preferences from kg/lb.
- Effort accepts one decimal place; HR is whole bpm; power/cadence accept one decimal; elevation/incline accept up to three decimals. Reject excess precision with a clear input message instead of silently rounding entered measurements. Preserve greater legacy source precision in unchanged fields. Resource labels are at most 80 characters and sourceReference at most 255; neither is a public field.

## 5. Templates, logging lifecycle and reliability

### 5.1 Prescriptions

An endurance prescription v1 is a discriminated sport-specific object with ordered steps and one level of repeats. Steps have stable IDs, phase (warmup/work/recovery/cooldown), action (sport action or run-walk recovery), a duration OR distance target/range, optional effort target/range, and bounded notes. Swimming may specify stroke. A repeat contains steps, repetition count and optional between-repetition rest; it cannot contain another repeat.

Keep sessionTargets separately from step targets: a prescription may retain both an overall duration range and distance range, plus effort, as current running programmes do. Structured steps use one primary time/distance axis; secondary session goals are not fabricated interval measurements. For imported legacy prescriptions, steps may be absent with structureSource=legacy_summary; preserve their original duration/distance/RPE ranges and do not parse prose into guessed intervals. New simple sessions may use session totals alone; choosing structured mode requires a nonempty valid step list.

The running prescription has typed paceNote, progressionNote, symptomStopRule and note fields. Map blueprint paceNote/progressionNote/shinRule/comment and prepared-run paceNote/stopRule/note losslessly, preserving original fields when two contexts differ. Map mode to running environment and programRunId to the exact occurrence. Current optional prepared duration/distance and unconfirmed actual effort remain separate concerns. Cycling/swimming can have sport-specific instructions, but they do not inherit a shin rule. No version converter discards these legitimate running-specific fields to fit a generic shape.

Limits: 100 authored nodes, 100 repetitions per block, 1,000 expanded steps, 128 KB payload. Empty/zero/reversed ranges are invalid. Recovery may have an explicit time and zero distance. Template totals are derived only when all contributing quantities are known; mixed time/distance steps do not invent a conversion pace. Between-rest occurs n-1 times; an after-block rest is its own step.

Example contracts, not default training prescriptions:

| Example | Prescription | Actual logging |
| --- | --- | --- |
| Easy ride | 30 minutes at a stated target effort | 32 minutes, distance unknown, actual effort answer |
| Distance run | 5 km | Actual distance and duration; pace derived |
| Run/walk | 5 × [2-minute run + 1-minute walk] | One running activity, actual session totals; walking is not another sport or completion |
| Pool swim | 8 × 50m, 20s between reps | In a 25m pool, 16 entered lengths derives 400m; actual swim time optional; seven prescribed rests do not manufacture actual rest |

Session totals only in release one. Advanced summary metrics are optional; no per-interval result table. Actual totals may differ from prescription totals. No discrepancy is auto-corrected to the target. A saved activity closes the occurrence as logged or ended_early; target attainment is reported separately, without creating another completion.

Templates are immutable revisions. Editing one affects future selections, not scheduled snapshots. Applying edits to pending occurrences is an explicit previewed programme/schedule change. Deleting a template archives it while referenced revisions remain readable. Existing strength savedRoutines are adapted into the unified picker without converting exercise sets into endurance steps.

### 5.2 Save, edit, delete and identity

- One create submission UUID per local draft; retry uses the same key and canonical payload digest. Same key + same payload returns the same result. Same key + different payload is 409. Retain a receipt tombstone after deletion so a delayed retry cannot recreate it.
- Planned logging uses the chosen occurrence, not date matching. Database uniqueness prevents two actual activities completing it, including concurrent tabs/devices. Return the existing owned completion with a clear conflict, never silently overwrite it.
- Ad hoc activities always have null occurrence linkage. No post-save matching suggestions or casual reassignment. To correct the wrong origin/sport, explicitly delete the mistaken record and log a new one through the correct entry point; snapshots/drafts must not carry incompatible fields.
- Sport is immutable after save. Environment/measurements/notes may be corrected with expected revision. Updates never create another completion.
- Delete requires confirmation showing that the log and its shared statistics will be removed and the occurrence will reopen. No automatic undo/soft-delete retention in release one. Confirmed deletion removes raw measurements; a minimal request receipt/event prevents replay without retaining those measurements.
- Backdating is allowed. Actual history uses the entered actual date; adherence belongs to the linked occurrence's original programme position/week even when completed later. No weekly expiration.
- No live endurance session state. An unsaved form is a draft, not a completed activity, no adherence/statistics/coach actuals.
- Strength in-progress/completed/discard lifecycle remains. Any common activity parent is created/finished/discarded in the same transaction as its existing session.

### 5.3 Draft protection

Keep overload:draft:v1 strength keys and effortVersion handling unchanged. New endurance keys: overload:activity-draft:v1:<userId>:<draftId>; include schemaVersion, sport, original input strings/units, occurrence/revision snapshot, expected activity revision, submit UUID, dirty fields, update timestamp.

Persist locally on change; restore with an explicit Continue draft affordance in Training. No automatic background save or sync queue. Network uncertainty means save not confirmed, not a false assertion that nothing was saved. Retry/check receipt before clearing. Remove only the exact acknowledged snapshot so another tab's newer edit survives.

Bound each draft to 128 KB, 20 drafts/account and 90 days; warn before eviction, never silently remove an unsent draft to make room. Logout clears this account's local drafts after an unsaved-work warning; other accounts cannot read them. Corrupt/unknown-version drafts are quarantined locally with a recovery/export-of-text option, not silently interpreted. Existing run forms have no persistent draft format to migrate; the bridge release adds safe draft capture before canonical cutover. No app-level private HTML/API caching; public/sw.js retains its current network-only policy for private routes/actions.

Opening a planned log creates a short authenticated edit claim, not a timer: occurrence ID, pinned prescription revision, draft token, 30-minute renewable expiry. Coach acceptance cannot overwrite that occurrence while claimed. After expiry the local draft still retains its original prescription snapshot; saving against a changed/cancelled occurrence requires explicit conflict resolution, not silent use of newer targets. Do not allow a lost browser to freeze the programme forever.

If another tab/device holds the same athlete's claim, offer continuing that draft where locally available or explicit takeover. Takeover rotates the claim token; the previous form keeps its local input but cannot save with the invalid token. Never discard that input or silently overwrite a completed log. Claim expiry/takeover does not bypass the unique-occurrence and optimistic-revision checks.

## 6. Architecture and data contracts

### 6.1 Alternatives and selected design

| Design | Advantages | Costs | Decision |
| --- | --- | --- | --- |
| Common activity parent, typed sport details; existing strength logger underneath | One ownership/identity/history/completion boundary; FK-backed shared stats; future sport addition is a typed extension | Strength start/finish/discard must maintain parent atomically; broad parity tests and backfill required | Selected under delegated authority |
| Shared endurance parent plus untouched lifting roots and UNION queries | Smaller initial strength storage change | Repeated union/completion/privacy logic in every consumer; two roots indefinitely | Rejected for the intended unified programme/coach experience |
| Three copied run tables/forms/services | Local simplicity | Repeats scheduling, provenance, migration and sharing defects | Rejected |
| One giant nullable table or unconstrained JSON | Fewer joins | Weak validation/ownership, sparse fields, easy cross-sport errors | Rejected |

The common parent carries identity/lifecycle/provenance only. Strength exercises, machines and sets stay specialised. Typed details carry sport metrics. Validated, versioned JSON is used for finite prescription trees and historical payloads, not arbitrary unvalidated activity blobs.

### 6.2 Conceptual ER diagram

~~~mermaid
erDiagram
  PROFILE ||--o{ ACTIVITY : owns
  PROFILE ||--o{ PROGRAM_VERSION : owns
  PROGRAM_FAMILY ||--o{ PROGRAM_VERSION : versions
  PROGRAM_FAMILY ||--o{ PLANNED_OCCURRENCE : schedules
  PLANNED_OCCURRENCE ||--|{ OCCURRENCE_VERSION : revisions
  PROGRAM_VERSION o|--o{ OCCURRENCE_VERSION : approves
  TEMPLATE ||--|{ TEMPLATE_REVISION : versions
  TEMPLATE_REVISION o|--o{ OCCURRENCE_VERSION : copied_from
  PLANNED_OCCURRENCE o|--o| ACTIVITY : fulfilled_by
  OCCURRENCE_VERSION o|--o| ACTIVITY : performed_against
  ACTIVITY ||--o| RUNNING_DETAILS : typed_detail
  ACTIVITY ||--o| CYCLING_DETAILS : typed_detail
  ACTIVITY ||--o| SWIMMING_DETAILS : typed_detail
  ACTIVITY ||--o| WORKOUT_SESSION : strength_detail
  WORKOUT_SESSION ||--o{ WORKOUT_EXERCISE : contains
  WORKOUT_EXERCISE ||--o{ SET_LOG : contains
  ACTIVITY ||--o| SHARED_SESSION_STATS : approved_projection
  PLANNED_OCCURRENCE ||--o{ OCCURRENCE_EVENT : history
  PLANNED_OCCURRENCE ||--o{ COACH_SESSION_PLAN : preparations
  COACH_SESSION_PLAN o|--o| ACTIVITY : performed_with
~~~

PROGRAM_FAMILY denotes existing programs.familyId lineage. Add a small physical owner/family registry to enforce the composite family FK; it has no separate product workflow. Standalone occurrences have no programme family/version.

### 6.3 Tables and ownership/cardinality

All names below are proposed physical tables except existing names explicitly identified.

| Table | Core contents and constraints |
| --- | --- |
| activities | id, user_id, sport, status, started_at, recorded_time_zone/source, occurred_on, duration_ms, effort/value status, title/notes, occurrence_id, performed_revision_id, source_kind, revision, timestamps. Completed endurance only; strength may be in_progress. UNIQUE(user_id,id,sport), UNIQUE occurrence_id WHERE non-null |
| running_activity_details | activity_id PK, user_id, constant sport=running; distance/native quantity, environment, existing symptom fields/surface, advanced metrics, preserved legacy gym/workout links |
| cycling_activity_details | Same 1:1 typed boundary; optional distance, assistance, bike/trainer reference, advanced metrics |
| swimming_activity_details | Same; elapsed parent duration, active_ms, distance method, native pool/unit/length count, stroke and optional metrics |
| workout_sessions (existing) | Keep all original fields/relations; add same-owner activity FK and unique mapping. Prefer parent ID = existing session ID. Existing set/exercise APIs continue |
| program_families | id, user_id; registry backfilled from programs.familyId, needed for enforceable ownership, not a second active-programme model |
| planned_occurrences | id, user_id, sport, family_id/slot_lineage_id/cycle_index nullable for standalone; current_revision_id, pending/skipped/cancelled disposition; legacy_resolution reference optional |
| occurrence_versions | Immutable id, occurrence_id, user_id, sport, program_version_id nullable, scheduled_on, scheduling_zone, order_index, prescription_version/payload, template_revision_id, strength program_day_id when applicable |
| occurrence_events | Append-only completion/deletion/skip/reopen/reschedule/revision/legacy-resolution events; actual date, actor/source, IDs. No independent event may invent an actual activity |
| activity_templates / activity_template_revisions | Owned reusable definitions and immutable typed prescriptions; archive referenced templates instead of dropping history |
| activity_resources | Optional owned pool/bike/trainer/venue identities and defaults. Not gyms. Per-log measurement/context snapshots remain stable after resource edits/archive |
| user_sport_preferences | Owner+sport PK, enabled, display units, share_stats. Existing global shareTraining remains an upper bound |
| activity_submission_receipts | Owner+idempotency key unique; canonical payload digest, activity ID/result status, deleted marker. No raw notes or measurements in receipt |
| occurrence_edit_claims | Owner+occurrence unique active lease; pinned revision, draft token, expiry; no actual timer |
| multisport_migration_links | Owner+source kind+source ID+source version unique → canonical target IDs, mapping reason/checksum. Durable while legacy references exist |
| multisport_migration_issues | Owner-scoped issue category/source references/status/resolution; no guessed links. Operator-only cross-account summary contains counts, not athlete data |

Every owner table has a profiles/auth cascade and owner-only RLS. Every owner-to-owner relation uses composite user_id FKs, not just globally unique IDs. A deferred constraint trigger verifies exactly one matching typed detail for every activity at transaction end. Composite sport keys prevent placing a running detail under a swimming parent. Restrict direct client writes to derived tables/fields; server writes still run with athlete RLS.

Declare UNIQUE(user_id,id) on owner parents needed by composite FKs, and the additional sport/revision keys where specified. Shared stats keep their legacy sport discriminator but carry an explicitly mapped canonical sport for the same-owner/source/sport FK. A generated/check-constrained mapping prevents a workout shared row pointing at a cycling source.

Use the existing trusted server database transaction as the write entry point: withUser sets a transaction-local server-write marker after authentication for mutating work; new raw/derived table write policies require that marker as well as the owner. Read-only transactions never set it. No client-exposed RPC may set arbitrary configuration or bypass this guard. This prevents a browser's direct table write from bypassing receipts/projections while preserving athlete RLS in server actions. Rehearsal verifies deployed exposed schemas/RPCs and transaction-local reset; this is not a new privileged public API.

Occurrence versions use UNIQUE(user_id,occurrence_id,id,sport); activities reference that exact tuple. A deferred check verifies current_revision belongs to its occurrence. Programme/day/family/resource/template links use composite ownership/membership FKs. Existing raw gym/workout links are preserved only when owner-consistent; inconsistent historical links block reconciliation and are not silently repaired.

Store original_program_week_index and original_scheduled_on on programme occurrences, plus strength sequence position where applicable. occurrence_versions carries the effective scheduled_on, scheduling_zone and optional scheduled_local_time; rescheduling never changes the original adherence membership. These values are null only when genuinely inapplicable/unknown, such as programme position for standalone work.

activities also stores optional performed_session_plan_id. A coach preparation is immutable and references exactly its base occurrence revision; its effective prescription may differ within approved bounds. The activity and edit claim pin both the base revision and the actually displayed preparation ID (or null when using the base prescription). Enforce the same-owner/occurrence/base-revision tuple with an FK/constraint. A later preparation cannot rewrite what was prescribed when the athlete logged. Preserve the consumed preparation's payload and explanation; status may change without changing its prescription. Strength's existing plan/session linkage is mapped to this relation rather than inferred from today's plan.

Derived resolution is logged when the unique linked completed activity exists; otherwise use explicit skipped/cancelled/legacy-completed disposition, else pending/incomplete. Past due is a display calculation, not a destructive state transition. Events preserve history but are not a second independently writable completion source.

Indexes: activities(user_id,started_at DESC,id DESC), activities(user_id,sport,occurred_on), planned_occurrences(user_id,family_id,slot_lineage_id,cycle_index), occurrence_versions(user_id,scheduled_on,order_index), active occurrence revision lookup, templates(user_id,sport,archived_at), resources(user_id,kind), jobs(user_id,status,contract_version), migration source uniqueness, receipts owner/key. Retain one-active-programme partial unique index. Include EXPLAIN checks against representative populated fixtures before adding speculative indexes.

### 6.4 Typed contracts

Illustrative contracts only; no source or executable migration is supplied here.

~~~ts
type ActivitySport = "strength" | "running" | "cycling" | "swimming";
type Effort =
  | { status: "reported"; value: number }
  | { status: "unknown"; value: null }
  | { status: "legacy_unconfirmed"; value: number | null };

type LogOrigin =
  | { kind: "ad_hoc"; occurrenceId: null; performedRevisionId: null; performedPlanId: null }
  | { kind: "planned"; occurrenceId: string; performedRevisionId: string; performedPlanId: string | null };

type EnduranceActual =
  | { sport: "running"; details: RunningActualV1 }
  | { sport: "cycling"; details: CyclingActualV1 }
  | { sport: "swimming"; details: SwimmingActualV1 };

type SaveActivityV1 = {
  mutationVersion: 1;
  submissionKey: string;
  expectedRevision?: number;
  origin: LogOrigin;
  actual: EnduranceActual;
};
~~~

Strict runtime schemas reject unknown write fields and invalid sport/detail combinations. Canonical sport values differ intentionally from legacy workout/run API/shared-stat discriminators; use explicit mappings. Strength is not silently relabelled in stored historical JSON. Old readers receive their old names.

Blueprint v2 keeps the existing strength-day/exercise prescription structure and lineage, removes authoritative includesRun and the separate runs array, and adds typed endurance slot definitions plus explicit occurrence prescriptions. Strength-only flags can remain in the v1 adapter, not as multi-sport completion identity. A sport-only blueprint may have no strength days and no gym. A unique occurrence identity/ordinal replaces week+weekday uniqueness. v1 conversion is pure, deterministic and preserves a typed legacy payload with source version.

The v2 envelope contains blueprintVersion=2, slug, name, notes, startDate, schedulingTimeZone, weeks, nullable strengthCycle, enduranceSlots and occurrences. strengthCycle retains ordered strength/rest slots, existing exercise prescriptions and startDayIndex; a rest slot is not an activity. Endurance slot definitions contain lineageId, sport and a typed prescription. Each endurance occurrence contains its own localId, slotLineageId, programme week position, scheduled local date, optional time, orderIndex and optional prescription override. Local IDs resolve transactionally on activation; known continuing occurrence IDs retain lineage on revision. Standalone prescriptions use the same contract without programme membership. Keep 1–52 weeks and at most 31 strength cycle slots; replace the old 200-run cap with at most 10,000 scheduled endurance occurrences and a 4 MiB blueprint payload bound. Validate uniqueness by identity, never by sport/weekday. Explicit local date and programme-week position must agree at initial creation; rescheduling preserves original membership. These are payload safeguards, not daily training limits.

### 6.5 Representative query and mutation boundaries

~~~sql
-- Illustration: owner-scoped, paginated actual history.
SELECT a.id, a.sport, a.started_at, a.occurred_on
FROM activities a
WHERE a.user_id = :owner AND a.status = 'completed'
  AND (:sport IS NULL OR a.sport = :sport)
  AND (:cursor_time IS NULL OR (a.started_at, a.id) < (:cursor_time, :cursor_id))
ORDER BY a.started_at DESC, a.id DESC
LIMIT :page_size_plus_one;

-- Illustration: explicitly scheduled endurance today, not an overdue list.
SELECT o.id, v.id AS revision_id, v.prescription
FROM planned_occurrences o
JOIN occurrence_versions v ON v.id = o.current_revision_id
WHERE o.user_id = :owner AND v.scheduled_on = :today
  AND o.sport <> 'strength' AND o.disposition = 'pending'
ORDER BY v.order_index, o.id;
~~~

Today combines the latter with the independent strength projection and today's logged scheduled cards. Neither query authorises access without RLS. Aggregate counts/time/distances use full SQL aggregates per sport and known-value counts, not the first page of history.

Save transaction: authenticate → validate contract → lock owner/occurrence in consistent order → check receipt/revision/claim → validate owner/sport/target → write parent and typed detail → unique completion/event → rebuild allowlisted shared stats → increment source revision → store receipt → commit → invalidate/redirect. A failed step rolls back all writes. A timeout after commit is resolved by receipt lookup, not a second create.

Edit/delete run the same boundary and update completion, shared rows, records, summaries and coach revision together. Maintain the existing withUser serialization and pre-work-only retry policy. Do not retry an ambiguous transaction by blindly replaying the body.

## 7. Scheduling and programme state model

When converting a mixed v1 cycle, preserve its calendar positions and startDayIndex: a day with endurance but no strength becomes a rest position in the strength projection, rather than deleting that position and compressing the cycle. An entirely endurance-only programme has no strength cycle. Historical run resolutions stay endurance evidence; they do not become fictional strength workouts.

- One programme family has one active immutable version. A slot lineage is a training role; an occurrence is one performance of it. Two Wednesday runs have distinct lineages/ordinals and occurrence UUIDs.
- Mixed and same-sport activities can share a date. Time-of-day is optional; an explicit order_index gives stable order, with UUID tie-break. Do not add calendar times to imply GPS/live recording.
- Strength order/rest/shift logic runs only over strength/rest slots. Endurance has fixed effective dates, independent completion and explicit rescheduling. A missed swim never blocks any later strength, running, cycling or swimming occurrence.
- The programme's original week membership is retained. Late actuals count in the actual week for volume and against the original occurrence for adherence. Week boundaries never expire work.
- Programme Cycle shows earlier incomplete items; Today has no overdue list. User can log from an earlier card, mark skipped, undo skip, or explicitly move it. Moving one endurance occurrence does not shift the day or another sport. Undo skip restores that same occurrence.
- A sport substitution cancels the original future occurrence and creates a new one with a replaces link and explicit approval; it does not change the sport of an actual activity or invisibly satisfy two prescriptions.
- Manual addition to a programme is an explicit programme edit; standalone scheduling remains outside its review targets, but can inform workload. Rest days are availability/intent, not a universal prohibition on another sport. Warn about user-entered time-budget conflicts and allow deliberate manual override; coach outputs must fit confirmed budgets or request a change.
- Out-of-order logging resolves only the selected ID. Finishing below target closes it as logged/ended_early; target attainment stays separate. Saving/deleting does not settle neighbouring occurrences.
- Starting new-block programmes archives the old programme and removes its future activities from Today; old occurrences remain readable/loggable through the archived programme. They are not new coach targets. Archive/replace must explain pending work and preserve it, not delete it.
- Programme revisions retain occurrence IDs for the same intended performance and attach new immutable prescription versions only to pending future work. Completed, skipped, already-started strength and pinned logging work retain their historical interpretation. Changed future membership/order/date is explicit in the diff.
- Compatible continuation keeps family/slot lineage and original start position. Structural new-block changes get a new family/block identity. Unchanged historical resolutions are referenced, not copied into additional completions.
- Prepared plans for changed pending occurrences are superseded and regenerated. Unchanged completed/consumed plans remain attached to performed revisions. Local drafts are not rewritten; stale drafts receive the original-vs-current conflict view.

## 8. Coaching and API compatibility

### 8.1 Versions and acceptance boundaries

| Contract | Baseline | New contract and transition |
| --- | --- | --- |
| Programme blueprint | BLUEPRINT_VERSION = 1 | v2; deterministic v1 reader, v2-only new writes after cutover |
| Worker/job contract | COACH_CONTRACT_VERSION = 3 | v4; advertised supported versions checked before claim, context and result |
| Coach intake | v3 workflow's lifting frequency/location plus running fields | Explicit intake schema v2 inside contract v4; per-sport experience/access/frequency and total availability; preserve original intake payload |
| Prepared session / opening plans | Exercises plus optional run, workout/run summaries | Session plan v2, exactly one occurrence/revision per preparation; openingPlans array referencing draft-local occurrence IDs |
| Prescription | Running fields/prose, strength exercise prescription | Endurance prescription v1 (§5); existing strength prescription remains typed |
| Weekly change assessment | WEEKLY_CHANGE_POLICY_VERSION = 2 | v3 multisport scope assessment; preserve strength/running numerical rules in sport policy adapters |
| Coach policy | COACH_POLICY_VERSION = 2026-09-16.1 | Named multisport-v1 revision with explicit constituent strength/running/cycling/swimming policy versions |
| Memory/evidence envelope | General/workout/run, legacy source strings | Memory envelope v2; canonical sports plus explicit legacy aliases and source revision |
| Read API | JSON version: 1 | v1 projection plus explicit v2 endpoints with version: 2; no silent response shape change |
| Endurance drafts/mutations | Run component state; effortVersion guard | Draft schema v1 and mutationVersion 1; unknown versions retained/rejected safely |
| Strength drafts | Existing v1 keys and effortVersion 2 | Preserve; bridge adds parent/occurrence handling without resetting set drafts |

These numbers describe distinct contracts, not one interchangeable version integer. Add explicit stored version fields where currently inferred. Parsers discriminate the version before validating the body. Unknown versions return a recoverable upgrade/incompatibility error; do not coerce them to current defaults.

### 8.2 Intake → blueprint → preparation → review

1. Collect the freeform goal first, then minimum relevant follow-ups. A draft explicitly identifies sports, access, available days/budgets, concrete occurrences, and any allowed adjustment ranges. A proposed new sport is only included after user confirmation. No founder-specific gym, injury or weekly routine defaults.
2. Materialise the approved blueprint into immutable programme/occurrence revisions. Resolve opening-plan local IDs to real occurrence UUIDs in the activation transaction. Gym/equipment is required only for strength targets that need it.
3. Daily dispatch prepares each eligible occurrence independently. Use one idempotent preparation job per occurrence + prescription revision + batch date, rather than today's one-job-per-athlete/date identity. Keep serial claiming per athlete, the current 15-minute job lease and maximum three attempts.
4. Prepare today's and the next 48 hours' scheduled work. Do not automatically prepare old incomplete endurance occurrences; explicit reschedule/open-plan preparation targets that exact occurrence. Strength uses its independent projected date. Review jobs are processed before preparations against the resulting programme version.
5. Today reads the exact prepared plan for each card. With no prepared plan, show the approved prescription and honest preparation state. Running-only and swimming-only days cannot become Rest because there is no lifting part.
6. Completion records actual measurements and effort provenance against the pinned prescription, then updates the athlete source revision. Targets, proposed values and session-plan summaries never become actual evidence.
7. Programme review retains the current elapsed-day/quiet-day cadence. Check every included sport even if its recent evidence is sparse. Return coverage entries for all sports: evidence considered, comparability, decision/change/hold, source references and reason. Missing coverage is invalid.
8. Actual ad hoc activities contribute workload, recovery and quiet-day evidence. They do not acquire occurrence links or their own daily preparation/review targets.

Overall coach consent remains the switch. When enabled, a manually built active programme receives the same complete review coverage. Disabling a sport shortcut does not silently remove it from programme reviews. No automatic coaching of standalone scheduled activities outside the active programme in this release; adding one to the programme is explicit.

Whole-programme revision and single-occurrence preparation are separate result types. An occurrence result cannot change another occurrence, the programme's selected sports, historical work or weekly structure. A programme result contains an explicit diff and historical eligibility checks, not a collection of unrestricted writes.

### 8.3 Sport policy and bounded changes

Retain actual strength load/machine comparability and current running-specific symptom/effort safeguards. Keep running shin observations and rules under running; do not rename them into universal endurance injury fields.

For cycling and swimming, automatic adjustments may select only within ranges already displayed and approved in the active prescription: applicable duration/distance, effort, repetitions and rest. If a target has no approved range, changing it requires a proposal. Changing environment, assistance, equipment assumptions, stroke, pool context, sport, weekly frequency or access requires explicit proposal/confirmation. Larger structural changes remain approval based. Do not borrow running progression percentages as new-sport policy.

The coach can propose a suitable new programme or wider range with reasons; automatic acceptance never creates the range retroactively. Programme confirmation explains this adjustment permission in plain language, with detailed bounds available without cluttering the main flow. All user-requested programme changes remain proposals under the separate agreed request/diff plan.

Per-sport policy prerequisites include experience and access, available time, recent comparable actuals, unknown-effort handling, missing-distance handling, and source-supported explanations. Swimming must not assume a beginner can execute an open-water plan; cycling must not treat assisted/indoor/outdoor speeds as equivalent performance. Missing essential information produces a question or conservative unchanged prescription, not fabricated capability. This is a validation policy, not a medical recommendation.

New-sport policy tests must independently cover initial programme creation, sparse evidence, improvement, fatigue, reported discomfort, limited time, missed sessions, environment/equipment changes, and noisy or incomparable metrics. Review may assess a sport and decide not to change it. Do not claim physiological equivalence from cross-sport pace, distance or arbitrary combined effort scores.

### 8.4 Frozen work, stale results and evidence

- Context includes contract/policy versions, athlete sourceRevision, active programme version, target occurrence and prescription revision, consent snapshot, and current claim/start/completion state.
- Claim/result acceptance rechecks these values transactionally. A consent change, new actual evidence, programme revision, different target, completion, cancellation or logging edit claim can invalidate a result. Record a reason and regenerate eligible work; never silently replay an old result against a new target.
- Preserve the existing strength started-session freeze. A strength session's exercise/set prescription is not rewritten mid-workout. Endurance logging claims pin the exact occurrence (§5.3); they do not freeze unrelated sports.
- Keep retry receipts and canonical result hashes. A retry with the same job/result returns the accepted receipt; a different result for an accepted receipt is a conflict. Expired/reclaimed leases cannot be accepted by an old worker.
- Preserve run:<UUID>, workout:<UUID> and exercise:<UUID> evidence references through the durable map and owner checks. New endurance sources use activity:<UUID> with explicit source revision where a claim depends on editable values.
- Distinguish evidence run:<UUID> from current guardrail scope run:<weekday>. The latter becomes a slot-lineage/occurrence/environment scope. Weekday alone cannot identify two same-day runs.
- Memory v2 supports general and each of the four sports. Preserve original observations, source timestamps, expiry and contradiction status; conversion is not fresh evidence. Legacy aliases are readable.
- Extend note/quote validation to cycling/swimming activity notes under the same ownership and exact-source rules. Retain note-disposition deduplication, now source-revision aware. An edited note creates a new revision/disposition opportunity; an old quotation does not silently attach to changed text.
- Deletion/relink correction invalidates referenced current evidence and queued contexts. Historical reports show source removed/revised where appropriate rather than continuing to treat a removed measurement as current evidence. No private text is copied into a public activity projection.
- Pending saved proposals/opening plans retain their original versioned payload. Lossless translation can produce an explicitly reviewed new proposal; incompatible or stale proposals remain visible with regenerate/review action, not silently activated or dropped.

### 8.5 Worker cutover and first-party clients

Deploy a bridge release before switching data authority. It advertises upcoming incompatibility, captures run drafts and preserves strength sessions. Pause dispatch at cutover; drain valid old work or let the 15-minute leases expire. Supersede remaining queued/claimed contract-v3 jobs with a recorded reason. Generate v4 jobs only against canonical occurrence IDs after reconciliation.

Completed old jobs, receipts and reports remain readable. Do not translate an in-flight v3 mutation into v4: its day/run/gym target may be ambiguous. An old result receives a clear conflict/upgrade response and no writes. Contract-v4 scripts verify advertised versions before claiming; retries use existing lease/receipt rules.

Update scripts/coach/workflow.ts and its context/result interfaces together with the service and the coach SKILL.md contract instructions. Legacy scripts (client, attempt, context, due, fail, propose, submit) must either read supported compatibility data or exit with an upgrade message before attempting legacy writes. The service write rejection must persist independently of COACH_WORKFLOW_ENABLED; turning off a rollout flag must not resurrect a v3 mutation path.

The coach skill is a dependency to update during implementation, not permission to run coaching in this planning task. Deployment of automation is coordinated with the app, never inferred from a successful web deployment.

### 8.6 Public read API

Continue authenticated, owner-scoped, read-only API tokens. Do not add write scopes or reuse automation service credentials for user tokens. Preserve private/no-store and Vary: Authorization response handling and existing recovery access.

| Route | Behaviour |
| --- | --- |
| /api/coach/running | v1 running-only projection with the existing units, fields, pagination and effort provenance |
| Existing v1 /summary, /workouts, /recovery, exercise history | Legacy strength/running view; preserve response shapes and documented date/range behaviour |
| v1 /program/current | Translate only when the programme is representable without loss; otherwise 409 upgrade_required with a v2 documentation link. Never pretend a partial two-sport programme is the complete new programme |
| /api/coach/v2/activities | Owner history with canonical sport discriminator, typed details, actual effort status, original/canonical units, occurrence and revision IDs; stable cursor by timestamp + ID |
| /api/coach/v2/summary | Full SQL aggregates per sport, known-value counts, coverage and actual date boundaries; no hidden first-500-row performance summary |
| /api/coach/v2/program/current | Blueprint/occurrences and explicit completion states, versioned and sport complete |
| /api/coach/v2/recovery | Preserve independent recovery semantics |
| /api/coach/v2/exercises/<id>/history | Preserve strength machine identity and load comparability |

v2 page size defaults to 50, maximum 100; explicit bounded date ranges use inclusive start/exclusive end in the requested validated IANA zone. Default history is the most recent page with a continuation cursor; aggregates require a stated period (default last 28 local days, maximum 366 per request). Longer export periods can be paged/chunked with coverage metadata. Unknown sports/versions/invalid cursors receive explicit 400 errors.

v1 summary remains explicitly documented as a legacy-supported-sports projection. Add Deprecation, Sunset and Link headers without injecting unknown JSON fields into strict v1 consumers. Maintain v1 for at least 180 days after cutover; removal additionally requires known-client upgrades and 30 days without legitimate usage. Then respond 410 with upgrade information. Do not redirect JSON clients to HTML or silently change their response version.

The read endpoints provide a complete owner-scoped export boundary through pagination; no separate new export UI or external integration is part of this release. Operational backups include all canonical/relationship tables. Any export consumer not represented in source is an OP-06 release check.

## 9. Progress, comparisons, privacy and deletion

### 9.1 Metrics

| View | Valid aggregation | Prohibited inference |
| --- | --- | --- |
| All sports | Activity count, distinct actual training dates, recorded duration with missing-count disclosure, per-sport adherence | Adding lifting tonnage to distance; treating kilometres across sports as one performance score |
| Strength | Existing sets, reps, comparable load, volume and e1RM rules | Pool/bike identity treated as gym-machine load compatibility |
| Running | Distance, logged duration, overall pace by comparable environment; existing whole-run best average pace for qualifying >=1 km runs | Fastest 5 km or segment record from only session totals |
| Cycling | Duration, known distance/speed, optional manually entered power/cadence/HR trends | Estimated power, speed with unknown distance, comparisons across assistance/environment as if equal |
| Swimming | Distance, elapsed time; active time/pace when actually known; pool/stroke context | Assuming elapsed minus active is confirmed rest, guessing lengths, or calculating swim pace without a stated time basis |

All-sport duration is labelled recorded training time, not unique wall-clock time or a physiological workload score; overlapping sessions can otherwise mislead. Display known counts for partial metrics. Zero is retained where allowed and never substituted for unknown.

Adherence uses explicit occurrence resolutions, independently per sport. Display logged, skipped, incomplete and legacy-completed counts; cancelled/superseded work is not silently included as a current obligation. Strength adherence must no longer fail because a run on the old combined day was incomplete. This is an intentional behavioural correction, documented separately from migration equivalence.

Performance comparisons require the same sport and known comparable context. For cycling distinguish indoor/outdoor, assistance and relevant bike/trainer protocol. For swimming distinguish pool/open water, stroke/mixed, pool length/unit and interval protocol/time basis when recorded. Converting metres to yards does not erase pool-length differences. Unknown context can participate in counts/duration but is excluded from context-dependent best-performance claims.

Release-one new-sport personal bests are conservative whole-session longest distance/duration and explicit-context summaries; no power, segment, stroke-efficiency or interval records inferred from incomplete data. Preserve existing running and lifting record features. Edited/deleted source records trigger recomputation of affected summaries and subsequent record flags, not just the edited row.

History and chart queries must expose pagination/coverage and compute full-range aggregates in SQL. The existing run overview's 200-row limit, coach 500-row readers, recent-sample pace summaries and other display caps must not become occurrence-completion or lifetime-total logic. Bounded coach evidence samples disclose truncation and are supplemented by exact period aggregates.

### 9.2 Sharing

Preserve raw owner-only RLS and follower/approval controls. Extend the existing shared-stat projection rather than returning an activities row from a public/person route.

- Preserve workout/run discriminator values in existing shared tables/API compatibility; add cycle/swim through an explicit mapping to canonical sport values.
- New cycling/swimming share_stats defaults false. Global shareTraining is an upper gate, with sport controls underneath. Existing strength/running inherit their present sharing choice; no migration opens a new private category.
- Opted-in cycling/swimming may appear in the existing feed, personal page, comparisons and participation leaderboards using safe sport/environment, date, session count, duration and known distance. No new social system.
- Keep advanced HR/power/cadence, actual effort, custom titles, private resource/location identity, symptom observations, coach notes and freeform notes out of shared projections. Safe generated labels are used publicly.
- New-sport leaderboards compare participation metrics only; swimming/cycling speed/power records remain private in this release. Existing lifting/running social features remain, with accurate whole-run pace labels.
- Shared detail at /u/<username>/activities/<sharedStatId> reads only an authorised shared row. A raw activity ID, new discriminator or query parameter must never bypass privacy checks.
- Backfill or privacy re-enable computes only currently opted-in fields. Turning sharing off deletes/hides the affected projections and invalidates person/feed/compare/leaderboard caches immediately.
- Add same-owner source FK from shared statistics to activities when canonical IDs are in place. Source ID collisions, stale rows and missing sources must be reconciled before validating this constraint.

### 9.3 Ownership and lifecycle

All new owner tables use RLS plus composite owner FKs; include templates, resources, occurrence revisions/events, receipts, edit claims and migration mappings/issues. There is no public policy for raw sessions. Derivation does not confer broader read permission.

Account deletion continues through the existing authenticated account action/Supabase auth deletion path. Confirm cascades cover all new tables, active jobs, evidence/memory links, projections and tokens; browser logout/deletion clears only the current account's local drafts. Test auth-delete failure does not leave a false success or partial manual data purge.

Resources/templates referenced by history are archived; snapshots preserve interpretation. A user may clear optional private location/resource fields without altering the measurement. Programme archival preserves history. A confirmed activity deletion removes its raw detail and projection, reopens only its linked occurrence, and invalidates evidence without retaining private measurements in a receipt. Minimal events/mappings must respect owner deletion.

Centralise invalidation in a typed mutation-effects helper. Changes affect the owned activity, Today, Training, programme Cycle/Changes, History, Progress, existing strength exercise pages where applicable, person pages, friends activity, comparisons and leaderboards, plus coach sourceRevision. Revalidate valid canonical paths and any cached compatibility views during transition; do not scatter a forgotten /runs-only list across new actions.

## 10. Migration, rollout and rollback

### 10.1 Strategy and authority

Choose expand → repeatable backfill/shadow verification → coordinated write cutover → contract. A single coordinated destructive migration is simpler operationally but cannot validate history or bridge old clients first. Indefinite dual sources of truth are rejected.

Before cutover, legacy tables/writers are authoritative; canonical projections can be regenerated and compared. After cutover, canonical activities/occurrences are authoritative and legacy reads use adapters. No old action can independently edit a retired run row. Do not release new-sport writes before this boundary.

Append migrations after the repository's then-current journal head; at this baseline that follows 0023. Never modify applied SQL/snapshots 0000–0023 to remove old names. Proposed logical migrations (filenames/sequence numbers assigned at implementation after rebasing):

- M1: additive canonical tables, owner/sport keys, version columns, indexes, conservative RLS and compatibility metadata.
- M2: post-backfill validated relationships/uniqueness, typed-detail integrity triggers and canonical shared-stat ownership links. Constraints cannot be declared valid by ignoring recorded issues.
- M3: contract after compatibility windows: remove retired writers/columns/tables only after reference/export/rollback gates pass. Historical migration files remain unchanged.

Backfills are explicit resumable operational commands with dry-run/reconciliation modes and receipts; never hidden in next build. Existing Vercel db:deploy may apply only safe additive migrations during this transition. Preview environments must have isolated test databases before any deployment test; MIGRATE_ON_PREVIEW is not proof of isolation.

### 10.2 Mapping and preservation

| Legacy source | Canonical target / exact preservation rule |
| --- | --- |
| runs | activities + running_activity_details; prefer identical UUID. Preserve owner, actual instant, distance precision, duration, mode, notes, symptoms, surface, effort value AND effortReported, gym/workout/program links |
| workout_sessions/exercises/sets | Add common parent using existing session UUID; keep all set/exercise/equipment identities, load units, draft keys, timers, status, comparison lineage and existing relationships |
| dailyRecovery in schema/runs.ts | Retain separate table/data/RLS; moving a TypeScript declaration does not drop or rewrite recovery |
| programs/programDays and includesLifting/includesRun | Keep immutable programme versions/family/day lineage; create independent occurrences. Strength flags feed the legacy adapter; includesRun becomes explicit endurance occurrences |
| programRuns | Map each intended planned run to occurrence/revision; replace week+weekday uniqueness with real IDs/ordinal. Preserve original week/day and prescription, not a guessed actual |
| programSlotEvents | Reconcile programme/cycle/day/part with actual sources and revision lineage; one logical occurrence resolution, not copied completions for every version |
| Completion with no raw run, including 0011 backfill | Explicit legacy-completed resolution with its provenance; no fabricated run, distance or effort. Preserve historical adherence; reopening is explicit |
| sessionPlans / coachPlanSchema.run / sportSummaries | Split into exact occurrence-scoped preparations, retaining source blob/version/IDs. Existing summary text stays attributed to its original sport/date |
| Opening plans / drafts / queued proposals | Versioned lossless translation only; stale/ambiguous items retained for review/regeneration. A visible invalidation reason replaces silent loss |
| Blueprint v1 / seed programme templates | Pure v1-to-v2 reader plus versioned v2 output; keep strength day/exercise lineage. Original historical JSON remains readable |
| savedRoutines / manual presets | Preserve strength routine identity/prescriptions; adapt into template picker. Do not turn old actual sets into template targets |
| shared_session_stats and records | Map source IDs, preserve current strength/run privacy and equivalent metrics, rebuild deterministically. New sports opt out by default |
| Memories/evidence/notes/reports | Resolve old run: IDs through mapping; preserve source dates, quote provenance, reported-effort status, sport tags and removed/revised-source state |
| Legacy intake runsPerWeek/preferredRunDays | Convert to running preference only where explicitly recorded. Retain strength intent and original intake; never invent consent to cycling/swimming or a gym |
| Local strength drafts | Preserve existing keys/content. Bridge and test parent/occurrence addition without clearing unsaved set input |
| Run forms/open clients | No preexisting persistent run-draft schema; bridge captures new local drafts, then version-checks before save. Older incompatible clients refresh without silent field loss |
| Stored links and /runs URLs | Durable ID map plus route aliases; rewrite owned first-party saved links only where unambiguous |

Preserve raw unknowns. Do not infer active/moving/rest time, pool lengths, intervals, HR, power or cadence for legacy runs. A numeric RPE with effortReported=false remains legacy_unconfirmed. Preserve original values outside new input bounds with migration-only provenance; notes-only edits do not normalise them.

Legacy runs store canonical metres, not necessarily the athlete's original entry unit/string. Preserve those metres exactly and mark original-entry unit unknown unless the source actually records it; a km formatter is not proof that km was the original input. New entries retain native quantity/unit explicitly.

Timestamp migration keeps actual instants and the legacy date interpretations needed for equivalence. Where an original time zone was not recorded, label the zone as inferred from the available profile at migration, not known at performance. If legacy analytics/shared dates disagree, report and retain their legacy projections until a documented factual resolution; do not silently shift a user's history.

### 10.3 Anomalies and deterministic policy

Run the audit before imposing new constraints. Preserve every owned raw record and original association in the migration ledger; publish only aggregate issue counts outside the operator's private audit environment.

- Repeated identical cross-version completion events can map to the same occurrence only when lineage and actual source prove they are the same performance.
- Multiple raw runs pointing at one planned run: if exactly one authoritative, owner-consistent completion event identifies the fulfilled record, use that link and retain the other records with their legacy association annotation. They are not fabricated extra planned completions. If the evidence conflicts or no unique authority exists, hold the mapping and block that reconciliation gate for factual review.
- Missing source/completion links: preserve the event as a specifically identified legacy resolution when provenance supports it; otherwise record an unresolved anomaly. Do not choose the earliest run merely because it sorts first.
- Cross-owner links: never attach another athlete's source or expose its contents. Retain the owner's valid raw record and isolate the bad link for correction. No automatic deletion or reassignment.
- UUID collisions between source tables: use a deterministic namespaced mapping keyed by owner/source-kind/source-ID, with a unique ledger. All callers/evidence/shared stats use the map, not ad hoc regeneration.
- Incomplete/zero/out-of-range old records: preserve unchanged with provenance and include them in the reconciliation report. Exclude only metrics that were already undefined, such as pace at zero distance; do not invent measurements to satisfy a new form.
- Backfill conflict with a newer source revision: retry that source from the authoritative legacy state before cutover. Do not overwrite a verified newer canonical row after authority switches.

Unresolved factual anomalies block the affected constraint/cutover gate. User delegation authorises this conservative resolution policy; it does not authorise guessing which private activity really happened.

### 10.4 Rollout order and checkpoints

1. Complete OP-01–06, capture private backups and a restore rehearsal; record deployed app/worker/schema versions and legitimate v1 clients.
2. Deploy M1 and the bridge app. Legacy writes stay authoritative. Ship draft/version handling, compatibility decoders, safe old-client messages and worker version negotiation. No new sport exposed yet.
3. Run resumable backfill and comparison in an isolated restored dataset, then approved production execution. Iterate with per-source checksums/watermarks; no app build triggers it.
4. Exercise all four sports in isolated staging, including existing open strength sessions, old browser bundles and v3 workers. Meet the acceptance matrix and measured pause budget.
5. Pause dispatch; wait for or expire leases. Announce/start the short write pause. Let active strength sessions finish through the bridge, or postpone cutover; do not force-complete/discard them. Existing local drafts remain recoverable.
6. Reject old mutation versions at the boundary. Apply final delta backfill, row/relationship reconciliation and M2 validation. Abort before switching if any required equality/invariant fails.
7. Atomically select canonical writers/readers, deploy the compatible app/API and v4 worker configuration, then resume writes/dispatch. New-sport forms and coaching activate together only after their capability checks pass. Record the first canonical write marker.
8. Monitor privacy/ownership errors, receipts/conflicts, orphan counts, missing coach coverage, 4xx version errors, latency and aggregate drift using counts/IDs without private notes. Reconcile again after the first controlled cohort before broad enablement.
9. Complete compatibility windows and cleanup gates, then M3. Durable reference mappings can remain as small owner-scoped identity records while old evidence/links need them; retired raw tables cannot remain a second editable source.

A release lacking cycling/swimming coaching is an internal staged build, not completion of the approved release. Do not present visible manual-only capabilities as full supported coaching.

### 10.5 Reconciliation contract

Required checks are repeatable and produce counts/checksums plus a pass/fail artifact without athlete data in logs:

- One canonical parent/detail per raw activity; unchanged strength session/exercise/set counts and IDs; recovery count/content equality.
- Per-owner, per-sport and per-period count/distance/duration equivalence, with explicitly listed null/undefined metrics and rounding tolerances only at the documented storage precision.
- Field-level sample equality for notes/symptoms, effort provenance, actual instants, native units, gym/workout links and programme associations in the private rehearsal environment.
- Occurrence/source cardinality, same-owner/same-sport relations, historical completion resolution and unique active programme; zero unresolved constraint violations.
- Legacy API golden payload equivalence where representable; explicit upgrade result where not. Existing private/shared aggregate equivalence and privacy selection.
- Coach evidence resolution, report readability, prepared-plan invalidation, proposal status and draft round-trip.
- Re-running each chunk/full backfill yields no added rows, changed correct totals, duplicated events or renewed evidence timestamps.
- Intentional new behaviour (independent strength adherence, new route ownership, optional Not sure effort) is isolated from claims of unchanged historical measurement totals.

Representative verification queries: anti-join each legacy source against the unique migration map; group canonical activities by source mapping to find count != 1; join every cross-owner FK candidate and assert equal owner; group completed activities by occurrence with HAVING count(*) > 1; compare grouped SUM/COUNT/known-count projections by owner/sport/period; anti-join each shared source to a same-owner canonical parent. Exact executable audit SQL is implementation work tested against fixtures, not supplied as a migration here.

### 10.6 Rollback

Before the first canonical write, stop the switch, return to the bridge/legacy writer and keep additive tables for investigation. Legacy remains authoritative, so no canonical-only activity has to be squeezed into an old format.

After canonical writes, an old-app rollback cannot represent new sports/occurrences. Prefer a previous compatible canonical app/worker release or roll forward with the database intact. If restoration is necessary: pause writes/jobs, export the complete post-cutover canonical delta (all four sports, revisions, receipts and relationships with original units), restore the verified backup in isolation, repair/replay into a compatible canonical schema, reconcile, then resume. This is a tested recovery procedure, not a promise of instant lossless rollback.

Never discard cycling/swimming data to regain a running-only application. If safe replay cannot be proven, keep writes paused and retain a read/export path while repairing. Contract migration requires a fresh backup, completed compatibility gates, stable canonical operation and an explicitly tested recovery path; retaining an old web deployment alone is not rollback capability.

## 11. Implementation sequence and release checkpoints

All paths marked new below are proposals. Existing modules are listed explicitly; their colocated tests are extended rather than copied into a parallel obsolete suite. Phase work begins only after a separate implementation instruction. Dependencies: P0 → P1 → P2 → P3 → P4; P5 and P6 require P3/P4 contracts and converge before P7; P8 follows the measured compatibility window.

### P0 — Freeze the implementation baseline and prove operational prerequisites

- Objective: rebase this plan against the chosen implementation checkout, record source/production versions, and prepare reproducible private audits.
- Prerequisites: plan review, separate implementation authorisation; approved access to isolated test infrastructure before runtime work.
- Existing files/modules: package.json; vitest.config.mts; vercel.json; src/db/deploy.ts; src/db/migrate.ts; src/db/test/pglite.ts; src/db/test/fixtures.ts; src/db/account-deletion.test.ts; scripts/dev/auth-stub.mjs; scripts/dev/seed-people.ts; docs/coach-api.md; docs/coach-automation.md; these three planning documents. Inspect environment names, never print credentials.
- Proposed new files: src/db/multisport-audit.ts; src/db/multisport-audit.test.ts; docs/planning/MULTISPORT_ROLLOUT_RUNBOOK.md. The audit defaults to read-only and aggregate output, with a separately protected operator report.
- Migration/compatibility: no schema changes in this phase. Inventory deployed migrations, worker versions, external readers, open sessions and unknown JSON variants. Verify backups and isolated restore access.
- Tests/acceptance: AT-BASE and audit portion of AT-MIG; fixture includes old run-only, strength-only, combined, partway-cycle and inconsistent histories. Resolve OP gates or explicitly mark deployment blocked.
- Release/rollback checkpoint: no product release. Baseline/diff must be known; preexisting output/ remains untouched. Do not infer production state from checkout.

### P1 — Define typed identities, measurements and versioned contracts

- Objective: make sport, actual, prescription, occurrence and effort semantics executable without replacing strength's logger.
- Prerequisites: P0 source baseline; decisions in §§2–8.
- Existing files/modules: src/domain/types.ts; src/domain/sport-scope.ts; src/domain/effort.ts; src/domain/pace.ts; src/domain/running.ts; src/domain/program-blueprint.ts; src/domain/program-calendar.ts; src/domain/plan-limits.ts; src/domain/session-plan.ts; src/domain/coaching-workflow.ts; src/domain/manual-prescription.ts; src/domain/saved-routine.ts; src/server/validation/sport.ts; src/lib/units.ts; src/lib/time.ts; src/lib/date-time-format.ts.
- Proposed new files: src/domain/activity.ts; src/domain/activity-limits.ts; src/domain/activity-metrics.ts; src/domain/activity-prescription.ts; src/domain/occurrences.ts; src/domain/legacy-multisport.ts; src/lib/distance-units.ts; matching .test.ts files for the new domain modules.
- Migration/compatibility: pure v1/legacy decoders, explicit v2/v4 output contracts, discriminator adapters; no database writes or runtime switch.
- Tests/acceptance: AT-LOG, AT-STRUCT and contract parts of AT-DATA/AT-COACH; include exact native-unit round trips, Not sure, legacy effort, the four example prescriptions and invalid cross-sport payloads.
- Release/rollback checkpoint: current UI remains on old adapters; no legacy reader broken. Revert unused new modules if needed; no data rollback required.

### P2 — Expand storage and implement repeatable preservation

- Objective: add canonical identity/occurrence/typed storage with enforceable ownership and a verifiable backfill.
- Prerequisites: P1; OP-01/02 and backup rehearsal before any production execution.
- Existing files/modules: src/db/schema/index.ts; src/db/schema/enums.ts; src/db/schema/profiles.ts; src/db/schema/programs.ts; src/db/schema/runs.ts; src/db/schema/workouts.ts; src/db/schema/coach.ts; src/db/schema/coaching-workflow.ts; src/db/schema/coaching-evidence.ts; src/db/schema/shared-stats.ts; src/db/backfill-shared-stats.ts; src/db/test/fixtures.ts; src/db/test/pglite.ts; src/db/db.test.ts; src/db/account-deletion.test.ts; src/db/seed/data/program.ts; src/db/seed/data/templates.ts; src/db/seed/reference.ts; src/db/seed/seed.test.ts; scripts/dev/seed-people.ts.
- Proposed new files: src/db/schema/activities.ts; src/db/schema/occurrences.ts; src/db/schema/activity-templates.ts; src/db/schema/activity-resources.ts; src/db/schema/sport-preferences.ts; src/db/schema/multisport-migration.ts; src/db/backfill-multisport.ts; src/db/migrations/multisport-backfill.test.ts; src/db/migrations/multisport-constraints.test.ts. New SQL/snapshots/journal entries are M1/M2, numbered only at implementation.
- Migration/compatibility: M1 additive schema, owner registries, typed details, version fields and RLS; dry-run/chunk/retry ledger; M2 validation prepared but gated on reconciliation. Keep dailyRecovery and original applied migration files intact.
- Tests/acceptance: AT-DATA, AT-MIG, AT-PRIV ownership/cascade cases; idempotent backfills, 0011 legacy completions, run duplicates, copied version events, orphan/conflicting ownership and UUID collisions.
- Release/rollback checkpoint: legacy is still authoritative. Canonical projection can be rebuilt; errors cannot delete or modify raw history. Additive deployment only.

### P3 — Prove transactional running parity and preserve strength

- Objective: implement one canonical save/edit/delete boundary and verify all existing running/strength behaviour against it before exposing new sports.
- Prerequisites: P2; schemas and receipt/completion contracts stable.
- Existing files/modules: src/server/actions/runs.ts; src/server/actions/sessions.ts; src/server/repositories/runs.ts; src/server/repositories/sessions.ts; src/server/repositories/schedule.ts; src/server/repositories/shared-stats.ts; src/server/repositories/workout-equipment.ts; src/server/repositories/progression-rule.ts; src/db/with-user.ts; src/lib/offline-submit.ts; src/lib/workout-drafts.ts; src/components/use-session-drafts.ts; src/components/shell/connectivity.tsx; src/components/shell/session-chrome.tsx; src/components/shell/session-status.tsx; src/app/(app)/runs/run-form.tsx; src/app/(app)/workouts/[sessionId]/exercise-logger.tsx; src/app/(app)/workouts/[sessionId]/finish/finish-form.tsx.
- Proposed new files: src/server/repositories/activities.ts; src/server/repositories/occurrences.ts; src/server/actions/activities.ts; src/server/activity-effects.ts; src/lib/activity-drafts.ts; src/components/activities/use-activity-draft.ts; src/components/activities/running-form.tsx; src/server/repositories/activities.test.ts; src/server/actions/activities.test.ts; src/lib/activity-drafts.test.ts.
- Migration/compatibility: bridge run draft/contract support; strength parent maintained atomically on start/finish/discard in canonical mode; no simultaneous independent legacy/canonical writers. Canonical path enabled only in isolated tests/staging until P7.
- Tests/acceptance: AT-LIFE, AT-DATA save transactions, AT-LOG running, AT-REG strength; double submit, save timeout, delete/retry tombstone, concurrent edits, source revision and shared-stat consistency.
- Release/rollback checkpoint: first safe vertical slice is existing-running parity through the canonical model in an isolated database, plus unchanged strength regression. Bridge app may ship with legacy authority; canonical feature stays off for real writes.

### P4 — Build independent scheduling, shared navigation and sport forms

- Objective: complete Today/Training/History ownership, distinct sport forms, templates and beginner onboarding.
- Prerequisites: P3 identity/mutation boundary; approved route and scheduling contracts.
- Existing files/modules: src/lib/nav.ts; src/components/shell/bottom-nav.tsx; src/components/shell/page-header.tsx; src/app/(app)/today/page.tsx; src/app/(app)/today/today-view.tsx; src/app/(app)/today/choose/page.tsx; src/app/(app)/runs/page.tsx; src/app/(app)/runs/new/page.tsx; src/app/(app)/runs/planned-run.tsx; src/app/(app)/runs/[runId]/page.tsx; src/app/(app)/runs/[runId]/edit/page.tsx; src/app/(app)/profile/programme/page.tsx; src/app/(app)/profile/programme/cycle-day.tsx; src/app/(app)/profile/programme/proposals.tsx; src/app/(app)/profile/routines/page.tsx; src/app/(onboarding)/welcome/page.tsx; src/app/(onboarding)/welcome/steps.tsx; src/app/(onboarding)/welcome/programme/page.tsx; src/components/coaching/programme-options.tsx; src/components/coaching/intake-form.tsx; src/components/coaching/program-builder.tsx; src/components/coaching/draft-preview.tsx; src/components/coaching/routines.tsx; src/components/program-template-picker.tsx; src/server/actions/onboarding.ts; src/server/actions/manual-training.ts; src/server/actions/programs.ts; src/server/repositories/manual-training.ts; src/server/repositories/programs.ts; src/server/repositories/program-drafts.ts; src/server/repositories/program-revisions.ts; src/server/repositories/schedule.ts; src/server/queries/onboarding-entry.ts; src/server/queries/profile.ts; src/domain/schedule.ts; src/domain/program-calendar.ts; src/domain/program-patch.ts.
- Existing route families also affected: all profile/programme and welcome/programme create/manual/drafts/jobs pages, existing /settings aliases in next.config.ts, and src/app/(preview)/preview/{page,logging/page,coaching/page,headers/page}.tsx. The audit inventory gives their exact files; redirects and previews must not retain a Runs product.
- Proposed new route files: src/app/(app)/training/page.tsx; training/new/page.tsx; training/schedule/page.tsx; training/scheduled/page.tsx; training/activities/[activityId]/page.tsx and edit/page.tsx; training/templates/page.tsx, new/page.tsx and [id]/edit/page.tsx; training/programme/page.tsx, occurrences/[id]/page.tsx, create/page.tsx, manual/page.tsx, drafts/[id]/page.tsx and jobs/[id]/page.tsx (all under src/app/(app)).
- Proposed new modules: src/components/activities/cycling-form.tsx; swimming-form.tsx; activity-form-fields.tsx; prescription-editor.tsx; template-picker.tsx; src/server/repositories/activity-templates.ts; activity-resources.ts; sport-preferences.ts; src/server/actions/activity-templates.ts; occurrences.ts; matching component/repository tests.
- Migration/compatibility: blueprint materialisation writes explicit occurrences; old day/run adapters are read-only at cutover; old URL resolvers use durable IDs. Do not edit history to make it fit new UI.
- Tests/acceptance: AT-NAV, AT-SCHED, AT-STRUCT, AT-LOG, AT-ONBOARD and all five journeys; earlier incomplete work absent from Today, same-sport multiple IDs, independent strength progression, pool lengths and optional cycling distance.
- Release/rollback checkpoint: complete functional surfaces behind the deployment capability gate. No partial launch claiming supported coaching. Keep compatibility route handlers small and tested.

### P5 — Make coaching sport-complete and deployment-safe

- Objective: run the full intake/preparation/review/memory/proposal pipeline for all included sports with exact occurrence scope.
- Prerequisites: P1 versions, P3 receipts and P4 materialisation/schedule; policy test fixtures and source criteria.
- Existing files/modules: src/domain/coaching-workflow.ts; src/domain/session-plan.ts; src/domain/coach-policy.ts; src/domain/coach-cadence.ts; src/domain/coach-review.ts; src/domain/coach-memory.ts; src/domain/training-evidence.ts; src/domain/program-change.ts; src/domain/program-patch.ts; src/server/repositories/coach-intakes.ts; coach-plans.ts; coach-memory.ts; coach-attachments.ts; coaching-jobs.ts; coaching-context.ts; coaching-evidence.ts; coaching-guardrails.ts; coaching-changes.ts; coaching-state.ts; coaching-today.ts; program-drafts.ts; program-revisions.ts (all repository paths share src/server/repositories/); src/server/actions/coaching-workflow.ts; src/server/actions/coach.ts; src/server/coach-routine.ts; src/server/coach-service.ts; src/server/coach-workflow-service.ts; src/server/dispatch-coach-job.ts; src/app/api/coach/service/[...path]/route.ts; src/app/api/coaching/attachments/route.ts; src/app/api/coaching/attachments/[id]/route.ts; src/components/coach-plan.tsx; src/components/run-plan.tsx; src/app/(app)/today/coach-actions.tsx; src/app/(app)/today/plan-actions.tsx; src/app/(app)/profile/ai-coach/ai-coach-settings.tsx; scripts/coach/workflow.ts; scripts/coach/{client,attempt,context,due,fail,propose,submit}.ts; .claude/skills/coach/SKILL.md; docs/coach-automation.md; docs/coach-api.md.
- Proposed new files: src/domain/coach-sport-policy.ts; src/domain/coach-sport-policy.test.ts; src/server/repositories/activity-evidence.ts; src/server/repositories/coaching-multisport.test.ts; src/server/coach-workflow-service.test.ts; src/components/activities/activity-plan.tsx.
- Migration/compatibility: versioned jobs/plans/memory; session-plan uniqueness per occurrence/revision, optional gym for non-strength; v3 result rejection and queue superseding; historical proposal/report decoding.
- Tests/acceptance: AT-COACH; test multiple daily preparations, review coverage, no unrequested sports, programme vs occurrence scope, real/target effort, quoted notes, stale leases/results, started/claimed work, consent toggles and legacy service path closure.
- Release/rollback checkpoint: v4 worker must negotiate successfully in isolated end-to-end rehearsal; no contract-v3 writer survives cutover. Existing agreed coaching request/diff behaviour is preserved without treating its entire separate proposal as implemented.

### P6 — Complete history, progress, social projections and read APIs

- Objective: every consumer understands four sports without loosening privacy or losing legacy reader behaviour.
- Prerequisites: canonical read contracts and P4 scheduling; independent from worker execution once P5 contract schemas are stable.
- Existing files/modules: src/domain/analytics.ts; src/domain/records.ts; src/domain/shared-stats.ts; src/domain/leaderboard.ts; src/domain/compare.ts; src/domain/comparable-history.ts; src/domain/period.ts; src/server/repositories/history.ts; training-data.ts; training-volume.ts; shared-stats.ts; people.ts; follows.ts; body-weight.ts; muscle-volume.ts (under src/server/repositories/); src/server/queries/leaderboard.ts; head-to-head.ts; comparable.ts (under src/server/queries/); src/server/validation/sport.ts; leaderboard.ts; privacy.ts; params.ts; date-range.ts (under src/server/validation/); src/server/actions/privacy.ts; src/server/actions/account.ts; src/server/coach-api.ts; src/app/api/coach/[...path]/route.ts; src/app/(app)/history/history-view.tsx; src/app/(app)/progress/progress-view.tsx; src/app/(app)/u/[username]/page.tsx; src/app/(app)/u/[username]/compare/page.tsx; src/app/(app)/u/[username]/compare/[exerciseId]/page.tsx; src/app/(app)/profile/friends/activity-row.tsx; leaderboard/page.tsx; leaderboard/leaderboard-controls.tsx; compare/page.tsx (under that friends route); src/app/(app)/profile/privacy/privacy-switches.tsx; src/components/ui/sport-switch.tsx; sport-period-controls.tsx (under src/components/ui/); src/components/friends-board-card.tsx; src/components/records-card.tsx; docs/coach-api.md.
- Proposed new files: src/server/coach-api-v2.ts; src/server/coach-api.test.ts; src/server/repositories/activity-analytics.ts; src/server/repositories/activity-analytics.test.ts; src/app/(app)/u/[username]/activities/[sharedStatId]/page.tsx; src/components/activities/activity-summary.tsx.
- Migration/compatibility: M2 shared source constraints; new-sport opt-out preferences; v1 projections/headers and v2 endpoints; deterministic shared-stat rebuild preserving current opt-outs.
- Tests/acceptance: AT-STAT, AT-PRIV, AT-API, deletion parts of AT-LIFE; data sets exceed 200/500 records, edited-record recomputation, no private field leaks, no inferred segments.
- Release/rollback checkpoint: v1 golden comparisons and adversarial ownership checks pass before canonical reads become authoritative.

### P7 — Rehearse and cut over the complete release

- Objective: a verified all-sport release with a recoverable authority switch.
- Prerequisites: P0–P6 complete; full acceptance matrix, OP gates, backup/restore/replay rehearsal and first-party client inventory.
- Existing files/modules: package.json; package-lock.json only if approved missing test tooling is added; vitest.config.mts; next.config.ts; vercel.json; src/db/deploy.ts; src/db/migrate.ts; src/lib/coach-rollout.ts; src/lib/env.ts; src/app/manifest.ts; public/sw.js; public/offline.html; scripts/measure-performance.ts; scripts/dev/auth-stub.mjs; docs/coach-automation.md; docs/coach-api.md.
- Proposed new files: tests/e2e/multisport.spec.ts and playwright.config.ts only if browser automation is adopted during implementation; otherwise record equivalent manual journeys in the rollout runbook. Browser automation is proposed tooling, not installed infrastructure. Add a deployment capability/version gate module at src/lib/multisport-rollout.ts with tests.
- Migration/compatibility: execute §10's ordered bridge/backfill/pause/M2/switch/v4 sequence. Assert no new sport writes before switch and no legacy writes afterwards.
- Tests/acceptance: all AT families; full existing regression suite in isolated environment, browser/mobile/PWA checks, old open tab, logout, slow/interrupted save, time-zone change and real concurrency; performance at representative scale.
- Release/rollback checkpoint: identify the first canonical write. Abort before it on reconciliation failure; afterwards use a compatible canonical rollback or tested replay/roll-forward. Confirm all four sports and required coaching are actually enabled.

### P8 — Contract legacy code after measured compatibility

- Objective: remove temporary duplicate infrastructure while retaining historical interpretation and necessary aliases.
- Prerequisites: minimum 90-day UI/180-day API windows, usage gates, no legacy writers, verified exports/mappings, stable new model, fresh backup and tested recovery.
- Existing files/modules: old src/app/(app)/runs routes; src/server/actions/runs.ts; src/server/repositories/runs.ts; legacy branches in src/domain/program-blueprint.ts, session-plan.ts, schedule.ts and src/server/coach-service.ts; src/db/schema/runs.ts (retain dailyRecovery); src/db/schema/programs.ts; src/db/schema/coach.ts; src/server/coach-api.ts; scripts/coach legacy clients; docs/coach-api.md; docs/coach-automation.md.
- Proposed new files: M3 SQL and journal/snapshot entries; contract-migration tests in src/db/migrations/multisport-contract.test.ts. Keep necessary pure legacy readers/ID aliases; do not delete evidence resolution just because a URL is retired.
- Migration/compatibility: drop retired raw-write structures only when all consumers use canonical data; API removal returns documented 410; UI aliases can remain tiny resolvers if legitimate bookmarks persist.
- Tests/acceptance: AT-MIG/AT-API historical readability and no dual source; full account deletion and recovery-table preservation after contract.
- Release/rollback checkpoint: no old-app rollback assumption after schema contraction. Keep canonical recovery procedure and enforce configured data/backup retention; no indefinite redundant private raw tables.

## 12. Current dependency map and audit evidence

All rows below are V unless explicitly labelled D or U. This is a map of the current checkout, not a claim about deployment.

### 12.1 End-to-end path

~~~text
coachIntakeSchema / manual builder / seed template
  → programBlueprintSchema v1
  → createProgramFromBlueprint / programRuns + programDays
  → getSchedule / slotParts / getRunTarget
  → sessionTarget / coachJobContext / coachPlanSchema
  → todayWorkflowState + Today, or Runs planned-run card
  → saveRunAction / workout session actions
  → createRun/updateRun + writeRunStats / recordSlotEvent
  → training-data + history + analytics + shared stats
  → readCoachingEvidence / coachJobContext / assessProgramChange
  → saved proposal / applyProposal / carryPlansToRevision
~~~

### 12.2 Exact modules, symbols and coupling

| Area | Existing files and relevant symbols | Finding / planned boundary |
| --- | --- | --- |
| Global navigation | src/lib/nav.ts: NAV_ITEMS, isNavItemActive, sectionLabel; src/lib/nav.test.ts | Runs is a primary item; workout paths activate Today; replace route/context logic |
| Shell ownership | src/components/shell/bottom-nav.tsx, page-header.tsx, session-chrome.tsx, session-status.tsx, rest-timer.tsx | Headers/back labels and in-progress strength strip must agree with new origin; retain timer |
| Run UI | src/app/(app)/runs/page.tsx, planned-run.tsx, run-form.tsx, new/page.tsx, [runId]/page.tsx, [runId]/edit/page.tsx, [runId]/delete-button.tsx | List/planned target/selected occurrence/new/edit/delete tightly coupled; remove standalone product ownership |
| Today | src/app/(app)/today/page.tsx, today-view.tsx, choose/page.tsx, plan-actions.tsx, coach-actions.tsx, gym-switcher.tsx | Lifting/gym gate affects plan display; scheduled sport-only cards need independent eligibility |
| Programme screens | src/app/(app)/profile/programme/page.tsx, cycle-day.tsx, proposals.tsx; create/manual/drafts/jobs pages | Day flags, diffs, review/opening plans and links all carry binary assumptions |
| Intake/onboarding | src/domain/coaching-workflow.ts: coachIntakeSchema, validateIntake; src/components/coaching/intake-form.tsx, programme-options.tsx; src/app/(onboarding)/welcome/steps.tsx; src/server/queries/onboarding-entry.ts | Required lifting frequency/location and gym path cannot remain prerequisites for endurance-only users |
| Manual/template flow | src/components/coaching/program-builder.tsx, routines.tsx, draft-preview.tsx; src/domain/manual-prescription.ts, saved-routine.ts; src/server/repositories/manual-training.ts | Reusable strength routine is not an endurance template; preserve specialised prescription |
| Blueprint | src/domain/program-blueprint.ts: BLUEPRINT_VERSION, programBlueprintSchema; src/server/repositories/programs.ts: createProgramFromBlueprint, readProgramBlueprint | v1 flags plus runs array; run uniqueness week+weekday cannot express two same-day runs |
| Programme storage | src/db/schema/programs.ts: programs, programDays, programRuns, programSlotEvents | One active programme; event identity programme/cycle/day/part; source UUIDs lack raw-source FK |
| Calendar and sequence | src/domain/program-calendar.ts: programWeekIndex, todayInTimeZone; src/domain/schedule.ts: slotParts, pendingParts, slotStatus, nextPendingSlot, suggestion, progress | Both lifting/run parts settle a day; start-day/rest/shift semantics covered in schedule.test.ts |
| Schedule repository | src/server/repositories/schedule.ts: getSchedule, getTodayPlan, getRunTarget, listRunTargets, slotForPlannedRun, recordSlotEvent, clearRunSlotEvent | Weekday matching and on-conflict event insert need exact occurrence replacement |
| Run mutations | src/server/actions/runs.ts: saveRunAction; src/server/repositories/runs.ts | Validates effort, links completion, invalidates and redirects; writes/deletes shared stats transactionally |
| Raw run/recovery | src/db/schema/runs.ts: runs, dailyRecovery; src/domain/running.ts, pace.ts | Generated run pace, effortReported, symptoms and optional gym/workout/program links; recovery must survive file reorganisation |
| Strength lifecycle | src/server/actions/sessions.ts; src/server/repositories/sessions.ts; src/db/schema/workouts.ts; src/app/(app)/workouts/[sessionId]/exercise-logger.tsx, use-set-rows.ts, view-model.ts | Common parent must follow start/finish/discard without rewriting sets/logger |
| Strength comparability | src/domain/comparable-history.ts, progression.ts, equipment-resolution.ts, sets.ts; src/server/repositories/workout-equipment.ts, progression-rule.ts; src/server/queries/comparable.ts | Machine identity, portable equipment and comparable loads remain strength-specific |
| History/data | src/server/repositories/training-data.ts: readWorkouts, readRuns, readRecovery, readTrainingData; src/server/repositories/history.ts; src/app/(app)/history/history-view.tsx | Bounded samples/binary item formatting; full aggregate queries must be independent of limits |
| Progress | src/domain/analytics.ts: trainingAnalytics, performanceSeries; src/server/repositories/training-volume.ts, muscle-volume.ts; src/app/(app)/progress/progress-view.tsx | Strength adherence currently depends on combined slot status; preserve actual metrics, change independent resolution |
| Sport discriminator | src/domain/sport-scope.ts: TRAINING_SPORTS, TrainingSport, summaryForSport, warningsForSport; src/server/validation/sport.ts | Two-member workout/run type and fallback branches; exhaustive mapping replaces else=run/strength assumptions |
| Coaching shapes | src/domain/session-plan.ts: planRunSchema, coachPlanSchema, sportSummariesSchema; src/domain/coaching-workflow.ts: jobTargetSchema, openingPlanSchema | One optional run, workout/run summaries and day/gym targets affect every caller |
| Job lifecycle | src/server/repositories/coaching-jobs.ts: enqueueDailySession, sessionTarget, claimCoachJob, acceptCoachJobResult, dispatchCoachPage; src/db/schema/coaching-workflow.ts | Daily dedupe/lease/retry/source revision and athlete serialisation must carry occurrence IDs |
| Context and cadence | src/server/repositories/coaching-context.ts: trainingPeriodSummary, coachJobContext; src/domain/coach-cadence.ts; src/server/repositories/coaching-today.ts: todayWorkflowState | Limited raw samples plus exact review aggregates; quiet-day test extends to all actual sports |
| Review/safety | src/domain/coach-policy.ts: COACH_POLICY; src/domain/coach-review.ts: reviewPlan; src/server/repositories/coaching-guardrails.ts; src/domain/training-evidence.ts | Running progression/symptoms are specific policy, not universal cardio rules |
| Evidence/memory | src/server/repositories/coaching-evidence.ts: readCoachingEvidence, retainEvidenceBaselines; src/domain/coach-memory.ts: evidenceIdSchema, isAthleteTextSource, validateMemoryQuote; src/server/repositories/coach-memory.ts | run: evidence aliases, separate run:weekday scopes, sport tags, note quotes and dispositions need explicit conversion |
| Revision acceptance | src/domain/program-change.ts: assessProgramChange; src/domain/program-patch.ts: applyProgramPatch; src/server/repositories/program-revisions.ts: applyProposal; src/server/repositories/coach-plans.ts: carryPlansToRevision; src/server/repositories/program-drafts.ts | Copies historical events/plans by lineage; replace duplicate resolutions with durable occurrence identity |
| Coach plans/state | src/server/repositories/coach-plans.ts, coaching-state.ts, coaching-changes.ts, coach-intakes.ts, coach-attachments.ts; src/db/schema/coach.ts, coaching-evidence.ts | Gym/day uniqueness, pending proposals and stored JSON cannot be updated only at form level |
| Public API | src/app/api/coach/[...path]/route.ts; src/server/coach-api.ts: handleCoachRequest; src/server/repositories/coach-tokens.ts | Read-only bearer token API, versioned payloads/pagination; UI redirects do not solve this contract |
| Service/workflow API | src/app/api/coach/service/[...path]/route.ts; src/server/coach-service.ts: handleCoachServiceRequest; src/server/coach-workflow-service.ts: handleCoachWorkflow; src/server/dispatch-coach-job.ts | Legacy and workflow write paths coexist behind rollout logic; both require permanent compatibility guard |
| Automation | scripts/coach/workflow.ts and other scripts/coach/*.ts; .claude/skills/coach/SKILL.md; docs/coach-automation.md | Skill and scripts are first-party contract consumers; skill read only, workflow not invoked |
| Shared stat writes | src/domain/shared-stats.ts, records.ts; src/db/schema/shared-stats.ts; src/server/repositories/shared-stats.ts: writeSessionStats, writeRunStats, deleteRunStats | Source IDs polymorphic; distinct privacy rules; existing four-hour strength duration cap is not an endurance cap |
| Social readers | shared-stats.ts: readPeriodTotals, readLeaderboard, readActivity, readExerciseBests; src/server/queries/leaderboard.ts, head-to-head.ts | Running pace is best whole-run average for a qualifying distance, not an actual segment |
| Social UI | src/app/(app)/u/[username]/page.tsx and compare pages; src/app/(app)/profile/friends/activity-row.tsx, leaderboard/leaderboard-controls.tsx; src/components/ui/sport-switch.tsx, sport-period-controls.tsx | Binary labels, filters and metric choices must become exhaustive, with new-sport opt-in |
| Privacy/account | src/server/actions/privacy.ts, account.ts; src/server/validation/privacy.ts; src/db/account-deletion.test.ts; src/server/queries/profile-lifecycle.test.ts | Cascade and cache behaviour must include every new owner table/projection |
| Transactions | src/db/with-user.ts: withUser; src/db/client.ts; src/server/auth.ts | Owner RLS and profile row lock; retries only before work, no blind ambiguous replay |
| Draft/offline | src/lib/workout-drafts.ts, offline-submit.ts; src/components/use-session-drafts.ts; public/sw.js; public/offline.html; src/app/manifest.ts | Strength protected drafts; run form has no persistent draft; private routes not cached |
| Seeds/fixtures | src/db/seed/data/program.ts, templates.ts; src/db/test/fixtures.ts; scripts/dev/seed-people.ts; scripts/dev/auth-stub.sql | Sample programme and populated accounts contain two-sport shapes; do not run seeds on production |
| Migration history | src/db/migrations/0000–0023 SQL; particularly 0009, 0011, 0013, 0017, 0018, 0021, 0023 | Event backfills, lineage, provenance, sharing and note history are preservation evidence |
| Deployment/testing | package.json, package-lock.json, vitest.config.mts, vercel.json, next.config.ts; src/db/deploy.ts; src/db/test/pglite.ts | Existing Vitest/PGlite/jsdom; no browser test runner dependency; deploy may run migrations |
| Existing plans | docs/planning/COACHING_REQUESTS_AND_PROGRAMME_DIFF_PLAN.md, COACH_TRAINING_REFERENCE.md | D: agreed/requested future work, not code or deployed behaviour |
| Production | Database rows, deployed policies/migrations, environment and workers | U: not accessed; OP gates apply |

Identifier search covered includesRun, includesLifting, programRunId, programRuns, runsPerWeek, preferredRunDays, SlotPart/slotParts, TRAINING_SPORTS, sportSummaries, planRunSchema, effortReported, /runs, /api/coach/running and run: references, plus two-way sport conditionals, limits, redirects, invalidations, SQL backfills, JSON consumers and tests. Retained matches in historical SQL/compatibility readers are intentional; a zero-match search is not the acceptance criterion.

### 12.3 Testing infrastructure and evidence limits

Existing infrastructure: Vitest 5 with 115 tracked .test.ts/.test.tsx files, PGlite migration/RLS fixtures, Testing Library and jsdom component tests. src/db/test/pglite.ts supplies an isolated in-memory database/auth stub and applies real migration files. Snapshot files and migration snapshots were inventoried; snapshots are not standalone proof of behaviour. No Playwright dependency is installed.

Future verification should run targeted domain/repository/component cases, then the existing regression suite and the repository's lint/format/type checks in an isolated checkout with test-only environment. package.json's typecheck runs next typegen and can generate files; check also runs the full suite. Never run these under production credentials, a production-linked preview, or the mutable current planning-only workspace. Browser/PWA checks remain required whether automated tooling is added or recorded manually.

What actually ran in this planning task: read-only source/metadata searches and planning-document consistency checks. No application tests or runtime behaviour were observed.

## 13. Risks and explicit limits

| Risk | Mitigation and stopping condition |
| --- | --- |
| Broad identity change breaks specialised strength | Keep sets/exercises/equipment and logger intact; prove parent lifecycle and full existing regressions before new sport launch |
| Migrated events disagree with raw runs | Deterministic provenance-led map; preserve all records, stop reconciliation on ambiguity; no earliest-row guess |
| New occurrence model duplicates history across revisions | One durable occurrence + immutable prescriptions; validate source and lineage before merging old copied events |
| Target values masquerade as actual performance | Blank actual measurements, explicit effort/Not sure, immutable performed snapshot and evidence provenance tests |
| App/worker/browser version skew creates incompatible writes | Bridge release, version negotiation, old mutation rejection, lease drain and result/source checks |
| Common parent exposes raw private fields publicly | Separate allowlisted shared projection and serializers, owner RLS, negative privacy tests and opt-out defaults |
| Numeric/time-zone conversion changes history | Native-value retention, exact decimal conversion, legacy uncertainty labels, period/field reconciliation |
| Old bounded readers produce incomplete totals | SQL aggregates/known counts independent of page limits; explicit coverage in coach/context/chart APIs |
| New-sport coaching claims more certainty than evidence permits | Sport-specific tests, approved adjustment envelopes, source-backed holds/questions and required review coverage |
| Draft/claim mechanism becomes an offline/timer rewrite | Local recovery + explicit save only; bounded claims expire; no background queue, GPS or execution timer |
| Compatibility becomes permanent duplicate architecture | Canonical authority marker, measured minimum windows and cleanup criteria; small identity aliases only when still needed |
| Write pause exceeds chosen operational budget | Rehearse final delta; postpone switch or redesign/obtain a different window. Do not assume arbitrary downtime |
| Other branch work changes contracts during implementation | Re-establish baseline in P0 and update this register/phase dependencies; no overwriting unrelated work |
| Too many fields overwhelm beginners | Essentials first, More details per sport, goal-first coaching, one common flow; optional does not mean silently fabricated |
| “Advanced support” is mistaken for device-app parity | Clearly label manual summary metrics and prescription-only intervals; deferred capabilities remain explicit |

Material release constraints: OP-01–06 remain unverified facts. No production-read access, deployed behaviour or data cleanliness is claimed. The plan is ready for design review and implementation scoping under delegated decisions; production cutover remains conditional on these checks. If new evidence creates an unresolved material product choice, relabel the affected specification as a draft until resolved.

## 14. Complete brief coverage check

Status C = covered in the specification; F = factual prerequisite still to verify before deployment; D = deferred through an explicit user answer or final delegation. Excluded initiatives are respected non-goals, not hidden future work. References to acceptance families identify the detailed cases in the acceptance document.

| Brief requirement | Status | Plan / decision / acceptance coverage |
| --- | --- | --- |
| Discovery → decisions → final plan; no implementation | C | §1; decision authority; AT-BASE. Only three Markdown files changed |
| Read repository instructions, scripts, coach skill as dependency | C | §1/12; no coaching skill workflow, installs, jobs or runtime commands executed |
| Baseline SHA/branch/dirty tree and existing planning work | C | §1.1–1.3; P0 rechecks; docs-only branch changes distinguished |
| Missing named prompt and production unknowns reported honestly | C/F | §1.1/1.4; inline brief used; OP gates |
| Inventory first-party files and trace imports/callers/SQL/scripts/tests beyond run names | C | §12 and tracked appendix; identifiers and binary branches explicitly included |
| Programme → occurrence → coach → Today → log → completion → history → sharing → review | C | §12.1/12.2 and new contracts §§6–8 |
| Verified code vs documentation vs observed tests vs unknown | C | §1.2; no runtime/test results claimed |
| Manageable decision rounds, evidence/options/tradeoffs/stable IDs | C | Decision register preserves explicit responses and later delegation; no unanswered recommendation silently approved |
| Sport-only use, strength relation, terminology, enabled sports | C | §2; SCOPE/SPORT/ONBOARD; AT-ONBOARD/AT-REG |
| Additional sports and excluded integrations | C/D | §2.1; BRIEF non-goals; extra sports deferred, run/walk step not a new sport |
| Feature depth and reusable templates for all three endurance sports | C | §§2/5/8; SCOPE-04/PLAN-01; AT-STRUCT/AT-COACH |
| Beginner goal-first flow and optional advanced information | C | §2.4/4; ONBOARD; AT-ONBOARD/JOURNEY |
| Navigation alternatives, concrete routes and wireframes | C | §§2.3/3 plus decision alternatives; NAV; AT-NAV |
| Distinct Today/Training/History/Progress/programme ownership | C | §§2.3/3; ad hoc absent Today, older incomplete in Cycle/standalone schedule |
| Create/list/filter/detail/edit/template/empty/back/active tab | C | §3 route/context rules; AT-NAV/AT-LIFE |
| Old URLs including planned query, missing/foreign/deleted/unknown behaviour | C | §3.2; NAV-04; AT-NAV-06/07 |
| Internal links, redirects, revalidation, metadata, typed routes and previews | C | §3 and P4/P6; activity-effects helper; AT-NAV-08 |
| UI compatibility duration vs API compatibility | C/F | §§3/8.6; 90/180 days + usage gates; actual consumers OP-04/06 |
| Per-sport required/optional/source/units/derived fields and validation/defaults | C | §4 matrices; LOG/RUN/CYCLE/SWIM/UNIT/FIELD; AT-LOG |
| Running-specific fields/pace/symptoms retained | C | §4.3; explicit LOG-02; AT-LOG/AT-MIG |
| Cycling unknown distance, environment, resources, advanced summary metrics | C | §4.4; CYCLE-01; AT-LOG-03/04/19 |
| Swimming lengths vs lap, pool units/stroke/time/rest/pace | C | §4.5; SWIM; AT-LOG-05–09 |
| Active/elapsed/rest semantics and interval/total discrepancies | C | §§4/5; no target-derived actuals; AT-LOG/AT-STRUCT |
| Precision, rounding, null/zero, independently chosen numeric caps | C | §4.6/6.4; UNIT-02; AT-LOG |
| Actual effort and historical unconfirmed provenance | C | §§4/8/10; LOG-03; AT-LOG-10/11/AT-COACH |
| Manual/live lifecycle, edits/delete/undo/backdating/drafts/concurrency | C/D | §5: manual chosen; no undo/live timer; corrections/recovery/receipts retained; AT-LIFE |
| Sport/link changes after save and consequences | C | §5.2; LIFE-04; delete/re-log explicit, no silent relinking |
| Structured warm-up/work/recovery/cool-down/repeats/targets | C | §5.1; STRUCT-01; four example cases and AT-STRUCT |
| Per-interval actuals, nested repeats and live execution | D | User chose manual logging; delegation chooses totals/one repeat level; SCOPE-05/STRUCT-02 |
| Same/mixed sport per day, ordering, budgets, rest and active programmes | C | §7; SCHED-01/02/05/07; AT-SCHED |
| Independent progression, dates vs sequence, late/out-of-order work | C | §§2.3/7; SCHED-01/03/04; AT-SCHED-01–05 |
| Occurrence identity, programme lineage/revisions, single actual cardinality | C | §6 ER/contracts, §7; DATA-02/LINK-02; AT-DATA/AT-SCHED |
| Explicit matching/ad hoc/relink/partial/delete policy | C | §5.2/7; LINK/LIFE; no auto suggestions, one fulfilment |
| Programme revisions preserve pending/completed/skipped/drafts/prepared plans | C | §§7/8.4/10; SCHED-06/COACH-08; AT-SCHED/COACH/MIG |
| Architecture alternatives with constraints/query/migration tradeoffs | C | §6.1; DATA-01; common parent selected, specialised strength preserved |
| ER ownership/cardinality/typed contracts/dictionary/indexes/queries | C | §§4/6; DATA; AT-DATA |
| Validation parity/derived values/deletion/idempotency/source provenance | C | §§4–6; AT-LOG/LIFE/DATA |
| Gym/machine load identity independent of pool/bike/location | C | §§4/6/9; DATA-03; AT-REG |
| Proportional future import boundary | C/D | Source metadata/receipts only; provider services and streams excluded |
| Full coach intake/materialisation/jobs/opening/prep/review/memory/result/scripts audit | C | §8/12; COACH; AT-COACH |
| Coach sport permission, required review and per-sport policy tests | C | §§2.4/8.2/8.3; COACH-01–05; AT-COACH |
| Whole-programme vs single-occurrence authority, started/completed freeze | C | §8.4; AT-COACH-07/08/14 |
| Blueprint/worker/stored JSON/API versions and old saved proposals | C | §8.1/8.4/8.6/10.2; AT-COACH/AT-API/MIG |
| run: evidence IDs, sport memory, selected occurrence and historical reports | C | §8.4; AT-COACH-11–13 |
| Queued/claimed jobs, lease/retry/idempotency/consent/skew | C/F | §8.5/10.4; COACH-07; OP-04; AT-COACH/AT-REL |
| Isolation/source-backed reasoning/read-only token boundary | C | §§6/8/9; AT-DATA/COACH/API/PRIV |
| Valid counts/days/durations/effort/volume/distance/adherence | C | §9.1; PROGRESS; AT-STAT |
| Comparable equipment/environment/pool/stroke/protocol, no inferred segments | C | §9.1; AT-STAT |
| Existing feed/person/compare/boards/shared writer/delete/cache features | C | §9.2/9.3/12; SOCIAL; AT-PRIV |
| New-sport social release scope and granular sharing | C | §9.2; participation opt-in; no advanced metric/notes/location sharing |
| RLS/cross-account links/export/account deletion every new relationship | C | §§6/8.6/9.3; AT-DATA/PRIV/API |
| Nonempty production, no loss/reset, retention/downtime/backups/active clients | C/F | §10; MIG/OP; factual checks required, no deployment assumption |
| Explicit raw/programme/events/JSON/templates/routines/stats/memory/draft mappings | C | §10.2; AT-MIG-02–07/11 |
| Preserve units/notes/symptoms/dates/unknowns/effort/links/recovery | C | §10.2; AT-MIG-03/09/10 |
| Duplicates/orphans/incomplete/history inconsistencies resolution policy | C/F | §10.3; MIG-03; preserve/report/block ambiguous facts |
| Staged vs coordinated rollout, ordering and finite authority switch | C | §10.1/10.4; MIG-01; AT-MIG-12/REL |
| Repeatable backfill/verification/field samples/aggregate equivalence | C | §10.5; AT-MIG-01–10 |
| Pre-new-write vs post-new-write rollback with new-sport preservation | C/F | §10.6; AT-MIG-13/14; restore capability OP-03 |
| Local draft parity versus full offline rewrite, versions/logout/retries | C/D | §5.3; LIFE-05; no background sync; AT-LIFE/REL |
| Existing test infrastructure and proposed missing browser tooling | C | §12.3/P7; TEST-01; no installations in planning |
| Domain/DB/RLS/action/API/UI/integration/manual mobile/PWA matrix | C | Acceptance §§2–10; phase tests and release checklist |
| Lifting-only/existing runner/indoor cyclist/pool swimmer/mixed journeys | C | AT-JOURNEY-01–07, including sport-only beginner |
| Every phase objective/prerequisites/existing/new files/migrations/tests/acceptance/rollback | C | §11 P0–P8, dependency graph and first safe running-parity slice |
| Three planning deliverables, register answers/blockers and test traceability | C | This plan and linked register/acceptance document |
| Final stop; plan approval not implementation permission | C | Status banner and final handoff; no implementation begins |

## 15. Established-app references and design inference

Primary documentation checked on 19 September 2026:

- Strava documents manual sport/time/distance entry without a GPS recording. This supports a useful manual-first release. Overload's planned edit/effort/unknown-distance rules are its own decisions, not a claim of identical Strava behaviour. [Strava manual activities](https://support.strava.com/en-us/articles/15402188-how-do-i-upload-a-manual-activity-to-strava).
- TrainingPeaks documents time/distance targets, effort/intensity options and repeat blocks. This informed the structured prescription editor with beginner essentials and optional detail. Overload deliberately chooses one repeat level and no device execution. [TrainingPeaks Structured Workout Builder](https://help.trainingpeaks.com/hc/en-us/articles/235164967-Structured-Workout-Builder).
- TrainingPeaks describes calculated information in planned workout details. Overload likewise separates prescription totals from manually reported actuals; it does not adopt TSS/IF, zones or sensor integrations. [TrainingPeaks builder FAQ](https://help.trainingpeaks.com/hc/en-us/articles/115003760832-Structured-Workout-Builder-FAQ).

These are product-pattern references. They are not authority for athlete-specific training prescriptions, numerical input caps, Overload's data model, or a claim that every requested feature already works in another app.

## 16. Tracked-file inventory

The following is the complete 706-path tracked inventory at the audited SHA, excluding the three new untracked planning documents and the preexisting untracked output/ directory. It includes tests, migration snapshots, reference assets and documentation as inventory entries; their presence is not a claim that binary assets or every snapshot were executed or semantically reviewed. Material dependency findings and evidence are recorded in §12. No dependency/vendor files or private environment values are reproduced.

<details>
<summary>Show the complete tracked inventory</summary>

~~~text
.claude/settings.json
.claude/skills/coach/SKILL.md
.env.example
.gitignore
.prettierignore
.prettierrc
AGENTS.md
CLAUDE.md
README.md
SETUP.md
docs/check-in.md
docs/coach-api.md
docs/coach-automation.md
docs/decisions/0001-phase-0-foundation.md
docs/decisions/0002-supabase-drizzle-rls.md
docs/decisions/0003-phase-2-gym-and-equipment-ui.md
docs/decisions/0004-phase-3-library-and-availability.md
docs/decisions/0005-phase-4-sessions-and-scheduling.md
docs/decisions/0006-phase-5-progression-engine.md
docs/decisions/0007-phase-6-running.md
docs/decisions/0008-history-coach-and-pwa-polish.md
docs/decisions/0009-tuesday-lower-a-cycle.md
docs/decisions/0010-multi-user-accounts.md
docs/decisions/0011-responsive-interface-and-navigation.md
docs/decisions/0012-latency-round-trips-and-caches.md
docs/decisions/0013-form-interface.md
docs/decisions/0014-less-said-per-screen.md
docs/decisions/0015-grouped-boxes.md
docs/decisions/0016-today-and-the-programme.md
docs/decisions/0017-navigation-island-and-page-headers.md
docs/decisions/0018-ai-house-coach.md
docs/decisions/0019-the-coach-plans-the-whole-week.md
docs/decisions/0020-who-you-are-and-what-you-weigh.md
docs/decisions/0021-two-tasks-a-day-and-three-ways-to-count-a-set.md
docs/decisions/0022-a-status-bar-at-the-bottom-of-the-screen.md
docs/decisions/0023-a-masthead-not-a-stack.md
docs/decisions/0024-one-trend-two-screens.md
docs/decisions/0025-two-ways-in-and-nothing-asked-twice.md
docs/decisions/0026-friends-and-what-a-friend-can-see.md
docs/friends/README.md
docs/icon-refresh/README.md
docs/icon-refresh/icons.js
docs/icon-refresh/index.html
docs/icon-refresh/licenses/phosphor.txt
docs/icon-refresh/licenses/tabler.txt
docs/icon-refresh/preview.css
docs/icon-refresh/preview.html
docs/icon-refresh/preview.js
docs/icon-refresh/review.css
docs/icon-refresh/review.js
docs/icon-refresh/screenshots/comparison-dark.png
docs/icon-refresh/screenshots/comparison-light.png
docs/icon-refresh/screenshots/duotone-desktop-dark.png
docs/icon-refresh/screenshots/duotone-phone-dark.png
docs/icon-refresh/screenshots/duotone-tablet-light.png
docs/icon-refresh/screenshots/inventory-dark.png
docs/icon-refresh/screenshots/selected-desktop-dark.png
docs/icon-refresh/screenshots/selected-phone-dark.png
docs/icon-refresh/screenshots/selected-phone-light.png
docs/icon-refresh/screenshots/selected-tablet-light.png
docs/icon-refresh/serve.mjs
docs/icon-refresh/sources.json
docs/implementation-plan.md
docs/local-dev.md
docs/performance-audit-files.json
docs/performance-audit.md
docs/planning/AI_COACH_EVALUATIONS.md
docs/planning/AI_COACH_IMPLEMENTATION_PLAN.md
docs/planning/AI_COACH_IMPLEMENTATION_PROGRESS.md
docs/planning/AI_COACH_PLANNING_QA.md
docs/planning/AI_COACH_POLICY_V2.md
docs/planning/AI_COACH_PROMPT_SNAPSHOT.md
docs/planning/AI_COACH_REVAMP.md
docs/planning/AI_COACH_SCIENCE.md
docs/planning/CLAUDE_CODE_IMPLEMENTATION_PROMPT.md
docs/planning/COACHING_REQUESTS_AND_PROGRAMME_DIFF_PLAN.md
docs/planning/COACH_MEMORY_AND_SPORTS.md
docs/planning/COACH_TRAINING_REFERENCE.md
docs/planning/DATA_MODEL_AND_ARCHITECTURE.md
docs/planning/FRIENDS_COMPARE_LEADERBOARD_PLAN.md
docs/planning/PRODUCT_REQUIREMENTS.md
docs/planning/TRAINING_CONTEXT.md
docs/planning/vinit_final_8_week_strength_aesthetics_hybrid.xlsx
docs/planning/vinit_training_plan_intake_and_warmups.xlsx
docs/qa-audit.md
docs/ui-redesign/01-layout-specification.md
docs/ui-redesign/02-implementation-plan.md
docs/ui-redesign/03-themes-and-performance.md
docs/ui-redesign/README.md
docs/ui-redesign/themes/README.md
drizzle.config.ts
eslint.config.mjs
next.config.ts
package-lock.json
package.json
postcss.config.mjs
public/icons/icon-192.png
public/icons/icon-512-maskable.png
public/icons/icon-512.png
public/offline.html
public/sw.js
scripts/coach/attempt.ts
scripts/coach/client.ts
scripts/coach/context.ts
scripts/coach/due.ts
scripts/coach/fail.ts
scripts/coach/propose.ts
scripts/coach/submit.ts
scripts/coach/workflow.ts
scripts/dev/auth-stub.mjs
scripts/dev/auth-stub.sql
scripts/dev/seed-people.ts
scripts/install-deps.sh
scripts/measure-performance.ts
scripts/render-icons.mjs
src/app/(app)/error.tsx
src/app/(app)/exercises/[exerciseId]/exercise-trend.tsx
src/app/(app)/exercises/[exerciseId]/loading.tsx
src/app/(app)/exercises/[exerciseId]/page.tsx
src/app/(app)/exercises/exercise-library.tsx
src/app/(app)/exercises/loading.tsx
src/app/(app)/exercises/new/page.tsx
src/app/(app)/exercises/page.tsx
src/app/(app)/gyms/[gymId]/edit/loading.tsx
src/app/(app)/gyms/[gymId]/edit/page.tsx
src/app/(app)/gyms/[gymId]/equipment/[equipmentId]/loading.tsx
src/app/(app)/gyms/[gymId]/equipment/[equipmentId]/page.tsx
src/app/(app)/gyms/[gymId]/equipment/new/loading.tsx
src/app/(app)/gyms/[gymId]/equipment/new/page.tsx
src/app/(app)/gyms/[gymId]/gym-details.tsx
src/app/(app)/gyms/[gymId]/loading.tsx
src/app/(app)/gyms/[gymId]/page.tsx
src/app/(app)/gyms/[gymId]/programme/[exerciseId]/fallback/fallback-form.tsx
src/app/(app)/gyms/[gymId]/programme/[exerciseId]/fallback/loading.tsx
src/app/(app)/gyms/[gymId]/programme/[exerciseId]/fallback/page.tsx
src/app/(app)/gyms/[gymId]/programme/loading.tsx
src/app/(app)/gyms/[gymId]/programme/page.tsx
src/app/(app)/gyms/equipment-form.test.tsx
src/app/(app)/gyms/equipment-form.tsx
src/app/(app)/gyms/gym-form.tsx
src/app/(app)/gyms/loading.tsx
src/app/(app)/gyms/new/loading.tsx
src/app/(app)/gyms/new/page.tsx
src/app/(app)/gyms/page.tsx
src/app/(app)/history/history-view.tsx
src/app/(app)/history/loading.tsx
src/app/(app)/history/page.tsx
src/app/(app)/layout.tsx
src/app/(app)/loading.tsx
src/app/(app)/not-found.tsx
src/app/(app)/profile/ai-coach/ai-coach-settings.test.tsx
src/app/(app)/profile/ai-coach/ai-coach-settings.tsx
src/app/(app)/profile/ai-coach/loading.tsx
src/app/(app)/profile/ai-coach/page.tsx
src/app/(app)/profile/coach/loading.tsx
src/app/(app)/profile/coach/page.tsx
src/app/(app)/profile/coach/token-manager.test.tsx
src/app/(app)/profile/coach/token-manager.tsx
src/app/(app)/profile/delete-account/delete-account-form.tsx
src/app/(app)/profile/delete-account/loading.tsx
src/app/(app)/profile/delete-account/page.tsx
src/app/(app)/profile/edit/loading.tsx
src/app/(app)/profile/edit/page.tsx
src/app/(app)/profile/edit/profile-form.test.tsx
src/app/(app)/profile/edit/profile-form.tsx
src/app/(app)/profile/friends/activity-row.tsx
src/app/(app)/profile/friends/compare/loading.tsx
src/app/(app)/profile/friends/compare/page.tsx
src/app/(app)/profile/friends/leaderboard/leaderboard-controls.tsx
src/app/(app)/profile/friends/leaderboard/loading.tsx
src/app/(app)/profile/friends/leaderboard/page.tsx
src/app/(app)/profile/friends/loading.tsx
src/app/(app)/profile/friends/page.tsx
src/app/(app)/profile/friends/people-lists.tsx
src/app/(app)/profile/friends/people-tabs.ts
src/app/(app)/profile/friends/request-row.tsx
src/app/(app)/profile/loading.tsx
src/app/(app)/profile/page.tsx
src/app/(app)/profile/password/loading.tsx
src/app/(app)/profile/password/page.tsx
src/app/(app)/profile/password/password-form.tsx
src/app/(app)/profile/privacy/loading.tsx
src/app/(app)/profile/privacy/page.tsx
src/app/(app)/profile/privacy/privacy-switches.tsx
src/app/(app)/profile/programme/create/page.tsx
src/app/(app)/profile/programme/cycle-day.tsx
src/app/(app)/profile/programme/drafts/[id]/page.tsx
src/app/(app)/profile/programme/jobs/[id]/page.tsx
src/app/(app)/profile/programme/loading.tsx
src/app/(app)/profile/programme/manual/page.tsx
src/app/(app)/profile/programme/page.tsx
src/app/(app)/profile/programme/proposals.test.tsx
src/app/(app)/profile/programme/proposals.tsx
src/app/(app)/profile/rest-timer-setting.tsx
src/app/(app)/profile/routines/page.tsx
src/app/(app)/profile/sign-out-row.tsx
src/app/(app)/progress/loading.tsx
src/app/(app)/progress/page.tsx
src/app/(app)/progress/progress-view.tsx
src/app/(app)/runs/[runId]/delete-button.tsx
src/app/(app)/runs/[runId]/edit/loading.tsx
src/app/(app)/runs/[runId]/edit/page.tsx
src/app/(app)/runs/[runId]/loading.tsx
src/app/(app)/runs/[runId]/page.tsx
src/app/(app)/runs/loading.tsx
src/app/(app)/runs/new/loading.tsx
src/app/(app)/runs/new/page.tsx
src/app/(app)/runs/page.tsx
src/app/(app)/runs/planned-run.test.tsx
src/app/(app)/runs/planned-run.tsx
src/app/(app)/runs/run-form.tsx
src/app/(app)/today/choose/loading.tsx
src/app/(app)/today/choose/page.tsx
src/app/(app)/today/coach-actions.test.tsx
src/app/(app)/today/coach-actions.tsx
src/app/(app)/today/gym-switcher.tsx
src/app/(app)/today/loading.tsx
src/app/(app)/today/page.tsx
src/app/(app)/today/plan-actions.test.tsx
src/app/(app)/today/plan-actions.tsx
src/app/(app)/today/today-view.tsx
src/app/(app)/u/[username]/compare/[exerciseId]/loading.tsx
src/app/(app)/u/[username]/compare/[exerciseId]/page.tsx
src/app/(app)/u/[username]/compare/loading.tsx
src/app/(app)/u/[username]/compare/page.tsx
src/app/(app)/u/[username]/loading.tsx
src/app/(app)/u/[username]/page.tsx
src/app/(app)/workouts/[sessionId]/add-exercise/add-exercise-form.tsx
src/app/(app)/workouts/[sessionId]/add-exercise/loading.tsx
src/app/(app)/workouts/[sessionId]/add-exercise/page.tsx
src/app/(app)/workouts/[sessionId]/check-in/check-in-form.tsx
src/app/(app)/workouts/[sessionId]/check-in/loading.tsx
src/app/(app)/workouts/[sessionId]/check-in/page.tsx
src/app/(app)/workouts/[sessionId]/exercise-logger.test.tsx
src/app/(app)/workouts/[sessionId]/exercise-logger.tsx
src/app/(app)/workouts/[sessionId]/exercises/[workoutExerciseId]/substitute/loading.tsx
src/app/(app)/workouts/[sessionId]/exercises/[workoutExerciseId]/substitute/page.tsx
src/app/(app)/workouts/[sessionId]/finish/finish-form.tsx
src/app/(app)/workouts/[sessionId]/finish/loading.tsx
src/app/(app)/workouts/[sessionId]/finish/page.tsx
src/app/(app)/workouts/[sessionId]/loading.tsx
src/app/(app)/workouts/[sessionId]/page.tsx
src/app/(app)/workouts/[sessionId]/session-details.tsx
src/app/(app)/workouts/[sessionId]/set-grid.tsx
src/app/(app)/workouts/[sessionId]/set-options.tsx
src/app/(app)/workouts/[sessionId]/superset-sheet.tsx
src/app/(app)/workouts/[sessionId]/use-set-rows.ts
src/app/(app)/workouts/[sessionId]/view-model.ts
src/app/(app)/workouts/[sessionId]/workout-overview.tsx
src/app/(app)/workouts/[sessionId]/workout-view.tsx
src/app/(auth)/auth-link.ts
src/app/(auth)/forgot-password/forgot-password-form.tsx
src/app/(auth)/forgot-password/page.tsx
src/app/(auth)/layout.tsx
src/app/(auth)/login/login-form.tsx
src/app/(auth)/login/page.tsx
src/app/(auth)/not-configured.tsx
src/app/(auth)/reset-password/page.tsx
src/app/(auth)/reset-password/reset-password-form.tsx
src/app/(auth)/signup/page.tsx
src/app/(auth)/signup/signup-form.test.tsx
src/app/(auth)/signup/signup-form.tsx
src/app/(onboarding)/layout.tsx
src/app/(onboarding)/welcome/equipment/equipment-step-form.test.tsx
src/app/(onboarding)/welcome/equipment/equipment-step-form.tsx
src/app/(onboarding)/welcome/equipment/page.tsx
src/app/(onboarding)/welcome/gym/first-gym-form.tsx
src/app/(onboarding)/welcome/gym/page.tsx
src/app/(onboarding)/welcome/page.tsx
src/app/(onboarding)/welcome/profile-step-form.tsx
src/app/(onboarding)/welcome/programme/create/page.tsx
src/app/(onboarding)/welcome/programme/drafts/[id]/page.tsx
src/app/(onboarding)/welcome/programme/jobs/[id]/page.tsx
src/app/(onboarding)/welcome/programme/manual/page.tsx
src/app/(onboarding)/welcome/programme/page.tsx
src/app/(onboarding)/welcome/skip-link.tsx
src/app/(onboarding)/welcome/steps.tsx
src/app/(preview)/layout.tsx
src/app/(preview)/preview-shell.tsx
src/app/(preview)/preview/coaching/page.tsx
src/app/(preview)/preview/headers/page.tsx
src/app/(preview)/preview/icons/page.tsx
src/app/(preview)/preview/icons/preview-controls.tsx
src/app/(preview)/preview/logging/page.tsx
src/app/(preview)/preview/page.tsx
src/app/api/coach/[...path]/route.ts
src/app/api/coach/service/[...path]/route.ts
src/app/api/coaching/attachments/[id]/route.ts
src/app/api/coaching/attachments/route.test.ts
src/app/api/coaching/attachments/route.ts
src/app/apple-icon.png
src/app/auth/confirm/route.test.ts
src/app/auth/confirm/route.ts
src/app/globals.css
src/app/icon.svg
src/app/layout.tsx
src/app/manifest.ts
src/app/not-found.tsx
src/app/page.tsx
src/client-boundary.test.ts
src/components/availability-badge.tsx
src/components/coach-plan.tsx
src/components/coaching/activity.tsx
src/components/coaching/builder-page.tsx
src/components/coaching/client-action.ts
src/components/coaching/creation-page.tsx
src/components/coaching/custom-exercise-form.tsx
src/components/coaching/draft-page.tsx
src/components/coaching/draft-preview.tsx
src/components/coaching/intake-form.test.tsx
src/components/coaching/intake-form.tsx
src/components/coaching/job-page.tsx
src/components/coaching/job-status.tsx
src/components/coaching/program-builder.tsx
src/components/coaching/programme-options.tsx
src/components/coaching/programme-tools.tsx
src/components/coaching/routines.tsx
src/components/coaching/saved-work.tsx
src/components/compare-header.tsx
src/components/confirm-sheet.tsx
src/components/date-range-fields.tsx
src/components/exercise-picker.tsx
src/components/follow-button.test.tsx
src/components/follow-button.tsx
src/components/friends-board-card.tsx
src/components/people-search.tsx
src/components/person-card.tsx
src/components/person-row.tsx
src/components/planned-exercises.tsx
src/components/profile-fields.test.tsx
src/components/profile-fields.tsx
src/components/program-template-picker.tsx
src/components/records-card.test.tsx
src/components/records-card.tsx
src/components/run-plan.tsx
src/components/shell/appearance-row.tsx
src/components/shell/appearance-sync.tsx
src/components/shell/bottom-nav.tsx
src/components/shell/connectivity.tsx
src/components/shell/install-row.tsx
src/components/shell/loading-page.tsx
src/components/shell/navigation-feedback.test.tsx
src/components/shell/navigation-feedback.tsx
src/components/shell/page-content.tsx
src/components/shell/page-header.test.tsx
src/components/shell/page-header.tsx
src/components/shell/rest-timer.tsx
src/components/shell/session-chrome.test.tsx
src/components/shell/session-chrome.tsx
src/components/shell/session-status.tsx
src/components/shell/wordmark.tsx
src/components/strength-trend.tsx
src/components/ui/app-link.tsx
src/components/ui/avatar.test.tsx
src/components/ui/avatar.tsx
src/components/ui/badge.tsx
src/components/ui/body-map.tsx
src/components/ui/body-regions.test.ts
src/components/ui/body-regions.ts
src/components/ui/button.tsx
src/components/ui/card.tsx
src/components/ui/chart.test.tsx
src/components/ui/chart.tsx
src/components/ui/compare-table.test.tsx
src/components/ui/compare-table.tsx
src/components/ui/detail-list.tsx
src/components/ui/dictation.test.tsx
src/components/ui/dictation.tsx
src/components/ui/disclosure.tsx
src/components/ui/empty-state.tsx
src/components/ui/field.test.tsx
src/components/ui/field.tsx
src/components/ui/filter-sheet.tsx
src/components/ui/form.tsx
src/components/ui/headline.tsx
src/components/ui/icons.tsx
src/components/ui/info-tip.test.tsx
src/components/ui/info-tip.tsx
src/components/ui/input.tsx
src/components/ui/link-row.tsx
src/components/ui/number-field.tsx
src/components/ui/period-select.tsx
src/components/ui/progress-bar.tsx
src/components/ui/radar-chart.test.tsx
src/components/ui/radar-chart.tsx
src/components/ui/rank-list.test.tsx
src/components/ui/rank-list.tsx
src/components/ui/section-select.tsx
src/components/ui/section.tsx
src/components/ui/segmented-control.test.tsx
src/components/ui/segmented-control.tsx
src/components/ui/select.tsx
src/components/ui/set-table.tsx
src/components/ui/sheet.tsx
src/components/ui/sport-period-controls.tsx
src/components/ui/sport-switch.tsx
src/components/ui/stat-tile.tsx
src/components/ui/switch.tsx
src/components/ui/tabs.test.tsx
src/components/ui/tabs.tsx
src/components/use-session-drafts.ts
src/components/username-field.test.tsx
src/components/username-field.tsx
src/db/account-deletion.test.ts
src/db/backfill-shared-stats.ts
src/db/client.ts
src/db/db.test.ts
src/db/deploy.ts
src/db/errors.ts
src/db/migrate.ts
src/db/migrations/0000_initial_schema.sql
src/db/migrations/0001_auth_bridge.sql
src/db/migrations/0002_gym_absent_equipment.sql
src/db/migrations/0003_sessions_and_schedule.sql
src/db/migrations/0004_misty_robin_chapel.sql
src/db/migrations/0005_tuesday_cycle.sql
src/db/migrations/0006_profile_onboarding.sql
src/db/migrations/0007_workout_supersets.sql
src/db/migrations/0008_coach_plans.sql
src/db/migrations/0009_coach_runs_and_lineage.sql
src/db/migrations/0010_profile_measurements_and_body_weight.sql
src/db/migrations/0011_careless_tinkerer.sql
src/db/migrations/0012_broad_eddie_brock.sql
src/db/migrations/0013_coaching_workflow.sql
src/db/migrations/0014_saved_routine_targets.sql
src/db/migrations/0015_coach_attempt_receipts.sql
src/db/migrations/0016_modern_micromax.sql
src/db/migrations/0017_coach_evidence.sql
src/db/migrations/0018_coach_notes_and_sports.sql
src/db/migrations/0019_usernames_and_privacy.sql
src/db/migrations/0020_follows.sql
src/db/migrations/0021_shared_stats.sql
src/db/migrations/0022_top_weight_sets.sql
src/db/migrations/0023_coach_note_dispositions.sql
src/db/migrations/backfill-body-weight.test.ts
src/db/migrations/meta/0000_snapshot.json
src/db/migrations/meta/0001_snapshot.json
src/db/migrations/meta/0002_snapshot.json
src/db/migrations/meta/0003_snapshot.json
src/db/migrations/meta/0004_snapshot.json
src/db/migrations/meta/0005_snapshot.json
src/db/migrations/meta/0006_snapshot.json
src/db/migrations/meta/0007_snapshot.json
src/db/migrations/meta/0008_snapshot.json
src/db/migrations/meta/0009_snapshot.json
src/db/migrations/meta/0010_snapshot.json
src/db/migrations/meta/0011_snapshot.json
src/db/migrations/meta/0012_snapshot.json
src/db/migrations/meta/0013_snapshot.json
src/db/migrations/meta/0014_snapshot.json
src/db/migrations/meta/0015_snapshot.json
src/db/migrations/meta/0016_snapshot.json
src/db/migrations/meta/0017_snapshot.json
src/db/migrations/meta/0018_snapshot.json
src/db/migrations/meta/0019_snapshot.json
src/db/migrations/meta/0020_snapshot.json
src/db/migrations/meta/0021_snapshot.json
src/db/migrations/meta/0022_snapshot.json
src/db/migrations/meta/0023_snapshot.json
src/db/migrations/meta/_journal.json
src/db/migrations/usernames-and-privacy.test.ts
src/db/schema/coach.ts
src/db/schema/coaching-evidence.ts
src/db/schema/coaching-workflow.ts
src/db/schema/common.ts
src/db/schema/enums.ts
src/db/schema/exercises.ts
src/db/schema/follows.ts
src/db/schema/gyms.ts
src/db/schema/index.ts
src/db/schema/profiles.ts
src/db/schema/programs.ts
src/db/schema/runs.ts
src/db/schema/shared-stats.ts
src/db/schema/workouts.ts
src/db/seed/data/equipment-types.ts
src/db/seed/data/exercises.ts
src/db/seed/data/program.ts
src/db/seed/data/templates.ts
src/db/seed/data/warmups.ts
src/db/seed/reference.ts
src/db/seed/run.ts
src/db/seed/seed.test.ts
src/db/test/fixtures.ts
src/db/test/pglite.ts
src/db/tuesday-cycle.test.ts
src/db/types.ts
src/db/with-user.test.ts
src/db/with-user.ts
src/domain/analytics.ts
src/domain/avatar.test.ts
src/domain/avatar.ts
src/domain/coach-cadence.test.ts
src/domain/coach-cadence.ts
src/domain/coach-memory.test.ts
src/domain/coach-memory.ts
src/domain/coach-policy.ts
src/domain/coach-request.ts
src/domain/coach-review.test.ts
src/domain/coach-review.ts
src/domain/coaching-workflow.test.ts
src/domain/coaching-workflow.ts
src/domain/comparable-history.test.ts
src/domain/comparable-history.ts
src/domain/compare.test.ts
src/domain/compare.ts
src/domain/effort.ts
src/domain/equipment-resolution.test.ts
src/domain/equipment-resolution.ts
src/domain/follows.test.ts
src/domain/follows.ts
src/domain/leaderboard.test.ts
src/domain/leaderboard.ts
src/domain/manual-prescription.ts
src/domain/muscle-split.test.ts
src/domain/muscle-split.ts
src/domain/muscle-volume.test.ts
src/domain/muscle-volume.ts
src/domain/muscles.ts
src/domain/pace.test.ts
src/domain/pace.ts
src/domain/period.ts
src/domain/plan-limits.ts
src/domain/program-blueprint.test.ts
src/domain/program-blueprint.ts
src/domain/program-calendar.test.ts
src/domain/program-calendar.ts
src/domain/program-change.test.ts
src/domain/program-change.ts
src/domain/program-patch.test.ts
src/domain/program-patch.ts
src/domain/progression.test.ts
src/domain/progression.ts
src/domain/records.ts
src/domain/recovery.test.ts
src/domain/recovery.ts
src/domain/running.test.ts
src/domain/running.ts
src/domain/saved-routine.ts
src/domain/schedule.test.ts
src/domain/schedule.ts
src/domain/session-plan.test.ts
src/domain/session-plan.ts
src/domain/sets.test.ts
src/domain/sets.ts
src/domain/shared-stats.test.ts
src/domain/shared-stats.ts
src/domain/sport-scope.test.ts
src/domain/sport-scope.ts
src/domain/training-evidence.test.ts
src/domain/training-evidence.ts
src/domain/types.ts
src/domain/username.test.ts
src/domain/username.ts
src/lib/app.ts
src/lib/appearance.test.ts
src/lib/appearance.ts
src/lib/coach-rollout.ts
src/lib/date-time-format.ts
src/lib/env.ts
src/lib/exercise-search.test.ts
src/lib/exercise-search.ts
src/lib/format.test.ts
src/lib/format.ts
src/lib/labels.test.ts
src/lib/labels.ts
src/lib/nav.test.ts
src/lib/nav.ts
src/lib/offline-submit.test.ts
src/lib/offline-submit.ts
src/lib/safe-app-path.test.ts
src/lib/safe-app-path.ts
src/lib/site-url.ts
src/lib/slug.test.ts
src/lib/slug.ts
src/lib/supabase/jwks.test.ts
src/lib/supabase/jwks.ts
src/lib/supabase/server.ts
src/lib/superset-colors.test.ts
src/lib/superset-colors.ts
src/lib/time.test.ts
src/lib/time.ts
src/lib/units.test.ts
src/lib/units.ts
src/lib/utils.ts
src/lib/workout-drafts.test.ts
src/lib/workout-drafts.ts
src/next-config.test.ts
src/proxy.test.ts
src/proxy.ts
src/server/actions/account.test.ts
src/server/actions/account.ts
src/server/actions/auth.test.ts
src/server/actions/auth.ts
src/server/actions/availability.ts
src/server/actions/coach-tokens.ts
src/server/actions/coach.ts
src/server/actions/coaching-workflow.ts
src/server/actions/effort.test.ts
src/server/actions/equipment.ts
src/server/actions/follows.ts
src/server/actions/gyms.ts
src/server/actions/manual-training.ts
src/server/actions/onboarding.ts
src/server/actions/people.ts
src/server/actions/privacy.ts
src/server/actions/profile.ts
src/server/actions/programs.ts
src/server/actions/runs.ts
src/server/actions/sessions.ts
src/server/auth.test.ts
src/server/auth.ts
src/server/coach-api.ts
src/server/coach-routine.ts
src/server/coach-service.ts
src/server/coach-workflow-service.ts
src/server/dispatch-coach-job.ts
src/server/queries/active-session.ts
src/server/queries/comparable.ts
src/server/queries/head-to-head.ts
src/server/queries/leaderboard.ts
src/server/queries/onboarding-entry.test.ts
src/server/queries/onboarding-entry.ts
src/server/queries/profile-cache.test.ts
src/server/queries/profile-cache.ts
src/server/queries/profile-lifecycle.test.ts
src/server/queries/profile.test.ts
src/server/queries/profile.ts
src/server/queries/reference.test.ts
src/server/queries/reference.ts
src/server/queries/request-profile.ts
src/server/repositories/absent-equipment.ts
src/server/repositories/analytics-coach.test.ts
src/server/repositories/availability.test.ts
src/server/repositories/availability.ts
src/server/repositories/body-weight.test.ts
src/server/repositories/body-weight.ts
src/server/repositories/coach-attachments.ts
src/server/repositories/coach-foundation.test.ts
src/server/repositories/coach-intakes.ts
src/server/repositories/coach-memory.test.ts
src/server/repositories/coach-memory.ts
src/server/repositories/coach-plans.test.ts
src/server/repositories/coach-plans.ts
src/server/repositories/coach-requests.test.ts
src/server/repositories/coach-tokens.ts
src/server/repositories/coaching-changes.ts
src/server/repositories/coaching-context.ts
src/server/repositories/coaching-evidence.test.ts
src/server/repositories/coaching-evidence.ts
src/server/repositories/coaching-guardrails.ts
src/server/repositories/coaching-jobs.ts
src/server/repositories/coaching-state.ts
src/server/repositories/coaching-today.ts
src/server/repositories/coaching-workflow.test.ts
src/server/repositories/equipment.ts
src/server/repositories/exercises.ts
src/server/repositories/fallbacks.ts
src/server/repositories/follows.test.ts
src/server/repositories/follows.ts
src/server/repositories/gyms.test.ts
src/server/repositories/gyms.ts
src/server/repositories/history.test.ts
src/server/repositories/history.ts
src/server/repositories/load-units.test.ts
src/server/repositories/manual-training.ts
src/server/repositories/muscle-volume.ts
src/server/repositories/people.test.ts
src/server/repositories/people.ts
src/server/repositories/program-drafts.ts
src/server/repositories/program-revisions.test.ts
src/server/repositories/program-revisions.ts
src/server/repositories/programs.test.ts
src/server/repositories/programs.ts
src/server/repositories/progression-rule.ts
src/server/repositories/runs.test.ts
src/server/repositories/runs.ts
src/server/repositories/schedule.ts
src/server/repositories/sessions.test.ts
src/server/repositories/sessions.ts
src/server/repositories/shared-stats.test.ts
src/server/repositories/shared-stats.ts
src/server/repositories/training-data.ts
src/server/repositories/training-volume.ts
src/server/repositories/workout-equipment.test.ts
src/server/repositories/workout-equipment.ts
src/server/validation/date-range.test.ts
src/server/validation/date-range.ts
src/server/validation/form.ts
src/server/validation/gyms.test.ts
src/server/validation/gyms.ts
src/server/validation/leaderboard.ts
src/server/validation/params.test.ts
src/server/validation/params.ts
src/server/validation/people.ts
src/server/validation/period.ts
src/server/validation/privacy.ts
src/server/validation/profile.test.ts
src/server/validation/profile.ts
src/server/validation/sport.ts
src/server/validation/username.ts
src/styles/form/form.css
src/styles/form/foundation.css
tsconfig.json
vercel.json
vitest.config.mts
~~~

</details>
