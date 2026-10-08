# Evidence review: progression rules for an RIR-based double-progression coach

The evidence behind [ADR 0047](../decisions/0047-two-reps-past-the-top-a-lighter-day-and-a-set-tried-heavier.md):
how accurate reported reps in reserve are, how far a load-to-reps curve can be trusted, what
long sets cost, and how coarse steps, misses and light days are handled. Each section ends with
the rule the evidence suggests for an app; those are inputs, not what the app does. What the
app does is in the ADR, the training policy in `src/domain/training-evidence.ts`, and the
coach's training reference.

Prepared 2026-10-08. Every peer-reviewed citation was checked against its PubMed/NCBI or Crossref record, and against the full text where it was open. Practitioner sources are marked **(opinion)**, claims I could not check are marked **unverified**, and "my calculation" means my own arithmetic.

Evidence grades: **strong** = consistent meta-analyses; **moderate** = one meta-analysis with caveats or several trials; **weak** = few or indirect studies; **opinion** = practitioner guidance or inference.

---

## 1. RIR / reps-to-failure prediction accuracy

**Short answer.** Lifters typically *underpredict* reps to failure, i.e. they report less RIR than they really have. The average error is about 1 rep, but heterogeneity across studies is very large.

Accuracy is best close to failure and in short sets:
- **Short sets near failure:** trained lifters benching at 75% 1RM had a mean absolute error of 0.65 reps when calling 1 and 3 RIR.
- **Set length:** in the meta-regression, error barely changed up to 12 reps (+0.06 rep per extra rep). Beyond 12 reps it grew by about 0.47 rep per extra rep.
- **Long squat sets (16 ± 4 reps):**

  | Called RIR | Error (reps) |
  |---|---|
  | 1 RIR | 2.05 |
  | 3 RIR | 3.65 |
  | 5 RIR | 5.15 |

- **Day-to-day noise:** reps to failure at the same relative load vary between days, with an SEM of about 1.1 reps at 70% 1RM.

**Is a 1-rep tolerance defensible?** Yes as a minimum for sets of 12 reps or fewer, near failure. It is too tight for sets of 13–20+ reps, where about 2 reps is realistic. Because the usual bias is underprediction, a tolerance mainly prevents false misses.

**Evidence: moderate.** One exploratory meta-analysis (I² ≈ 98%) plus lab studies, mostly on bench, squat and machine exercises.

