---
target: Form v2 canvas after the second notes (review J)
total_score: 28
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 4
target_identity: "file:/home/user/gym-tracker/docs/ui-redesign/revamp/form-v2/canvas"
timestamp: 2026-10-03T08-30-56Z
slug: docs-ui-redesign-revamp-form-v2-canvas
---

# Form v2, round 3: fresh-eyes review (J)

Read: Main, System, Alphabet, Platforms, all 70 phone boards and the five Moment frames. Every
board was also loaded in Chromium (Playwright, fonts as the generator loads them) to measure
target sizes, text contrast, clipping, the log's columns against the entry's, and accessible
names. Scored on its own, then set against G (26/40) only for the status table in section 3.

The owner's and app's decisions are applied as given. Where a string or figure was traced to
`src/` it is not counted as a design defect: "Best set" (`shared-stats.ts`), the warm-up ramp
(37.8), the Finish count of 7 sets with warm-ups (`finish/page.tsx`), "Coach is planning for
{gym}" (`coach-actions.tsx`), the Offline page (`(app)/error.tsx`), Ride's Duration-first order
(`cycling-form.tsx`, by design), and "Strength" / "Lifting".

## 1. Nielsen heuristics: 28/40

| #   | Heuristic                 | Score | Key evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Visibility of status      | 3     | **+** Saving… → Saved → the line lands, with a status message (Moment); rest in the header pill and on the strip (Progress); "Set 3 of 4", "RIR · target 2"; Workout-Coach no longer runs rest before a set. **−** The waiting Save gives sighted users no reason (the RIR or RPE sentence is screen-reader only: Log, Log-Typing, Superset-Log); grey warm-ups mean "to do" on Log-Warm-ups and "done" on Log; Log-Dark draws untouched suggestions as confirmed; at the 3:00 restart the dial keeps its 2:14 wedge and its label (Moment@2150–2800ms).                                                                                                             |
| 2   | Match with the real world | 3     | **+** "@" is RIR everywhere and RPE is written out ("RPE · 1–10", Superset-Log); pounds read as pounds. **−** Prescriptions drop the app's own "RIR" ("3 × 8–12 @ 1–2"; `planned-exercises.tsx` writes "@ 1–2 RIR"), which an RPE user reads as RPE 1–2 (Today, Workout, Programme-Day, Log); "63 × 9 @ 2 × 2" and "72.5 × 6 × 3" (Exercise); "≤ 297 g" (Food); "⇄ 45° leg press" for "instead of" (Workout-Coach); the indoor-bike glyph reads as a Ferris wheel (Log-Ride, Gym).                                                                                                                                                                                   |
| 3   | User control              | 3     | **+** Minimise, back links that name their target, Close on every sheet, every log line editable, Undo on a set saved as a warm-up (System), Skip check-in, Decline / Ask for changes, typed DELETE. **−** Each line of last cycle's History opens that old set for editing from inside a live session (History); at 200% RIR needs a scroll (Log-200).                                                                                                                                                                                                                                                                                                              |
| 4   | Consistency               | 2     | **−** The log's columns match the entry at 375–402 but not at 360 or 320 (Log-Android, Log-Pounds-320). DESIGN says "nothing drawn under" a form and also "a bar under a mark means indoors" (Alphabet, Calendar). Names start at the gutter on session rows but 52 pt in on Dinner, Add-exercise, Fallback, Gym, Privacy. Today-Coach's coach line is not the System's coach-note block. Gym-step draws "Gym" as a machine, Gyms as a pin. Chart scales sit left (Running, Recovery), right (Body) or nowhere (Exercise). Summary's print draws warm-ups, Workout's does not. Portion's print has 10-px corners. At 200% the round steppers become rounded squares. |
| 5   | Error prevention          | 3     | **+** Save waits for RIR; Saving… blocks a second tap; coach changes wait for Approve; Delete needs DELETE. **−** At 200% the reps and RIR buttons sit 89–153 pt below the first screen and the dash is not a control (Log-200). On Android a five-character load overlaps the set number by 5.2 pt (Log-Android with "102.5"). Edit profile's Save stays live while the page says "Saving needs all of them".                                                                                                                                                                                                                                                       |
| 6   | Recognition               | 2     | **+** Calendar legend; the Overview's totals as its key; Welcome's key; a label under every figure. **−** The indoors bar has no key on Overview or Progress-History. The seven cycle squares say nothing on screen (Today). "Tap the dash for the target" and "tap a figure to type" have no visible affordance (Log). The coach glyph after "Lower A" and the "⇄" are unlabelled on screen (Workout-Coach). The sliders glyph means Set options on Log and Filters on Progress.                                                                                                                                                                                    |
| 7   | Flexibility               | 3     | **+** Typed entry with Save above the pad and Previous / Next (Log-Typing); a set as suggested in two taps (the dash, then Save); hold-to-repeat; saved meals and Quick add (Dinner); Select all machines; filters. **−** The History tab holds about two sessions per screen at Figure L, undated, with no top set (History); after each save the entry returns to the suggestion, so a lifter who overrides it re-enters the same numbers every set (the app's prefill rule; see section 6).                                                                                                                                                                       |
| 8   | Minimalism                | 3     | **+** An ink-only interface, one print per screen, no art on Progress, a log that is only figures. **−** 183 pt (Log) to 299 pt (Log-Warm-ups) of empty space between the last set and the entry that is meant to be its next line; Programme-change boxes its rows in outlined cards; Friends opens on four tiles.                                                                                                                                                                                                                                                                                                                                                  |
| 9   | Error recovery            | 3     | **+** "Connection lost. Your entries are still here. Retry saving when connected." with Retry, and "Saved as a warm-up… Undo" (System). **−** A failed save is drawn only on System, never on a Log board; the missing-RIR sentence never appears on screen.                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10  | Help                      | 3     | **+** Why (the reason, its basis, History), Technique, ⓘ on Hold, AI coach and Machines, Welcome's key, Calendar's legend; the rows under every print name its parts and their state (✓, Resume, Skipped). **−** RIR is never explained on screen to a newcomer; the indoors bar is explained only on the Calendar page.                                                                                                                                                                                                                                                                                                                                             |

**What still loses points.** Consistency across widths and lists (4) and codes that need memory
(6) cost the most. The logging screen is the best it has been, but it breaks at its edges: 200%
text, Android widths with three-digit loads, and the warm-up line's two meanings of grey.

## 2. Cognitive load: 2 fails, 3 borderline (moderate)

- **Pass:** single focus (Log's entry, Check-in, Portion); visual hierarchy (32-px log lines
  under a 42-px entry; title → print → rows); one thing at a time ("Set 3 of 4", sheets);
  progressive disclosure (Hold → Why, Set options, "Notes, heart rate, more", "Save or repeat
  this workout").
- **Pass, the calendar's grouping:** a date sits 11.5 pt above its marks and 20 pt below the row
  before; marks within a cell are 5 px apart, cells 16 px apart (Calendar, Progress).
- **Fail, the log's grouping:** the entry, drawn as "the log's next line", sits 183 pt under the
  last set (Log), 126 pt at 375 (Log-Pounds-375), 299 pt under the warm-ups (Log-Warm-ups).
- **Fail, state legibility:** grey means "to do" on Log-Warm-ups and "done, not counted" on Log;
  Log-Dark shows untouched suggestions in confirmed ink.
- **Borderline, minimal choices:** set by the data model (owner decision): Effort 1–5 plus Not
  sure (Log-Run, Log-Ride, Log-Swim), three 1–5 scales (Check-in), nine targets in the Log dock.
- **Borderline, working memory:** "@" now means one thing, but prescriptions omit "RIR", the
  indoors bar and the seven cycle squares carry no key.
- **Borderline, chunking:** Food lists seven meal slots, three of them empty.
- **More than four options:** Effort 1–5 + Not sure (6); Check-in's three 1–5 scales; the Log
  dock (6 stepper buttons, Save, Hold, Set options); Food's 7 meal slots; Machines' 12-tile grid
  (with search and "7 selected"). The six Progress sections now sit in a sheet, which is right.

## 3. The owner's notes

### Round 2 (this version)

| #   | Note                                                                    | Verdict | Evidence                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No boxes or art beside exercise names; sets said once                   | Met     | Today, Workout, Workout-Coach, Programme-Day and Finish rows are the name, a glyph and the prescription; the sets are drawn once, in the print. (Search lists still lead with glyphs: issue 11.)                                                                                                                                                   |
| 2   | Logging rethought from the ground up; keep the rest timer and the entry | Met     | Log, Log-Warm-ups, Log-Typing, Moment: one line per set in the entry's columns (exact at 402: 74.3 / 201 / 327.7 pt in both), warm-ups on one quiet line, a docked entry, the pill kept. Its edges need work: issues 1, 2, 5–9.                                                                                                                    |
| 3   | Training art centred                                                    | Met     | Training: every tile's composition sits within 1 pt of the centre across and down (Upper A 47 / 47 pt either side, Easy Run + Arms 70.5 / 69.5); Today, Workout, Day, Run likewise.                                                                                                                                                                |
| 4   | A better run shape; no line under the art on any page                   | Partly  | The track (stadium, lane cut in, a module longer per 20 min) reads well (Alphabet, Run, Day, Today), and the ground line is gone. But the indoors "platform" is still a black bar under the Treadmill, Indoor bike and Pool forms (Alphabet › Context) and under calendar and History marks (Progress, Calendar, Progress-History, Progress-Dark). |
| 5   | The old calendar back (paper, marks, dots), better                      | Met     | Progress, Calendar: paper, weekday letters, dots, one to four marks per day, every past day a named link, dates in the corners, a legend, months scrolling. Craft: the dot is 1.42:1 and today's ring crosses "29" (issues 12, 13).                                                                                                                |
| 6   | Running's art: a new representation or none                             | Met     | Running, Exercise, Recovery, Body: ink charts, no art; each run says treadmill or outdoors with a glyph.                                                                                                                                                                                                                                           |
| 7   | Food shows calories eaten only                                          | Met     | Food, Food-Over, Food-Dark, Food-320: "1,152.5 kcal" / "2,536 kcal", no left or over figure.                                                                                                                                                                                                                                                       |
| 8   | Raise the score by fixing the reviewers' verdicts                       | Partly  | Both of G's P0s and four of its six P1s are fixed (table below). But the read-me's Critiques still shows "29/40", "Pending", and the round-1 list, including "Add set ends the ledger", which the canvas no longer does (Main).                                                                                                                    |

**G's verdicts now.** Fixed: print geometry (Main hero, Day and Welcome stand on one baseline;
the skipped swim is dashed); pounds read as pounds; the calendar's proximity and its tappable,
named days; "@" for one thing; records in ink; the dumbbell glyph; Progress's clipped tabs;
centred prints; aligned steppers (Log-Run, Log-Typing, Portion); the Recovery chart; Save above
the pad; tab targets clear of the indicator; the superset bracket; Coach access as a key; the
coach glyph in System; Check-in's "Upper A". Partly: Log-200 (controls back, RIR still below
the first screen); links (252 to boards, 393 still "#"); Food-320's "19" (now a 3.3-pt sliver).
Open: "≤ 297 g", "@ 2 × 2", slashed zeros, Dinner's indent, the Food tab icon's size. App or
owner decisions now: offline logging, Check-in's direction, Start while the coach plans, Run vs
Ride order, the Offline title, warm-up and kcal figures, "Best set", set counts with warm-ups.

