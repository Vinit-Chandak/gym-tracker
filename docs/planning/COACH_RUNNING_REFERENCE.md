# Coach running reference: editorial source

Compiled 20 October 2026 for [ADR 0059](../decisions/0059-running-programmes-laps-and-heart-rate-zones.md).

This is the evidence behind the running reference every running coach job reads. The served,
condensed copy is `src/domain/coach-running-reference.ts` (`COACH_RUNNING_REFERENCE`): change
both together and bump `COACH_RUNNING_REFERENCE_VERSION`. The served text is guidance only:
server permissions, the policy's numeric limits and the athlete's records outrank it, and it
leaves research names and tags out of anything the athlete reads.

Two briefs follow. The first is the training science, tagged by strength of evidence, with a
numbered reference list. The second surveys how leading running apps create plans and record
runs, which set the questions the running intake asks, the structure a session is written in,
what a logged run records and how heart-rate zones default.

How the app applies it:

- **Heart-rate zones** (`src/domain/heart-rate.ts`): five zones at 50/60/70/80/90% of the
  maximum, as Garmin and Polar default, or of the heart-rate reserve (Karvonen) with a resting
  rate, as the ACSM prefers, or the athlete's own. The maximum is the athlete's entered value,
  else the highest plausible reading of their year's runs, else Tanaka's 208 − 0.7 × age (not
  220 − age, which has no research basis). Readings above 230 are treated as sensor artefacts.
- **The intake** (`src/domain/running-intake.ts`) asks what every planning app asks: the goal
  (a race with distance and date, or a goal without one), one recent race or time trial, weekly
  distance and longest recent run, runs a week, run days, long-run day and its time, places and
  terrain.
- **Sessions** carry a run type and are written as steps (warm-up, work and recovery as one
  repeat block, cool-down), each measured by distance or by time, with pace and zone targets.
- **Logged runs** carry their kind and their laps, as a watch lists them.

---

# Part 1: running training science

Compiled 2026-10-20. Tags: **[E++]** meta-analysis or consistent RCTs; **[E+]** an RCT or a large cohort; **[E]** observational, small or mechanistic; **[C]** coaching convention from the canonical books or expert practice (not directly tested). [n] = reference list at the end. "Secondary" means a book rule checked through summaries or quoted highlights, not the book itself.

## 0. Core rules (distilled)
1. Keep at least 75–80% of running time below VT1, i.e., conversational [2,9] [E+]. Recreational runners get 1–2 quality sessions a week, advanced runners 2–3 [C]. For recreational runners, a pyramidal week (some threshold, little VO2max work) works at least as well as a polarised one [7] [E++].
2. Anchor intensity to the athlete's own data, in this order: a recent race (VDOT) or measured thresholds (LTHR, VT); then %HRR from measured HRmax and resting HR; then %HRmax; an age formula (±10 bpm) only as a last resort [11,51–55,59].
3. No single run more than 10% longer than the longest run of the past 30 days [28] [E]. For novices, keep the 2-week rise in weekly volume under 30% [26] [E]. The "10% rule" itself did not prevent injury in an RCT [25] [E+].
4. Hard days hard, easy days easy. Lift heavy legs at least 3–6 h after a same-day hard run, and about 24–48 h before the next key run [40,43–45] [E/C].
5. Taper for about 2 weeks (2–3 for a marathon): cut volume 40–60% on an exponential curve and keep intensity and frequency [18,19] [E++].

## 1. Intensity distribution

**Zone models.** "Zone 2" means different things in different models; always name the model.

| 3-zone (Seiler) | Physiology | Lactate | ~%HRmax in runners | RPE 6–20 | Equivalent in Haugen's 7-zone runner scale [9] | Race-pace anchor |
|---|---|---|---|---|---|---|
| Z1 low | below VT1/LT1 | <2 mmol/L | below ~82–85% | 9–14 | Z1 60–72% (<1 mM); Z2 73–82% (1–2 mM) | easy and long runs |
| Z2 moderate (threshold) | VT1 to VT2 | 2–4 | ~83–92% | 14–17 | Z3 83–87% (2–3.5 mM) | marathon to half-marathon pace (≈1-h race pace is the top of this zone) |
| Z3 high | above VT2/LT2 (≈ MLSS, critical speed) | >4 | above ~92% | 16–20 | Z4 88–92% (10K pace); Z5 >93% (1500 m–5K pace); Z6–7 lactate work and sprints | 10K to mile pace |

- **Lab data, 1,411 runners:** VT1 fell at 85.1 ± 4.6% of peak HR and VT2 at 93.5 ± 2.5%. The matching speeds were 73.9% and 87.6% of the speed at VO2peak [11] [E]. So the watch-style "Zone 2 = 60–70% HRmax" sits far below VT1 for trained runners: it is very easy running, not the ceiling for easy days.
- **Norwegian 5-zone scale** (Tønnessen 2014, via [4]): Z1 54–73% HRmax (<1.2 mM), Z2 74–83%, Z3 84–88%, Z4 89–93%, Z5 >94%.

**Evidence**
- **Seiler & Kjerland 2006** (junior cross-country skiers, 32 days): sessions split 75/8/17% across zones by HR, and 71/7/22% by lactate [1] [E].
- **Seiler 2010 review:** trained athletes settle on about 80% of sessions at low intensity (≈2 mM) and about 20% at high intensity (≈90% VO2max). In already-trained athletes, adding HIIT showed no convincing long-term gain [2] [E].
- **Esteve-Lanao 2005:** sub-elite runners spent 71/21/8% of time in the three zones, and more Z1 time correlated with faster cross-country times (r = −0.97) [10]. Their 2007 RCT: more Z1 work (rather than more Z2) gave bigger gains over ≈10 km [4] [E].
- **Stöggl & Sperlich 2014 RCT** (n = 48, 9 weeks): polarised training beat the other models; VO2peak rose 11.7% and time to exhaustion 17.4% [3] [E+].
- **Meta-analyses** [E++]:
  - Polarised beat threshold-focused training for time trials (ES −0.66), but only 3 studies were pooled [5].
  - Polarised beat other distributions for VO2peak (SMD 0.24, CI 0.01–0.48) but not for time trials (SMD −0.01) [6].
  - An individual-participant network meta-analysis (13 studies, n = 348) found polarised ≈ pyramidal. Competitive athletes may gain more VO2max from polarised, recreational athletes from pyramidal [7].
- **Elite distance runners** [E]: pyramidal in preparation, shifting towards polarised in the competition period, on a hard-day/easy-day rhythm [8]. World-class runners keep at least 80% of volume at low intensity, in 11–14 sessions a week; mid-preparation volume is 160–220 km/week for marathoners and 130–190 km for track runners [9].
- **In practice:** count intensity by time, not sessions. Check easy days with the talk test (comfortable speech ≈ below VT1) [63]. Treat 80/20 as a target band, not a law [C].

## 2. Session types and how to prescribe them

**Daniels' paces** [12] (secondary; % of VO2max via VDOT). Caps apply to a single session.

| Pace | %VO2max | %HRmax | Race equivalent | Format | Cap |
|---|---|---|---|---|---|
| E / L (easy, long) | 59–74 | 65–79 | conversational | recovery, easy and long runs | Long run ≤ the lesser of 25% of weekly volume or 150 min; ≤30% if weekly volume is under 64 km |
| M (marathon) | 75–84 | 80–90 | goal marathon pace | steady segments | ≈110 min; under ~20% of weekly volume |
| T (threshold) | 83–88 | 88–92 | ≈1-h race pace | ~20 min steady, or cruise intervals (e.g., 5 × 1 mile with 1 min rest; work:rest ≈5:1) | ≤10% of weekly volume |
| I (interval) | 95–100 | 98–100 | ≈3K–5K pace | 3–5 min reps (none over 5 min); jog recovery no longer than the rep | the lesser of 10 km or 8% of weekly volume |
| R (repetition) | >100 | n/a | ≈mile pace | 200–400 m (≤~2 min); recovery 2–3 × the rep time | the lesser of 8 km or 5% of weekly volume |

**Session menu.** Formats are coaching convention [C] unless marked [E].