**Sources**
- Halperin I, et al. 2022. *Sports Med* 52:377–390. [doi:10.1007/s40279-021-01559-x](https://doi.org/10.1007/s40279-021-01559-x) · [PMID 34542869](https://pubmed.ncbi.nlm.nih.gov/34542869/)
- Zourdos MC, et al. 2021. *J Strength Cond Res* 35(S1):S158–S165. [doi:10.1519/JSC.0000000000002995](https://doi.org/10.1519/JSC.0000000000002995) · [PMID 30747900](https://pubmed.ncbi.nlm.nih.gov/30747900/)
- Refalo MC, et al. 2024. *J Strength Cond Res* 38:e78–e85. [doi:10.1519/JSC.0000000000004653](https://doi.org/10.1519/JSC.0000000000004653) · [PMID 37967832](https://pubmed.ncbi.nlm.nih.gov/37967832/)
- Mitter B, et al. 2022. *PLoS One* 17:e0268074. [doi:10.1371/journal.pone.0268074](https://doi.org/10.1371/journal.pone.0268074) · [PMC9070879](https://pmc.ncbi.nlm.nih.gov/articles/PMC9070879/)

**Also verified**
- [Zourdos 2016](https://pubmed.ncbi.nlm.nih.gov/26049792/): introduced the scale. It was checked against bar velocity, not against actual failure.
- [Hackett 2017](https://pubmed.ncbi.nlm.nih.gov/27787474/): about 1 rep of error at 0–5 reps from failure, more than 2 at 7–10.
- [Remmert 2023](https://pubmed.ncbi.nlm.nih.gov/37036795/): curl, pushdown and row showed the same pattern.
- [Steele 2017](https://pubmed.ncbi.nlm.nih.gov/29204323/): lifters underpredicted; accuracy improves with experience.

**App rule**
- Define a miss as capacity (reps + RIR) falling short of the expected capacity by more than the tolerance.
- Tolerance is 1 rep for sets of 12 reps or fewer, and 2 reps for longer sets.
- Do not estimate capacity from sets reported at 4 RIR or more.

## 2. Epley/Brzycki beyond ~10–12 reps; exercise differences

**Short answer.** Linear equations such as Epley are reasonable up to about 10 reps and get worse beyond that.
- **Reynolds 2006:** R² fell from 0.993 to 0.955 (bench) and from 0.974 to 0.915 (leg press) going from a 5RM to a 20RM. The authors advise no more than 10 reps for linear equations.
- **Mayhew 2008:** equations, "especially the linear ones", tended to overestimate 1RM at high reps. After training, the change in reps at the same %1RM varied hugely (95% CI −11 to +13).

The reps–%1RM relationship also differs by exercise and by person:
- Leg press allows more reps than bench press (19.0 vs 14.1 at 70% 1RM).
- Squat allows more reps than bench press or arm curl at 60% 1RM.
- The spread between people grows from SD 2.5 reps at 80% 1RM to 4.4 reps at 60%.

On average, Epley's relative predictions track pooled data in the 5–20 rep zone (my calculation from Nuzzo's estimates):

| Lift | Pooled reps at 70% 1RM | Epley's predicted reps at 80% | Pooled reps at 80% |
|---|---|---|---|
| Bench | 14.1 | 8.6 | 8.8 |
| Leg press | 19.0 | 12.9 | 13.1 |

For an individual, however, a prediction can be off by several reps.

**Is extrapolating from sets of 20+ reps reasonable?** Not as a precise gate. There is little data at those rep counts, the spread between people is largest there, and the input already carries the RIR error from Q1. For example, if "17 reps @1 RIR" was really 3 RIR, the predicted landing at 12.5 kg moves from 7.4 to 9.0 reps.

**Evidence: moderate.** There are few data for isolation exercises and for sets above 20 reps.

**Sources**
- Reynolds JM, Gordon TJ, Robergs RA. 2006. *J Strength Cond Res* 20:584–592. [doi:10.1519/R-15304.1](https://doi.org/10.1519/R-15304.1) · [PMID 16937972](https://pubmed.ncbi.nlm.nih.gov/16937972/)
- Mayhew JL, et al. 2008. *J Strength Cond Res* 22:1570–1577. [doi:10.1519/JSC.0b013e31817b02ad](https://doi.org/10.1519/JSC.0b013e31817b02ad) · [PMID 18714230](https://pubmed.ncbi.nlm.nih.gov/18714230/)
- Nuzzo JL, Pinto MD, Nosaka K, Steele J. 2024. *Sports Med* 54:303–321. [doi:10.1007/s40279-023-01937-7](https://doi.org/10.1007/s40279-023-01937-7) · [PMC10933212](https://pmc.ncbi.nlm.nih.gov/articles/PMC10933212/)
- Shimano T, et al. 2006. *J Strength Cond Res* 20:819–823. [doi:10.1519/R-18195.1](https://doi.org/10.1519/R-18195.1) · [PMID 17194239](https://pubmed.ncbi.nlm.nih.gov/17194239/)

**Also checked**
- **LeSuer 1997** ([doi:10.1519/00124278-199711000-00001](https://doi.org/10.1519/00124278-199711000-00001)): the bibliographic details were confirmed via Crossref. Its findings (all equations underestimated deadlift 1RM) come only from secondary sources and are **unverified**.
- **Hoeger 1990** (*J Appl Sport Sci Res* 4:47–54): no PubMed or DOI record found. **Unverified.**
- [Richens & Cleather 2014](https://pubmed.ncbi.nlm.nih.gov/24899782/): training background shifts the curve. Endurance runners did 39.9 reps at 70% 1RM, weightlifters 17.9.
- Preprint, not peer-reviewed ([arXiv 2603.17495](https://arxiv.org/abs/2603.17495)): reports that fixed-constant equations fit light isolation exercises worst.

**App rule**
- Treat the predicted reps after a load jump as ±3 reps.
- Never predict from a capacity above about 20 reps.
- Re-anchor capacity from the first session at the new load.
- Learn a per-exercise *k* in 1RM = w·(1 + r/k) from the user's near-failure sets at two or more loads. Default *k* = 30.

## 3. Hypertrophy across loads; 20+ rep sets

**Short answer.** When taken near failure, 20+ rep sets grow muscle about as well as heavier sets:
- A network meta-analysis of 28 studies found no difference in growth between >15RM, 9–15RM and ≤8RM loads.
- Trained men doing 20–25 reps to failure for 12 weeks grew as much as men doing 8–12 reps.
- 20% 1RM produced only about half the growth of 40–80% 1RM.
- Strength gains are smaller with light loads.

Downsides of light loads:
- More discomfort, higher RPE, longer sets, and more fatigue even in non-exercised limbs.
- Lifters stop at discomfort rather than true failure. Plotkin 2022's rep-progression group "appeared to have greater difficulty approaching true failure".
- At 30% 1RM, stopping well short of failure gave no significant growth (Lasevicius 2022), and RIR estimates are least accurate in such sets (Q1).
- Failure is often not the target muscle: in squat and bench sets at 70–83% 1RM, lifters blamed muscle fatigue in only 54% of reports, and also general fatigue (26%), pain (12%) and cardiovascular strain (11%).

**Grip:** I found no study of grip limiting high-rep curls or rows. Lifting straps increased deadlift reps at 80% 1RM, but did not change lat-pulldown reps at 70% 1RM.

**Evidence:** strong that hypertrophy is similar across roughly 8–30+ reps near failure. Moderate for the downsides. Weak or absent for grip as a limiter.

**Sources**
- Lopez P, et al. 2021. *Med Sci Sports Exerc* 53:1206–1216. [doi:10.1249/MSS.0000000000002585](https://doi.org/10.1249/MSS.0000000000002585) · [PMC8126497](https://pmc.ncbi.nlm.nih.gov/articles/PMC8126497/)
- Morton RW, et al. 2016. *J Appl Physiol* 121:129–138. [doi:10.1152/japplphysiol.00154.2016](https://doi.org/10.1152/japplphysiol.00154.2016) · [PMC4967245](https://pmc.ncbi.nlm.nih.gov/articles/PMC4967245/)
- Lasevicius T, et al. 2018. *Eur J Sport Sci* 18:772–780. [doi:10.1080/17461391.2018.1450898](https://doi.org/10.1080/17461391.2018.1450898) · [PMID 29564973](https://pubmed.ncbi.nlm.nih.gov/29564973/)
- Schoenfeld BJ, Grgic J, Van Every DW, Plotkin DL. 2021. *Sports* 9:32. [doi:10.3390/sports9020032](https://doi.org/10.3390/sports9020032) · [PMC7927075](https://pmc.ncbi.nlm.nih.gov/articles/PMC7927075/)

**Also verified**
- [Schoenfeld 2017 meta-analysis](https://pubmed.ncbi.nlm.nih.gov/28834797/)
- [Lasevicius 2022](https://pubmed.ncbi.nlm.nih.gov/31895290/)
- Discomfort and fatigue: [Fisher & Steele 2017](https://pubmed.ncbi.nlm.nih.gov/28006852/), [Farrow 2021](https://pubmed.ncbi.nlm.nih.gov/32401690/)
- Causes of failure: [Emanuel 2020](https://pubmed.ncbi.nlm.nih.gov/33194334/)
- Lifting straps: [Trahey 2023](https://pubmed.ncbi.nlm.nih.gov/37729509/), [Valério 2021](https://pubmed.ncbi.nlm.nih.gov/31198105/)
- Helms, [SBS guest article](https://www.strongerbyscience.com/low-load-training/) **(opinion)**: save high reps mainly for isolation and machine exercises.

**App rule**
- Keep the overshoot cap at top + 2.
- Set an absolute ceiling of about 20 reps per set (about 15 for free-weight compounds).
- Target 0–1 RIR on any set above 15 reps.

## 4. Proximity to failure; RIR targets

**Short answer.**
- **Failure is not clearly better.** For hypertrophy, momentary failure vs non-failure gave an effect size of 0.12 (not significant). With any definition of failure, the advantage was "trivial" (ES 0.19).
- **Dose-response.** Meta-regressions suggest growth rises as sets end closer to failure. Strength is largely unaffected by RIR.
- **Within-subject trials in trained lifters:**
  - Leg press at 2 RIR and leg extension at 1 RIR matched failure for quadriceps growth.
  - Preacher curls at 1–3 RIR matched failure for both arm size and 1RM.
- **Failure has costs.** It causes more fatigue, worse perceptions, and slower recovery (24–48 h, on squat and bench).
- **ACSM 2026** calls about 2–3 RIR "sufficient effort".

**Evidence: moderate.**

**Sources**
- Refalo MC, et al. 2023. *Sports Med* 53:649–665. [doi:10.1007/s40279-022-01784-y](https://doi.org/10.1007/s40279-022-01784-y) · [PMC9935748](https://pmc.ncbi.nlm.nih.gov/articles/PMC9935748/)
- Robinson ZP, et al. 2024. *Sports Med* 54:2209–2231. [doi:10.1007/s40279-024-02069-2](https://doi.org/10.1007/s40279-024-02069-2) · [PMID 38970765](https://pubmed.ncbi.nlm.nih.gov/38970765/)
- Refalo MC, et al. 2024. *J Sports Sci* 42:85–101. [doi:10.1080/02640414.2024.2321021](https://doi.org/10.1080/02640414.2024.2321021) · [PMID 38393985](https://pubmed.ncbi.nlm.nih.gov/38393985/)
- Vasconcelos T, et al. 2026. *Muscles* 5:61. [doi:10.3390/muscles5030061](https://doi.org/10.3390/muscles5030061) · [PMC13609929](https://pmc.ncbi.nlm.nih.gov/articles/PMC13609929/)

**Also verified**
- [Refalo 2023, *Sports Med Open*](https://pubmed.ncbi.nlm.nih.gov/36752989/): fatigue rose steadily with proximity to failure.
- [Morán-Navarro 2017](https://pubmed.ncbi.nlm.nih.gov/28965198/)
- [Currier 2026, ACSM Position Stand](https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/)

**App rule (opinion)**
- Compounds: 1–3 RIR. Heavy barbell lifts: 2–3 RIR, never 0.
- Isolation exercises: 0–2 RIR, with 1–2 as the default.
- Occasionally program a 0-RIR last set on isolation exercises to measure capacity directly.

## 5. Coarse load increments

**Short answer.** Progressing reps at a fixed load is a valid alternative to progressing load: hypertrophy was similar over 8–10 weeks in trained and untrained lifters. Neither trial set an overshoot limit. I found no controlled studies of microloading, mixed-load sets, tempo changes, or landing below the range.

**Practitioner approaches (opinion):**
- **Contreras:** progress curls and lateral raises by reps. For example, take 10-lb raises to "a couple of sets of 20 reps", then jump 50% to 15 lb. This implicitly accepts a big drop in reps.
- **Vaghela:** "break in" a heavier dumbbell by using it on set 1 only, with back-off sets at the old weight.
- **Zourdos:** "absolutely nothing wrong with repeating the same load two weeks in a row."

**Is landing below the range acceptable?** Temporarily, yes. It is consistent with hypertrophy being load-independent between "five and 30 or more repetitions" (quoted in Plotkin 2022; see also Q3). But no source endorses a specific floor, so the ~5-rep floor is an **opinion**.

**Evidence:** moderate that rep progression and load progression are equivalent. Opinion for the specific tactics.

**Sources**
- Plotkin D, et al. 2022. *PeerJ* 10:e14142. [doi:10.7717/peerj.14142](https://doi.org/10.7717/peerj.14142) · [PMC9528903](https://pmc.ncbi.nlm.nih.gov/articles/PMC9528903/)
- Chaves TS, et al. 2024. *Int J Sports Med* 45:504–510. [doi:10.1055/a-2256-5857](https://doi.org/10.1055/a-2256-5857) · [PMID 38286426](https://pubmed.ncbi.nlm.nih.gov/38286426/)
- Contreras B. "[10 Rules of Progressive Overload](https://bretcontreras.com/wp-content/uploads/10-Rules-of-Progressive-Overload.pdf)" (undated) **(opinion)**
- Vaghela A. "[How To Pick The Right Weight](https://www.rntfitness.co.uk/how-to-pick-the-right-weight)", RNT Fitness, 2017 **(opinion)**

**App rule**
- Keep the top + 2 cap, then step up the load.
- Accept a predicted landing at or above max(5, bottom − 3), or bottom − 1 for ranges whose bottom is 6 or lower.
- If the predicted landing is below that floor even at the cap, switch to mixed loads: set 1 at the new load and the remaining sets at the old load. Promote one more set per session once the heavier sets reach the floor.

## 6. Autoregulation vs fixed progression; speed; missed sessions

**Short answer.** Load selected by RPE or RIR does at least as well as fixed %1RM:
- Helms 2018 found the same hypertrophy plus a small, probable strength advantage.
- Graham & Cleather found larger squat gains, with training intensity rising as strength rose.
- The meta-analyses disagree. Hickmott 2022 found no significant difference (+2.07 kg, p = 0.09). Zhang 2021 found an advantage in athletes (ES 0.64). Larsen 2021 is a systematic review with no pooled analysis, not a meta-analysis.

**How fast to progress.** ACSM 2009 advises raising load by 2–10% once the lifter beats the target by 1–2 reps in two consecutive sessions, with a lower percentage for small-muscle exercises (evidence category B). A 25% dumbbell jump is far outside this.

**Missed sessions.** No study tests how many poor sessions justify cutting the load. Day-to-day noise plus RIR error gives roughly 1.4 reps of capacity noise for short sets and 2.3 for long sets (my calculation), so one bad session is within noise. Practitioners repeat the load first and cut only after repeated misses.

**Evidence:** moderate that autoregulation is at least as good as fixed loading. Opinion for missed-session rules.

**Sources**
- Helms ER, et al. 2018. *Front Physiol* 9:247. [doi:10.3389/fphys.2018.00247](https://doi.org/10.3389/fphys.2018.00247) · [PMC5877330](https://pmc.ncbi.nlm.nih.gov/articles/PMC5877330/)
- Hickmott LM, et al. 2022. *Sports Med Open* 8:9. [doi:10.1186/s40798-021-00404-9](https://doi.org/10.1186/s40798-021-00404-9) · [PMC8762534](https://pmc.ncbi.nlm.nih.gov/articles/PMC8762534/)
- American College of Sports Medicine. 2009. *Med Sci Sports Exerc* 41:687–708. [doi:10.1249/MSS.0b013e3181915670](https://doi.org/10.1249/MSS.0b013e3181915670) · [PMID 19204579](https://pubmed.ncbi.nlm.nih.gov/19204579/)
- Zourdos M. "[How to Choose the Right Load Progression Strategy](https://www.strongerbyscience.com/weekly-load-progression/)", Stronger By Science **(opinion)**

**Also verified**
- [Graham & Cleather 2021](https://pubmed.ncbi.nlm.nih.gov/31009432/): back squat 1RM gains were +10.8% with RIR-based loads vs +7.1% with fixed loads.
- [Zhang 2021](https://pubmed.ncbi.nlm.nih.gov/33776802/)
- [Larsen 2021](https://pubmed.ncbi.nlm.nih.gov/33520457/)
- [Mann 2010](https://pubmed.ncbi.nlm.nih.gov/20543732/) (APRE)
- [Nóbrega 2023](https://pubmed.ncbi.nlm.nih.gov/36515591/): progression within an RM zone (essentially double progression) beat %1RM progression for hypertrophy (untrained men, exploratory).

**App rule**
- A miss means capacity fell short of the *predicted landing* by more than the Q1 tolerance.
- Revert only after two misses within the first three sessions. After a single miss, repeat the load.

## 7. Light or off-plan sessions

**Short answer.** **No study addresses this. What follows is opinion and inference.**
- Deloads deliberately lower load, reps and effort (more RIR) to "enhance preparedness for subsequent training" (Delphi consensus and athlete survey).
- RIR calls far from failure are the least accurate: errors of 3.7–5.2 reps when lifters called 3–5 RIR (Q1). Light sets therefore say little about true capacity.
- In one trial, a one-week break did not affect hypertrophy but blunted strength gains, so the first session back may underperform.

**Evidence:** opinion, with indirect support.

**Sources**
- Bell L, et al. 2023. *Sports Med Open* 9:87. [doi:10.1186/s40798-023-00633-0](https://doi.org/10.1186/s40798-023-00633-0) · [PMC10511399](https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/)
- Rogerson D, et al. 2024. *Sports Med Open* 10:26. [doi:10.1186/s40798-024-00691-y](https://doi.org/10.1186/s40798-024-00691-y) · [PMC10948666](https://pmc.ncbi.nlm.nih.gov/articles/PMC10948666/)
- Coleman M, et al. 2024. *PeerJ* 12:e16777. [doi:10.7717/peerj.16777](https://doi.org/10.7717/peerj.16777) · [PMC10809978](https://pmc.ncbi.nlm.nih.gov/articles/PMC10809978/)
- Zourdos MC, et al. 2021 (Q1)

**App rule**
- Tag deload and off-plan sessions.
- Exclude them from capacity estimates, step-up triggers and miss counts.
- Resume from the pre-deload baseline.

---

## Implications for the app's rules

- **Misses:** compare capacity (reps + RIR) with the *predicted* landing, not the rep range. Tolerance is 1 rep for sets of 12 or fewer reps and 2 above. Revert only after two misses in three sessions; after one miss, repeat the load.
- **Overshoot cap:** top + 2 is sensible because RIR accuracy collapses beyond 12–15 reps. Add an absolute ceiling of about 20 reps (15 for free-weight compounds).
- **Coarse jumps (opinion):** step if the predicted landing is at or above max(5, bottom − 3), or bottom − 1 when the range's bottom is 6 or lower. Otherwise use mixed-load sets.
- **Epley:** treat as ±3 reps, re-anchor after the first session at the new load, and fit a per-exercise *k*.
- **Capacity estimates:** ignore sets at 4 RIR or more, and occasionally program a 0-RIR last set on isolation exercises.
- **RIR targets:** compounds 1–3 (heavy barbell 2–3), isolation 0–2, sets above 15 reps 0–1.
- **Step-up criterion:** the current rule matches ACSM's "1–2 reps over". Optionally require it in two consecutive sessions for compounds.
- **Light, deload and off-plan sessions:** never update baselines or count as misses. Give extra tolerance on the first session after a deload or a gap of 7+ days.
- **Evidence gaps:** grip in high-rep upper-body sets, floors for landing below the range, microloading, and missed-session rules.