### Round 1

| #   | Note                                                                        | Verdict | Evidence                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Better art for runs, rides and other sports; fix the alignment              | Met     | Alphabet: one module grid, one baseline, whole modules, centred, real states. Left: the indoors bar (round 2, note 4); "Paddle: one crest" is a smaller form, not a cut.                                                                                                                          |
| 2   | Cycle and rest timer minimal                                                | Met     | Seven squares (Today); one pill (Workout, Log). The dial does not refill at the restart (Moment).                                                                                                                                                                                                 |
| 3   | Minimal text, nothing repeated                                              | Met     | Most remaining repeats are the app's own strings ("Coach is planning for Anytime Fitness" under "Anytime Fitness", Today-Coach; "60 kg × 4" four times, Finish). The design adds one: Privacy's marks beside "Share cycling" and "Share swimming", whose words already name the sport (issue 11). |
| 4   | Logging revamp: not boxy, tabs, full history, warm-ups faded                | Met     | Log, Technique, History, Log-Warm-ups. History is undated (its test data has no dates) and sparse.                                                                                                                                                                                                |
| 5   | RIR as − figure +                                                           | Met     | Log, Moment, System. The dash is not yet a control (issue 9).                                                                                                                                                                                                                                     |
| 6   | Equipment and outdoor or treadmill as icons                                 | Met     | Meta-line glyphs; Outdoor / Treadmill / Indoor / Pool tiles; the Running list. Day and Progress-History still say "Outdoor" and "Treadmill" in words; the indoor-bike glyph needs redrawing.                                                                                                      |
| 7   | Everything at the left edge                                                 | Partly  | Session rows, yes. Dinner indents every food 52 pt behind a star column; Add-exercise, Fallback and Gym put glyphs before names; Privacy's two sport rows; Programme-change's carded rows at 67 pt; AI-coach's card buttons 18 pt in.                                                             |
| 8   | Calendar: one month, several activities a day, tap for a scrolling calendar | Met     | Progress → Calendar (August above September) → Day.                                                                                                                                                                                                                                               |
| 9   | Less padding under the tab bar                                              | Met     | 64 pt; targets 814–858 pt, 3 pt above the indicator at 861 (DESIGN says 4).                                                                                                                                                                                                                       |
| 10  | Over-full bowl, symmetric                                                   | Met     | Food-Over: a 12-pt symmetric heap; Alphabet: at twice the target it closes the circle.                                                                                                                                                                                                            |
| 11  | Many more pages, a coach page                                               | Met     | AI-coach, Programme-change, Today-Coach, Workout-Coach, Friends, Gyms, the first run.                                                                                                                                                                                                             |
| 12  | Plan for native iOS and Android                                             | Met     | Platforms (shells, safe areas, text styles, haptics), Today-Android, Log-Android.                                                                                                                                                                                                                 |
| 13  | Text never runs off                                                         | Met     | A DOM scan of all 74 boards finds no clipped or ellipsised text except Food-320's scrolled strip. At risk: a five-character load against the set number (issue 2), and wraps that split a figure from its unit (issue 17).                                                                        |