| Session | Intensity anchor | HR anchor / RPE (6–20) | Typical prescription | Source |
|---|---|---|---|---|
| Recovery | slower than easy | Pfitzinger <76% HRmax / <70% HRR; RPE 9–11 | 20–45 min, the day after a hard session | [13] |
| Easy / general aerobic | 15–25% slower than marathon pace (≈5K pace + 0:50–2:30/km) | 70–81% HRmax / 62–75% HRR (Pfitzinger); 65–79% (Daniels); RPE 10–12 | 30–75 min | [12,13] |
| Long run | E pace, or 10–20% slower than goal marathon pace | 74–84% HRmax / 65–78% HRR (book text; [13] lists these transposed) | ≤25–30% of weekly volume and ≤150 min (Daniels); marathon peak 20–22 mi (32–35 km) (Pfitzinger) | [12,13] |
| Medium-long (marathon) | endurance pace | as long run | 11–15 mi (18–24 km) midweek | [13] |
| Marathon pace | goal marathon pace | 79–88% HRmax / 73–84% HRR | e.g., 18 mi with 10 at marathon pace (Pfitzinger); weekly marathon-pace tempo building from 5 to 10 mi (Hansons) | [13,15] |
| Tempo / threshold (LT2) | ≈1-h race pace: 15K–half pace for trained runners; ≈10K pace + 5–10 s/km for slower runners | 82–91% HRmax / 77–88% HRR (Pfitzinger); 88–92% (Daniels); RPE 14–16 | continuous 20–40 min (elites 20–50), or 3–15 min reps with 1–2 min rest (elite total 30–75 min) | [9,12,13] |
| VO2max intervals | 3K–5K pace | 93–95% HRmax / 91–93% HRR (Pfitzinger); RPE 17–19 | 2–5 min reps (e.g., 5 × 1000 m); recovery 50–90% of the rep time (work:rest ≈1:1 to 1:0.5); elite total ≈15–20 min. 4 × 3 min gave more time above 90% VO2max than 24 × 30/30 s [69] [E] | [9,12,13,69] |
| Repetition / speed | ≈mile pace | HR lags; set by pace and RPE | 8–12 × 200–400 m with full recovery | [12] |
| Hills | sprints of 8–12 s at max effort; repeats of 30 s–4 min on a 5–10% grade at 3K–10K effort | — | 8–10 × 200 m or 6–8 × 800–1000 m, jog-down recovery. Six weeks of uphill intervals: 5K time trial +2.0%, economy +2.4% [70] [E] | [9,70] |
| Fartlek | unstructured surges by feel | Z1–Z3 | 30–60 min (e.g., 25 × 1 min on/1 min off, or 4 × 10 min/2 min) | [9] |
| Strides | relaxed, ≈mile pace, not sprints | — | 4–8 × 15–20 s with 45–60 s recovery, after easy runs (Pfitzinger: 10 × 100 m) | [12,13] |

- HR lags in short reps, so prescribe I and R work by pace or RPE, not HR. HR also drifts upward in long or hot runs, about +20 bpm late in a marathon [9,64].

## 3. Plans by distance

Typical lengths, volumes and long runs are coaching convention [C]; the examples come from the named books.

| Goal | Typical length | Runs/week | Example volumes | Key sessions | Long-run peak | Taper |
|---|---|---|---|---|---|---|
| Couch-to-5K | 9 weeks (NHS) | 3, rest day between | 20–30 min per run | run/walk: week 1 is 8 × (60 s run / 90 s walk); 30 min continuous by week 9 [17] | 30 min | none |
| 5K | 8–12 weeks after base | 4–6 | 30–60 km/week (recreational) | I + R, plus T | 60–90 min | 7–10 days |
| 10K | 12 weeks (Pfitzinger tiers 30→42, 45→57, 60→76 mi/week, peaking 3 weeks out) [14] | 4–6 | as listed | T + I; a tune-up race | 75–100 min | 7–10 days |
| Half marathon | 12 weeks (Pfitzinger tiers 31–47, 46–63, 61–84, 81–100 mi/week) [14] | 4–7 | as listed | LT cruise intervals or tempo (e.g., 22 + 18 min at LT); progression long runs; two 10K tune-ups | 16 mi (≈26 km) in tier 2, plus a 12 mi midweek run | 10–14 days |
| Marathon | 16–18 weeks (Pfitzinger 18 or 12; Hansons 18) | 5–7 | Pfitzinger 18/55, 18/70, 18/85, 18/105 (mi/week) | long run, medium-long run, marathon pace, LT; VO2max work late | 32–35 km (Pfitzinger; last one 3–4 weeks out); 26 km (Hansons); ≤150 min (Daniels) | 2–3 weeks |

- **Daniels** [12] [C]: 24 weeks in four 6-week phases:
  1. Foundation and injury prevention: easy running plus strides.
  2. Early quality: R + T.
  3. Transition quality: I + T, the hardest phase.
  4. Final quality: mostly T plus race-specific work.

  A 5K block emphasises R in phase II, I in phase III, then T with I kept for maintenance.
- **Pfitzinger marathon** [13] [C]: endurance → LT plus endurance → race preparation (VO2max work, tune-up races) → a 3-week taper at about 80%, then 60%, then 40% of peak mileage (secondary).
- **Hansons** [15] [C]: six days a week with three "SOS" (something of substance) sessions. Speed work (≈5K pace) in the first half gives way to "strength" work (marathon pace − 10 s/mile). A weekly marathon-pace tempo builds from 5 to 10 mi. The long run is capped at 16 mi (≈25–30% of weekly volume, ≤~3 h), relying on "cumulative fatigue".
- **Lydiard** [16] [C]: aerobic base (≥10–12 weeks) → hills (4–6 weeks) → anaerobic (≈4 weeks) → coordination and race pace → taper (1–3 weeks).
- **Elites** [9] [E]: race-pace volume rises towards competition; marathoners run 30–40 km long runs slightly slower than marathon pace; the taper starts 7–10 days out.
- **Volume and long-run evidence** [E]:
  - Recreational marathoners [20]: under 40 km/week was linked to a slower finish (+6.3 min), over 65 km/week to a faster one (−14.1 min), and a longest run under 25 km to a slower one (+13.4 min).
  - Half marathoners [20]: over 32 km/week and a longest run over 21 km were linked to faster finishes. None of these measures was associated with injury.
  - A meta-regression of 85 studies found weekly distance, runs per week, longest run and hours per week each inversely related to marathon time [21].
- **Taper evidence:**
  - Bosquet 2007 meta-analysis (27 studies): best was 2 weeks (ES 0.59), with volume cut 41–60% exponentially (ES 0.72) and intensity and frequency kept [18] [E++].
  - Mujika & Padilla 2003: keep intensity, cut volume 60–90%, cut frequency by no more than 20%, over 4–28 days in a non-linear shape; expect about +3% (0.5–6%) [19] [E+].

## 4. Sprinting and short speed (100–400 m, and speed for distance runners)

**Best practice** (Haugen 2019 [22]; mostly expert practice [C]; intensity is % of maximal velocity):

| Component | Distance | Intensity | Rest between reps | Session volume | Next high-intensity session |
|---|---|---|---|---|---|
| Acceleration | 10–50 m from blocks or 3-point start | >98% | 2–7 min | 100–300 m | 48 h |
| Maximal velocity | 10–30 m flying (20–40 m run-in) | >98% | 4–15 min | 50–150 m | 48–72 h |
| Sprint-specific ("special") endurance | 80–150 m | >95% | 8–30 min | 300–900 m | 48–72 h |
| Speed endurance (Vittori) | 60–80 m | 90–95% | 2–4 min (8–15 between sets) | 600–2000 m | 48–72 h |
| Resisted sprints | 10–30 m | 80–95% | 3–6 min | 50–200 m | 48 h |
| Tempo (recovery) | 100–300 m | 60–70% | 1–3 min | 1000–2000 m | 24 h |

- **Recovery and volume rules** [22]:
  - Take full recovery; end the session when speed or technique drops.
  - For 7–15 s efforts, rest 1–2 min per second of maximal sprinting (UK Athletics). A popular rule of thumb is about 1 min per 10 m sprinted [C].
  - Allow at least 48 h between intensive sprint sessions, so they rarely fall on consecutive days.
  - Keep sprint speeds polarised: ≥95% or <70% of max, avoiding 70–95%.
- **400 m** [24] [C]: "special endurance" of 300–600 m at ≈95% with about 10 min rest, totalling ≈2.5 × race distance (e.g., 4 × 300 m with 10 min rest).
- **Technique and strength** [22]: drills (high knees, skips, straight-leg bounding) in the warm-up; plyometrics stressing short ground contacts. Lifting 2–3 times a week in 4–6-week cycles: hypertrophy → maximal strength → explosive strength and plyometrics, usually the day after sprint sessions.
- **Periodisation** [22]:
  - General preparation: hill sprints, speed endurance, hypertrophy lifting, tempo.
  - Specific preparation: resisted sprints, acceleration, maximal velocity, maximal and explosive strength.
  - Competition: acceleration plus maximal velocity, special endurance, plyometrics, tempo.
  - "Short-to-long" (Francis) is the most popular model; "long-to-short" suits 200/400 m. Load in 2:1 or 3:1 hard:easy weeks. The Francis taper puts the last hard session 10 days out, then low-volume 95% sessions on days −8, −6, −4 and −2.
