# Coach planning and memory Q&A

This document preserves the September 14 audit of commit `3656427` and the original recommendations. The user subsequently accepted those recommendations and requested mandatory actual effort. The local implementation is described in [Coach policy v2](AI_COACH_POLICY_V2.md); it supersedes the pending decisions and optional-effort recommendation below. The live routine and production database have not been updated by this work.

The strength examples concern general adult resistance training. They do not establish rules for children, rehabilitation, pregnancy, competitive peaking, or other populations requiring separate evidence. Running recommendations are included conditionally because the app currently supports running; the intended redesign scope remains an open question.

**Q1. What was broken for home workouts, and what changed?**

`planningContext` returned `no_gym` whenever a lifting day's location kind was anything other than `gym`. Creation could accept a home program, but subsequent preparation could not expose its exercise-slot IDs. The strict result validator correctly required those IDs, so the routine could not submit a complete session. Changing the prompt alone would not fix this contradiction.

The planner now accepts an active training location and resolves each exercise against that location's actual equipment. It includes the location kind in the context, honors an explicitly saved home default even when another gym exists, and permits active home locations through the older replan action. An unavailable barbell exercise still has a slot ID so the coach can explicitly substitute or drop it. Missing equipment does not become available merely because planning succeeds.

Regression tests cover home-only bodyweight and dumbbell programs from creation through preparation and starting the following session, missing-slot rejection, a default home alongside another gym, unavailable exercises, and inactive-location rejection. All 504 tests across 81 files pass, along with lint, type checking and the production build. A pre-existing calendar-dependent test assertion was also corrected so it works on Mondays. The home fix is local; it does not verify a deployment or change a failed live job's status. Sources: [planner](../../src/server/repositories/coach-plans.ts), [workflow tests](../../src/server/repositories/coaching-workflow.test.ts), [equipment resolver](../../src/domain/equipment-resolution.ts).

**Q2. What is the current AI-coach prompt?**

There are four layers, rather than one self-contained prompt:

| Layer | Current role |
| --- | --- |
| Saved cloud routine entry point | Fetch the specified branch, check out pinned commit `3656427`, read the repository skill, and select a single fired job or a scheduled batch. |
| `.claude/skills/coach/SKILL.md` | Claim jobs, read contract and evidence, apply policy, submit results, and handle failures. |
| `COACH_POLICY` | Task-specific training principles and server authority rules. |
| Claimed job contract and context | Athlete records, exact target, allowable result shape, equipment and evidence. |