## 4. Priority issues

No P0: nothing blocks the core task on the boards as drawn.

### P1

1. **The 200% entry is not docked** (Log-200).
   - Wrong: the first screen ends at 751 pt (the dashed ticks above the pinned Save), but the
     reps and RIR buttons sit at 840–904 pt. The RIR dash is an `<output>`, so it cannot take
     the target, and "RIR ·" wraps away from "target 2". This breaks the Docked Entry Rule.
   - Fix: dock the whole entry at 200% as at 100%. That is the set row 56, load 128, reps and
     RIR 238 and Save 84: 506 pt above the home indicator. The back row, title, meta, tabs and
     log scroll in the 272 pt left. Make the dash a button, and break its label as "RIR" over
     "target 2".
2. **The set number collides with five-character loads** (Log, Log-Android, Log-Pounds-375,
   Log-Pounds-320).
   - Wrong: the number sits in a 0-wide grid column over the load. With "102.5" the gap is
     0.5 pt at 402, 2.9 at 375 and −5.2 at 360 (they overlap). A two-digit set number overlaps
     by 9 pt at 402.
   - Fix: give the number its own 20-pt column in both grids, the entry's left empty, so the
     columns still align (102 pt each at 402, 88 at 360, 77 at 320). Step log figures down
     (32 → 30 → 28 → 24 px) until the widest fits its column: "102.5" is 88.8 px at 32.