- **Speed for distance runners** [9]: 5–15 s (60–120 m) near-maximal sprints, strides, or hill or flying sprints after easy runs or warm-ups, with full recovery and no lactate build-up. Strength and plyometric work also raise sprint speed [40] [E].
- **Ask what "sprint" means:** a sprint triathlon is a 750 m swim, 20 km bike and 5 km run (super-sprint ≈300 m / 5 km / 2.5 km) [23], so that runner needs a 5 km run off the bike. "Sprint" may instead mean 60–400 m track events or short speed work.

## 5. Progression and injury risk
- **Novices** get 17.8 injuries per 1,000 h of running versus 7.7 in recreational runners [31] [E], so progress them more slowly.
- **The 10% rule:** in an RCT of 532 novices, a 13-week graded plan built on the rule matched a standard 8-week plan: 20.8% versus 20.3% injured [25] [E+].
- **Weekly jumps** (874 novices): a rise of more than 30% over 2 weeks, versus under 10%, gave a hazard ratio of 1.59 (95% CI 0.96–2.66, p = 0.07) for distance-related injuries [26]. A review called the overall evidence "very limited" [27] [E].
- **Single-run spikes** (5,205 runners, 588,071 sessions), compared with runs no more than 10% longer than the 30-day longest [28] [E]:
  - 10–30% longer: hazard rate ratio 1.64.
  - 30–100% longer: 1.52.
  - More than 100% longer: 2.28.

  The week-to-week volume ratio showed no association. Rule: cap any run at 110% of the 30-day longest.
- **ACWR** (acute:chronic workload ratio) is mathematically coupled and has no causal evidence behind it; use it to describe load only [29,30] [E].
- **Mileage steps (Daniels)** [12,36] [C]: hold a volume for 3–4 weeks, then add no more than 1 mile (1.6 km) per weekly session, to a maximum of about 10 mi (16 km). Schedule a cutback week every 3–4 weeks at roughly 20–30% lower volume [C]; sprint coaches use 2:1 or 3:1 week patterns [22].
- **Frequency:** at least 3 sessions a week to improve (ACSM: vigorous exercise ≥3 days/week) [37]. VO2max held for 15 weeks on 2–4 days a week at unchanged intensity [32] [E].
- **Detraining:** VO2max dropped 7% after 21 days off and levelled off 16% lower by 56 days [33]. Layoffs under 4 weeks cause rapid losses in highly trained athletes [34] [E].
- **Returning after a break** (Daniels, secondary [35]) [C]:
  - 5 days off or fewer: resume normal training.
  - 6–28 days off: first half of the return period at 50% volume, second half at 75%.
  - 4–8 weeks or more than 8 weeks off: about 33%, then 50%, then 75%.
  - Lower paces too: about −7% of VDOT after 4 weeks off, at most about −20%.
- **Strength training** cut sports injuries (RR 0.315) and overuse injuries (RR 0.53); stretching did not (RR 0.96) [38] [E++].

## 6. Concurrent strength and running
- **Interference** [39] [E++]: the more often and the longer the endurance training, the smaller the strength, hypertrophy and power gains (frequency r −0.26 to −0.35; duration r −0.29 to −0.75). Running, unlike cycling, significantly blunted hypertrophy and strength. This matters for maximal strength or muscle goals, not for running performance.
- **Benefits** [E++]: 2–3 sessions a week for 6–14 weeks improve running economy by 2–8%, plus 1.5–10 km time trials and sprint speed, without harming VO2max or body composition [40]. In highly trained runners, economy improved by SMD −1.42 (2–3 times a week, 8–12 weeks, mixed loads plus plyometrics) [41]; time trials and speed at VO2max improve too [42].
- **Dose** [40] [E]: heavy lifting at 2–6 sets × 3–10 reps above 70% of 1RM; plyometrics at 30–228 foot contacts per session.
- **Scheduling evidence:**
  - Gaps of 0, 6 or 24 h: doing both in one session blunted strength gains, and a 24 h gap gave the best VO2peak gains. Avoid gaps under 6 h between conflicting sessions [43] [E+].
  - Wait at least 3 h after high-intensity running before lifting [40].
  - Same day, 6 h apart: lifting before running hurt next-day economy and time to exhaustion more than running first [44] [E]. Run first.
  - 100 drop jumps cut 30-min time-trial performance by 4% 48 h later [45] [E]. Avoid key runs within about 48 h of new or eccentric-heavy leg work.
  - Within one session, lift first if strength is the priority: +6.9% lower-body dynamic strength [46] [E+]. Review: [47].
- **Template** [C]: quality run in the morning, heavy legs at least 3–6 h later. The next day is easy or rest; never put the long run or a quality session the day after heavy legs. Drop to one maintenance session a week in peak weeks and the taper, with no heavy legs in the last 7–10 days.

## 7. Heart-rate zones

**(a) Max-HR equations.** Individual error is about ±10 bpm.

| Equation | Basis | Error | Predicted HRmax at age 30 / 40 / 50 / 60 |
|---|---|---|---|
| Fox: 220 − age | Not derived from original research; based on ~11 compiled data sources [48] | Sxy 7–11 bpm [48] | 190 / 180 / 170 / 160 |
| Tanaka 2001: 208 − 0.7 × age | Meta-analysis of 351 studies (18,712 people); lab cross-validation in 514 gave 209 − 0.7 × age; independent of sex and activity [49] | ~±10 bpm | 187 / 180 / 173 / 166 |
| Gellish 2007: 207 − 0.7 × age | Longitudinal: 132 people, 908 tests over 25 years [50] | ±5–8 bpm (secondary) | 186 / 179 / 172 / 165 |
| Nes 2013: 211 − 0.64 × age | HUNT study, 3,320 healthy adults [51] | SEE 10.8 bpm | 192 / 185 / 179 / 173 |

- In 4,043 runners, formulas missed by 9.1–10.5 bpm (RMSE) [52].
- In 4,375 endurance athletes, formulas underestimated field HRmax by about 5–6 bpm (Tanaka bias −4.8; limits of agreement −18.5 to +9.1) [53]. Older formulas also underestimate HRmax after about age 30 [51].
- If a formula is unavoidable, use Tanaka (or Nes for older runners).

**(b) Karvonen (%HRR) method:** target HR = resting HR + % × (HRmax − resting HR) [56]. Example with max 185 and rest 55: 70% HRR = 146 bpm, versus 130 bpm for 70% of HRmax. Measure resting HR on waking over several days [C].

**(c) %HRmax 5-zone model** (Garmin default): Z1 50–60%, Z2 60–70%, Z3 70–80%, Z4 80–90%, Z5 90–100% [57]. ACSM's categories differ: very light <57% HRmax, light 57–63%, moderate 64–76%, vigorous 77–95%, near-maximal ≥96% [37].

**(d) Friel LTHR zones for running** [58]:
- Test: a 30-min solo all-out time trial; LTHR is the average HR of the last 20 min (a ~60-min race also works).
- Zones as % of LTHR: Z1 <85%, Z2 85–89%, Z3 90–94%, Z4 95–99%, Z5a 100–102%, Z5b 103–106%, Z5c >106%. With LTHR 170: Z2 = 144–151 bpm, Z4 = 162–168 bpm.
- Validation: in 27 runners and triathletes, 30-min time-trial HR matched the lab lactate threshold at 4 mM (SEE 8 bpm), and it also estimated threshold speed (SEE 0.21 m/s) [59] [E].

**(e) Estimating max HR from field data** (procedure is [C]; the cited facts are evidence):
- **Source:** the highest reliable HR at the end of an all-out effort, e.g., the last 400–800 m of a hard 5K/10K, or the final rep of 3–4 × 2–3 min uphill after a 15–20 min warm-up. Field values usually exceed formulas and lab peaks: VO2max tests under-read HRmax by about 5–6 bpm in endurance athletes [53], and female athletes reached 198 bpm in the field versus 190 in the lab [54].
- **Artifacts:** wrist optical sensors can lock onto step cadence ("signal crossover"), and their error is about 30% higher during activity than at rest [60]. A chest-strap ECG agreed best with lab ECG (rc 0.996 versus 0.67–0.92 for wrist devices) [61].
- **Discard:**
  - single-sample spikes, or jumps of more than ~10 bpm within 1–2 s;
  - values more than ~25 bpm above the age prediction unless corroborated;
  - flat traces where HR roughly equals cadence (150–190 spm);
  - spikes in the first 5–10 min of a run (dry sensor contact);
  - high readings at easy effort.
- **Accept** a plateau held at least 5–10 s at the end of a maximal effort, ideally seen in 2 or more sessions. Take the highest credible value; don't average it down. Revise upward only on credible evidence. HRmax falls about 0.6–0.7 bpm a year [49,51].

**(f) Which method is most research-backed for individualising zones?**
1. Threshold-anchored zones from lab testing (VT1/VT2 or LT1/LT2). Fixed percentages produce very different strain between people: at 60% and 75% VO2max, lactate varied with a CV of 41–52% [62]. Thresholds vary between runners too (VT1 at 85 ± 4.6% of peak HR) [11].
2. A field threshold anchor: LTHR from a 30-min time trial [58,59], or race-derived paces (VDOT).
3. %HRR from measured HRmax and resting HR. %HRR tracks %VO2 reserve almost exactly (slope 1.00, intercept −0.1) but overstates %VO2max [55]; ACSM prefers it [37].
4. %HRmax with a measured max.
5. An age formula, as a last resort.

