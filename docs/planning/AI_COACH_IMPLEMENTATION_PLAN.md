# AI-first coaching implementation plan

Status: implementation started September 11, 2026. See [implementation progress](AI_COACH_IMPLEMENTATION_PROGRESS.md) for the delivered slice, verification, and unresolved decisions. The full release described below is not yet implemented.

This is the implementation handoff for personalized onboarding, scheduled coaching, manual programs, and independent workout tracking. It supersedes the proposed behavior in [the application and industry review](AI_COACH_REVAMP.md). That review records code findings from `main` at `d9075a6cd672a6391b451fcdba1705896e31fcde`. The working branch is `codex/ai-first-coaching`, created from that revision of `origin/main`.

This plan builds on the completed audit. The user has confirmed that relevant code may be rechecked whenever necessary. The cloud dispatch adapter, service boundary, due-user selection, and automation setup documentation were rechecked after that clarification. File references identify integration points, not changes already implemented. No routine, production data, or application behavior is changed by this document.

## 1. Confirmed product decisions

| Area                | Decision                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New coached users   | Generate a personalized program during onboarding from their goals, circumstances, equipment, and starting ability. Do not silently install the founder's template.                                                                        |
| Other ways to train | Users can author a program themselves or track workouts indefinitely without any program. All modes share the normal exercise, machine, workout, and analytics records.                                                                    |
| Execution and cost  | Continue using the owner's Claude Code cloud routine on Anthropic hardware and the existing subscription. Asynchronous results and delays are acceptable. A separately billed model API is outside this release.                           |
| Daily coaching      | One shared daily run at 04:00 IST in the owner's time zone evaluates every enabled athlete and prepares their next pending session for the intended/default gym. This is session preparation, not a mandatory daily program replacement.   |
| Gym exception       | Before starting, an athlete changing gyms can explicitly request a session prepared for that gym's actual equipment and machine history. This is an additional asynchronous request.                                                       |
| During training     | Freeze the prescribed session at Start. No AI regeneration, automatic substitutions, or Adjust remaining workout flow during an active workout. Ordinary recording and correction of what the athlete actually performed remain available. |
| After training      | Persist performance immediately. The next scheduled run reads it; finishing a workout does not launch a new routine.                                                                                                                       |
| Weekly coaching     | Review each athlete's program once a week on their selected rest day, in that day's shared 04:00 IST run, using the past week and longer trends. A review can conclude that the program should stay unchanged.                             |
| Authority           | Automatically adjust unused upcoming sessions. Require athlete review before major changes to the split or schedule. Preserve revision history and explanations.                                                                           |
| Later work          | Wearables, continuous conversation, and coaching during workouts are outside this release.                                                                                                                                                 |

### Confirmed clarifications

All four questions raised during planning are resolved by the user's follow-up. These choices govern implementation; no further confirmation is required for them.

| ID  | Confirmed answer                                               | Implementation consequence                                                                                                                                         |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Weekly review is on each athlete's selected rest day at 04:00. | Ask which weekly rest day to use; include the review in that day's daily batch before preparing the next session.                                                  |
| D2  | Use the owner's time zone for this rollout: IST, UTC+05:30.    | Configure one shared 04:00 schedule using the IANA zone Asia/Kolkata (the workspace reports its Asia/Calcutta alias). Do not create athlete-local 04:00 schedules. |
| D3  | The routine runs in Anthropic's cloud on Anthropic hardware.   | Reuse the cloud schedule and API trigger. There is no personal Mac dependency or local worker to build.                                                            |
| D4  | Recheck relevant application code whenever necessary.          | Inspect and verify integration points during planning and implementation; follow the installed framework guides before writing application code.                   |

The requested daily/weekly distinction governs this plan. The remark that AI could sometimes change the program daily does not specify an exception policy. Out-of-cycle automatic program restructuring is therefore not part of the implementation contract; session adjustments remain automatic. Do not add an event-driven program-rewrite feature from that remark alone.

## 2. Onboarding and everyday experience

### Three complete entry paths

Offer **Coach me**, **Build my own program**, and **Just track workouts**. Recommend Coach me while keeping the alternatives easy to select. Program origin and coaching permission are separate: a manually authored program can later receive coaching, and a previously generated program can remain usable after coaching is disabled.

Keep account completion separate from coaching-intake completion. Units and the location needed for a workout should be enough to enter tracking; physique measurements and a coaching goal must not block the logging path. Make the use of the owner's coaching account clear when the athlete opts into AI processing. Manual/tracking users are excluded from routine context collection unless they enable coaching.