3. **The indoors bar is a line under the art** (Alphabet, Calendar, Progress, Progress-History,
   Progress-Dark).
   - Wrong: the owner asked for no line under the art on any page. DESIGN and the Alphabet
     also contradict themselves: "nothing drawn under it", yet "a bar under a mark means
     indoors".
   - Fix: drop the platform from forms and marks. Keep indoors in words and glyphs on the rows,
     which Running and Progress-History already have ("Treadmill · 4 km"). Remove "Indoors"
     from the Calendar legend, and amend DESIGN (Layout › The month, Shapes, Alphabet ›
     Context).
4. **The read-me misreports the critiques** (Main).
   - Wrong: it shows "Last canvas · heuristics 29/40", "Pending", and the round-1 findings,
     including "Add set ends the ledger" (Add set is in Set options on every Log board). Yet
     the notes table promises "why the score was 26".
   - Fix: G's 26/40 with each of G's items marked Fixed, Open or App decision (section 3), and
     this review's score and list.

### P2

5. **An empty gap between the log and the entry** (Log, Log-Warm-ups, Log-Pounds-375,
   Moment): 183, 299 and 126 pt.
   - Fix: bottom-anchor the log (`ol { flex: 0 0 auto; margin-top: auto }` in the
     column-reverse panel), so the newest line sits 8 pt above the entry's hairline and the
     space opens under the tabs. Log-Typing shows how much better adjacency reads.