**ACSM intensity bands** (%HRR = %VO2R) [37]:

| Category | %HRR | RPE (6–20) |
|---|---|---|
| Very light | <30% | <9 |
| Light | 30–39% | 9–11 |
| Moderate | 40–59% | 12–13 |
| Vigorous | 60–89% | 14–17 |
| Near-maximal to maximal | ≥90% | ≥18 |

When HR is unreliable (heat, drift, wrist sensors), use RPE and the talk test [63,64].

## 8. Race prediction and training paces from a recent race
- **Riegel 1981:** T2 = T1 × (D2/D1)^1.06, fitted to world records [65]. In 2,303 recreational runners it was well calibrated up to the half marathon, but its marathon predictions were at least 10 min too fast for half of them [66]. Treat a marathon prediction as best-case unless the runner has high weekly volume and long runs of ≥30 km.
- **Daniels VDOT** (Daniels–Gilbert equations) [67]:
  - VO2 = −4.60 + 0.182258v + 0.000104v², where v is speed in m/min.
  - %max = 0.8 + 0.1894393e^(−0.012778t) + 0.2989558e^(−0.1932605t), where t is race time in minutes.
  - VDOT = VO2 / %max.
  - Example row: VDOT 38 corresponds to 5K 25:10, 10K 52:15, half 1:55:51, marathon 3:59:30 [68].

**Worked example: 5K in 25:00** (5:00/km; VDOT ≈ 38.3; computed)

| Distance | Riegel | VDOT |
|---|---|---|
| 10K | 52:07 (5:13/km) | 51:53 (5:11/km) |
| Half marathon | 1:55:00 (5:27/km) | 1:55:04 (5:27/km) |
| Marathon | 3:59:47 (5:41/km) | 3:57:55 (5:38/km); realistically slower [66] |

**Training-pace offsets from 5K pace** (computed with the VDOT equations for 5K times of 18–35 min):

| Pace | Offset vs 5K pace | For a 25:00 5K |
|---|---|---|
| E | +0:50 to +2:30/km (use the slower half on recovery days) | 6:03–7:14/km |
| M | +30 to +45 s/km | 5:38/km |
| Half-marathon pace | +20 to +38 s/km | 5:27/km |
| T | ≈ +15 s/km (≈10K pace + 5–10 s/km) | 5:16/km |
| 10K pace | +8 to +17 s/km | 5:11/km |
| I | −3 to −18 s/km (≈3K pace) | ≈4:51/km (1:56/400 m) |
| R | −20 to −27 s/km (≈mile pace) | ≈4:36/km (1:50/400 m) |

- Recompute after each race or time trial, using the most recent honest all-out effort no more than 6–8 weeks old. Slow the paces for heat, hills and altitude [C].

## References
1. Seiler KS, Kjerland GØ. Scand J Med Sci Sports 2006;16:49–56. doi:10.1111/j.1600-0838.2004.00418.x
2. Seiler S. What is best practice for training intensity and duration distribution… IJSPP 2010;5:276–291. doi:10.1123/ijspp.5.3.276
3. Stöggl T, Sperlich B. Front Physiol 2014;5:33. doi:10.3389/fphys.2014.00033
4. Stöggl TL, Sperlich B. The training intensity distribution among well-trained and elite endurance athletes. Front Physiol 2015;6:295. doi:10.3389/fphys.2015.00295 (summarises Tønnessen 2014 and Esteve-Lanao 2007, doi:10.1519/R-19725.1)
5. Rosenblat MA et al. Polarized vs threshold TID: meta-analysis. JSCR 2019;33:3491–3500. doi:10.1519/JSC.0000000000002618
6. Oliveira PS et al. Sports Med 2024;54:2071–2095. doi:10.1007/s40279-024-02034-z
7. Rosenblat MA et al. Which TID intervention…? IPD network meta-analysis. Sports Med 2025;55:655–673. doi:10.1007/s40279-024-02149-3
8. Casado A et al. IJSPP 2022;17:820–833. doi:10.1123/ijspp.2021-0435
9. Haugen T, Sandbakk Ø, Seiler S, Tønnessen E. Training characteristics of world-class distance runners. Sports Med Open 2022;8:46. doi:10.1186/s40798-022-00438-7
10. Esteve-Lanao J et al. MSSE 2005;37:496–504. doi:10.1249/01.MSS.0000155393.78744.86
11. Esteve-Lanao J et al. Reference values for HR and speed zones in long-distance runners. Sports 2026;14:29. doi:10.3390/sports14010029
12. Daniels J. Daniels' Running Formula, 3rd ed. (Human Kinetics), checked via: https://www.coachray.nz/2023/05/03/jack-daniels-running-intensity/ ; quoted highlights at https://www.goodreads.com/notes/57293990-daniels-running-formula/1412810-hilmi?page=3 and https://www.goodreads.com/notes/20762026-daniels-running-formula/77147819-adrian-gonzalez?page=3 ; long-run cap at https://runningmagazine.ca/?p=99607 ; phases at https://www.coacheseducation.com/endur/jack-daniels-dec-00.php and https://runningwithrock.com/training-explained-jack-daniels-running-formula/
13. Pfitzinger P, Douglas S. Advanced Marathoning (Human Kinetics), via https://runningwithrock.com/pfitz-marathon-training-explained/ and https://runningwithrock.com/pfitzinger-marathon-plan/ ; recovery runs from webinar slides https://www.slideshare.net/slideshow/marathon-training-webinar/11191347 ; taper https://www.hmrrc.com/members/pacesetter/2018/may/coaches-corner-tapering-your-event
14. Pfitzinger P, Latter P. Faster Road Racing. Publisher excerpt: https://us.humankinetics.com/blogs/excerpt/training-for-an-8k-or-10k-race ; half-marathon plans: https://runningwithrock.com/pete-pfitzinger-half-marathon-plans/
15. Humphrey L. Hansons Marathon Method, via https://runningwithrock.com/pros-and-cons-of-the-hanson-marathon-training-plan/ , https://marathonhandbook.com/hansons-marathon-method/ and https://lukehumphreyrunning.com/marathon-strength-workouts/
16. Lydiard phases: https://www.lydiardfoundation.org/about ; https://coachtherun.com/running-training/technique/what-is-the-lydiard-method/
17. NHS Couch to 5K plan: https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/
18. Bosquet L et al. Effects of tapering on performance: a meta-analysis. MSSE 2007;39:1358–1365. doi:10.1249/mss.0b013e31806010e0
19. Mujika I, Padilla S. MSSE 2003;35:1182–1187. doi:10.1249/01.MSS.0000074448.73931.11
20. Fokkema T et al. Scand J Med Sci Sports 2020;30:1692–1704. doi:10.1111/sms.13725
21. Doherty C et al. J Sci Med Sport 2020;23:182–188. doi:10.1016/j.jsams.2019.09.013
22. Haugen T, Seiler S, Sandbakk Ø, Tønnessen E. Training and development of elite sprint performance. Sports Med Open 2019;5:44. doi:10.1186/s40798-019-0221-0
23. Sprint triathlon distances: https://en.wikipedia.org/wiki/World_Triathlon_Championship_Series ; https://triathlon.org/events/2026-world-triathlon-cup-tiszaujvaros
24. Clyde Hart 400 m clinic notes (convention): https://www.runblogrun.com/2023/04/clyde-harts-guide-to-400-meter-training-from-1996-super-clinic-notes-world-coaches-notes.html
25. Buist I et al. Am J Sports Med 2008;36:33–39. doi:10.1177/0363546507307505
26. Nielsen RØ et al. JOSPT 2014;44:739–747. doi:10.2519/jospt.2014.5164
27. Damsted C et al. IJSPT 2018;13:931–942. doi:10.26603/ijspt20180931
28. Frandsen JSB et al. How much running is too much? BJSM 2025;59:1203–1210. doi:10.1136/bjsports-2024-109380
29. Impellizzeri FM et al. IJSPP 2020;15:907–913. doi:10.1123/ijspp.2019-0864
30. Lolli L et al. BJSM 2019;53:921–922. doi:10.1136/bjsports-2017-098110 ; Windt J, Gabbett TJ. BJSM 2019;53:988–990. doi:10.1136/bjsports-2017-098925
31. Videbæk S et al. Sports Med 2015;45:1017–1026. doi:10.1007/s40279-015-0333-8
32. Hickson RC, Rosenkoetter MA. MSSE 1981;13:13–16. doi:10.1249/00005768-198101000-00011
33. Coyle EF et al. J Appl Physiol 1984;57:1857–1864. doi:10.1152/jappl.1984.57.6.1857
34. Mujika I, Padilla S. Detraining, Part I. Sports Med 2000;30:79–87. doi:10.2165/00007256-200030020-00002
35. Daniels' return-to-running categories (secondary): https://www.trailrunnermag.com/training/trail-tips-training/returning-running-injury
36. Daniels' mileage-increase rule (secondary): https://runnersconnect.net/?p=6471
37. Garber CE et al. ACSM Position Stand. MSSE 2011;43:1334–1359. doi:10.1249/MSS.0b013e318213fefb
38. Lauersen JB et al. BJSM 2014;48:871–877. doi:10.1136/bjsports-2013-092538
39. Wilson JM et al. JSCR 2012;26:2293–2307. doi:10.1519/JSC.0b013e31823a3e2d
40. Blagrove RC, Howatson G, Hayes PR. Sports Med 2018;48:1117–1149. doi:10.1007/s40279-017-0835-7
41. Balsalobre-Fernández C et al. JSCR 2016;30:2361–2368. doi:10.1519/JSC.0000000000001316
42. Beattie K et al. Sports Med 2014;44:845–865. doi:10.1007/s40279-014-0157-y
43. Robineau J et al. JSCR 2016;30:672–683. doi:10.1519/JSC.0000000000000798
44. Doma K, Deakin GB. Appl Physiol Nutr Metab 2013;38:651–656. doi:10.1139/apnm-2012-0362
45. Marcora SM, Bosio A. Scand J Med Sci Sports 2007;17:662–671. doi:10.1111/j.1600-0838.2006.00627.x
46. Eddens L et al. Sports Med 2018;48:177–188. doi:10.1007/s40279-017-0784-1
47. Doma K et al. Sports Med 2019;49:669–682. doi:10.1007/s40279-019-01072-2
48. Robergs RA, Landwehr R. The surprising history of the "HRmax = 220 − age" equation. JEPonline 2002;5(2):1–10. https://www.asep.org/asep/asep/May2002JEPonline.html
49. Tanaka H et al. JACC 2001;37:153–156. doi:10.1016/S0735-1097(00)01054-8
50. Gellish RL et al. MSSE 2007;39:822–829. doi:10.1097/mss.0b013e31803349c6
51. Nes BM et al. Scand J Med Sci Sports 2013;23:697–704. doi:10.1111/j.1600-0838.2012.01445.x
52. Kasiak PS et al. J Clin Med 2023;12:2884. doi:10.3390/jcm12082884
53. Ausland Å, Kelemen B, Seiler S. Front Sports Act Living 2026;8:1806303. doi:10.3389/fspor.2026.1806303 (cites Ingjer 1991, doi:10.1111/j.1600-0838.1991.tb00285.x)
54. Coutinho C et al. J Hum Sport Exerc 2017;12:386–395. doi:10.14198/jhse.2017.122.15
55. Swain DP, Leutholtz BC. MSSE 1997;29:410–414. doi:10.1097/00005768-199703000-00018
56. Karvonen MJ, Kentala E, Mustala O. Ann Med Exp Biol Fenn 1957;35:307–315.
57. Garmin heart-rate zone table: https://www8.garmin.com/manuals-apac/webhelp/instinctsolar/EN-SG/GUID-A6BA0162-041B-4512-8FEC-9E6F3DF24B77-7512.html
58. Friel J. Quick Guide to Setting Zones: https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/
59. McGehee JC et al. JSCR 2005;19:553–558. doi:10.1519/15444.1
60. Bent B et al. npj Digit Med 2020;3:18. doi:10.1038/s41746-020-0226-6
61. Gillinov S et al. MSSE 2017;49:1697–1703. doi:10.1249/MSS.0000000000001284
62. Scharhag-Rosenberger F et al. J Sci Med Sport 2010;13:74–79. doi:10.1016/j.jsams.2008.12.626
63. Reed JL, Pipe AL. The talk test. Curr Opin Cardiol 2014;29:475–480. doi:10.1097/HCO.0000000000000097
64. Achten J, Jeukendrup AE. Heart rate monitoring. Sports Med 2003;33:517–538. doi:10.2165/00007256-200333070-00004
65. Riegel PS. Athletic records and human endurance. Am Sci 1981;69:285–290.
66. Vickers AJ, Vertosick EA. BMC Sports Sci Med Rehabil 2016;8:26. doi:10.1186/s13102-016-0052-y
67. Daniels–Gilbert VDOT equations, as reproduced at https://tools.devcomma.com/en/calculators/vdot (originally Daniels & Gilbert, Oxygen Power, 1979)
68. VDOT table derived from the same equations: https://shuichi-running.com/en/wp-content/uploads/2026/04/VDOTpace_EN_miles.pdf
69. Fleckenstein D et al. Front Sports Act Living 2024;6:1507957. doi:10.3389/fspor.2024.1507957
70. Barnes KR et al. IJSPP 2013;8:639–647. doi:10.1123/ijspp.8.6.639