The [complete prompt snapshot](AI_COACH_PROMPT_SNAPSHOT.md) contains the actual saved cloud prompt, the documented entry-point template, the complete repository skill, and the policy source verbatim. I read the live [Overload house coach routine](https://claude.ai/code/routines/trig_01GNaF6MbdbaMQ5LxsYAj1ND) directly: it is enabled, runs daily at 04:00 GMT+5:30, and uses Opus 5. Its prompt explicitly checks out commit `36564277e66b6c3d61fdc4132b91bf96d1e04408` after fetching `codex/complete-coaching-flow`. This checkout instruction is absent from the documented template.

Updating repository instructions alone will not advance that pinned checkout. Future skill/policy changes need a corresponding routine-pin update and compatible server deployment. The prompt says the live app is deployed from that branch; this audit did not independently verify the deployment or modify the live routine.

The current training instructions already say to use repeated comparable performances, avoid large changes from one poor session, make the smallest justified future change, permit no change, preserve unknown RIR, and respect confirmed restrictions. However, those statements do not supply an executable definition of sufficient evidence, a per-exercise noise threshold, or a cumulative limit on automatic dose changes.

**Q3. How is the next session currently selected and planned?**

The target is the earliest pending training occurrence in the active program, rather than necessarily tomorrow's calendar date. Rest days are omitted. Lifting and running components can remain pending separately. Location selection uses a one-off location intent, then the day's recommended location, then the default/fallback location.

The daily scheduled batch is at 04:00 Asia/Kolkata. Explicit pre-start location changes can request preparation; logging, finishing, and recovery check-ins do not call the model. A due weekly review is processed before session preparation. The server gives the model a claimed attempt with a lease and source revision. An open workout prevents a new accepted plan from modifying training already started.

The model returns keep/substitute/drop for every pending lifting slot, optional additions with explicit targets, and a run when that component is pending. Empty set targets on a retained exercise can leave the deterministic progression prefill in control. A session job cannot replace the program. `no_change` requires an existing active prepared session for that exact target; it cannot stand in for an absent session plan. Sources: [job scheduling and acceptance](../../src/server/repositories/coaching-jobs.ts), [session contract](../../src/domain/session-plan.ts), [routine skill](../../.claude/skills/coach/SKILL.md).

**Q4. What factors and history does the coach currently receive?**

| Evidence | Current implementation |
| --- | --- |
| Confirmed intake | Goals, priorities, experience, recent training, physique goal, optional age/body measurements, frequency, days, time, review day, location, restrictions, preferences, avoided exercises, reported baselines, long brief and report references. |
| Current constraints | Active program blueprint, locations, equipment, available exercise catalogue, warm-ups, pending components, memo and athlete notes. |
| Main workflow narrative | Up to 40 workouts and 60 runs from a date range starting 28 local dates before today, with truncation markers; recovery in that range. This is not exactly seven days or exactly 28 rolling 24-hour periods. |
| Main workflow trends | Eight calendar weeks of muscle/set and running volume, including partial-week coverage. These are workload summaries, not calculated exercise-performance slopes. |
| Review interval | Complete saved-interval aggregates for the exact seven-day review period: completed/incomplete workouts, non-warm-up sets by exercise, running count/duration/distance/longest run and measurement coverage. |
| Longer exposure | Full last-30-day aggregate, including running exposure. |
| Additional next-session context | Up to eight completed comparable performances per resolved exercise; a separate recent range starting 14 local dates before today; four calendar-week volume summaries; the last three distinct planned occurrences and available outcomes. |
| Previous decisions | Up to eight weekly-review records and 20 recent draft decisions in the workflow context. |
| Readiness and symptoms | Saved sleep, energy, fatigue, soreness, symptom reports, notes, and relevant run reports, with missing values retained. |

Sources: [workflow context](../../src/server/repositories/coaching-context.ts), [next-session context](../../src/server/repositories/coach-plans.ts), [weekly volume](../../src/server/repositories/training-volume.ts), [intake fields](../../src/domain/coaching-workflow.ts).

The workflow and next-session packets overlap considerably. Weekly review does not receive `nextSession`, so it does not automatically receive that eight-performance history for every program exercise. It gets the longer narrative and workload summaries instead. This is a material gap between “eight weeks of trends” and “eight weeks of comparable exercise performance.”

**Q5. Where can the current behavior overreact or miss a problem?**

The deterministic rep progression uses one basis performance, preferring the same program-slot lineage and compatible equipment. It increases load one increment when all required sets reach the upper rep target with sufficient reported RIR. If the first set falls below the minimum reps, it instead prefills a one-increment reduction. That is a next-exercise target change, not a whole-program rewrite, but it can anchor the AI to one bad day. Missing required RIR can also prevent an increase despite achieved reps. [Progression rule](../../src/server/repositories/progression-rule.ts), [progression engine](../../src/domain/progression.ts).

The existing regression streak counts consecutive decreases of any size. It has no allowance for normal measurement variation. Its score uses the largest `weight × (1 + reps / 30)` among eligible weighted sets, otherwise total reps, a load/distance heuristic, or time. A change in set count can therefore look like a bodyweight performance change. The function does not account for effort, technique, or assistance direction. Moreover, the score exposed directly in `planningContext` is computed from the raw historical set values; unlike the progression-rule path, that call does not first normalize kg/lb. A number without a measurement method and unit is unsuitable as the coach's authoritative trend. [Score and streak](../../src/domain/progression.ts), [context score construction](../../src/server/repositories/coach-plans.ts).

Session warnings are advisory. They flag a load increase only when it exceeds both 15% and three increments, set-count drift above 40% when both totals are positive, more than two dropped exercises, very low RIR for listed compounds, and a run-duration increase above 30% relative to the latest run. They do not block storage. These constants are engineering heuristics, and the run comparison does not filter for a matching run type. [Warning implementation](../../src/domain/coach-review.ts), [warning inputs](../../src/server/repositories/coach-plans.ts).

Weekly acceptance classifies changes primarily by structure. Prescription, sets, and substitutions can apply automatically; a large change does not become approval-required solely because of its size. The evidence list is a bounded array of strings, not a server-verified proof of a persistent trend. [Program-change classification](../../src/domain/program-change.ts), [result schema](../../src/domain/coaching-workflow.ts).

**Q6. How is program review currently done?**

The first review waits at least seven full days after coaching consent and then uses the selected review/rest weekday at the shared 04:00 boundary. Subsequent reviews preserve a scheduled anchor. Changing the selected weekday cannot create a review less than seven days after the previous scheduled boundary. Catch-up dispatch selects the latest due review rather than replaying every missed week. [Cadence](../../src/domain/coach-cadence.ts), [dispatcher](../../src/server/repositories/coaching-jobs.ts).

The model evaluates the active structure and returns either `no_change`, a complete revised blueprint, or questions. A revised block that changes structural identity, block length, split/calendar, run occurrence schedule, or moves a retained slot between days requires athlete review. Other changes can activate automatically when automatic reviews are enabled. Muscle-coverage differences are advisory. Accepted reviews retain a rationale and enqueue session preparation; a review requesting input can also enqueue preparation using current valid information.

The useful distinction to preserve is that a weekly review is an opportunity to assess evidence. It is not a requirement to change training every week.

**Q7. What does the memo preserve today?**

| Stored field | Meaning and limits |
| --- | --- |
| `overview` | Coach-written free text; up to 2,500 characters through the plan schema. There are no required internal categories. |
| `userNotes` | Athlete-authored text, separate from the overview; the UI permits up to 2,500 characters. Saving a coach overview does not overwrite these notes. |
| `overviewUpdatedAt` | One timestamp for the whole overview. |
| Row metadata | Row ID, account ID, creation/update timestamps; one memo row per account. |

An accepted session result updates the overview only if it contains `plan.memo`. It replaces the entire overview rather than merging facts. Omitting it keeps the old overview; an empty string can clear it. Program creation's opening-plan shape and weekly review outcomes have no memo-update field. The UI's statement that it is rewritten after every plan is therefore stronger than the enforced behavior. [Storage](../../src/db/schema/coach.ts), [memo reads/writes](../../src/server/repositories/coach-plans.ts), [schema](../../src/domain/coaching-workflow.ts), [settings copy](../../src/app/(app)/settings/ai-coach/ai-coach-settings.tsx).

The intended contents are goals, issues, progress and previous experiments, but no particular preference, trend, exercise observation, evidence reference or expiry date is guaranteed to survive a rewrite. Confirmed intake, workouts, equipment and previous job results are stored separately; they are not all copied into the memo. This describes storage and code behavior, not the actual private contents of any athlete's memo.

**Q8. Is seven days of history plus an overall trend enough?**

It is a good compact context design if “overall trend” is specific and auditable. Seven days alone may contain only one exposure to an exercise, or none. Several sets from one tired workout are still one training occasion. Repeated runs of the coach over that same workout are not additional evidence.

Recommended packet: an exact recent seven-day interval; a compact summary of approximately eight weeks of comparable exercise exposures; the last few relevant prescriptions and outcomes; confirmed constraints; and a concise memo. The eight-week lookback is a proposed engineering default, not a biological cutoff. Sparse or infrequent training may need older history, explicitly labeled stale, or an insufficient-evidence result.

Each exercise summary should include comparison identity, measurement method and units, sample size, observation dates, last performed load/reps/effort, recent target attainment, trend magnitude, variability/coverage, time since last exposure, latest relevant change, and source record IDs. Provide exact period volume and actual completed/skipped opportunities separately. Use elapsed dates for a trend line so training twice a week is not confused with twice a month.

For daily preparation, use an explicit interval ending at the planning snapshot. For review, use the scheduled review boundary; label any later information separately. A partial Monday calendar week must not be interpreted as a collapsed full week. Missing or truncated records are not zero performance.

**Q9. What research supports changing the approach?**

| Evidence | What it supports | What it does not establish |
| --- | --- | --- |
| ACSM's 2026 position stand, summarized by ACSM; 137 reviews and over 30,000 participants | Resistance training can work with home equipment, bodyweight and bands. Match training to goals and sustained participation. [ACSM](https://acsm.org/resistance-training-guidelines-update-2026/) | A universal personal optimum, or a rule that every week must gain sets. |
| Halperin et al., 2022; meta-analysis of 12 studies, 414 participants | RIR estimates are imperfect. Mean underprediction was about 0.95 reps, with substantial heterogeneity. Preserve uncertainty and repeated evidence. [Study](https://pubmed.ncbi.nlm.nih.gov/34542869/) | Correcting every reported RIR by one, treating experience as perfect accuracy, or a precise individual noise estimate. |
| Robinson et al., 2024; exploratory meta-regressions | Proximity to failure may relate differently to hypertrophy and strength. Effort belongs beside performance and goals. [Author institution](https://rke.abertay.ac.uk/en/publications/exploring-the-dose-response-relationship-between-estimated-resist/) | One exact RIR target or causal prediction for every exercise. Study RIR values were estimated from intervention descriptions. |
| Plotkin et al., 2022; 43 participants randomized, eight weeks, trained adults | Increasing repetitions as well as load can support adaptation, relevant when home weights are limited. [Trial](https://pubmed.ncbi.nlm.nih.gov/36199287/) | Unlimited high-rep substitution for maximal-strength work, or transfer between arbitrary exercise variants. |
| Graham and Cleather; 12 weeks, 31 trained men | RIR-based load selection can accommodate changing performance. The squat results favored autoregulation in this study. [Author manuscript](https://research.stmarys.ac.uk/3067/3/Graham-Cleather-Autoregulation-Repetitions-in-Reserve.pdf) | A reason to rewrite an entire program after one difficult day, or proof of the proposed app algorithm. |
| Coleman et al., 2024; 39 participants, nine weeks | A planned week of complete training cessation did not improve measured hypertrophy and reduced strength gains relative to continuous training. [Trial](https://pubmed.ncbi.nlm.nih.gov/38274324/) | That all deloads are harmful. Complete cessation differs from an individualized reduction in sets or load. |
| Saw et al., 2016; systematic review of 56 studies | Athlete-reported well-being can contribute useful monitoring information. [Review](https://pubmed.ncbi.nlm.nih.gov/26423706/) | A validated app-specific readiness score, a fatigue diagnosis, or a universal sleep-to-load equation. |
| NIST statistical guidance | Medians and median absolute deviations limit the influence of extreme observations. [NIST](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm) | Clinically validated training thresholds, especially from small or correlated samples. |

These sources support the principles. The exact observation counts, caps, memory budget and state transitions below remain proposed policies to evaluate. The literature does not validate a complete algorithm that guarantees avoidance of both excessive and insufficient training.

**Q10. What should the algorithm be?**

Use deterministic calculations and acceptance checks around a coach that interprets context and explains choices. A proposed sequence is:

1. Resolve the exact target and current confirmed constraints. Verify feasible equipment and an unstarted session.
2. Classify evidence: completed, incomplete, skipped, self-reported, estimated, missing, or incompatible. Preserve actual work in volume totals even when it is unsuitable for a capacity comparison.
3. Group comparable exposures by exercise/variant, measurement, load convention, relevant machine/setup, slot purpose and effort conditions. Normalize known kg/lb deterministically. Cluster same-day bouts when counting independent confirmation.
4. Calculate target attainment and exercise trends. Mark insufficient evidence explicitly. Separate a capacity limitation from running out of time, unavailable equipment, a changed rep scheme, or an intentional easier session.
5. Choose a scope: maintain; progress this exercise; temporarily adapt this session; review this exercise's prescription; or propose a broader program change.
6. Check evidence novelty, change size, equipment increments, current restrictions, and cumulative changes before acceptance. A fluent explanation is not a substitute for passing these checks.
7. Store the decision, its supporting IDs, reference prescription, affected scope, intended duration, and what new observation will trigger reassessment.

Confirmed symptoms or a new restriction can require an immediate affected-exercise response. The repeated-performance gate must never require someone to reproduce pain to qualify for a change. Fatigue reports are also retained; they are not discarded merely because they complicate the trend. The question is whether they justify a temporary adaptation, a persistent change, or clarification.

**Q11. What would the math look like?**

First define a meaningful `x` for one comparable context: for example reps in a designated working set at the same load and effort band, or load at a matched rep/effort target. For bodyweight, keep the same variant/setup and treat changing body weight as context. For carries and holds, retain load and distance/time separately. Do not combine all these into a universal strength score.

An estimated 1RM can be an additional labeled proxy for suitable weighted rep sets. It should not drive reductions across high-rep sets, changed effort, assistance, unknown load conventions or different machines. Until the eligibility rules are chosen, raw matching performance and target attainment are the clearer primary signals.

For an established comparable context, a candidate robust detector is:

```text
B = median(3–5 accepted reference exposures)
R = median(latest 3 comparable exposures, separate from the reference)
relative_change = (R - B) / B
MAD = median(abs(reference_value - B))
threshold = max(minimum_meaningful_relative_change, k × MAD / B)

decline_candidate = at least 2 of the latest 3 exposures below B × (1 - threshold)
                    AND relative_change < -threshold
                    AND relevant target failures/context support the interpretation
```

This only applies to positive, consistently oriented measures where higher means better. The threshold is a fraction; a meaningful change defined in raw units must first be divided by `B`. Zero baselines, incomparable measurements and inadequate observations produce `unknown`, not a ratio. The reference, `k`, and minimum meaningful change need calibration. A tiny sample with zero MAD is not proof of zero noise. Select reference exposures by predefined comparability rules, not by retaining only successful days. Do not update the reference downward after each bad performance; retain its prescription/phase identity and deliberately re-establish it after a justified change or return from a break. [Statistical rationale](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm).

For illustration only, use a reference of 100 and a 5% threshold:

| Latest three comparable observations | Median | Relative change | Interpretation of the numerical evidence |
| --- | --- | --- | --- |
| 100, 100, 85 | 100 | 0% | One poor observation; no persistent-decline trigger. |
| 100, 85, 101 | 100 | 0% | Recovery after the poor observation. |
| 100, 92, 91 | 92 | −8% | Repeated-decline candidate; investigate cause and scope. |
| 92, 91, 93 | 92 | −8% | Continued lower level against the retained reference. |
| 99, 101, 100 | 100 | 0% | Small variation. |

Five percent is an illustrative value, not a proposed universal physiological cutoff. A candidate trigger starts an assessment; it does not dictate an 8% cut or diagnose fatigue.

For the displayed longer trend, a candidate robust slope is the median of the pairwise slopes `(x_j - x_i) / (date_j - date_i)` across comparable observations on distinct dates: the Theil–Sen approach. [Method reference](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html). Report it in the metric's units per week, with its observation count and date range. This is a descriptive engineering choice, not a significance test. A downward slope can miss a newly stable lower level, while a moving median can lag a rebound; show the latest observation and retained-reference comparison alongside it. If the latest exposure has recovered, reassess before cutting in response to older low observations.

The tradeoff can also be shown analytically. If an otherwise stable athlete had an independent 10% chance of a false low signal on each exposure, a three-exposure window would contain at least one false low with probability `1 − (1 − p)³ = 27.1%`. Requiring two lows among those same three gives `3p²(1−p) + p³ = 2.8%`. Real performances are correlated, repeated windows overlap, and multiple exercises create more opportunities for alerts; these are not predicted app error rates. Requiring corroboration lowers sensitivity to isolated noise but can delay detection. Immediate symptom handling and explicit insufficient-evidence states address different problems.

The arithmetic examples are executable in [check-math.mjs](../../output/coach-audit/check-math.mjs), with [calculated output](../../output/coach-audit/math-examples.json). They test arithmetic and the illustrative gate, not coaching efficacy.

**Q12. How should the next session change?**

| Situation | Recommended candidate behavior |
| --- | --- |
| One poor session after otherwise adequate performances | Preserve the program and exercise baseline. Explain the hold and reassess the next comparable exposure. A reported reason may justify a temporary session adaptation, subject to the acute-adjustment decision below. |
| Repeated completion at the top of the target range with suitable effort | Progress the affected exercise. Two qualifying comparable exposures is a candidate confirmation rule; it is a product choice, not a proven optimum. |
| First exposure or unknown starting load | Provide feasible calibration guidance and retain unknown load. Do not infer strength from body size or a different machine. |
| Repeated inability to reach the lower target | Check actual load, effort, technique/setup, rest, and stopping reason. Adjust the affected prescription or recalibrate; do not rewrite unrelated training. |
| Less work because of time or equipment | Adjust fit or exercise feasibility. Do not relabel this as reduced strength. |
| Missing effort or sparse logs | Use known performance cautiously, preserve uncertainty, and ask only for information that changes the decision. Do not turn missing RIR into failure or indefinite unexplained stagnation. |
| New symptoms, illness, or restriction | Respect the report immediately and adapt/withhold affected work or ask a focused question. Do not use a three-session waiting rule. |

Progress one main variable at a time. Repetitions within the chosen range are useful when a load jump is too coarse. For load progression, calculate `relative_jump = (next_available_load − current_load) / current_load`, using confirmed available weights. A 10 kg to 12 kg dumbbell change is 20%; calling it “one small increment” hides its size. A nominal percentage must not create a weight the athlete does not own. Repetition progression has supporting trial evidence, but its goal-specific limits still matter. [Plotkin et al.](https://pubmed.ncbi.nlm.nih.gov/36199287/).

If the selected next weight exceeds an agreed automatic-change limit, maintain load and progress within the permitted rep range, consider a confirmed feasible variation, or request review. A different variation begins a new comparison context. Do not promise it is equivalent in external kilograms.

**Q13. How should weekly review change?**

Review every week but require new relevant exposures before making a persistent training change. A successful program may remain unchanged for several reviews. Evaluate goal progress, target attainment, effort, attendance/opportunity, performed volume, session fit, symptoms, and response to previous changes together.

For a local repeated decline, first determine whether the prescription is mismatched, the recent progression was too large, equipment changed, or repeated fatigue is present. For possible insufficient stimulus, first check whether achievable rep/load progression has been omitted. Adding sets is not automatically the remedy for a flat score. Stable performance is not proof of absent hypertrophy, and a performance increase is not a direct muscle-size measurement.

A plateau candidate should require multiple comparable exposures, adequate opportunity to train, known effort/context, and enough elapsed time for the chosen outcome. The number of exposures and minimum time should differ by experience and goal. “No new PR in seven days” should not be a plateau definition.

A broad reduction needs corroboration across dates and affected movements, or an explicit constraint that already warrants it. Two exercises performed poorly on the same tired day are not two independent confirmations of a failing program. Separate local exercise changes from a temporary whole-session reduction and from a lasting change in the weekly program.

Store what changed and wait for the response. A candidate starting limit is one working set added or removed from an affected exercise in a review, with additional limits on relative exercise and weekly muscle volume. The numerical limits require agreement: one set removed from three is a 33% session reduction, while one from six weekly sets is about 17%. If integer set sizes exceed the agreed cap, request review rather than silently rounding around it. Do not apply a compulsory set increase or scheduled deload. [Relevant cessation-trial limitation](https://pubmed.ncbi.nlm.nih.gov/38274324/).

**Q14. What prevents repeated cuts and insufficient progression?**

Every automatic change should require a new evidence identity and record the baseline it modifies. A repeated daily job with identical relevant observations can refresh an explanation or preserve a plan, but cannot treat those observations as another failed exposure. Daily preparation and weekly review must share that evidence accounting.

A temporary reduction expires at the specified session; it does not silently become the permanent starting point. Record changes relative to the underlying prescription as well as the previous plan. Three consecutive 10% reductions leave `0.9³ = 72.9%` of the starting dose: a 27.1% cumulative cut. Small individual changes are not automatically small in combination.

The same accounting should detect when progression is being withheld despite repeated qualifying performances. A hold should explain the limiting factor, such as equipment, uncertain effort, a constraint, or insufficient comparable evidence. It should state what observation would unlock progression. Review the combined daily and weekly change before acceptance so two individually permitted changes do not create an unintended larger one.

**Q15. What should be stored in a concise memo?**

Use three stores with distinct responsibilities: confirmed facts and preferences; deterministic training summaries; and a small coach memo. The model should not be responsible for remembering facts that can be queried exactly.

| Keep in the memo when relevant | Required context |
| --- | --- |
| Durable preference that affects decisions | Athlete-confirmed wording/source, such as dislike of a substitution or preference for shorter sessions. Link to the structured preference record. |
| Short interpretation of a repeated trend | Exercise/context, direction, period, number of exposures, uncertainty and supporting IDs. Exact metrics remain in the derived summary. |
| Repeated exercise-specific observation | For example, later sets repeatedly deteriorate when rests are shortened. Preserve the observation and avoid declaring an untested cause. |
| Current experiment and response | Previous and current prescription, reason for change, start date, exposures since change, and reassessment condition. |
| Active unresolved issue or restriction pointer | Confirmed source and affected activities. Restrictions remain in their authoritative record, regardless of memo length. |
| Relevant accepted/rejected coach decision | The decision and athlete's stated reason, so the same unwanted proposal is not repeated. |

Recommended presentation budget: approximately 150–250 words, with the existing 2,500-character limit as an outer ceiling if retained. The budget is a product choice. Prefer three to five useful observations over a narrative biography. Source IDs and timestamps can live beside the text rather than consume the user-facing prose.

A synthetic example:

```text
Preferences: Home training; sessions capped at 40 minutes; prefers dumbbell rows.
Trend: Goblet-squat rep performance improving across six comparable exposures.
Last low session is isolated; baseline retained. RIR coverage is incomplete.
Observation: Rows lose reps in later sets on three short-rest exposures.
Experiment: Restore the agreed rest interval; compare the next two exposures
before considering more sets. Source records and dates are attached.
```

These are invented examples, not facts about a current athlete.

**Q16. What should be skipped, expired, or kept elsewhere?**

Do not duplicate complete workouts, every set, PR tables, exact weekly totals, equipment inventories, body measurements, or the full program in the memo. Query those records. Do not store one tired day as a permanent trait, turn a missed workout into “poor recovery,” invent a diagnosis, infer a preference from one action, or preserve a coach suggestion as if the athlete accepted it.

Temporary observations need an explicit review/expiry condition. Lack of a new symptom report is not proof that a restriction resolved. A restriction should not disappear because the memo exceeded its word budget. Confirmed preference changes supersede old values; unresolved conflicts need a question.

Store memo items with provenance, status (`confirmed`, `observation`, `hypothesis`), supporting IDs, last-reviewed time and an expiry/reassessment rule. Update by item rather than replacing all facts with unconstrained prose. Removing a report should invalidate report-only derived memo items while preserving independently confirmed athlete facts. Currently report removal cancels affected jobs/drafts but does not remove unstructured overview text. [Removal implementation](../../src/server/repositories/coach-attachments.ts).

A candidate update policy is: deterministic summaries recompute from logs; confirmed preferences change only through user input; memo interpretations refresh at review or after materially new evidence, including explicit preference changes. Do not rewrite the whole memo every morning merely because a job ran.

**Q17. What additional home-training information is needed?**

The immediate bug fix uses the existing equipment catalogue. Better home progression needs confirmed available load values or min/max/step, load convention (per hand, combined, added bodyweight, or assistance), available setup, and relevant variation identity. Current equipment records include units, increment and notes, but not a complete discrete list or upper limit for available weights. A recorded increment alone cannot prove a heavier load is available.

For bands, record band identity and relevant setup/stretch context rather than inventing kilograms. For bodyweight, preserve variant, assistance/elevation and technique/range context where they affect comparison. Ask only for details needed by the selected exercises. If equipment availability is unconfirmed, mark it unknown or ask; do not label a home as a commercial gym to inherit the latter's equipment assumptions.

**Q18. If running is in scope, what differs?**

Do not reuse lifting's estimated-strength score or rep-progression detector. Track run frequency, duration, distance, effort, recent gaps, comparable run type, symptoms and recent longest run. A useful exposure comparison is `planned_distance / longest_completed_distance_in_previous_30_days − 1`, alongside seven-day totals. It is undefined when there is no valid distance baseline; do not convert missing distance into an invented pace.

A 2025 observational cohort of 5,205 runners associated session-distance increases relative to the longest run in the preceding 30 days with injury rates; it did not find the same association for simple week-to-week ratios. This supports showing both session and cumulative exposure. It does not validate a universal safety percentage or a causal injury-risk calculator. [Study](https://pubmed.ncbi.nlm.nih.gov/40623829/).

Hybrid planning should preserve the athlete's stated priority and account for neighboring leg workload. Choosing running versus strength priority requires their confirmed goal, not an app-wide assumption.

**Q19. Which decisions need answers before implementation?**

| Question | Recommendation to consider; not an accepted decision |
| --- | --- |
| Does this redesign cover strength only, or strength and running? | Strength rules can be specified first; include a separate running policy if running is in scope. |
| Which goals and populations are supported? | Use explicit goal/experience branches; define separate rules for returning users and any special populations. |
| Does “undercutting/overcutting” include slow/aggressive progression as well as excessive/insufficient reductions? | Evaluate both directions. |
| May one bad day cause a temporary next-session adjustment while the program baseline stays unchanged? | Yes when supported by current context; distinguish this from a lasting program change. |
| Should normal local progression need two qualifying exposures, and persistent decline need two of three? | Use these as initial candidates, then evaluate false alerts and delayed responses. No symptom waiting period. |
| Which changes may be automatic, and which need athlete review? | Small verified local changes may be automatic. Large/cumulative changes and structural changes should be reviewable. Exact limits remain to be agreed. |
| What is the policy when RIR or stopping reason is missing? | Preserve unknown; use bounded calibration or a targeted question, rather than defaulting to a reduction or permanently blocking progress. Decide the acceptable logging burden. |
| Is eight weeks an appropriate longer window, and how should sparse histories be handled? | Keep eight weeks as a compact default with explicit counts, dates, stale evidence and insufficient-evidence states. |
| Should memory become structured items with a 150–250-word display, and remain editable by the athlete? | Yes; protect confirmed facts and track provenance separately. |
| What equipment details will home users confirm? | Start with the weights/setup needed by their selected exercises; collect exact available loads before automatic weight progression. |
| Should these rules also govern deterministic prefills when AI has no explicit targets? | Yes; otherwise fallback behavior can contradict the coach policy. |
| What should happen when a workout/report is removed? | Invalidate dependent derived observations and recalculate, while retaining independently confirmed facts. |

**Q20. What should be implemented and validated after those decisions?**

Implement the agreed evidence summary and comparison rules first, including units and measurement meaning. Add a shared decision state and evidence-novelty check for daily and weekly work. Then enforce the agreed limits in result acceptance and deterministic prefills. Add structured memo updates to the job contract, update the repository skill/policy, deploy the compatible server changes, advance the live routine's pinned revision, and verify the entry point and deployed contract agree.

Evaluate isolated bad days, same evidence replayed across daily/review jobs, genuine repeated decline, repeated success, sparse history, missing RIR, time-limited sessions, changed equipment/units, home load ceilings, exercise substitutions, pain/restrictions, partial weeks, and returning after a gap. Verify both unwanted-change rate and missed/delayed justified-change rate. Include cumulative volume/load changes and athlete acceptance/reversion, not just JSON validity or model confidence.

Use synthetic and reviewed historical cases first, then compare proposed decisions in shadow mode before enabling new automatic behavior. Predefine what counts as a correct decision and the acceptable tradeoff between overreaction and delay. Software tests and toy arithmetic cannot establish physiological benefit; outcome monitoring is needed to assess whether the agreed policy helps the intended population.

**Evidence access**

This is a focused evidence review, not a new systematic review. It uses the current official ACSM summary, indexed original-study abstracts, accessible author manuscripts/institutional records, and NIST statistical guidance. Some direct publisher and PubMed/PMC requests were blocked or returned no full text; no reanalysis of participant-level study data is claimed. Published and online-first dates are distinguished from search-engine crawl dates.

**Source inventory**

1. American College of Sports Medicine. [Updated resistance-training guidelines](https://acsm.org/resistance-training-guidelines-update-2026/), March 17, 2026. Official summary of the 2026 position stand.
2. Halperin et al. [Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise](https://pubmed.ncbi.nlm.nih.gov/34542869/). Sports Medicine, 2022; online September 2021. DOI: 10.1007/s40279-021-01559-x.
3. Robinson et al. [Proximity to failure, strength gain and hypertrophy: exploratory meta-regressions](https://rke.abertay.ac.uk/en/publications/exploring-the-dose-response-relationship-between-estimated-resist/). Sports Medicine, September 2024. DOI: 10.1007/s40279-024-02069-2.
4. Plotkin et al. [Progressive overload without progressing load?](https://pubmed.ncbi.nlm.nih.gov/36199287/). PeerJ, September 30, 2022. DOI: 10.7717/peerj.14142.
5. Graham and Cleather. [Autoregulation by repetitions in reserve versus fixed loading](https://research.stmarys.ac.uk/3067/3/Graham-Cleather-Autoregulation-Repetitions-in-Reserve.pdf). Journal of Strength and Conditioning Research; published online 2019, volume 35(9), 2021. DOI: 10.1519/JSC.0000000000003164. Accepted manuscript.
6. Coleman et al. [Gaining more from doing less?](https://pubmed.ncbi.nlm.nih.gov/38274324/). PeerJ, January 22, 2024. DOI: 10.7717/peerj.16777.
7. Saw, Main and Gastin. [Monitoring the athlete training response](https://pubmed.ncbi.nlm.nih.gov/26423706/). British Journal of Sports Medicine, March 2016; online 2015. DOI: 10.1136/bjsports-2015-094758.
8. NIST/SEMATECH. [Measures of Scale](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm). Statistical handbook; accessed September 14, 2026.
9. Frandsen et al. [How much running is too much?](https://pubmed.ncbi.nlm.nih.gov/40623829/). British Journal of Sports Medicine, 2025, 59(17):1203–1210. DOI: 10.1136/bjsports-2024-109380.
10. SciPy. [Theil–Sen slope estimator](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html). Official method documentation, citing Theil (1950) and Sen (1968); accessed September 14, 2026.