6. **The warm-up line's grey means two things** (Log-Warm-ups, Log).
   - Wrong: to-do warm-ups ("35 × 5 · 45 × 3") are ink-2 like the done ones on Log. This
     contradicts "nothing is drawn for a set not yet done" (System).
   - Fix: show only done warm-ups, since the entry already says "Warm-up 2 of 3". Or draw to-do
     ones in control (#85878e) with the dotted suggested underline.
7. **Suggestions look confirmed** (Log-Dark).
   - Wrong: with RIR chosen, the untouched 62.5 × 3 is in ink with no dotted underline, named
     "62.5 kg". PRODUCT says a suggested value looks unconfirmed until saved.
   - Fix: keep it ink-2 and dotted until touched or saved, as on Log and Moment@2800ms.
8. **The log's columns break when the entry restacks** (Log-Android, Log-Pounds-320).
   - Wrong: at 320 the log's columns are 59 / 160 / 261 pt but the entry's are 160 / 84 / 237.
     At 360 they are 69 / 180 / 291 against 180 / 96 / 265. Log lines at 320 are 40 pt tall,
     the only targets under 44 in the canvas.
   - Fix: below 375, keep the figures in one row of three columns and make each stepper
     vertical: + above, − below, 44 pt (48 dp), 6 apart. That is about 300 dp for the entry at
     360 against 400 now, and the columns survive. Keep log lines at 44 pt or more.
9. **The entry's actions are invisible and inoperable** (Log, Log-Warm-ups, Superset-Log,
   Log-200).
   - Wrong: the figures and the dash are `<output>`s, so "tap to type" and "tap the dash for
     the target" are neither shown nor exposed. An empty RIR is named "not set RIR" on Log but
     "RIR not set, target 2" on Log-200.
   - Fix: buttons named "62.5 kg, suggested. Type a load" and "RIR not set, target 2. Use the
     target". After a tap on the waiting Save, show the app's sentence ("Enter RIR: estimate
     how many more good reps you could do.") under it.
10. **Notation lifters misread** (Today, Workout, Programme-Day, Log, Exercise, Food).
    - Wrong: prescriptions drop the app's own "RIR"; Exercise compresses sessions into
      "63 × 9 @ 2 × 2" and "72.5 × 6 × 3".
    - Fix: "3 × 8–12 @ 1–2 RIR" (PRODUCT; `planned-exercises.tsx`). On Exercise, "63 kg × 9,
      63 kg × 9" (the app's `formatSets`). On Food, "86 of 297 g" (the label already says "of").
11. **Names off the left edge** (Dinner, Add-exercise, Fallback, Gym, Privacy,
    Programme-change, AI-coach).
    - Fix: foods at the 20-pt gutter, with the star trailing. Search and machine rows put the
      name first and the glyph in the second line ("[machine] Weight stack"), as on Workout
      rows. Privacy drops the two sport marks, since the words name the sport.
      Programme-change uses hairline rows, not outlined cards with content at 67 pt. AI-coach's
      card buttons align their text to the card's 34-pt edge.
12. **Non-text contrast** (Calendar, Progress, Progress-Dark, Summary, Past-Workout, Day, Food).
    - Wrong: the empty-day dot is 1.42:1 (1.71:1 dark); warm-up blocks are #d8d2c4 on paper at
      1.30:1; the straw and cadmium meal marks are 1.43 and 1.89:1 on white.
    - Fix: dot #8d8980 (3.0:1), dark #716b5f (3.0:1). Give warm-up blocks a 1.5-px #8d8980
      edge, as to-do blocks carry an edge. Outline meal marks in 1-px ink.

### P3