---

# Part 2: how running apps build plans and log runs

**Method:** I used official help centres and manuals wherever I could reach them: Runna, COROS, Strava and TrainingPeaks help articles (all updated Aug–Oct 2026), the Garmin Forerunner 970 manual (Sept 2026) and Polar e-manuals. Two official sites blocked automated reads: support.garmin.com and vdoto2.com. For those, details come from vendor blogs, and anything from a secondary source is marked **(2nd)**. Citation codes link to the source list at the end.

## Key takeaways for design

1. **The plan-creation inputs are much the same across apps:**
   - a goal: either a race (distance and date) or a non-race goal
   - one piece of fitness evidence: a recent or estimated race time, which sets every pace
   - current weekly volume and longest run, or an "ability level" that pre-fills both
   - runs per week, available days and preferred long-run day
   - volume and difficulty preferences

   A goal time is optional, and Runna deliberately has none [RN5].
2. **Plans are periodised.** The usual sequence is base → build → peak → taper. Build weeks come in 2:1 or 3:1 cycles (two or three harder weeks, then one lighter "deload" week). The taper lasts 1–3 weeks.
3. **A structured workout is an ordered list of steps with repeat blocks:**
   - Step types: warm-up, work, recovery or rest, cool-down.
   - Each step ends by **time**, **distance** or **lap button** ("open").
   - Each step has a target: pace range, HR zone or range, %threshold, power, cadence, RPE, or none.
   - Garmin's FIT workout schema is the de facto format other apps exchange workouts in [G7].
4. **Standard logging fields:** distance, moving and elapsed time, average pace, average and max HR, time in zones, laps/splits, elevation, cadence and calories. **Niche fields:** power, running dynamics, vendor training-load and training-effect scores, and grade-adjusted pace (GAP). A post-run RPE (1–10) is the cheap substitute for HR-based load [S6].
5. **HR zone defaults:**
   - Garmin, Polar, Strava and Runna all default max HR to **220 − age** and use **%HRmax** zones.
   - Garmin and Polar use 50/60/70/80/90/100% boundaries.
   - Strava and Runna cut at 65/81/89/97%.
   - COROS defaults to six **%LTHR** (lactate-threshold HR) zones.

---

## A. Plan-creation inputs

