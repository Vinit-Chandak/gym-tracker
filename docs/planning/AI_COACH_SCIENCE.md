# Coaching evidence and context policy

Companion to [the implementation plan](AI_COACH_IMPLEMENTATION_PLAN.md). Sources checked September 11, 2026. This is an evidence-informed design specification, not validation of the app's future coaching efficacy.

The maintainers keep this appendix and its references. The routine receives a short, versioned policy packet containing applicable principles, uncertainty, and decision rules; it does not receive all the papers or this entire planning folder for every athlete.

## 1. What the evidence supports

### Resistance training: individualization before complexity

The 2026 ACSM position stand concerns resistance training in healthy adults. Its synthesis supports progressive resistance training across several prescriptions; heavier loads particularly support maximal strength, and greater weekly volume can support hypertrophy. Reaching failure and elaborate periodization are not necessary for benefit. These are population-level findings, not an exact dose for an individual. [ACSM position stand](https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/), [official ACSM summary](https://acsm.org/resistance-training-guidelines-update-2026/).

Application inference: match the plan to goals, experience, available time, and sustained participation. Do not require every beginner to complete an arbitrary high set count or copy a six-day split. Explain the selected starting dose, then adjust from actual response. The current founder template is an optional template, not the evidence policy.

### Effort matters, but an exact universal RIR target is not established

Robinson and colleagues' 2024 exploratory meta-regressions found a relationship between closer proximity to failure and hypertrophy, while strength gains were less clearly related to proximity. RIR was estimated from study descriptions, and the authors explicitly limit conclusions about the exact dose-response relationship. This does not establish that every set should reach failure or that a single RIR value is optimal for everyone. [Author-hosted study and abstract](https://rke.abertay.ac.uk/en/publications/exploring-the-dose-response-relationship-between-estimated-resist/).

Application inference: use effort targets as goal- and exercise-dependent guidance. Interpret them alongside achieved reps, load, recent comparable work, and restrictions. Do not turn a noisy effort report into an automatic large load or volume change.

### RIR reports are estimates, including for experienced athletes

Halperin and colleagues' scoping review and exploratory meta-analysis found imperfect predictions of repetitions remaining, with considerable between-study heterogeneity. In that analysis, training status did not clearly explain accuracy; it would be inaccurate to treat every experienced user's RIR as a precise measurement. [Study abstract](https://pubmed.ncbi.nlm.nih.gov/34542869/).

Application inference: retain “unknown” RIR, explain the term, and preserve raw self-reports. Use repeated observations to calibrate interpretation. Missing RIR does not mean zero RIR or failure. Do not require an actual failure test during onboarding.

### Running: the weekly 10% rule is not a safety guarantee

Buist and colleagues randomized 532 novice runners to a standard eight-week program or a thirteen-week graded program based on the weekly 10% rule. The graded program did not reduce running-related injury incidence in that trial. This finding does not show that arbitrary load increases are harmless; it limits claims for that rule in that population. [Trial abstract and author-hosted paper](https://research.rug.nl/en/publications/no-effect-of-a-graded-training-program-on-the-number-of-running-r/).

A 2025 prospective study of 5,205 runners associated increases in individual session distance relative to the longest run in the prior 30 days with overuse injury rates; it did not find the same relationship for week-to-week distance ratios. This was observational research in a particular runner cohort, not a universal causal cutoff or proof that smaller increases are safe. [Study abstract](https://pubmed.ncbi.nlm.nih.gov/40623829/), [journal article](https://bjsm.bmj.com/content/59/17/1203).

Application inference: include recent run distance/duration, longest recent run, recent frequency, breaks, and reported problems. Do not label compliance with a weekly percentage as “safe.” Review session jumps and cumulative exposure together. Do not infer pace from missing data, or make strength automatically outrank running for every athlete.

## 2. Product rules that must not be presented as scientific laws

The following are proposed engineering/coaching policies. Their value should be evaluated, and their constants should be versioned and adjustable.

| Policy                                              | Correct interpretation                                                                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily session preparation at 04:00                  | The user's chosen execution cadence and resource constraint. It is not a biologically privileged time to prescribe exercise.                                                                          |
| One weekly program review                           | A predictable opportunity to evaluate the evidence. A review can keep the program unchanged; seven days does not prove a plateau or demand a rewrite.                                                 |
| Keeping useful exercises consistent                 | Preserves comparable observations and reduces unnecessary churn. Do not promise that one fixed number of weeks is optimal for all movements and goals.                                                |
| Double progression/load increments                  | A practical progression method, conditional on achieved targets, effort, equipment increments, and the goal. Do not increase loads just because the calendar advanced.                                |
| Primary-muscle sets plus half-credit secondary sets | A workload accounting heuristic used in the app. It is not a measured biological dose or proof that all exercises contribute equally. Keep the method visible and consistent across coach and charts. |
| Estimated 1RM                                       | A formula-based estimate from eligible comparable sets. Label method/source and uncertainty; never treat it as a tested maximum or compare it across incompatible equipment.                          |
| Session duration estimates                          | Derived from intended work, rest, warm-up, and available history. Show an estimate, not a completion guarantee.                                                                                       |
| Starting dose and effort bands                      | Defaults selected for a particular athlete and supported by the applicable policy. Do not confuse a broad evidence range with a personalized optimum.                                                 |
| Recovery flags                                      | Timestamped reports that inform later decisions. Missing check-ins cannot establish recovery, and one score must not become an unsupported clinical conclusion.                                       |
| A model's rationale or confidence                   | An explanation for review, not independent evidence that the prescription is effective or safe.                                                                                                       |

Do not introduce an automatic deload every week, a mandatory set increase every review, a universal running percentage, or a physique-based strength prediction. Any future numeric rule needs a defined population, input conditions, rationale, source or explicit heuristic label, and an evaluation case. Distinguish a schema's numerical sanity limit from a physiologically validated threshold.

## 3. Evidence the application should calculate and supply

The app should calculate exact totals and comparisons; the model should not reconstruct them from pages of logs.

| Information               | Required meaning                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completed working sets    | Actual performed work, excluding warm-ups, with exercise and equipment identity. Abandoned/open sessions have a separate status.                                          |
| Comparable performance    | Same exercise/measurement and portable-load convention, or the exact relevant machine. Include time since performance and the basis for comparability.                    |
| Weekly volume             | Full requested interval and explicit primary/secondary weighting. Return coverage, not a false zero caused by a short history fetch.                                      |
| Attendance                | Intended opportunities versus completed/skipped/missed work, interpreted under the flexible sequence. Programless users have no program-adherence score.                  |
| Effort and failure        | Actual reps and reported effort, with missing values intact. Distinguish stopping because of time, equipment, or symptoms from inability to complete the prescribed reps. |
| Running exposure          | Completed distance, duration, frequency, recent longest run, gaps, and measurement coverage. Pace requires known distance and duration.                                   |
| Recovery and restrictions | Athlete-reported facts with timestamps and affected movements; confirmed restrictions remain separate from inferred summaries.                                            |
| Initial baselines         | Self-reported example lifts with units, date, and equipment, stored outside completed workout history.                                                                    |
| Plan changes and results  | What was prescribed, what was actually done, the reason for prior changes, and accepted/rejected decisions. Do not treat a model prediction as an observation.            |

Normalize known units using deterministic conversions while retaining the original value and convention. Missing units, assisted loads, per-hand loads, unknown machine configurations, and changed range/measurement require explicit handling; a matching exercise name alone is insufficient.

For weekly review, provide the full active structure and exact review-period aggregates plus longer trends. For daily preparation, provide detailed evidence for the relevant next session and enough neighboring workload to avoid ignoring recent ad hoc or running work. Both need data freshness and completeness. Unavailable information must remain unavailable.

## 4. How a coaching decision should be formed

This is a proposed review procedure, not a claim that research has validated the entire algorithm.

1. **Establish the task and constraints.** Use confirmed goals, time, equipment, restrictions, and the exact pending training components. Do not transfer one person's preferences or health notes to another.
2. **Check evidence quality.** Separate completed comparable logs, reported baselines, estimates, missing information, and old observations. A large context does not compensate for incorrect coverage.
3. **Assess fit and trends.** Consider performance, attendance, effort, workload, time, and reported recovery together. Preserve a plausible alternative explanation for an isolated poor session.
4. **Choose the smallest justified future change.** Maintaining a successful prescription is a valid decision. Do not change split or availability without the required review.
5. **Explain the decision compactly.** Identify supporting records, uncertainty, and what future observation would justify reconsideration. Supply a reason the athlete can understand.
6. **Validate before acceptance.** The server verifies ownership, freshness, frozen-session boundaries, equipment, measures, output completeness, and actual change classification. Rejected output never becomes a prescription.

Initial unknown loads should produce conservative calibration guidance using feasible equipment and an effort target, with no claim of measured strength. The athlete records the load/reps actually used. That new evidence becomes available to the next scheduled planning run; no model needs to change the active session.

General fitness evidence must not be silently extended into injury diagnosis, rehabilitation clearance, or unsupported special-population prescriptions. Respect user-stated restrictions and avoid the existing blanket assurance that a particular kind of lifting is unaffected by a symptom. When essential information is missing, return a specific clarification or withhold the affected prescription instead of inventing clinical certainty. Do not add generic medical messaging to every normal logging action.

## 5. Maintaining accuracy without context overload

Store the compact policy in version control with a policy version and review date. For each rule record its purpose, applicable task/population, inputs, evidence link, confidence/limitations, and whether it is a hard server rule, a coaching default, or an optional heuristic. Source changes should pass review and the evaluation fixtures before deployment; the routine should not browse and rewrite its own scientific policy each morning.

Keep source material in this appendix and send the relevant distilled rules. Omit unrelated sports, founder-only notes, raw papers, repeated explanatory prose, and old rejected ideas without present relevance. Retain still-applicable rejections and all confirmed restrictions, even when older than the narrative-history window.

Do not ask the model to infer missing device readings or build a proprietary recovery score from absent data. Later device observations can use source, timestamp, unit, coverage, and quality fields without changing the meaning of existing manually logged data. Wearable integration is outside this implementation.

Scientific sources here support specific principles and limitations. Commercial examples in [the earlier review](AI_COACH_REVAMP.md) support interaction patterns only. Neither those examples nor successful software tests establish superior physiological outcomes for this app.

## 6. Evidence access and limits

The review used the official ACSM position-stand summary and indexed paper passages, original study abstracts/author-hosted records, and the indexed journal text for the running cohort. Direct retrieval of some PubMed/PMC and journal pages was incomplete or blocked; this document does not claim a complete independent reassessment of their underlying trial data. The citations distinguish the study designs and avoid treating observational associations or exploratory analyses as exact individual predictions.

Before expanding beyond the current strength, muscle, and basic running/hybrid use cases, add applicable evidence and evaluation cases. Reassess sources when their guidance changes or observed failures reveal a policy gap; do not represent this bounded review as an exhaustive systematic review of exercise science.