13. **Today's ring crosses "29"** (Calendar). The ring is inset 3 with a 1.5 border; the date
    sits at 4 / 6 px. Fix: put the date at 8 / 7, or inset the ring 1.
14. **The signature moment slips** (Moment).
    - At the restart the pill reads 3:00 but keeps the 2:14 wedge and the label "2 minutes 14
      seconds".
    - Word swaps are hard cuts, not the specified 80 ms out, 120 ms in.
    - Fix: redraw the dial full, update the label, and add the swap timing.
15. **Pattern drift** (Today-Coach, Gym-step, Running / Body / Exercise, Workout vs Summary,
    Today vs Workout-Superset, Portion, Log-200).
    - The coach line is not the coach-note block.
    - "Gym" is a machine glyph.
    - Scale labels sit on three different sides.
    - Warm-up blocks appear in one print and not the other.
    - The day's print lacks the warm-up fan the session's has.
    - Portion's print is rounded (Square Print Rule).
    - The 200% steppers are rounded squares.
16. **Glyphs** (Log-Ride, Gym, Workout-Coach, Exercise, Log, Progress).
    - The indoor bike reads as a Ferris wheel.
    - "⇄" needs "instead of".
    - The coach glyph after a title needs a word.
    - One sliders glyph means two things.
    - "Barbell" sits beside the dumbbell glyph.
17. **Wraps that split figures** (Log-Ride, Food-320, Log-200, Log-Typing).
    - Split from their unit: "21.4 / km/h", "10 foods · 2 / meals", "RIR · / target 2".
    - Log-Typing drops "· target 2".
    - Fix: no-break between a figure and its unit.
18. **Alignment** (Gym, Alphabet, Welcome).
    - "Add machine" ends 4 pt past the gutter.
    - The "30 minutes" label touches a block.
    - Welcome's key sits 11 pt above the title but 17 pt below its print.
