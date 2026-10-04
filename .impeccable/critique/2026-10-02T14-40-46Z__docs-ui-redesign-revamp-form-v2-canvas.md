---
target: docs/ui-redesign/revamp/form-v2/canvas
total_score: 26
max_score: 40
na_heuristics:
p0_count: 2
p1_count: 6
target_identity: "file:/home/user/gym-tracker/docs/ui-redesign/revamp/form-v2/canvas"
timestamp: 2026-10-02T14-40-46Z
slug: docs-ui-redesign-revamp-form-v2-canvas
---

# Form v2, refined: fresh-eyes review (G)

Read: Main, System, Alphabet, Platforms and all 70 phone boards; geometry checked against the source. Not like-for-like with the earlier 29/40, which covered 24 boards; this canvas has 74, and most points are lost on cross-board consistency.

## 1. Nielsen heuristics: 26/40

| #   | Heuristic            | Score | Key issue                                                                                                                                                                          |
| --- | -------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Visibility of status | 3     | Saving… → Saved (Moment) and the rest pill are exemplary. But Workout-Coach runs rest 2:14 before any set, and offline nothing can be logged.                                      |
| 2   | Match real world     | 2     | "@" is RIR, but RPE on Superset-Log (and lifters read "@" as RPE). W 37.8 kg (Finish), "1,147.5 kcal" (Food), "Best set 630 kg" (Summary), "63 × 9 @ 2 × 2" (Exercise), "≤ 297 g". |
| 3   | User control         | 3     | Undo, minimise, Skip, Decline / Ask for changes. Delete account: "Nothing is exported first".                                                                                      |
| 4   | Consistency          | 2     | RIR, RPE 1–10 and Effort 1–5. Run asks Distance then Time, Ride the reverse. The gym is a pin on Today, a machine on Gyms. Prints align three ways.                                |
| 5   | Error prevention     | 3     | Save waits for RIR; Saving… blocks a second tap. But Check-in flips polarity between scales, and Start stays live while the coach re-plans (Today-Coach).                          |
| 6   | Recognition          | 2     | Marks, the platform underline and the 7 cycle squares need memory. The Overview calendar has no legend; Calendar has one.                                                          |
| 7   | Flexibility          | 3     | Typed entry, hold-to-repeat, Select all, saved meals, remembered fallbacks. No "log as suggested".                                                                                 |
| 8   | Minimalism           | 3     | Restrained. But the suggestion appears three times (dock tag, Why, History), and "Latest 7 h" sits under the 7 h tile (Recovery).                                                  |
| 9   | Error recovery       | 3     | "Your entries are still here" is right; Offline heads a specific cause with "Something went wrong".                                                                                |
| 10  | Help                 | 2     | Nothing teaches the print alphabet; Welcome shows a print with no key.                                                                                                             |

## 2. Cognitive load: 3 fails, 1 borderline (moderate)