### Guided intake with an optional scratchpad

Use a short autosaved form, grouped into a few screens, followed by one editable summary. Do not require the athlete to compose the entire specification in a blank text box. No model call is needed for every screen.

| Input                          | Ask                                                                                                                             | Use and missing-data behavior                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal and priority              | What do you want to improve, and what matters most if goals compete? Any specific lift, body area, or running target?           | Record a primary goal, ordered secondary goals, and optional target/date. Do not copy the founder's strength-over-running priority.                            |
| Experience and recent training | How long have you trained consistently? What have the last month or two looked like? Returning after a break?                   | Separate experience from recent exposure. A long break is relevant even for an experienced athlete.                                                            |
| Current physique               | Current weight and height, if known; what would you like to change?                                                             | Store dated measurements and units. Allow skip/unknown. Do not infer body-fat percentage or assign a body type. Photos are not required.                       |
| Availability                   | How many sessions can you realistically do each week, which days usually work, and how much time do you have including warm-up? | Capture frequency, preferred days, and day-specific time budgets. Keep preferred days distinct from completed training.                                        |
| Weekly review                  | Which weekly rest day should the coach use to review your program?                                                              | Review once on that weekday in the shared 04:00 IST run. Do not change the athlete's split to manufacture a rest day.                                          |
| Training locations             | What is your usual gym? Where else do you train, and which equipment is available?                                              | Resolve feasible movements against real location/equipment records. Additional gym details can be added when needed.                                           |
| Restrictions and preferences   | Any movements to avoid, current problems, existing restrictions, favorite exercises, or exercises to keep?                      | Save confirmed restrictions separately from model interpretations. Missing means unknown, not “no problems.” Generalize beyond the founder's back/shin fields. |
| Current performance            | For a few familiar exercises, what did you last lift and for how many reps?                                                     | Capture exercise, load, unit, reps, approximate date, and machine where applicable. Optional set count and effort/RIR. No mandatory max-strength test.         |
| Additional context             | Anything else the coach should know? You may paste an existing routine.                                                         | Optional scratchpad; structured answers remain reviewable. Ambiguous or conflicting essentials produce a clarification result, not invented facts.             |

Ask age or age range for coaching context; do not require an exact birth date for generation. Keep sex optional. Clarify per-hand dumbbell loads, total barbell loads, assisted/body-weight conventions, and the difference between load and stack labels. Explain RIR in ordinary language and offer “I don't know.”

Baseline reports are not completed workouts. Store their source and date independently. A beginner who skips lift examples still receives a program, with unknown starting loads and practical calibration instructions. Later completed comparable logs should take precedence over old reports.

### Generate, preview, and activate

1. Save the confirmed intake revision and an idempotent `create_program` request.
2. Show Queued, Preparing, Needs an answer, Ready, or Could not finish. The athlete can leave and resume without losing answers.
3. Return a validated draft, a concise explanation, and an opening-session plan where feasible in the same planning task. A missing active program is a supported state.
4. Preview frequency, arrangement, expected durations, exercises, effort targets, gym, and uncertain loads. Explain why the plan fits the supplied answers.
5. Offer Start this program, Edit answers, and Edit program. An answer change creates a new intake revision and supersedes incompatible pending results.
6. Activate atomically after validating the exact draft and current athlete state. Only then archive a previous active program. A repeated activation must have the same effect as one activation.

If creation fails, preserve the intake and offer an explicit retry, resume later, or empty workout. Do not silently substitute the shared program. A template remains an explicit manual choice.

For first-session output, use draft-local exercise references. The server resolves them to materialized IDs during activation and validates the resulting plan in that transaction. The model must not invent future database IDs. If equipment or intake changed while the draft was waiting, require revalidation before activation; do not publish an incompatible opening session.

### Today and starting a workout

The primary card shows the next session, intended gym, expected duration, preparation timestamp, and a short explanation of changes. Show waiting/failure status without blocking the tracker. Use one primary Start action and a Change gym action that explicitly offers preparation for the alternate gym before Start.

Separate **this session's gym** from **my usual gym**. Do not make a temporary visit rewrite the persistent default. Resolve location intent as an explicit occurrence override, then a configured day preference, then the usual gym; validate availability before starting.

A late gym result must never modify a workout that has started. If the athlete starts before the result arrives, provide the existing deterministic equipment/history-based preparation or an empty workout, clearly labelled; atomically supersede the pending AI result for that occurrence. Never apply a plan for Gym A directly to Gym B.