| App | What the user provides | Notes |
|---|---|---|
| **Runna** | **Plan type** [RN1]: Race; Distance (5K–50K); 5K/parkrun Improvement; Run Faster / Maintain / Further / Train Your Way; New to Running / Return to Running / Path to parkrun; Post-race / Post-injury / Postpartum; Hyrox; triathlon (run only).<br>**Goal:** search for a race, or add one manually (name, distance, date). Optional future start date.<br>**Ability level** (New to Running → Beginner → Intermediate → Advanced → Elite → Elite Plus). This pre-fills **current weekly mileage and longest run**, and both are editable [RN2][RN4].<br>**Recent race time(s):** one estimated current 5K, 10K or half time sets all paces [RN5].<br>**Schedule:** runs per week (minimum 2; maximum 4–7 depending on ability), available days, preferred **long-run day** [RN3].<br>**Training Volume** (Progressive / Steady / Gradual) and **Difficulty** (Challenging / Balanced / Comfortable). An advanced mode caps the longest run and sets the number of hard runs [RN6].<br>**Elevation profile:** Flat / Rolling / Moderate / Hilly [RN13].<br>**Units:** km or mi; pace targets or RPE [RN12].<br>Strength is added after creation: ability, goal, 30/45/60 min, up to 4 per week, days, equipment [RN14].<br>Beginner plans instead ask how long since you last ran, and how often and what type you exercise [RN2]. | There is **no goal-time input** by design [RN5]. Custom length is 6–26 weeks [RN7]. |
| **Garmin Coach** (expert plans by Galloway, McMillan and Parkerson-Mitchell) | Distance (5K, 10K or half marathon). Current weekly mileage, with an option for people not currently running. Average pace (a recent run's time ÷ distance). Goal: a time goal, or just finish. Choice of coach [G2]. | Lengths: 5K 6–20 weeks, 10K 10–21 weeks, half 12–26 weeks (2021 blog) [G2]. |
| **Garmin Run Coach** (algorithmic) | End date or goal; race and course information (several races allowed, one marked primary); days to train and days to rest; optional supplemental strength on compatible watches [G3][G4]. A forum thread shows "Days Available" and "Long Run Days" settings [G8 (2nd)]. | Adapts to VO2max, lactate threshold, training history, sleep, stress and recovery [G3]. |
| **Garmin Daily Suggested Workouts** (no plan) | Needs a VO2max estimate. Settings: Training Days, Long Workout Day, Target Type. Adding a race event (date, optional goal time, course) switches the suggestions to race phases [G1][G6]. | |
| **COROS** Personalized Marathon Plan | Confirm a recent or estimated 10K and marathon time (pre-filled from the Race Predictor). Distance run in the last month (pre-filled). Upcoming race (yes/no, date). Target marathon time and intensity level on a slider, which shows the resulting average weekly mileage and number of workouts [C1]. | Aimed at runners who have already finished a half [C1]. Alternatives: build your own plan, or download a coach plan [C2]. |
| **Polar Running Program** | Event (5K, 10K, half or marathon), program name, event date, start date. Activity-level questions (pre-filled if 4 weeks of history exist). Whether to include supporting strength, core and mobility work. A physical activity readiness questionnaire [P1]. | 9 weeks to 20 months [P1]. |
| **Nike Run Club** | Pick a fixed plan and start it: Get Started (4 weeks), Go Beyond (4 weeks), 5K (8), 10K (8), half (14), marathon (18) [N1]. The marathon plan can start 8 or 18 weeks out, at 3, 4 or 5 days per week [N3]. | No fitness inputs are documented. |
| **TrainingPeaks** | Buy a coach-written plan, then apply it by **start date or end (event) date**. Some plans are locked to a specific event [TP2]. | Content is defined by the plan's author. |
| **Strava** | No longer builds running plans. Effective July 10 (year not stated), new running plans on the website are "powered by Runna" [S1]. Instant Workouts use a "focus" (Build fitness / Stay active / Train for an event / Recover) plus optional details and an end date [S2]. | Strava owns Runna. |
| **Hal Higdon** (Run With Hal app) | 5K to 50K plans that adapt to "goals, schedule, and performance". Long-run customisation and blackout dates [H3]. On the website you simply pick a level [H1]. | |
| **V.O2 (Jack Daniels)** | VDOT (Daniels' fitness score) from a recent race. Adaptive Trainer or Goal Race Plan [D1]. Coach-customised templates use training and racing history, preferred running days and days off, with no minimum weekly mileage [D3 (2nd)]. | |
| **Pfitzinger** | Pick a plan by peak weekly mileage (55, 70, 85 or 105 mi) and length (12 or 18 weeks). Prerequisites: you can complete week 1, and you have recently done a long run as long as week 1's longest [PF1]. | |
| **Hansons** | Pick Just Finish, Beginner or Advanced. Beginner is 18 weeks, building from about 20 to about 55 mi/week [HN1]. | |

## B. Plan types, session types, length, phases and taper

| App | Session types | Length, phases, taper |
|---|---|---|
| **Runna** | Easy; recovery; long (including structured/paced long runs and a "Race Practice Long Run"); tempo; intervals (threshold, VO2max, speed); hills; strides; steady; time trial; race. Strength, yoga and Pilates are add-ons [RN15][RN16][RN22]. | Blocks of **build, build, deload** [RN19]. The long run grows 10–15% per week, with a deload every 4–5 weeks. Marathon peak is 32 km, done once or twice [RN20]. The taper starts after the Race Practice Long Run, about 3 weeks out: about −30% volume, then up to −50% in race week, with taper intervals kept in [RN8]. Suggested minimum lengths: 5K 8 weeks, 10K 10, half 12, marathon 16, ultra 16 [RN7]. |
| **Garmin** | Daily suggestion types: recovery; base (HR "typically below 80%" of max; run/walk for entry-level runners); tempo (about marathon pace); threshold (a pace sustainable for 40–60 min); VO2max (longer hard intervals); anaerobic (40–60 s efforts); sprint; rest [G5]. Garmin Coach plans: easy, long easy, hill repeats, goal-race-pace repeats, cadence drills, speed repeats [G2]. | Race phases: **base, build, peak, taper, race** [G6]. |
| **COROS** | The marathon plan mixes easy, interval and long runs with strength [C1]. Each run gets a Training Focus label: Easy, Base, Tempo, Threshold, VO2 Max or Anaerobic [C6]. | Base → Progression/Peak → Race phase (includes the taper) [C1]. |
| **Polar** | Easy jog, medium run, long run, tempo, interval, plus optional strength, core and mobility [P1]. | Base building runs in 4-week cycles (3 progressive weeks, 1 light). Build-up lasts 9–15 weeks (2 harder weeks, 1 lighter), then tapering. Minimum 9 weeks for 5K, 10 for 10K, 14 for half or marathon. 2–5 runs and 1–7 hours per week [P1][P2]. |
| **Nike Run Club** | Speed (short and long intervals, fartlek, hills, tempo), long (including progression runs), recovery (run by feel), rest or a Nike Training Club workout [N2][N3]. | Fixed lengths; no taper is documented. |
| **Hal Higdon** | Novice: easy runs, long run, cross-training, rest. Advanced adds marathon-pace runs, hills, 800 m repeats ("Yasso" 800s) and tempo runs, plus "3/1" long runs that pick up pace for the last quarter [H1][H2]. | Marathon plans are 18 weeks. Every third week is a stepback week. Peak long run is 20 mi, followed by a **3-week taper** [H1][H2]. |
| **Pfitzinger** | Recovery; general aerobic (plus 10 × 100 m strides); medium-long; long; marathon-pace; lactate threshold; VO2max; tune-up races [PF1]. | Endurance → lactate threshold + endurance → race preparation → **3-week taper** → 5-week recovery plan [PF1]. |
| **Hansons** | Easy runs plus three "SOS" (Something Of Substance) workouts a week: speed at 5K–10K pace (replaced by strength at marathon pace − 10 s/mi later on), tempo at goal marathon pace, and a long run capped at about 16 mi. Six days a week [HN1][HN2][HN3]. | Beginner plan is 18 weeks [HN1]. |
| **Daniels** | E/L (easy/long), M (marathon), T (threshold), I (interval) and R (repetition) paces, plus strides [D2]. | Four phases: foundation and injury prevention → early (initial) quality → transition quality → final quality [D4]. |
| **TrainingPeaks** | Defined by each plan's author. | Defined by each plan's author. |

## C. Structured workout format

| App | Step kinds | How a step ends | Target types | Recovery and advancing |
|---|---|---|---|---|
| **Garmin** (Connect / FIT format) | Intensity tags: warm-up, active, interval, recovery, rest, cool-down, other. Repeat blocks are a step that loops back to an earlier step a set number of times [G7]. | Time, distance, calories, HR above/below, power above/below, **open** (lap button) [G7]. | Speed/pace, HR (zone or custom range in bpm or %max), cadence, power, open [G7]. | On the watch, quick intervals are either **Open Repeats** (you press lap) or **Structured Repeats** by distance or time, with an optional open warm-up [G1]. The post-run execution score weights the work steps and ignores the cool-down [G1]. |
| **COROS** | Warm Up, Training, Rest, Cool Down, plus an Interval shortcut. Sets are built by stacking steps and adding repeats [C3]. | Distance, Time, Training Load, Open [C3]. | %Max HR, %HRR, %Threshold HR, HR, %Threshold Pace, Pace, Cadence, Power, Not set [C3]. | Auto Advance, or manual advance with the Back/Lap button [C4]. |
| **Runna** | Warm-up, Set (a repeat block), Rest/Recovery, Cool-down [RN9]. | Mostly distance. Steps advance automatically unless "Intervals/Tempo on Track" or "Open Warm-Up" is switched on. Hill reps always need a manual lap [RN9]. | Pace (e.g. "No faster than 7:15/km"), or RPE if the user switches to it. Hills are effort-based [RN9][RN12]. | Either a slower-paced jog or a walking/standing rest [RN9]. |
| **TrainingPeaks** | Warm up, Active, Recovery, Cool down, 2- and 3-step repeats, ramp up, ramp down [TP1]. | Duration or distance; **"End step on lap button"** [TP1][TP3]. | %FTP, %Max HR, %Threshold HR, %Threshold Pace, RPE 0–10, as a single target or a range, plus cadence [TP1]. | |
| **Polar** | Warm-up, work, cool-down phases [P1]. | Time. | HR zones [P2]. | |
| **Nike Run Club** | 5:00 warm-up, then timed reps. | Time. | Paces relative to races: mile pace, 5K, 10K, "best" pace. Recovery runs are by feel [N2]. | Timed recoveries of 30–60 s; whether to jog or walk is not specified [N2]. |
| **Daniels** | Written shorthand, e.g. "5 × 1 T w/1 min rests" [D5 (2nd)]. | Distance or time. | Paces from the runner's VDOT. | I-pace bouts last 3–5 min. R-pace recovery is 2–3× the rep's duration, or a jog of the same distance [D2]. |

**Example workouts as the apps write them:**
- **Runna:** "1.2km warm-up → Set: 3× (300m @ 6:15/km + 300m recovery @ 7:00/km) → Rest: 90s walking rest → 1km cool-down" [RN9]
- **Nike Run Club:** "5:00 warm-up; 8 × 1:00 at 5K pace, 1:00 recovery" [N3]
- **Hansons:**
  - Speed: "1.5 mi WU; 12 × 400 m @ 5K–10K pace w/ 400 m jog; 1.5 mi CD" [HN1]
  - Strength: "6 × 1 mi @ MP−10 s/mi w/ ¼ mi jog" [HN2]
- **Hal Higdon (Advanced):** "800 m repeats faster than marathon pace, 400 m jog/walk between" [H2]
- **Garmin/TrainingPeaks style** (my own illustration of the FIT model, not copied from an app): Warm Up 15:00, HR Z1–2 → Repeat ×6 [Run 800 m, pace 4:05–4:15/km; Recover 2:00, open target] → Cool Down, ends on lap button.

## D. Run logging data

| Field | Garmin [G1] | COROS [C5] | Strava | Runna | Status |
|---|---|---|---|---|---|
| Distance | Yes | Yes (editable) | Yes | Yes; manual entry takes distance and time [RN11] | Standard |
| Moving vs elapsed time | Timer, Moving, Elapsed and Stopped time fields | Yes, plus an auto-pause option | Shows both. Moving time is the default; Race-tagged runs, segments and best efforts use elapsed time [S3] | PRs use total elapsed time; moving time is not shown separately [RN5] | Standard |
| Pace | Average, lap, and grade-adjusted pace (GAP) | Pace graph | Pace; pace zones are computed on GAP [S9] | Actual vs target pace; Pace Insights | Average pace is standard; GAP is niche |
| Average/max HR, time in zones | HR zone, Time in Zone, Lap HR | Zone distribution | Average and max HR; % time in 5 zones [S5] | Via a connected watch | Standard |
| Laps and splits | Auto Lap (by distance or position) plus the lap key. Per lap: time, distance, pace, HR, cadence, power | Manual laps and auto laps, a 1 km/1 mi view, workout stages, and an "active reps only" filter | Per-km/mi splits plus device laps [S5] | One lap per workout step; treadmill lap paces are editable [RN17] | Standard |
| Elevation gain/loss | Total ascent/descent | Yes | Yes | No | Standard outdoors |
| Cadence | Yes | Yes | If recorded | No | Common |
| Power; stride length, ground contact time, vertical oscillation | Yes | Power on most watches | If recorded | No | Niche |
| Calories | Yes | Yes | Yes | No | Standard |
| Training effect/load | Aerobic and anaerobic Training Effect (0–5) with a label; training load (EPOC-based) | Training Load, Training Focus label, Efficiency score [C6] | Relative Effort, from HR or RPE [S11] | No | Niche, proprietary |
| RPE / feel | No | Training-log notes with perceived exertion | Perceived Exertion 1–10; can replace HR for load features [S6] | Thumbs up/down unlocks AI Workout Insights [RN18]; "effort" on manual cross-training entries [RN21] | Growing |
| Indoor / treadmill | Treadmill and Indoor Track modes; calibrate after at least 2.4 km | Indoor Run | Indoor page with no map; turn GPS off [S10] | Smart treadmill (Bluetooth FTMS) or manual treadmill, where distance = pace target × time [RN17] | Standard |
| Track mode | Track Run: 400 m track, lane number, auto lap 1600 m | Track Run [C4] | No | "Intervals/Tempo on Track" (manual laps) [RN9] | Niche |
| Run-type labels | No | Activity mode | Tags: Race, Long Run, Workout, Commute, Competition, Recovery, With Pet, With Kid, For a Cause [S4] | Linked planned session [RN11] | Strava-style tags are worth copying |

## E. Heart-rate zones

| App | Default max HR | Default model | Default boundaries | Other options |
|---|---|---|---|---|
| **Garmin** | **220 − age**. Auto-detection of max HR and LTHR is on by default [G1]. | 5 zones, %HRmax | Z1 50–60, Z2 60–70, Z3 70–80, Z4 80–90, Z5 90–100% [G1] | BPM, %Max, %HRR (max − resting), %LTHR; separate zones per sport [G1] |
| **Polar** | **220 − age**, shown as the default the first time you set it [P3] | 5 zones, %HRmax. "Default" zones are locked; "Custom"/"Free" zones are editable [P5] | Very light 50–60, Light 60–70, Moderate 70–80, Hard 80–90, Maximum 90–100% [P4] | Display as bpm, %max or %HRR [P5] |
| **COROS** | Formula not stated. COROS's blog calls 207 − 0.7×age more precise than 220 − age [C7]. The Running Fitness Test outputs max HR, LTHR and threshold pace [C6]. | **6 zones, %LTHR**, personalised by COROS's EvoLab analytics [C6] | Z1 <80, Z2 80–90, Z3 90–95, Z4 95–102, Z5 102–106, Z6 >106% of LTHR [C7] | Max-HR zones and HRR zones (enter resting and max HR) [C8][C9]. EvoLab metrics always use the LTHR zones [C7]. |
| **Strava** | **220 − age**; 190 bpm if no age is given; updates on your birthday [S7][S8] | 5 zones: Endurance, Moderate, Tempo, Threshold, Anaerobic [S7] | Strava's help pages don't list them. Runna says its zones are calculated the same way: ≤65, 65–81, 81–89, 89–97, >97% [RN10]. A forum post gives 65–80 / 80–89 for Z2/Z3 [S12 (2nd)]. | Custom zones; subscribers can set run and ride zones separately [S7] |
| **Runna** | **220 − age** [RN10] | 5 zones, %HRmax, editable | Recovery 0–65, Endurance 65.1–81, Tempo 81.1–89, Threshold 89.1–97, Anaerobic 97.1–100% [RN10] | Pace is the primary target; HR is secondary [RN5] |
| **TrainingPeaks** | Entered by the user | Choice of calculators, e.g. Joe Friel (run) on %LTHR [TP4] | Z1 <85, Z2 85–89, Z3 90–94, Z4 95–99, Z5a 100–102, Z5b 103–106, Z5c >106% [TP5] | LTHR test: 30-min solo time trial, average HR of the last 20 min [TP5] |

**How book plans map sessions to HR:**
- **Pfitzinger:** general aerobic 70–81% max HR / 62–75% HRR; marathon pace 79–88 / 73–84; lactate threshold 82–91 / 77–88; VO2max 93–95 / 91–93 [PF1]. The source's long-run figures look transposed, so I left them out.
- **Daniels:** E 65–79% HRmax, M 80–90, T 88–92, I 98–100 [D2].

## Gaps and caveats
- **Garmin Run Coach:** the full setup question list isn't published anywhere I could reach. The long-run-day setting is evidenced only by a forum thread.
- **COROS:** the default boundaries for the Max-HR and HRR zone models appear only in images, so I couldn't read them.
- **Strava:** its zone percentages are taken from Runna's statement, not from Strava's own pages.
- **V.O2:** the app's onboarding questions are behind a Cloudflare check and couldn't be read.
- **Hansons:** I found no official source for the taper length.

## Sources
**Runna (support.runna.com/en/articles/…)**
- RN1 [15443877](https://support.runna.com/en/articles/15443877-how-to-create-a-training-plan-in-runna)
- RN2 [15231838](https://support.runna.com/en/articles/15231838-how-does-runna-build-your-training-plan-around-your-current-fitness)
- RN3 [6206024](https://support.runna.com/en/articles/6206024-adjusting-your-running-schedule)
- RN4 [6205993](https://support.runna.com/en/articles/6205993-adjusting-your-running-ability)
- RN5 [6205998](https://support.runna.com/en/articles/6205998-adjusting-your-estimated-race-time-and-pace-targets)
- RN6 [10393191](https://support.runna.com/en/articles/10393191-how-to-use-training-preferences)
- RN7 [8975787](https://support.runna.com/en/articles/8975787-how-long-should-i-make-my-runna-training-plan)
- RN8 [6576215](https://support.runna.com/en/articles/6576215-top-tips-for-tapering-before-a-race)
- RN9 [15690947](https://support.runna.com/en/articles/15690947-understand-your-runna-workouts)
- RN10 [6359409](https://support.runna.com/en/articles/6359409-understanding-and-training-to-heart-rate)
- RN11 [14666681](https://support.runna.com/en/articles/14666681-how-to-log-link-or-manually-add-an-activity)
- RN12 [6206133](https://support.runna.com/en/articles/6206133-adjusting-your-training-units)
- RN13 [6206287](https://support.runna.com/en/articles/6206287-adjusting-your-elevation-profile)
- RN14 [15624879](https://support.runna.com/en/articles/15624879-adding-strength-training-to-your-runna-plan)
- RN15 [9459885](https://support.runna.com/en/articles/9459885-coaching-terms-every-runner-should-know)
- RN16 [11598487](https://support.runna.com/en/articles/11598487-how-to-choose-your-training-focus)
- RN17 [13616950](https://support.runna.com/en/articles/13616950-how-to-record-a-treadmill-workout)
- RN18 [10494265](https://support.runna.com/en/articles/10494265-what-are-workout-insights)
- RN19 [15013260](https://support.runna.com/en/articles/15013260-what-is-a-build-week-understanding-progressive-overload-in-your-running-plan)
- RN20 [9144831](https://support.runna.com/en/articles/9144831-how-is-my-long-run-distance-calculated-in-my-marathon-plan)
- RN21 [15899152](https://support.runna.com/en/articles/15899152-how-can-i-incorporate-cross-training-in-runna)
- RN22 [8608203](https://support.runna.com/en/articles/8608203-is-my-workout-a-threshold-interval-session-or-tempo-run)

**Garmin**
- G1 [Forerunner 970 Owner's Manual, Sept 2026 (PDF)](https://www8.garmin.com/manuals/webhelp/GUID-025D75CF-3445-49E1-8D81-1AA74AB4E00F/EN-US/Forerunner_970_OM_EN-US.pdf): HR zones pp. 109–110; workouts and suggestions pp. 11–13; Training Effect p. 60; data fields p. 127 onward
- G2 [Which adaptive training plan is right for you?](https://www.garmin.com/en-GB/blog/which-adaptive-training-plan-is-right-for-you/)
- G3 [Garmin training plans for runners](https://www.garmin.com/en-US/blog/fitness/garmin-training-plans-for-runners/)
- G4 [Five ways to use Garmin Coach (Sept 2025)](https://www.garmin.com/en-US/blog/fitness/five-ways-to-use-garmin-coach-on-your-watch/)
- G5 [Types of daily suggested workouts](https://www.garmin.com/en-GB/blog/types-of-daily-suggested-workouts-for-runners/)
- G6 [Race widget phases](https://www.garmin.com/en-US/blog/fitness/running/how-to-train-for-your-next-race-with-the-garmin-race-widget/)
- G7 [FIT workout file](https://developer.garmin.com/fit/articles/file-types/workout.html)
- G8 [Forum: Run Coach days and long run](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/444196/garmin-run-coach---days-available-and-long-run-days-keeps-getting-reset-to-every-day-weekends)

**COROS (support.coros.com/hc/en-us/articles/…)**
- C1 [Personalized Marathon Plans](https://support.coros.com/hc/en-us/articles/20959039543828-Personalized-Marathon-Plans)
- C2 [Creating and Using Training Plans](https://support.coros.com/hc/en-us/articles/360048955151-Creating-and-Using-Training-Plans)
- C3 [Create Custom Workouts](https://support.coros.com/hc/en-us/articles/47285577958932-Create-Custom-Workouts-in-Your-COROS-App)
- C4 [Following Structured Workouts](https://support.coros.com/hc/en-us/articles/360044426251-How-to-Follow-Structured-Workouts-on-COROS-Watches)
- C5 [Activity Summary](https://support.coros.com/hc/en-us/articles/15284799576980-Activities-Page-Activity-Summary)
- C6 [Fitness Metrics Explained](https://support.coros.com/hc/en-us/articles/360061452651-COROS-Fitness-Metrics-Explained)
- C7 [HR Zones guide](https://coros.com/stories/coros-metrics/c/coros-heart-rate-zones-the-ultimate-guide)
- C8 [Training Hub Manual](https://support.coros.com/hc/en-us/articles/4412176269844-COROS-Training-Hub-Manual)
- C9 [Resting/Max HR](https://support.coros.com/hc/en-us/articles/360040258391-Setting-Resting-and-Max-Heart-Rate-Data)

**Polar**
- P1 [Running Program (Vantage V3 manual)](https://support.polar.com/e_manuals/vantage-v3/polar-vantage-v3-user-manual-english/polar-running-program.htm)
- P2 [Running Program blog](https://www.polar.com/blog/polar-running-program/)
- P3 [Physical settings (V3 manual)](https://support.polar.com/e_manuals/vantage-v3/polar-vantage-v3-user-manual-english/physical-settings.htm)
- P4 [HR zones (V800 manual)](https://support.polar.com/e_manuals/V800/Polar_V800_user_manual_English/Content/Heart_Rate_Zones.htm)
- P5 [Sport profiles](https://support.polar.com/ie-en/how-can-i-edit-sport-profiles-in-polar-flow)

**Nike**
- N1 [NRC plans](https://www.nike.com/help/a/nrc-plan)
- N2 [5K plan](https://www.nike.com/running/5k-training-plan)
- N3 [Marathon plan](https://www.nike.com/running/marathon-training-plan)

**TrainingPeaks**
- TP1 [Structured Workout Builder](https://help.trainingpeaks.com/hc/en-us/articles/235164967-Structured-Workout-Builder)
- TP2 [Apply a plan](https://help.trainingpeaks.com/hc/en-us/articles/204071974-How-do-I-apply-unapply-my-TrainingPeaks-Training-Plan)
- TP3 [Open-ended steps](https://help.trainingpeaks.com/hc/en-us/articles/115003385172-Open-ended-steps-for-Structured-Workouts)
- TP4 [Zones calculators](https://help.trainingpeaks.com/hc/en-us/articles/360017420092-Zones-Calculator-Overview)
- TP5 [Joe Friel zones](https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/)

**Strava (support.strava.com/en-us/articles/…)**
- S1 [Plans for runners](https://support.strava.com/en-us/articles/15401942-training-plans-for-runners)
- S2 [Instant Workouts](https://support.strava.com/en-us/articles/15401583-what-are-instant-workouts)
- S3 [Moving time](https://support.strava.com/en-us/articles/15401804-moving-time-speed-and-pace-calculations)
- S4 [Activity tags](https://support.strava.com/en-us/articles/15401889-strava-activity-tags)
- S5 [Run activity pages](https://support.strava.com/en-us/articles/15401883-run-activity-pages)
- S6 [Perceived Exertion](https://support.strava.com/en-us/articles/15401767-perceived-exertion)
- S7 [Training Zones](https://support.strava.com/en-us/articles/15401569-training-zones-on-strava)
- S8 [Custom HR zones](https://support.strava.com/en-us/articles/15401923-how-do-i-customize-my-heart-rate-zones-on-strava)
- S9 [Pace zones](https://support.strava.com/en-us/articles/15402116-how-does-pace-zone-analysis-work-on-strava)
- S10 [Indoor/treadmill](https://support.strava.com/en-us/articles/15401956-indoor-treadmill-and-bike-trainer-activities)
- S11 [Relative Effort](https://support.strava.com/en-us/articles/15401794-relative-effort)
- S12 [Forum post listing Strava zones](https://forums.garmin.com/sports-fitness/sports-fitness/f/forerunner-935/135052/hr-zones-not-right)

**Plans and books**
- H1 [Higdon Novice 1](https://www.halhigdon.com/training-programs/marathon-training/novice-1-marathon/)
- H2 [Higdon Advanced 1](https://www.halhigdon.com/training-programs/marathon-training/advanced-1-marathon/)
- H3 [Run With Hal (App Store)](https://apps.apple.com/us/app/run-with-hal/id1437166081)
- D1 [V.O2 app (App Store)](https://apps.apple.com/app/id977666802)
- D2 [Daniels intensities (Coach Ray)](https://www.coachray.nz/2023/05/03/jack-daniels-running-intensity/)
- D3 [V.O2 Boston plan](https://runsmartproject.com/boston-marathon/) (now redirects to vdoto2.com)
- D4 [Daniels phases](https://www.coacheseducation.com/endur/jack-daniels-dec-00.php)
- D5 [Daniels notation notes (Goodreads)](https://www.goodreads.com/notes/20762026-daniels-running-formula/77147819-adrian-gonzalez?page=3)
- PF1 [Pfitzinger explainer (Running With Rock)](https://runningwithrock.com/pfitz-marathon-training-explained/)
- HN1 [Hansons classic programs](https://lukehumphreyrunning.com/the-classic-hanson-marathon-training-programs/)
- HN2 [Hansons strength workouts](https://lukehumphreyrunning.com/marathon-strength-workouts/)
- HN3 [Hansons method overview (Marathon Handbook)](https://marathonhandbook.com/hansons-marathon-method/)