- **Pass:** single focus, visual hierarchy, one thing at a time (Check-in, entry dock), progressive disclosure ("Notes, heart rate, more"; Why).
- **Fail:** grouping (calendar marks sit nearer the next week's dates); minimal choices; working memory ("@" changes meaning, three effort scales, no legend on Overview).
- **Borderline:** chunking (Food lists 7 meal slots).
- **More than four options:** Check-in's three 1–5 scales; Effort 1–5 plus "Not sure" = 6 (Log-Run, Log-Ride, Log-Swim); 6 Progress tabs; 12+ Machines tiles; 9 targets in the Log dock.

## 3. The owner's notes

| #   | Note                        | Verdict             | Evidence                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Art, one ground             | Partly              | Distinct families, one cut per sport (Alphabet). But the lower wave crosses the ground (Main hero, Alphabet, Day, Welcome); the Food·bowl tile's ground is 8 units lower; the wheel's top is off-grid (Welcome); gaps of 5–9 empty modules (Workout, Workout-440); lifting is always drawn first, though Today says "Run first". |
| 2   | Cycle and rest minimal      | Met                 | Seven squares (Today); one dial pill (Workout, Log).                                                                                                                                                                                                                                                                             |
| 3   | No repeats                  | Partly              | "In progress / To do / Done" (Workout boards); "Run first, arms after" (Today); the coach card repeats the gym (Today-Coach); "machine" ×3 (Add-exercise).                                                                                                                                                                       |
| 4   | Logging revamp              | Met                 | Ledger and tabs (Log); grey warm-ups (Log-Warm-ups); "previous" moved into Why. The History tab shows 2 undated cycles; the full history is on Exercise.                                                                                                                                                                         |
| 5   | RIR stepper                 | Met                 | Log, Moment.                                                                                                                                                                                                                                                                                                                     |
| 6   | Equipment icons             | Partly              | Meta-line glyphs; Outdoor / Treadmill / Pool cards. But the kettlebell reads as a padlock, Today and Programme-Day rows have none, and Day and History use words.                                                                                                                                                                |
| 7   | Left edge                   | Partly (mostly met) | Superset-Log's bracket is 8 pt from the edge; Log-Typing's field sits at 18 pt; stars indent the names on Dinner.                                                                                                                                                                                                                |
| 8   | Calendar                    | Partly              | One month, several marks a day, a scrolling Calendar. But marks group with the wrong date, and Calendar days cannot be tapped (each month is one aria-hidden SVG).                                                                                                                                                               |
| 9   | Tab bar padding             | Met                 | 64 pt. Targets now end at 862 pt, on the home indicator (861–866).                                                                                                                                                                                                                                                               |
| 10  | Food over, symmetric        | Met                 | Food-Over's heap, though only about 5 pt tall; "met" and "over" look alike in the week strip.                                                                                                                                                                                                                                    |
| 11  | More pages, coach           | Met                 | AI-coach, Programme-change, Friends, Gyms, first run. The coach page sits only under Profile.                                                                                                                                                                                                                                    |
| 12  | Native; text never runs off | Partly              | Platforms is thorough. But "Recove" and "story" are clipped (Progress tabs), "1,147.5" hits the rim and "19" is cut (Food-320), and Log-200 drops controls.                                                                                                                                                                      |
| 13  | Black-and-white chart       | Met                 | Body, System. New break: ultramarine record tiles with white text (Summary, Past-Workout).                                                                                                                                                                                                                                       |

## 4. Priority issues

### P0

1. **Print geometry and state** (Main hero, Alphabet, Day, Welcome).
   - The wave's baseline, `lo = base − 0.6·stw` (art.mjs), ignores the trough (amp/2) and half the stroke, so the wave sinks through the ground.
   - "A swim skipped" renders as done: round caps on a 9-unit stroke close every gap of its 6.4/5.1 dash.
   - Fix: `lo = base − amp/2 − stw/2 − 3`; butt caps on dashed waves; one ground y across the Alphabet row; wheel diameter in whole modules.
2. **Wrong unit read aloud** (Log-Pounds-375, Log-Pounds-320). Saved sets read "Set 1: 135 kilograms…" because `session.mjs:132` hard-codes "kilograms".

### P1

3. **Log-200.** RIR sits below the fold while the pinned button says "Choose RIR to save", and the overflow menu, Set options and row editing are gone despite "Nothing is dropped". Fix: reps and RIR on one row; the button scrolls to RIR and focuses it.
4. **Calendar proximity** (Progress, Calendar, Alphabet). Marks sit about 30 pt below their own date and 12 pt above the next row's. Fix: start the marks 4 pt under their date, add cell hairlines, and make each day a button with a name ("Fri 25: run, swim, lift").
5. **"@" means two things.** It is RIR on most boards and RPE on Superset-Log, although the read-me says "RIR only". Fix: write "60 × 5 · RIR 2" and "RPE 8".
6. **Record tiles break the colour rule** (Summary, Past-Workout). Fix: ink on white with a leading mark, and "63 kg × 10", not "630 kg".
7. **Kettlebell looks like the padlock.** Its handle is the Privacy padlock's shackle (icons.mjs). Fix: draw a dumbbell and test it at 16 pt beside the padlock.
8. **No logging offline** (Offline; System, "A set not saved"). Nothing inks until the server answers, so a gym with no signal stops a session. Fix: save on the phone with a "pending" mark (outline plus dot) and sync later.

### P2

9. **Clipped text.** The Progress tab scroller clips "Recove" and "story"; the Food-320 week strip cuts "19". Fix: snap scrollers to whole items; below 360 pt put "1,147.5" above the bowl.
10. **Print alignment.** Start, ends and centre (Workout vs Summary, Run). Fix: always start, 1 module between parts, in row order.
11. **Steppers misalign.** Log-Run's "−" buttons are offset 8 pt; on Log-Typing "kg" sits 12 pt below "reps" and the "×" is 2 pt from the field; Portion uses 52 pt buttons, 44 pt elsewhere. Fix: a fixed 120 pt value column.
12. **Check-in polarity.** Sleep quality 5 means great; Fatigue and Soreness 5 mean bad. Fix: make 5 mean the same in all three.
13. **Figures.** Round warm-ups to plate steps (37.5), kcal to whole numbers, body weight to 0.1 (76.83). On Body, "since 08/07" sits next to an axis labelled "8 Jul".
14. **Recovery chart.** Bars are #E9E9EC on white (1.21:1), and x labels repeat (15, 15, 21, 21). Fix: Ink 2 bars, one per day.
15. **Typing hides Save** (Log-Typing), against Platforms' "Save above the pad". Fix: put Save in the keypad toolbar.
16. **Tab targets** run onto the home indicator. Fix: keep 4 pt clear above it.

### P3

- **Superset bracket:** 8 pt from the edge around one exercise (Superset-Log) vs 20 pt around both (Today).
- **Icons:** the link glyph means Superset and Coach access; Indoor bike looks like the pin; the coach bubble is missing from System; the Training and Food tab icons are half Progress's height.
- **Zeros:** slashed beside plain ("25–30" / "70–100 min", Today).
- **Continuity:** "Easy Run + Arms" leads to Check-in "Upper A"; "Cycle 1 of 8" (Training) vs "cycle 2" (Why); "9 sets" counts warm-ups the Alphabet calls uncounted; "Ride · 0 km" and sleep 7 h vs 7.5 h on one day (Progress-History).
- **Canvas:** Food-320's unlabelled fold line strikes through "Morning snack"; links are `href="#"`, so flows cannot be walked.

## 5. Persona red flags

- **Lifter between sets:** an RIR tap every set, and the first "−" jumps to the target (2), not 1; six 44 pt buttons only 6 pt apart within each pair (Log-Android); suggested vs confirmed is just grey plus a dotted underline; 7 pt row marks; no signal, no ink. Fix within the owner's rule: −/+ step from the target (1 or 3), and tapping "—" accepts it.
- **Screen reader / 200% text:** pounds read as kilograms; the Calendar is one hidden image; on Log-200 the RIR control is off-screen and controls are missing; 12 px calendar SVG text ignores text size.
- **Power user:** no "log as suggested" or repeat-set; typing a load hides Save (Log-Typing); effort switches between RIR, RPE and 1–5.

## 6. Keep

1. **The ledger and the ink moment** (Log, Moment): one row per set, grey warm-ups, a docked entry, and Saved only on the server's answer.
2. **A data-driven alphabet with real states** (Alphabet, the System's pigments, the Food-Over heap, dark paper).
3. **Native and accessibility planning** (Platforms; labels such as "One rep more in reserve"; Log-Pounds-320 restacking its steppers).

## 7. Audit of accessibility, craft and data (H, summary)

Every string grepped against `src/`, every figure recomputed from the seeds and tests,
`exercise-search.ts` re-run over the 276 seeded exercises, every board rendered and measured.

- **High (5):** Fallback search results were hand-picked, not the app's; the session pages followed three different sessions; the bench sets were misattributed (the test's cycle 3 is 60 × 4 @ 2); pounds were announced as kilograms; the Calendar was an aria-hidden picture with no day links.
- **Medium (7):** one account in two states (fixture gyms beside the audit database); profile boards did not match the seeded profile; copy shown as the app's that is not in `src/`; impossible states (Send answer enabled on an empty field, Try again enabled offline, a pre-filled body weight); Friends feed order; four Progress ranges, none shown; the programme mixed sources.
- **Accessibility (5):** targets under 44 pt; contrast of future days, Recovery bars and step dots; `role="tab"` on navigating links; Log-200 dropped controls; hidden headings read board captions.
- **Craft (6):** exercise rows drawn three ways; edges and headers varied; the README's own rules broken (dashed 6 h line, "@" before RPE, words on prints, a bracket over one exercise); facts repeated; labels clipped; destructive actions undifferentiated.

## 8. Status after this round

All P0 and P1 issues above, and every high, medium, accessibility and craft finding of the audit, were fixed in the same round and re-rendered:

- Prints: the wave stands on the ground; a skipped crest is dashed with butt caps; wheel and fan are whole modules; every print starts at the left with its parts in row order (Today, Workout, Day, the Alphabet).
- Pounds are announced in pounds; RPE is written "RPE 8" and "@" is RIR only; records are an ink list; free weights are a dumbbell.
- The calendar is an HTML grid of day links named with what they hold, marks under their own date.
- Log-200 keeps More, Set options, Hold, every set (the one being entered included) and Add set, with reps and RIR on the first screen; on short screens the ledger keeps its end in view instead of cutting between two sets.
- Data: the session pages follow Upper A, cycle 3; gyms, machines, search and profile come from the audit account; strings are the app's own; Progress shows its range.
- Targets reach 44 pt (48 dp on Android); future days, bars and step dots meet 3:1; only real tabs are tabs.
- Kept on purpose (owner's notes): the RIR stepper and the 64-pt tab bar. Kept because the app does it: sets save only on the server's answer; the check-in scales keep the app's direction, with end words shown.

Detector on the final canvas: 108 findings, 17 warnings (14 tab bars on their hairline and 2 ink fills, by design; 1 spacing) and 91 advisories (fitted figure sizes, print drawings).

Questions skipped: the owner asked for no further questions in this round; the review listed 8 priority issues, all fixed here.