No time, readiness, note edit, or completed workout fires an extra routine. Such changes become inputs at the next scheduled run. If supplied with an authorized pre-start gym request, the job may also use them. Optional readiness collected after a plan is ready is saved for future coaching; the interface must not imply it regenerated today's plan. Do not add a hidden immediate LLM call or a new check-in gate.

Once Start consumes a prescription, keep that snapshot immutable. Logging actual loads, omissions, or extra work records what happened without rewriting the prescription. An active session cannot request or accept AI adaptation. An overnight run encountering an open workout defers planning that depends on its unfinished outcome; it never edits that workout.

### Manual programs and free logging

Implement a manual builder for named days, exercise order, sets, reps/time/distance targets, optional RIR, rest, and schedule. Include duplicate, edit future version, activate, and archive. Reuse the same blueprint validation and program writer as AI generation. Review warm-up and run-only-day requirements so a valid manual program does not need artificial lifting entries.

Offer Start empty workout, Repeat workout, and explicit Save as routine. A saved routine copies structure; it neither changes past sets nor creates/advances a program. A routine can become a day in the manual builder. Basic custom exercises need measurement and equipment/comparability metadata; unknown muscle coverage remains explicitly unknown.

For an athlete with no program, Today leads with empty workouts and saved routines. Completed ad hoc workouts count toward normal history, progress, and workload. They do not silently complete a scheduled slot for coached athletes. Program adherence is not applicable for programless training. The audit found that this independent logging foundation already exists; it must be preserved and made easier to reach.

## 3. Scheduled coaching policy

### One execution setup, distinct tasks

Retain one coaching configuration with explicit task types and a shared evidence policy. Do not create separate routines per gym or per athlete. The dispatcher handles queue metadata; each athlete task receives only that athlete's context. These are task boundaries, not necessarily separate provider invocations.

| Task              | Trigger                                                                       | Output                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `create_program`  | Confirmed onboarding or an explicit replacement request                       | Draft blueprint, rationale, uncertainty/clarifications, optional opening session.                             |
| `prepare_session` | Shared daily 04:00 IST batch or explicit pre-start alternate-gym request      | A plan for one exact pending occurrence and its unfinished components, or a reason for no change/defer.       |
| `review_program`  | Once weekly on the athlete's selected rest day, in the shared 04:00 IST batch | No change, a scoped future-prescription revision, or a structural proposal requiring review.                  |
| `refresh_due`     | Scheduled dispatch/catch-up                                                   | Claims and orders work, reconciles failures, and reports coverage. It does not decide exercise prescriptions. |

### Daily batch

1. Establish a batch identity, scheduled 04:00 boundary in Asia/Kolkata, and actual start time. Use the configured owner time zone, not the server/browser time zone or the athlete's profile time zone.
2. Reconcile expired claims and incomplete requests. List all enabled athletes with keyset pagination; remove the current silent 500-account ceiling.
3. For each athlete, resolve their active program, next unfinished occurrence, intended gym, source revisions, open-workout state, and whether a weekly review is due.
4. If due, complete the weekly review first. Apply only authorized, validated changes; otherwise retain the active program and save a reviewable proposal.
5. Prepare the next pending session against the resulting active version. A mixed lifting/running day includes only unfinished parts. A missed day remains governed by the existing flexible sequence; do not compress missed workouts to satisfy a calendar.
6. Persist the result or explicit no-change/deferred outcome with evidence references. Every eligible athlete must have a recorded outcome, including athletes whose program or equipment needs attention.

Proposed efficiency rule: revalidate every athlete daily, but reuse a still-valid unused plan when all relevant inputs, pending components, and time-dependent conditions are unchanged. Record that daily check. Reuse must not hide new workout data, changing recovery age, a long layoff, changed equipment, or a due weekly review. Daily evaluation does not require a different prescription every day.

### Weekly review and program stability

The review becomes due on the athlete's selected weekly rest-day weekday in the shared owner time zone. Review the completed seven-day interval ending at that day's scheduled 04:00 IST boundary, plus longer comparable trends. Return exact boundaries and data coverage. This review interval is independent of a program's repeating cycle and the calendar-week chart. A “week” in existing program data may mean a cycle; do not mix those meanings. Preserve athlete-local dates and time zones for workout records and charts; they do not move the shared batch or its review-period keys. Show exact review boundaries so the reviewed period remains clear. An unexpected workout on the selected rest day does not trigger another review or change the weekly cadence; open-workout protections still apply.