19. **Slashed beside plain zeros** (Today "25–30" vs "70–100 min"; the calendar's 10, 20, 30).
20. **Programme-change semantics** (Programme-change). "becomes" is an `aria-label` on a plain
    `<span>`, and the struck values are not announced as old. Fix: visually hidden "was" and
    "becomes".
21. **Docs drift** (Alphabet, DESIGN, Platforms).
    - "A warm-up: done, but not counted" vs the app's 7 / 9 sets: say "not in the volume".
    - "Paddle: one crest" is not a cut.
    - Platforms' SE caption says "6 under the tab bar", the rule says 11, and Today-375
      measures 10.
22. **Continuity** (Profile vs every session board, Superset-Log, Progress).
    - Profile's Rest timer is off while sessions run one.
    - Superset-Log loses the pill.
    - Progress's strip has Upper A under way while 29 Sept reads "nothing logged".
23. **Canvas** (all).
    - 393 of 645 links are "#".
    - Today → Check-in → Workout → Log and Finish session → Summary are not linked.
    - Calendar's "Tue 25 Aug" opens the Fri 25 Sept Day.
    - The Food tab icon is about 64% of Progress's height.

## 5. Accessibility and craft, measured

| Check                            | Result                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text contrast, all phone boards  | No failures. Lowest small text 5.75:1 (calendar dates and weekday letters, #615c50 on #f2eee5); ink 2 6.57:1 on white, 5.98:1 on surface; the empty RIR dash 3.59:1 at 42 px (large); dark ink 2 7.70:1, dark paper labels 7.21:1.                                                                              |
| Non-text contrast                | Pigment marks on paper 3.51 (run) to 6.79:1 (lift), on white 4.06 to 7.86:1; chart bars 3.59:1 (dark 4.12:1); to-do fills 1.76–1.93:1 but edged in full pigment. **Fails:** empty-day dot 1.42:1 (dark 1.71:1); warm-up blocks 1.30:1; straw and cadmium meal marks 1.43 and 1.89:1.                            |
| Targets ≥ 44 pt                  | 1,061 interactive elements on 70 phone boards; 2 under 44, both Log-Pounds-320 log lines (288 × 40). Tab targets 814–858 pt, 3 pt above the indicator. Calendar days 50 × 56 (Calendar), 58 tall (Progress). Steppers 44 (iOS), 48 (Android), 64 at 200%.                                                       |
| Names of log lines               | "Set 1: 60 kilograms, 4 reps, 2 reps in reserve. Edit"; pounds as "135 pounds"; warm-ups "Warm-up: 25 kilograms, 8 reps, being entered below" / "…, to do"; Save `aria-disabled` with the RIR sentence as its description; on save, `role=status` "Set 3 saved: 60 kilograms, 4 reps, 2 in reserve. Rest 3:00." |
| Names of calendar days           | Every past day a link ("Fri 25 Sept: run 5 km, swim 1,500 m, lifting 60 min"; "Tue 29 Sept, today: nothing logged"); days to come are not links; the month is a named group.                                                                                                                                    |
| Charts                           | `role=img` with the data in the name ("Weekly distance, 13 weeks from 6 July: 9, 0, 4, … km, this week so far").                                                                                                                                                                                                |
| Clipping, 320 pt and 200%        | No clipped or ellipsised text on any board; Food-320's scrolled strip leaves 3.3 pt of "19" at the edge. Log-200: the reps and RIR buttons fall below the first screen (issue 1); "RIR ·" wraps.                                                                                                                |
| Log lines vs the entry's columns | Exact at 402 (74.3 / 201 / 327.7 pt) and 375 (71.2 / 187.5 / 303.8); History keeps the same × and @ columns. Broken at 360 (69 / 180 / 291 vs 180 / 96 / 265) and 320 (59 / 160 / 261 vs 160 / 84 / 237). Set number vs "102.5": +0.5 pt at 402, +2.9 at 375, −5.2 at 360, +6.1 at 320.                         |
| Floors                           | No text under 12 px on a phone board.                                                                                                                                                                                                                                                                           |
| Weak names                       | "not set RIR"; the entry's figures are outputs; "Less" and "More" on Portion; "One less" and "One more" for RPE (Superset-Log); Moment's pill label stays "2 minutes 14 seconds" at 3:00.                                                                                                                       |

## 6. Persona red flags

- **Lifter between sets**
  - The entry sits 183 pt below the last set, so the glance splits.
  - Done and to-do warm-ups are the same grey.
  - Save greys out without saying why.
  - On Android, "102.5" runs into the set number.
  - After each save the entry returns to the suggestion. This is the app's prefill rule: the
    target for the set index.
    - A lifter repeating 60 × 4 against a 62.5 × 3 suggestion re-enters it every set.
    - Or, untouched, saves 62.5 × 3, which Log-Dark even draws as confirmed.
  - **Good:** a set as suggested takes two taps (the dash, then Save), and Saving… → Saved
    lands where the eye is.
- **Screen reader and 200% text**
  - Log-200 puts the reps and RIR buttons 89–153 pt below the first screen, and the dash
    cannot take the target.
  - Figures cannot be typed by name.
  - Programme-change's diff reads as two numbers in a row.
  - Moment's label lags the pill.
  - **Good:** log lines, warm-ups, calendar days and charts are fully named; units are right;
    a save is announced.
- **Power user**
  - There is no "same as last set" for an override.
  - The History tab is two undated sessions per screen.
  - Exercise's "63 × 9 @ 2 × 2" is hard to scan over 454 sessions.
  - **Good:** typed entry with Previous / Next and Save above the pad, hold-to-repeat,
    filters, saved meals and Quick add, Select all machines.

## 7. Keep

1. **The log and the moment a set is written** (Log, Moment, Log-Typing): figures in the
   entry's own columns; warm-ups on one quiet line; "Set 3 of 4" with its Hold tag; RIR as a
   stepper with its target; Saving… → Saved → the line lands, announced.
2. **The calendar back on paper** (Progress, Calendar, Day, Run): every past day a named link,
   dates in corners, a legend, months that scroll, records under centred prints.
3. **Progress in ink** (Running, Recovery, Body, Exercise, Past-Workout): bars and lines that
   pass contrast, their data in their names, records as a plain list.
4. **The alphabet's discipline** (Alphabet, Today, Training, Food-Over): one baseline, whole
   modules, centred compositions, a visible dashed state, the run as a track, the bowl's heap.
5. **Planning and labelling** (Platforms, every board): 1,061 targets with 2 under 44, no
   failing text contrast, no clipped text.
