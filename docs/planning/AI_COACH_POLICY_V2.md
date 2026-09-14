# Coach policy v2 — accepted implementation

Accepted on September 14, 2026: proceed with the recommendations and make actual effort mandatory. This document describes the local implementation, not a production deployment. The earlier [Q&A](AI_COACH_PLANNING_QA.md) and [prompt snapshot](AI_COACH_PROMPT_SNAPSHOT.md) preserve the audit of the previous version.

**What must the athlete log?**

Rep working sets require actual RIR: estimated additional repetitions with the same technique. Timed sets, carries measured by distance, and runs require actual RPE from 1 to 10. Warmup effort remains optional. The app does not save target effort as actual effort, and historical missing values remain null. An honest estimate is sufficient; no failure test is required. Actual load, repetitions, duration and distance remain distinct measurements. New logs mark effort as reported. Existing ratings are preserved but labelled unconfirmed because earlier screens could copy targets into actual logs; they do not justify automatic changes until explicitly reconfirmed or replaced by new observations. A null rep-set load remains unknown; zero denotes bodyweight-only external load.

RIR is appropriate for proximity to repetition failure, but is an imperfect self-report, especially far from failure. It is not a precise readiness sensor. RPE measures overall perceived effort for work without a countable repetition endpoint; it is not mathematically interchangeable with RIR. [RIR accuracy review](https://pubmed.ncbi.nlm.nih.gov/34542869/), [RIR application review](https://pubmed.ncbi.nlm.nih.gov/38563729/), [session-RPE review](https://pubmed.ncbi.nlm.nih.gov/29163016/).

Older offline set drafts retain their values but require effort to be re-entered before saving. Editing only a historical set's load cannot confirm its old rating. Requests from an outdated workout or run screen ask for a reload instead of accepting a potentially copied target as reported effort.

**What does the coach receive?**

Both daily and weekly jobs receive seven days of detailed history, up to 56 days of exercise evidence, running history and prior accepted decisions. Weekly reviews additionally receive complete aggregates for the exact review interval. Completed work and incomplete work are distinguished. Data has timestamps, local dates, units, equipment identity, source IDs and missing-effort coverage. Detailed narrative lists are bounded and carry coverage flags; a bounded list is not the complete workload total.

Exercise comparisons keep program-slot lineage, exercise, equipment and load convention separate. Physical kg/lb loads can be converted; stack labels cannot be converted to kilograms. Matching-load comparisons allow rounding tolerance, and comparable first-set effort must be within one RIR/RPE point. A second bout on the same local date does not supply a second confirmation occasion. A change to the prescription or setup establishes a separate comparison context.

**What changes the next session?**

The app still selects the next pending program occurrence; it is not necessarily tomorrow's calendar date. Home locations use the same slot IDs and per-exercise equipment resolution as gyms. One-off location intent, the active program, current equipment, actual history, recovery, running workload, preferences and confirmed restrictions inform the next plan.

Within a repetition range, two complete comparable sessions at suitable effort can support adding one repetition. Load progression requires all prescribed working sets to reach the upper target twice with suitable RIR. The next physical load must be feasible. Home equipment now supports a confirmed list of available loads and their convention. A coarse dumbbell jump that exceeds the automatic limit means hold and review a feasible alternative; the coach cannot invent a lighter increment. Assistance and stack-label changes need review rather than treating the label as a simple physical load.

One poor day does not lower the lasting plan. A temporary adjustment requires a cited recent recovery/symptom report or confirmed restriction and applies to that exact session only. Accepted decisions retain the pre-adjustment load. The fallback planner restores retained targets rather than ratcheting downward from the lighter workout. Current readiness still needs reassessment; retained targets are not clearance to train through symptoms.

Daily jobs cannot make lasting changes to the number of working sets. The weekly review handles those changes. The fallback can flag repeated decline but cannot create an unrecorded lasting reduction.

**What is the decline calculation?**

For a comparable exercise/load/effort/prescription context, use first-working-set repetitions, seconds or metres. This is descriptive performance, not muscle growth or a diagnosis.

Let `B` be the median of three earlier eligible exposures, `MAD` the median absolute deviation of those values from `B`, and `R` the median of three recent eligible exposures.

```text
relative_change = R / B - 1
threshold = max(0.05, 1 / B, 2 * MAD / B)
```

A decline candidate requires three recent matched exposures, at least two individually below `B * (1 - threshold)`, a median decline strictly larger than the threshold, and the latest performance still below both that threshold and the prescribed minimum. A latest-session recovery vetoes the cut, including recovery to a baseline below an ambitious program minimum. The reference is retained after accepting a result; it does not simply follow the lower recent median. Deleted, edited, aged-out or incompatible reference evidence is invalidated. Sparse data produces an insufficient-evidence state.

Example: reference `10, 10, 10` gives `B=10`, `MAD=0`, threshold `10%`. Recent `5, 10, 10` does not trigger a cut. Recent `5, 6, 6` gives median `6`, a 40% decline, and qualifies when the latest result is below the program minimum and effort is comparable. Latest recovery `10, 5, 5` vetoes a cut. The one-unit term prevents interpreting a sub-resolution change as meaningful.

The Theil–Sen slope is the median of pairwise performance slopes per week on distinct training dates, with at least three matching observations. It is descriptive context, not an independent trigger. [NIST on median absolute deviation](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm), [Theil–Sen method](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html).

These exact windows, matching tolerances, counts and thresholds are engineering defaults. The full algorithm has not been clinically validated. RIR error, technique, exercise order, rest and setup changes can confound the metric; the coach must review that context. Statistical confirmation never delays responding to acute symptoms.

**What limits stop excessive progression or cuts?**

| Decision | Initial automatic limit |
| --- | --- |
| Rep working-set load | +5% or −10% per decision |
| Load across 14 days | +10% or −15%, measured from the earlier retained load |
| Weekly exercise set count | At most one set and 25% per exercise |
| Total program working sets | At most 20%; cumulative revisions also checked |
| Daily rep target | One rep within the current range, supported by repeat performance |
| Timed/distance target | At most 10%, inside the current range |
| Run distance and duration | Each checked separately against 10%; cumulative decisions over 14 days checked |
| Run session distance | Also checked against the longest recorded run in 30 days |
| Lasting running reduction | Athlete review; RPE alone does not establish a persistent decline |

These are review thresholds, not guaranteed safe doses or research-established optimal percentages. Confirmed recovery adjustments can be smaller than these ordinary floors. Larger or unsupported weekly changes become reviewable proposals. Structural changes still require review; approving a substantial target change does not unnecessarily restart the block.

Exercise-specific and total-dose checks serve different purposes: four sets to five is 25% for that exercise, but must also fit the total program limit. A program of four total sets cannot automatically become five merely because the per-exercise check passes. Daily and weekly decisions share source consumption and decision timestamps. The same two workouts cannot justify multiple successive changes. Repeated small changes are also checked against the earlier reference, rather than only the last revision.

**How does running differ?**

Track actual duration, distance, RPE, frequency, gaps and symptoms. Compare the same scheduled running role and mode, not an easy short run against an unrelated long run. A mode/role without enough comparable history needs calibration or review. Check duration and distance separately even if one is unchanged. No run pace is inferred when its inputs are missing. Running volume and resistance-training dose are not merged into a fictitious common biological score.

The large running cohort associates session-distance spikes with injury risk; it does not validate a universal safe 10% rule. [Primary study](https://pubmed.ncbi.nlm.nih.gov/40623829/).

**What stays in the memo?**

Up to 40 items, 3,000 words and 40,000 characters in total, with 2,000 characters per item. The athlete requested the larger word allowance before merging. These are ceilings, not a target to fill; each item should remain concise. The word budget counts item text, not generated category labels. Store:

- Athlete-confirmed preferences worth applying repeatedly.
- Exercise-specific observations that affect the next choice.
- Brief interpretations of repeated trends, with supporting source IDs.
- An ongoing experiment, its purpose and reassessment date.
- A decision that explains why the plan differs from an obvious default.

Coach items remain observations or hypotheses and require existing athlete-owned sources and a review date within 56 days. Athlete corrections become protected confirmed items. Updates name individual item IDs and the expected memo revision; they preserve unrelated facts and reject competing edits. Expired or missing-source items are withheld from active memo context and shown for reassessment. The athlete can correct or remove items in AI-coach settings.

Skip raw workout logs, duplicated calculated numbers, isolated tired-day labels, invented injuries or diagnoses, unconfirmed preferences presented as facts, and lengthy conversation transcripts. Confirmed goals, restrictions, intake answers and equipment data remain authoritative structured records outside the concise memo. Existing free-text memo content is labelled legacy/unverified; it is not silently upgraded to confirmed fact.

**What has to happen before this is live?**

Local validation passed: 534 tests across 85 files, TypeScript, the production build, source lint and formatting of supported changed files. Lint excludes generated `.next-qa` files and local `output` artifacts. Tests cover home-only planning, evidence and cumulative-change limits, memo ownership/revisions, legacy effort handling and larger-change approval.

Apply migrations `0016_tearful_randall_flagg.sql` and `0017_reported_effort.sql`, deploy the compatible app/server and contract v2, then advance the live routine's pinned checkout to that deployed revision. The audited live entry point pinned `36564277e66b6c3d61fdc4132b91bf96d1e04408`; changing repository instructions alone does not update it. Reclaim stale jobs against fresh context after rollout, and verify a real home-only preparation and a weekly no-change review. No production database or cloud routine was changed as part of this local implementation.

Evaluate these defaults using decision receipts: rate of rejected/overturned changes, immediate reversals, repeated cuts, effort completeness, feasible-load failures, and athlete corrections. Passing software tests demonstrates rule enforcement; it does not establish better physiological outcomes. [ACSM's individualized resistance-training guidance](https://acsm.org/resistance-training-guidelines-update-2026/), [load-versus-repetition progression trial](https://pubmed.ncbi.nlm.nih.gov/36199287/).