Use one logical review key per athlete and scheduled review period. Retries finish that review rather than create another one. A missed run catches up the latest due review using current relevant evidence; do not generate several historical rewrites consecutively. Preserve a cadence anchor when review-day settings change so edits cannot accidentally cause repeated reviews in one period.

A completed review is not a requirement to change the program. Evaluate adherence, comparable performance, completed workload, duration fit, recovery reports, and repeated substitutions. Missing sessions are different from unsuccessful sets. Preserve useful movements long enough to observe comparable performance. Avoid forced weekly deloads, scheduled novelty, or automatic extra volume solely because a week elapsed.

Proposed authority classification:

| Change                                                                                               | Handling                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Upcoming load, reps, or effort targets within the program                                            | Automatic at session preparation, with an explanation.                                                                             |
| Small weekly prescription changes within the existing split and confirmed constraints                | Automatic future revision; show what changed. The server, not the model's label, checks whether the change stays in this category. |
| Change to days/week, day arrangement, split, priorities, or confirmed constraints; replacement block | Proposal and athlete review before activation. Existing prescribed work continues meanwhile.                                       |
| No useful evidence or continued suitable progress                                                    | Keep the program; record why.                                                                                                      |

All program changes apply at an explicit future boundary and never alter completed or open sessions. Structural revisions require a transition mapping: preserve exercise/machine history, but carry slot completion forward only for equivalent occurrences. Do not copy old day indexes into a new split. Reverting creates an appropriate future version; it does not erase actual training.

Plan for a block's end during its weekly reviews. If no successor is approved, completion is visible and the athlete can use manual/free logging; do not silently activate a new split or invent another review trigger. Repeated rejected proposals stay visible to the coach with rejection reasons and relevance conditions.

### Runtime and failure behavior

The user confirmed Anthropic cloud execution. Reuse the existing cloud routine's shared 04:00 IST schedule and authenticated API trigger for authorized on-demand work. The current dispatch adapter and setup documentation match this architecture. Keep durable requests and bounded reconciliation for cloud/API failures and quota deferrals. [Cloud dispatch adapter](../../src/server/coach-routine.ts), [automation setup](../coach-automation.md), [Claude routine documentation](https://code.claude.com/docs/en/routines).

There is no local Mac execution path, device wakeup requirement, or local polling worker in this implementation. Verify the configured cloud schedule, credentials, and actual allowance during rollout; the user's confirmation establishes the intended runtime and cadence, while deployment inspection establishes their operational configuration.

Provider dispatch is not job completion. Each successful routine API trigger starts a new session, and the documented API has no idempotency key. Subscription and run allowances are shared account constraints. Therefore retries need application claims, duplicate-result protection, and special handling for uncertain dispatch responses. [Routine API documentation](https://platform.claude.com/docs/en/api/claude-code/routines-fire).

Keep the current manual replan limit of three per athlete/local day as the initial engineering baseline, with its meaning made explicit in the UI. It is not a guarantee of owner capacity. Deduplicate repeated clicks and unchanged pending requests, bound concurrency/retries, and reserve available work capacity for onboarding and explicit gym requests. Quota exhaustion produces a visible queued/retry-later state, not a paid-provider fallback. Measure real latency and usage before promising completion times.

## 4. Context contract and scientific policy

Use [the evidence and coaching-policy appendix](AI_COACH_SCIENCE.md) to maintain a short versioned policy packet. The LLM selects and explains prescriptions from validated context. The server owns calculations, identifiers, permissions, scheduling, and acceptance. Scientific plausibility is not established merely by producing schema-valid JSON.

### Task-specific context

Every envelope includes schema/policy version, task/job identity, athlete scope, snapshot time, source revisions, units, coverage, and missing information. Fetch only the relevant task's context; do not attach the whole audit, repository, coaching transcript, full workout export, or scientific papers to every run.

| Context                 | Initial program                                                                      | Daily session                                                                                               | Weekly review                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Confirmed athlete facts | Intake, goals, availability, restrictions, preferences, baseline provenance.         | Applicable confirmed facts and any changes.                                                                 | Full current commitments and changed preferences.                                         |
| Program                 | Optional current blueprint when explicitly replacing a program.                      | Exact version, target day/occurrence and pending parts; compact neighboring workload/schedule.              | Complete active blueprint and intended progression, version lineage, completion position. |
| Actual training         | Optional recent completed summaries and relevant reported baselines.                 | Recent comparable completed performances for target slots; recent completed workload including ad hoc work. | Complete seven-day review aggregates plus longer trends and relevant exceptions.          |
| Equipment               | Compact feasible candidates covering the intended movement needs; expand on request. | Target gym, relevant machines and supported measures, bounded alternative candidates.                       | Locations in use, constraints, repeated substitutions, relevant alternatives.             |
| Recovery and time       | Reported baseline limitations and normal time budgets.                               | Timestamped recent reports, planned time budget; never label old reports “today.”                           | Trends with coverage and symptom reports, not a fabricated readiness score.               |
| Coaching memory         | Confirmed facts plus any relevant existing decisions.                                | Short derived memo and recent plan/outcome differences.                                                     | Prior accepted/rejected/pending proposals and their reasons.                              |

Calculate numeric aggregates in application/SQL code. Include all completed training in the requested window, independently of program membership. Exclude warm-ups from working-set volume. Show incomplete/abandoned-session work separately when available; do not silently count an open workout as completed evidence. Derive history from actual performed exercises and machines, rather than the originally planned substitution.

Keep exact-machine histories separate for nonportable loads. Preserve portable-exercise identity and load conventions across locations. Include timestamps, working-set reps/load/effort, completed-set counts, and relevant failures/omissions. Do not average dissimilar machine stacks or silently convert unknown units. Treat secondary-muscle weighting and estimated 1RM as labelled calculations, not measurements.

Proposed initial bounds for profiling: up to six relevant completed performances per target exercise, eight complete weeks of aggregate trends, up to three recent plan/outcome summaries, and up to five feasible alternatives per slot. These are tunable engineering limits, not scientific constants. Initial creation and weekly review need full structural coverage even when the blueprint is longer than a typical program. Retrieve extra history/candidates through bounded follow-up requests when needed.

Always include safety-relevant restrictions, target state, units, the complete applicable blueprint structure, and coverage metadata. Never silently truncate these to fit a token target. Each bounded collection reports the full period, available/returned counts, missing data, and whether older details were omitted. Incomplete evidence must not be presented as zero training or absence of pain.

Measure serialized bytes and model tokens on small, typical, and large fixtures before setting final context limits. Budget by task against the confirmed runner/model, not an invented token allowance. Prefer complete aggregates and targeted exceptions over arbitrary raw-log cutoffs. Reuse revision-keyed reference data and a compact policy packet; keep athlete data scoped throughout.

### Source precedence and explanation

Confirmed athlete constraints and actual logs are authoritative within their respective meanings. Self-reported baselines are separately labelled. Derived summaries and model conclusions cannot overwrite those sources. Store an inference with its evidence references, uncertainty, and review condition. Resolve conflicts by asking for missing essentials or withholding the affected change.

Return a short user-facing reason, structured changes, evidence IDs, missing-data notes, and the applicable policy version. Do not request or store private chain-of-thought. Treat scratchpads, exercise notes, and imported text as athlete data, never as instructions to change tool permissions, access another account, or bypass validation.

## 5. Data model and server contracts

Extend existing primitives rather than introduce a second workout database or a separate program system for AI.

| Data addition/change           | Required behavior                                                                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versioned coaching intake      | Structured confirmed answers, unknowns, completion state, and source timestamps; independent of `onboardedAt`.                                                                                                                                           |
| Reported baselines             | Exercise/machine, load convention, unit, reps/effort/date, and provenance; never fabricated set logs.                                                                                                                                                    |
| Training preferences           | Entry path, coach permission, default gym, selected weekly rest day, and confirmed availability. The dispatcher uses the shared owner time zone; athlete-local logging settings remain separate. Program origin remains independent of coach permission. |
| Occurrence preparation intent  | Target program/version and occurrence, gym override, input revision, and lifecycle. Editing a future intent cannot alter an active workout.                                                                                                              |
| Durable coaching jobs/attempts | Operation, trigger, dedupe key, target, input revisions, claim/lease, attempt IDs, dispatch receipt, persistent state, and compact result/error. Extend current requests where practical.                                                                |
| Program drafts/revisions       | Validated blueprint, generating job/intake, source, rationale, change classification, activation boundary, and transition metadata. Reuse existing immutable program versions.                                                                           |
| Weekly review record           | Unique period identity, evidence boundaries, due/completed timestamps, no-change/patch/proposal outcome. A no-change review is still completed.                                                                                                          |
| Saved workout routines         | Reusable structures separate from actual workouts and active program schedules.                                                                                                                                                                          |

Proposed job state machine: `queued -> claimed -> succeeded | needs_input | failed | superseded`. Waiting on quota or execution availability remains queued with a retry reason/time. Attempts have their own dispatch and lease details. An expired claim is persisted as retryable/failed by reconciliation; a pending row must not simply disappear after fifteen minutes as it currently can.

Use separate identities for logical work and execution attempts. Daily evaluation is unique per athlete/batch day; weekly review per athlete/review period; creation per athlete/intake revision/request; gym preparation per athlete/occurrence/intent revision. Different triggers targeting the same unused session must converge on the newest valid intent. Use a database uniqueness rule for active logical work and serialize competing writes per athlete/target.

Do not hold a database transaction open during a model call. Claim work in a short transaction, assemble a coherent versioned snapshot, compute outside it, and accept in a second short transaction with compare-and-set checks. Relevant source changes update revisions in the same transaction as the change. Saving a workout invalidates dependent evidence but does not dispatch a routine.

The acceptance transaction must validate:

1. Service authentication, athlete opt-in, job ownership/scope, current claim/attempt, and valid lifecycle state.
2. Exact base program/version, target occurrence, intended gym, current intent/input revisions, and still-pending target components.
3. No workout has started or consumed the target plan, no newer intent/result superseded it, and no incompatible program/intake/equipment change occurred.
4. Every exercise slot has an explicit keep/substitute/drop disposition; additions are identifiable. Measures, ranges, warm-ups, equipment requirements, and machine compatibility are valid.
5. Run references belong to the exact target occurrence and pending run, not merely to some run in the same program. Preserve run fields through the public service envelope and persistence.
6. Output change classification matches the actual diff. A model cannot evade structural approval by calling a major change minor.
7. Program activation/version numbering and plan replacement are atomic and idempotent, with one active program per athlete enforced in the database after existing data is checked.

If evidence changes during computation, reject the stale result and mark the appropriate logical work superseded/queued. A bounded retry may occur within the authorized batch or gym request; otherwise wait for the next authorized run. Do not turn stale-result handling into a stream of unbounded event-triggered runs.

Keep per-user export tokens read-only. The existing house-service token is broader than one athlete; route-level RLS must be paired with claimed-job scoping on new writes. Avoid private athlete context in dispatcher logs or shared caches. Record only operational IDs, timings, sizes, and error categories by default.

## 6. Performance and operational requirements

- Keep all LLM execution off Start/log-set/finish request paths. The existing tracker must remain responsive if the routine is slow, offline, or out of quota.
- Replace the per-athlete due scan's silent ceiling with stable pagination and an indexed due/claim query. Use batch metadata retrieval where possible and bounded athlete-level concurrency.
- Aggregate full time windows in the database before fetching small narrative samples. Eliminate repeated full-library resolution for every athlete; cache reference/equipment resolution by relevant revision with correct athlete/gym keys.
- Profile query count and query plans for completed-history range scans, exercise/machine comparability, due jobs, and pending plans. Add indexes based on actual predicates; avoid speculative indexes for every field.
- Bound context expansion, polling, retries, and outputs. Back off status polling; a browser refresh must not trigger work. No external message or notification integration is required.
- Persist batch progress so one athlete's bad data does not abandon later athletes. Catch-up should finish missing logical work without recomputing successful work unnecessarily.
- Track eligible/evaluated/deferred counts, job age and latency, dispatch failures, quota deferrals, duplicate claims/results, stale rejections, weekly-review coverage, context size, query count/time, and log-route latency. Do not claim physiological efficacy from these operational metrics.

No production latency or quota headroom was measured during this planning session. Establish a baseline and an initial friends-scale load fixture during implementation. The release gate is bounded work and no material tracker regression against that baseline, with enough measured batch capacity for the enabled population; numerical SLAs must follow measurements.

## 7. Implementation sequence and audited integration points

### Phase 0: verify the confirmed cloud setup and lock contracts

Use the confirmed Anthropic cloud routine, one shared 04:00 Asia/Kolkata schedule, and each athlete's selected weekly rest day. Verify the operational cloud configuration and quota behavior during rollout; do not reopen D1-D4 as product questions. Preserve the existing flexible sequence unless the user explicitly chooses a different scheduling model. Recheck relevant code as needed and read the installed Next.js guides before writing application code, as required by AGENTS.md.

Write task envelopes, output schemas, change classification, review-period rules, and acceptance invariants first. Define fixtures for lifting, running, mixed days, programless users, and two gyms. Do not configure the live routine or enable new writes before subsequent gates pass.

### Phase 1: correct existing coaching evidence and writes

Fix the run-payload transport bug, complete four/eight-week aggregation coverage, completed-history semantics, semantic equipment/measure/slot validation, and stale-result rejection. Persist request timeouts. Remove universal founder-specific constraints from shared coaching instructions and move confirmed personal facts into the right athlete's data.

Audited surfaces: [coach service](../../src/server/coach-service.ts), [coach plans](../../src/server/repositories/coach-plans.ts), [session-plan schema](../../src/domain/session-plan.ts), [muscle volume](../../src/server/repositories/muscle-volume.ts), [comparable history](../../src/domain/comparable-history.ts), [history queries](../../src/server/queries/comparable.ts), and [coach submission script](../../scripts/coach/submit.ts).

Exit: endpoint round trips retain running and lifting, coach summaries match completed-workout analytics for the same interval, and stale/incompatible writes are rejected.

### Phase 2: durable tasks, drafts, and version transitions

Implement claims/deduplication, reconciliation, snapshot revisions, draft creation/activation, single-active-program enforcement, and structured weekly review records. Extend the shared service with authenticated task claim/context/result operations. Add program provenance and exact transition mapping for structural proposals. Preserve existing valid rows during migration.

Audited surfaces: [program writer](../../src/server/repositories/programs.ts), [program revisions](../../src/server/repositories/program-revisions.ts), [blueprint](../../src/domain/program-blueprint.ts), [patch contract](../../src/domain/program-patch.ts), [coach actions](../../src/server/actions/coach.ts), and [routine adapter](../../src/server/coach-routine.ts). New migration and schema file names are implementation choices to confirm against the checkout.

Exit: creation works with no active program; repeated/out-of-order requests and activation races cannot corrupt program or session state.

### Phase 3: personalized onboarding and existing-user setup

Build the three entry paths, versioned intake, reported baselines, resumable generation status, preview/edit, and activation. Reuse profile/location controls where suitable. Offer existing athletes a prefilled coaching-setup flow that asks for missing information without resetting onboarding or replacing their current program.

Audited surfaces: [profile fields](../../src/components/profile-fields.tsx), [profile validation](../../src/server/validation/profile.ts), [onboarding actions](../../src/server/actions/onboarding.ts), [program actions](../../src/server/actions/programs.ts), and [current onboarding program step](<../../src/app/(onboarding)/welcome/programme/page.tsx>).

Exit: an empty coached account receives its own usable program and first-session guidance; a generation failure leaves the athlete able to resume or log freely.

### Phase 4: manual programs and independent routines

Add the manual builder and authenticated authoring actions using the shared draft/version path. Add saved routines, repeat/save workout, and basic custom exercise creation. Make programless Today useful. Keep normal history and analytics independent of program ownership.

Audited surfaces: [session actions](../../src/server/actions/sessions.ts), [session repository](../../src/server/repositories/sessions.ts), [exercise schema](../../src/db/schema/exercises.ts), [analytics](../../src/domain/analytics.ts), and [Today](<../../src/app/(app)/today/today-view.tsx>).

Exit: users can create a manual program, or log repeatedly without any program or coach; ad hoc history remains ordinary history.

### Phase 5: daily/weekly execution and pre-start gym exception

Implement the shared 04:00 IST policy, weekly rest-day selection, review-before-session ordering, bounded catch-up, and the existing cloud runtime adapter. Add occurrence-specific gym intent and explicit asynchronous alternate-gym preparation. Enforce frozen sessions on the server and remove any UI suggestion that logging/check-in triggers immediate AI changes.

Audited surfaces: [schedule](../../src/domain/schedule.ts), [session preparation and requests](../../src/server/repositories/coach-plans.ts), [gym switcher](<../../src/app/(app)/today/gym-switcher.tsx>), [coach skill](../../.claude/skills/coach/SKILL.md), and [automation documentation](../coach-automation.md). Update scripts and service documentation alongside the contract; correct the documented training-week boundary and muscle-volume semantics.

Exit: one daily pass covers all eligible athletes, weekly review occurs once per due period, gym changes work before Start, and no active workout can be replanned.

### Phase 6: rollout, observability, and recovery

Use separate rollout controls for new intake, generation, automatic weekly minor revisions, and the new dispatcher. Verify additive migrations on a representative database copy and measure the bounded batch. Keep existing program IDs, family lineage, start position, exercise/machine history, locations, and coaching settings intact.

Roll out to the current friends group with the owner's explicit opt-in configuration already respected. If new automation must be disabled, stop claiming new jobs, reject incompatible late results, and keep the latest valid program plus normal logging available. Do not roll back performed workouts to reverse a coaching decision.

## 8. Validation and release acceptance

Write tests for the behavior and data boundaries below, not tests that merely repeat implementation code. Include service-level round trips and transactional concurrency cases; domain-only schema tests are insufficient for the audited transport defect.

| Area                 | Required checks                                                                                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap            | No-program user can generate/preview/activate; unknown baselines yield calibration, not fake logs; duplicate submissions and competing activation preserve one active program.                                                                                       |
| Intake               | Autosave/resume, conflicting scratchpad clarification, unit/load conventions, edited intake superseding an old draft, and manual/free path without coaching requirements.                                                                                            |
| Logging              | Programless and extra ad hoc workouts appear in completed history/volume without advancing a program; saved routines copy structure and preserve history.                                                                                                            |
| Transport/validation | Lifting-only, run-only, and mixed payloads survive endpoint-to-database round trips; incompatible machines, incorrect measures, missing dispositions, and wrong run occurrences fail.                                                                                |
| Evidence             | A completed set 21 days ago appears in a four-week summary; eight-week coverage is complete; more than forty records do not silently truncate aggregates; incomplete sessions and partial periods are labelled.                                                      |
| Comparability        | Two machines with different stacks, portable exercises, kg/lb, per-hand/total/assisted conventions, and actual substitutions use appropriate history.                                                                                                                |
| Cadence              | Daily coverage beyond 500 athletes; one review per selected rest-day period in the shared owner zone; no-change counts; retry/catch-up/rest-day changes; a different athlete/server zone cannot shift the 04:00 IST batch; weekly review before session preparation. |
| Frozen workouts      | Request before Start/result after Start, simultaneous Start and result acceptance, overnight open session, and disabled coaching all reject inappropriate mutation. Completed sets and prescription snapshots remain unchanged.                                      |
| Gym exception        | One-off visit does not rewrite default gym; out-of-order Gym A/B responses cannot replace newest intent; incompatible-gym plans are never consumed.                                                                                                                  |
| Progression          | Mixed day with completed lifting plans only its pending run; missed sessions preserve sequence; changed split maps only equivalent events; open workouts block activation.                                                                                           |
| Reliability          | Duplicate trigger/claim/callback, expired lease, uncertain dispatch, invalid output, partial batch failure, owner quota exhaustion, and executor downtime remain visible and recoverable.                                                                            |
| Isolation            | Cross-athlete context/results and unauthorized job operations fail; free/manual opt-out prevents coaching data collection; logs/caches do not mix private context.                                                                                                   |
| Performance          | Bounded context/query work on small and large fixtures; no LLM call from set logging or finishing; batch resume skips successful work; compare tracker latency with its baseline.                                                                                    |

Add a small, versioned coaching evaluation set using synthetic or deliberately de-identified fixtures: novice without loads, experienced lifter, return after a break, two non-comparable gyms, limited time, hybrid priorities, missing readiness, sparse attendance, repeated pain restrictions, rejected proposal, and a completed block. Evaluate feasibility, evidence/provenance, preserved constraints, workload rationale, stability, and no invented facts. Separate deterministic acceptance failures from model-quality review. Do not consume the owner's routine allowance for these experiments during this planning session.

Before release, run the repository's required checks and relevant end-to-end flows, verify migration behavior, and record measured capacity/latency. The earlier audit passed 101 tests in nine existing files and reproduced three defects with temporary isolated diagnostics; those results are a baseline, not proof that these proposed features work.

## 9. Handoff checklist

- Implement the confirmed D1-D4 choices: Anthropic cloud, shared 04:00 IST, weekly review on each selected rest day, and relevant code rechecks as needed. Keep other proposed engineering decisions visible.
- Implement the phases in dependency order; keep UI work independent where the contracts are already stable.
- Update the routine's compact shared policy, context contracts, scripts, service documentation, and application together.
- Keep the review and scientific sources available for maintainers, but send only the compact applicable policy and relevant athlete context to the LLM.
- Commit implementation and verification evidence in the next session. This session delivers only this plan, its evidence appendix, and the audited review.
