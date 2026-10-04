---
target: Form v2 canvas after the second review's fixes (review K)
total_score: 32
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/gym-tracker/docs/ui-redesign/revamp/form-v2/canvas"
timestamp: 2026-10-03T08-30-57Z
slug: docs-ui-redesign-revamp-form-v2-canvas
---

# Form v2, round 4: fresh-eyes review (K)

I read Main, System, Alphabet, Platforms, all 70 phone boards and the five Moment frames. I also
loaded every board in Chromium (Playwright, with fonts fetched as the generator loads them) and
measured target sizes and overlaps, text and non-text contrast, clipping, the log's columns
against the entry's at 402, 375, 360 and 320, accessible names (Chrome's tree and axe-core), and
text at 200% simulated on 11 boards. I scored the canvas on its own evidence before reading J's
review. J's review was used only for section 4.

Owner decisions are taken as given: the wordless cycle squares, the RIR stepper, the 64-pt tab bar,
and sets that save only on the server's answer. Strings and figures I traced to `src/` are not
counted as design defects. These are:

- "Best set" (`domain/shared-stats.ts`)
- the 7-set count with warm-ups beside the four sets listed (`finish/page.tsx` and `formatSets`)
- the Offline page (`(app)/error.tsx`)
- the check-in anchors (`check-in-form.tsx`)
- "Selected:" on Fallback (`exercise-picker.tsx`)
- "Hold" and the Why sentence (`labels.ts`, `progression.ts`)
- "Outdoor · 5 km" and "Treadmill · 4 km" titles (`progress/history/page.tsx`)
- "Ride · 0 km", an explicit zero in `seed-audit-boundaries.ts`
- "Strength" beside "Lifting" (both are in the app)
- Ride's duration-first order (`cycling-form.tsx`)
- the entry going back to the suggestion after a save

## 1. Nielsen heuristics: 32/40

| #   | Heuristic                 | Score | Key evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Visibility of status      | 3     | **+** Saving… → Saved → the line lands → the pill refills to 3:00 (Moment@1600, 2150, 2400 and 2800 ms), announced as "Set 3 saved: 60 kilograms, 4 reps, 2 in reserve. Rest 3:00." "Set 3 of 4" and "Warm-up 2 of 3" say what comes next. Prints ink as sets are done (Workout, Workout-Superset), Training's days show done and to-do, and the coach-planning note on Today-Coach says "This screen updates itself". Offline and Slow states appear on System. **−** The failed save is never drawn on a logging board, though every set waits on the server (issue 2). At 200% the screen no longer shows which exercise is being logged (Log-200, issue 5). Moment starts from a log that Log never shows (issue 7). |
| 2   | Match with the real world | 4     | **+** The app's notation is used throughout ("4 × 3–5 @ 2 RIR"; "RPE" spelled out on Superset-Log). Pounds read as pounds. "instead of 45° leg press" and "Planned by the coach" are in words (Workout-Coach). The track, wheel, waves and bowl are real-world forms. Effort reads "1 very easy to 5 maximal". Each body-weight and sleep figure carries its unit. **−** These are P3 only. Calendar day names say "run 3 km indoors" where the screens say Treadmill. A few chart and stat labels are the design's own words and do not appear in the app ("Heaviest set each month", "Best est. 1RM").                                                                                                                 |
| 3   | User control              | 4     | **+** Every log line opens its set, and History is read-only. Undo appears on a set saved as a warm-up (System); Retry on a failed save. Close is on every sheet. You can minimise the session, Skip check-in, Skip for now, Decline, Ask for changes, "I no longer want this", and Delete needs a typed DELETE. **−** Summary offers both Close and Done (P3).                                                                                                                                                                                                                                                                                                                                                          |
| 4   | Consistency               | 3     | **+** One exercise row everywhere. One grid for the log and the entry, whose centres match within 0.1 pt at all four widths. One type ramp, one glyph set and one sheet pattern. Scales sit left on every chart. **−** Platforms describes a 200% layout and figure sizes that the boards do not use (issue 8). Three logging boards drop the suggestion tag that the other seven carry (issue 3). Training draws each day on its own module (issue 9). Moment and Log disagree about the log at rest (issue 7). Add-exercise and Fallback draw the same picker's choice two ways. AI-coach's live and waiting buttons look alike. Past-Workout uses its own set notation.                                               |
| 5   | Error prevention          | 3     | **+** Save waits (`aria-disabled`, described by the app's RIR sentence). Saving… stops a second tap. Nothing is written early. Suggested figures stay ink 2 and dotted until touched (Log-Dark). Delete waits for DELETE. Skip this session sits apart under a rule. Coach changes wait for Approve. **−** The ⓘ beside RIR shares 30 × 7 pt of hit area with the RIR figure on 7 boards, and 30–32 × 9 pt with RIR's − at 360 and 320 (issue 4). In typing, the reps and RIR targets shrink to 25.8 and 32.3 pt wide (Log-Typing, issue 6).                                                                                                                                                                             |
| 6   | Recognition               | 3     | **+** The suggestion is a tag beside the set, with its reason one tap away. The target sits under RIR. Welcome's key teaches the alphabet. Calendar has a legend, and the Overview's totals act as its key. The figures carry dotted "tap to type" underlines. **−** Log-200 hides the exercise name and its rep range (issue 5). Food's week-strip bowls have no key on Food (P3). Recovery's "Sleep 7 h" is the latest reading but sits beside "Range average 6.98 h" without saying so. The cable and bodyweight glyphs are both a T with something hanging at 16 pt.                                                                                                                                                 |
| 7   | Flexibility               | 3     | **+** Tap a figure to type it, with Previous, Next and Done above the pad. A set as suggested takes two taps (the dash, then Save). Hold-to-repeat, Superset, Quick add and saved meals, Select all machines, Progress filters, and an exercise's whole life (454 sessions) on Exercise. **−** History still holds about two undated sessions per screen at 26 px. After a save the entry returns to the suggestion (app rule), with no "same as last set". The end of an exercise, after its last set, is not drawn.                                                                                                                                                                                                    |
| 8   | Minimalism                | 3     | **+** Ink on white, colour only in prints. The log is figures and nothing else. No art on Progress charts. Warm-ups sit on one quiet line. Food shows one figure. **−** Logging still says two things twice, against the owner's latest note: the set count ("4 ×" and "of 4") and the RIR target ("@ 2 RIR" and "target 2"). Training's Next is framed and also labelled "Next", and Plan's choice is framed and also ticked. Friends still opens on four tiles.                                                                                                                                                                                                                                                        |
| 9   | Error recovery            | 3     | **+** Plain, specific messages: "Enter RIR: estimate how many more good reps you could do." appears under Save after a tap, as `role=alert` (Log-Pounds-375). Also "Connection lost. Your entries are still here. Retry saving when connected." (System), "Taking longer than usual… Retry loading", and "Still to add: date of birth and training goal." **−** The failed save exists only as a System component, never in place on a logging board (issue 2). The RIR message does not point at the RIR column, which stays grey.                                                                                                                                                                                      |
| 10  | Help                      | 3     | **+** Help is available through ⓘ for RIR and RPE (the app's words), the Why sheet (reason, basis, History), the Technique tab, ⓘ on Machines and AI coach, Welcome's key, Calendar's legend, and "Your coach reads these". **−** Programme-change's "Why" is an empty `<details>` (issue 11). Scored on the product's help: the canvas's own documentation faults (Main and System cut by their frames, Platforms out of date) are priced in section 5, as J priced its read-me.                                                                                                                                                                                                                                        |

**Score history:** G 26 → J 28 → K 32. The rise comes from J's list: 19 of its 23 issues are fixed
(section 4). What still loses points is the edges of the logging screen, not its centre:

- the failed save
- the 200% context
- the typing state
- three boards without their suggestion
- the ⓘ's hit area

A run of smaller consistency drifts on the system boards also costs points.

## 2. Cognitive load: 0 fails, 2 borderline (low)

- **Pass, grouping.** The log stands on the entry: its latest line ends 8.0 pt above the entry's
  rule on Log (547.9 / 555.9 pt), Log-Pounds-375 and Log-Android. This was J's fail. The calendar's
  dates sit with their marks.
- **Pass, single focus.** Each screen has one primary action: Save, Start workout, Save and start,
  Approve, Finish session, Add to Dinner, Save activity.
- **Pass, hierarchy.** The entry is 42 px, the log 32, History 26 and the warm-ups 20. Screens run
  title → print → rows, and Food's kcal is 56 px over its bowl.
- **Pass, chunking.** Figures stand in columns, warm-ups on one line, and meta facts are each led
  by a glyph. Food's empty meal slots are muted.
- **Pass, progressive disclosure.** Hold → Why, the ⓘ buttons, Set options, "Notes, heart rate,
  more", View values, the sections sheet, and "Save or repeat this workout". The exception is
  Programme-change's Why, which discloses nothing.
- **Borderline, minimal choices.** The Log dock holds 13 targets: three figures, six steppers, ⓘ,
  Save, Hold and Set options. Effort is 1–5 plus Not sure, and Check-in has three 1–5 scales. The
  owner's RIR stepper and the app's data model set this.
- **Borderline, working memory.** At 200% the user must remember which exercise they are logging,
  because its name is above the first screen. The seven cycle squares are wordless (owner decision;
  named for screen readers).

## 3. The owner's notes

### Round 2 (latest)

| #   | Note                                                                                        | Verdict | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No boxes or art beside an exercise's name                                                   | Met     | Today, Workout, Workout-Superset, Workout-Coach, Programme-Day, Finish and Summary: each row is the name, a glyph and the prescription, and the sets are drawn once, in the print. Marks lead rows only in mixed-sport lists (Day, Progress-History, Friends). State words appear only as news (✓, Resume, Skipped).                                                                                                      |
| 2   | Logging rethought; no redundant information; keep the rest timer and the RIR and reps entry | Partly  | Rethought and kept: one line per set in the entry's own columns (equal within 0.1 pt at 402, 375, 360 and 320), warm-ups on one quiet line, the latest line 8 pt over the rule, the pill in the header, and RIR as − figure +. Still said twice: the set count and the RIR target. Its edges are unfinished: the failed save, the suggestion on three boards, the ⓘ's hit area, 200%, typing and the Moment (issues 2–7). |
| 3   | Training's art centred                                                                      | Met     | All six measured Training prints sit within 1 pt of centre across and down (Lower A 41 / 41 pt, Upper B 47.7 / 47.7, Easy Run + Arms 71.1 / 70.2). So do Today (22 / 20.6), Workout (48.4 / 49), Summary (67.2 / 68.1) and Past-Workout (127.1 / 127.1).                                                                                                                                                                  |
| 4   | A better run shape; no line under the art on any page                                       | Met     | The run is a track (Alphabet, Today, Run, Day, Calendar). No ground line or indoors bar sits under any form or mark. Where a run happened is a glyph on its row (Running, Run). The brand mark and the Today tab icon keep their ink line, which DESIGN calls "not a print"; confirm with the owner.                                                                                                                      |
| 5   | The old calendar's paper and style, better                                                  | Met     | Progress, Calendar and Progress-Dark have the paper, weekday letters, 3:1 dots and one to four marks per day. Today is ringed, days to come are blank, and every past day is a named link. Calendar adds dates and a legend and scrolls from August into September.                                                                                                                                                       |
| 6   | No ugly art on Running                                                                      | Met     | Running draws ink bars (this week in ink) with the scale on the left. Each run is listed with its outdoor or treadmill glyph.                                                                                                                                                                                                                                                                                             |
| 7   | Food shows only the calories eaten                                                          | Met     | Food, Food-Over, Food-Dark and Food-320 show "1,152.5 kcal" or "2,536 kcal" and nothing left or over. The bowl's fill stands at 0.60 R, which is 51% of its area for 1,152.5 / 2,300 (50.1%).                                                                                                                                                                                                                             |
| 8   | Raise the score by fixing the reviewers' verdicts                                           | Partly  | 19 of J's 23 issues are fixed and 4 partly, and the score rises from 28 to 32. But the read-me's account is cut off by its own frame (601 pt; issue 1). Two of the fixes brought new P2s: docking the 200% entry pushed the title off screen, and bottom-anchoring the log split Moment from Log.                                                                                                                         |

### Round 1

| #   | Note                                           | Verdict | Evidence                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Better art per sport on one aligned grid       | Partly  | The Alphabet has one module grid, one baseline, whole-module heights, one cut per sport and centred compositions. But Training draws each day on its own module (7.8–13.4 pt) on identical papers (issue 9).                                                                          |
| 2   | Cycle and rest timer minimal                   | Met     | Seven squares (Today). One pill whose dial empties from twelve and refills at 3:00 (Moment@2400ms).                                                                                                                                                                                   |
| 3   | Minimal text, nothing repeated                 | Partly  | Most things are said once. The repeats left are Log's set count and RIR target, Training's Next (frame and word) and Plan's choice (frame and ✓).                                                                                                                                     |
| 4   | Log / Technique / History tabs, warm-ups faded | Met     | Log, Technique and History. Warm-ups are ink 2 on one line, and only the done ones are drawn (Log-Warm-ups). History's lines are read, not buttons.                                                                                                                                   |
| 5   | RIR as −, a figure, +                          | Met     | Log, Log-Android, Log-200 and System. The dash is a button that takes the target.                                                                                                                                                                                                     |
| 6   | Equipment and outdoor or treadmill as icons    | Met     | A glyph leads every exercise's meta line. Log-Run, Log-Ride and Log-Swim offer Outdoor, Treadmill, Indoor, Pool and Open water tiles, and Running's list and Run's meta carry the glyphs. Day and Progress-History titles keep the app's words.                                       |
| 7   | Everything starting at the left edge           | Met     | Names sit at the gutter on session rows, search results, machines, Dinner (star trailing), Privacy and Programme-change. Glyph-led settings and mark-led mixed lists share one edge 12 pt after a 20-pt column. One exception remains: AI-coach's "Send answer" text starts 18 pt in. |
| 8   | Progress not congested                         | Met     | The Overview is one month, every sport, with the totals as the key. Calendar scrolls, and the six sections sit in a sheet.                                                                                                                                                            |
| 9   | Less padding under the tab bar                 | Met     | 64 pt. Targets end at 857 pt, 4 above the indicator at 861, and 11 above the edge at 375 × 667.                                                                                                                                                                                       |
| 10  | Over-full bowl stays symmetric                 | Met     | Food-Over shows one lens above the rim. The Alphabet shows that at twice the target the heap closes the circle.                                                                                                                                                                       |
| 11  | More pages, including an AI coach              | Met     | AI-coach, Programme-change, Today-Coach, Workout-Coach, Friends, Gyms, Gym, five first-run steps and four Progress sections.                                                                                                                                                          |
| 12  | Plan for native iOS and Android                | Partly  | Platforms covers shells, sheets, typing, haptics, safe areas and text styles. But its 200% paragraph and its figure sizes contradict Log-200 and the type ramp (issue 8).                                                                                                             |
| 13  | Text never runs off                            | Partly  | No phone board clips or ellipsises text at its own size. But Main and System run off their own frames. 200% is drawn only for Log, and simulated 200% overflows on 9 of the 11 other boards tried.                                                                                    |

## 4. J's issues on this canvas

| J     | Issue                                             | Status | Evidence                                                                                                                                                                                                                                                                                                   |
| ----- | ------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-1  | The 200% entry is not docked (Log-200)            | Fixed  | The whole entry is docked: set row 384, load 442–508, reps and RIR 553–685, steppers 692–756, Save 764–840 of 874 pt. The dash is a button ("RIR not set, target 2. Use the target"), and "RIR ⓘ" sits over "target 2". New trade-off: the title has gone above the first screen (issue 5).                |
| P1-2  | The set number collides with five-character loads | Fixed  | The number has its own 18-pt column in both grids. With "102.5" injected, set "1" clears the load by 11.3 / 8.1 / 5.6 / 4.3 pt at 402 / 375 / 360 / 320. Residual: a two-digit set leaves 0.3 pt at 360. At 320 the 32-px figure overflows its 80.7-pt column, so the ramp's 28 px (specified) must apply. |
| P1-3  | The indoors bar is a line under the art           | Fixed  | No bar under any form or mark (Alphabet › Context, Calendar, Progress, Progress-History). The Calendar legend reads Lifting, Run, Ride, Swim. DESIGN now says "Where it happened is not drawn".                                                                                                            |
| P1-4  | The read-me misreports the critiques              | Partly | The scores (26, 28) and each verdict are now right, but 601 pt of Main lies outside its frame, including all of "What the second review found, and what changed" (issue 1).                                                                                                                                |
| P2-5  | An empty gap between the log and the entry        | Fixed  | The latest line is 8.0 pt over the rule (Log, Log-Pounds-375, Log-Android), and the space opens under the tabs instead. Moment's first frame brings a 58-pt slot back (issue 7).                                                                                                                           |
| P2-6  | The warm-up line's grey means two things          | Fixed  | Log-Warm-ups draws only the done warm-up ("W 25 × 8"), and the entry says "Warm-up 2 of 3".                                                                                                                                                                                                                |
| P2-7  | Suggestions look confirmed (Log-Dark)             | Fixed  | 62.5 and 3 stay ink 2 and dotted beside a chosen RIR of 2, named "62.5 kilograms, suggested".                                                                                                                                                                                                              |
| P2-8  | The log's columns break when the entry restacks   | Fixed  | Equal centres at 360 (83.7 / 136.3 / 189 / 241.6 / 294.3 pt) and 320 (74.3 / 121.6 / 169 / 216.3 / 263.7). Log lines are 58 pt tall.                                                                                                                                                                       |
| P2-9  | The entry's actions are invisible and inoperable  | Fixed  | The figures and the dash are named buttons with dotted underlines. A tap on the waiting Save shows the app's sentence (Log-Pounds-375). The dash's "take the target" still has no visible cue beyond "target 2".                                                                                           |
| P2-10 | Notation lifters misread                          | Fixed  | "@ 1–2 RIR" on every prescription. Exercise uses "72.5 kg × 6, …", and Food uses "86 / 297 g" with no "≤".                                                                                                                                                                                                 |
| P2-11 | Names off the left edge                           | Partly | Fixed on Dinner, Add-exercise, Fallback, Gym, Privacy and Programme-change. AI-coach's "Send answer" text still starts at 52 pt against the card's 34-pt edge.                                                                                                                                             |
| P2-12 | Non-text contrast                                 | Fixed  | The empty-day dot is #8d8980 at 3.01:1 (3.04:1 dark). Warm-up blocks are edged in #8d8980 at 1.2–1.8 px (Summary, Past-Workout, Day). Meal marks are edged in 1-px ink.                                                                                                                                    |
| P3-13 | Today's ring crosses "29"                         | Fixed  | "29" sits inside the 44 × 50 ring (text box 84–100 × 628–647 pt).                                                                                                                                                                                                                                          |
| P3-14 | The signature moment slips                        | Fixed  | The dial is full at 3:00 from 2150 ms, words swap by keyframes, and the save is announced. Small residual: the pill's name holds "2:14" and "3:00" at once.                                                                                                                                                |
| P3-15 | Pattern drift                                     | Fixed  | Today-Coach uses the coach-note block. Gym is a pin. Every chart's scale sits left. Plan prints and record prints follow a stated rule. Portion's print is square, and the 200% steppers are round.                                                                                                        |
| P3-16 | Glyphs                                            | Fixed  | The indoor bike is redrawn. "instead of", "Planned by the coach", and a funnel for Filters versus sliders for Set options. Gym's Barbell row is below the board's fold.                                                                                                                                    |
| P3-17 | Wraps that split figures                          | Fixed  | "average 21.4 km/h", "2 meals", "RIR ⓘ / target 2", and Log-Typing keeps "target 2".                                                                                                                                                                                                                       |
| P3-18 | Alignment                                         | Fixed  | "Add machine" ends at 382 pt, the gutter. The "30 minutes" label clears the blocks. Welcome's key sits 6 pt under the print and 16 pt above the title.                                                                                                                                                     |
| P3-19 | Slashed beside plain zeros                        | Partly | This is by the Two Voices Rule: Today's "25–30" is Jost and "70–100 min" is Atkinson, on one screen.                                                                                                                                                                                                       |
| P3-20 | Programme-change semantics                        | Fixed  | Read as "Length was 6 weeks, becomes 8 weeks".                                                                                                                                                                                                                                                             |
| P3-21 | Docs drift                                        | Fixed  | The three items J named are fixed: "not in the volume"; Paddle is "cut once, aslant"; the SE caption says 11, and Today-375 measures 11. New drift has appeared elsewhere (issues 8 and 19).                                                                                                               |
| P3-22 | Continuity                                        | Fixed  | Profile's Rest timer is on, and Progress has no stray strip. Superset-Log's missing pill is now a stated rule, with no rest before a session's first set (Workout-Coach agrees).                                                                                                                           |
| P3-23 | Canvas                                            | Partly | Today → Check-in → Workout → Log and Finish session → Summary are linked, and only Fri 25 Sept opens Day. But 387 of 726 hrefs are still "#". Tab icons are 13–16.5 pt of ink tall: Food is 13.6 against Progress's 16 (85%, up from 64%).                                                                 |

**Tally:** 19 Fixed, 4 Partly, 0 Open. No J item turned out to be an app decision.

## 5. Priority issues

No P0: nothing on the boards as drawn blocks the core task.

### P1

1. **The read-me is cut off by its own frame** (Main).
   - Wrong: Main renders 5,059 pt tall in a 4,458-pt frame. The 601 pt that fall outside it hold:
     - the end of "Run asks distance first", and the "Check-in's scales…" and "'Best set'…" rows
     - all 13 bullets of "What the second review found, and what changed"
   - That section is the answer to the owner's "fix the reviewers' verdicts". This is a regression
     from the latest change.
   - Fix: set Main's `h` to 5,060 in `canvas.json` (and System's to 6,941; see issue 8) and re-shoot
     both. In the generator, fail the build when a board's `scrollHeight` exceeds its declared `h`.

### P2

2. **The failed save is not drawn where it happens** (every logging board).
   - Wrong: sets save only when the server answers (owner decision), so "Connection lost. Your
     entries are still here. Retry saving when connected." is the error a basement-gym lifter
     meets most. It exists only as a System component. No board shows where it sits relative to
     the entry, the log, Save and the pill.
   - Fix: add a Log-Failed board. The entries stay in ink, no line is added to the log, and the
     sentence sits above Save as `role=alert`. Save reads "Retry" in ink, and the pill does not
     restart. Add the offline variant ("drafts stay on this device") beside it.
3. **Suggested figures without their reason** (Log-Pounds-375, Log-Pounds-320, Superset-Log).
   - Wrong: 140 lb × 6 and 32 kg × 30 m are drawn as suggestions (ink 2, dotted, named
     "suggested"), but with no tag and no link to Why (0 on each board). Log, Log-Dark,
     Log-Android, Log-200, Log-Typing, Moment and Why all carry "Hold ⓘ". The app always shows the
     kind (`exercise-logger.tsx`: "Add load" … "No history"). PRODUCT sells "a suggestion for
     every exercise, with its reason", and the Fold, Never Drop Rule forbids dropping it.
   - Fix: draw the tag on every logging board ("Repeat ⓘ" for the squat's last set, the carry's
     kind or "No history" on Superset-Log). At 320 it fits beside "Set 3 of 3": it needs about
     72 pt and 160 pt are free.
4. **The RIR ⓘ shares its hit area with the controls around it** (Log, Log-Dark, Log-Warm-ups,
   Why, Moment, Moment-Reduced, Log-Pounds-375, Superset-Log, Log-Android, Log-Pounds-320,
   Log-200).
   - Wrong: "What RIR means" (44 × 44) overlaps the RIR figure by 30 × 7 pt (29 × 7 for RPE on
     Superset-Log). At 360 and 320 it overlaps RIR's − by 32 × 9 and 30 × 9 pt, and on Log-200
     the figure by 44 × 5.2. A sweaty thumb on the lower edge of the dash, or on the most-used
     − at 360 and 320, can open the explanation instead.
   - Fix: trim the figure's target to 44 pt (622.9–666.9 at 402) and start the ⓘ's 44-pt target
     below it (669–713, still 5 pt clear of − at 718). At 360 and 320, add 9 pt between − and the
     "RIR ⓘ" line. No two targets should share a point.
5. **At 200% the logging screen hides what is being logged** (Log-200).
   - Wrong: "Barbell bench press" sits at y = −105 and its prescription at 23–97 pt, behind the
     header. The first screen names only the workout ("Upper A"), and the rep range (3–5) is gone
     from view. The fix for J's P1-1 caused this.
   - Fix: at 200% put the exercise name in the sticky header in place of the workout. It is one
     line and may wrap to two; the back chevron keeps "Upper A" as its name. Show the rep target
     under reps ("target 3–5"), as RIR already shows its own.
6. **Typing breaks the entry** (Log-Typing).
   - Wrong:
     - the reps and RIR figure targets shrink to 25.8 × 51.2 and 32.3 × 51.2 pt, the only targets
       under 44 among 1,114 on the phone boards
     - the entry loses its hairline and its 8-pt gap: Set 2's line ends 13.2 pt under the "Set 3
       of 4 / Hold" row, and its target overlaps Hold's by 72.5 × 13.2 pt
   - Fix: keep column-wide 44-pt targets (each column is 102 pt wide). Keep the rule, and end the
     log 8 pt above it while the pad is up.
7. **Moment starts from a state Log never shows** (Moment, Moment-Reduced against Log).
   - Wrong: sets 1 and 2 are drawn 58 pt higher than on Log (line bottoms at 431.9 / 489.9 against
     489.9 / 547.9), leaving an empty slot for set 3 above the rule. The real motion, the earlier
     lines moving up as a set lands, is never specified.
   - Fix: start Moment from Log's resting state. Specify that the warm-up line and earlier sets
     rise 58 pt on the new line's 220-ms curve (and do not move under reduced motion), and redraw
     the frames.
8. **The canvas's documentation contradicts its boards** (Platforms, System).
   - Wrong:
     - Platforms says the 200% logging layout is "the entry first … the ledger below, Save pinned".
       Log-200 and DESIGN dock the entry under the log.
     - Platforms gives figures as "62.5 at 46 pt on the 440 board, 41 at 402, 39 at 375". Those
       sizes are off the ramp; the boards draw 42 at 402 and 375 and 36 at 360 and 320.
     - System renders 6,941 pt in a 6,805-pt frame, cutting off Motion's Swap, Sheet and Rest
       specs.
   - Fix: rewrite both Platforms paragraphs from Log-200 and the ramp. Set System's `h` to 6,941.
9. **Training's days are not on one grid** (Training).
   - Wrong: each day is scaled to fit an identical 176 × 64 paper, so a module measures:

     | Day                    | Module (pt) |
     | ---------------------- | ----------- |
     | Upper B                | 7.8         |
     | Upper A                | 9.0         |
     | Lower B                | 11.0        |
     | Lower A                | 12.2        |
     | Easy Run + Light Upper | 13.4        |
     | Easy Run + Arms (Next) | 19.5        |

     The heavier day draws smaller, and the week cannot be compared at a glance. This misses the
     owner's "one aligned grid".

   - Fix: use one module for the page, set by the widest day (about 7.8 pt), and centre each day
     on its paper. The Next tile stays the same module, centred on its wider paper.
10. **200% is drawn for one screen in 70** (Workout, Food, Training, Running, Friends and the tab
    bar).
    - Wrong: I simulated text at 200% (sizes doubled, widths kept) on 11 boards with no 200%
      variant. Nowrap labels overflow on 9:

      | Board    | What overflows            | By                                              |
      | -------- | ------------------------- | ----------------------------------------------- |
      | Workout  | "Superset" button         | 27 pt past the screen edge                      |
      | Food     | "1,152.5"                 | 33 pt past the edge                             |
      | Food     | macro columns ("/ 297 g") | 34–50 pt past their boxes                       |
      | Training | "Swimming" tile           | 23 pt past the edge                             |
      | Running  | segment labels            | 8–10 pt                                         |
      | Friends  | "Leaderboard"             | 12 pt                                           |
      | Tab bar  | "Training", "Progress"    | 9–14 pt (capped by the platform, per Platforms) |

    - Fix: draw 200% boards for Today, Workout, Food, Training and Progress using the fold rules:
      - paired buttons stack
      - macro columns stack
      - sport tiles go two to a row
      - the segmented control becomes a menu
      - the kcal steps down the ramp
11. **Programme-change's Why is empty** (Programme-change).
    - Wrong: "ⓘ Why" is a `<details>` with nothing inside. The app shows the coach's rationale and
      its uncertainties there (`change-detail.tsx`). This is the one screen where the athlete
      approves a structural change ("starts a new block").
    - Fix: fill it from the coaching preview's rationale.

### P3

12. **Logging says two things twice** (Log, Log-Dark, Log-Android, Log-200, Moment).
    - Wrong: the set count ("4 ×" and "of 4") and the RIR target ("@ 2 RIR" and "target 2") each
      appear twice, against the owner's "no redundant information".
    - Fix: either drop "@ 2 RIR" from the logging meta, since the target lives at its column, or
      drop "target 2" and let the dash's name and ⓘ carry it. Choose one.
13. **Past-Workout writes sets in its own notation** (Past-Workout).
    - Wrong: "W 37.8 × 10 · 63 × 10 · 63 × 10" uses middle dots and no unit. Workout, Finish,
      Summary and Exercise use the app's `formatSets` ("63 kg × 10, 63 kg × 10").
    - Fix: use `formatSets`, with warm-ups led by the set grid's "W".
14. **One picker draws its choice two ways** (Add-exercise, Fallback).
    - Wrong: Add-exercise ticks the row and pins "On Assisted pull-up machine". Fallback says
      "Selected: Split squat (supported)" above results that do not show it.
    - Fix: tick the row and pin the choice above the action in both.
15. **Live and waiting look alike** (AI-coach).
    - Wrong:
      - "Send note" is ink with an empty field, while "Send answer" waits.
      - "I no longer want this" is live but ink 2, the same as the waiting button beside it.
      - "Send answer" text starts 18 pt in from the card's edge.
    - Fix: Send note waits until there is text, "I no longer want this" goes to ink, and the text
      buttons align to the 34-pt edge.
16. **State said twice** (Training, Plan).
    - Wrong: Next has a 2-pt ink frame and the word "Next"; the chosen programme has a frame and
      a ✓.
    - Fix: keep one signal on each.
17. **Recognition gaps** (Food, Recovery, Workout, Gym).
    - Wrong:
      - The week-strip bowls (goal met, under, over, nothing) are keyed only on System and in
        screen-reader names.
      - Recovery's "Sleep 7 h" is the latest reading (its chart's name says so) but reads as the
        range figure.
      - The bodyweight and cable glyphs are both a T with something hanging at 16 pt (Pull-up
        against Seated cable row).
    - Fix: put a key in the Food calendar sheet, add "latest" under the tile figures, and draw
      bodyweight without the bar.
18. **Sports overloads "thinned"** (Sports).
    - Wrong: unchosen sports are drawn in the to-do pigment, which means "to do" everywhere else.
    - Fix: draw unchosen sports as full marks on surface, and chosen ones on an ink tile.
19. **DESIGN.md drift** (DESIGN, Alphabet).
    - Wrong:
      - DESIGN says "28 for pounds at 375 pt, 20 at 320", but Log-Pounds-375 and Log-Pounds-320
        draw the log at 32 px.
      - Figure XL is "56" in DESIGN but "40–64" on System.
      - "Size … in whole modules" sits beside the Alphabet's own "30 minutes: 2.5 modules long".
    - Fix: update the file so it matches the boards.
20. **Screen-reader semantics and inputs** (Workout, Food, Check-in, Appearance, Log-200, Finish,
    Edit-profile, Moment, Welcome, Sports).
    - Wrong:
      - The in-progress row's "Resume" is `aria-hidden`, so the row never says "in progress, 2 of 4".
      - Meal rows end "445" with no "kcal".
      - Check-in's radios read "1"–"5" and are not described by their anchors.
      - Appearance puts `li` inside `ul[role=radiogroup]` (axe flags all three).
      - Log-200 has no `main`.
      - The body-weight and height fields lack `inputmode="decimal"`, which the app sets.
      - Moment's pill name holds both times at once.
      - Onboarding's not-started step dots are #e9e9ec, 1.21:1 against the ground.
    - Fix: fix each one in place.
21. **Not drawn** (Log, Log-Pounds-320).
    - Wrong:
      - The end of an exercise is missing: after Set 4 of 4, what does the entry offer? Superset-Log
        has "Then Wrist curl", but a plain exercise has nothing.
      - Log-Pounds-320 shows the whole scroll (645 pt), not the 320 × 568 first screen the Docked
        Entry Rule promises.
    - Fix: add Log-Last and Log-320 × 568 boards.
22. **Canvas coherence** (Today, Workout-Superset, Training, the session boards, Progress).
    - Wrong:
      - "Easy Run + Arms" has four exercises on Today and Workout-Superset (preview `page.tsx`) but
        six on Training (`program.ts`).
      - Today is Fri 11 Sept in cycle 1, while the session boards are in Upper A's third cycle and
        Progress's today is 29 Sept.
      - 387 of 726 hrefs are "#".
      - Tab icons range from 13 to 16.5 pt of ink, though DESIGN says each is as tall as the others.
    - Fix: draw each page from one source, wire the remaining links, and redraw the tab icons to
      one height.

## 6. Accessibility and craft, measured

| Check                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text contrast (70 phone boards)                 | 2,177 text elements, none failing. The lowest small text is 5.75:1 (#615c50 on paper: calendar dates and weekday letters). Ink 2 is 6.57:1 on white and 5.98:1 on surface. The empty RIR or RPE dash is 3.59:1 at 36–63 px, which counts as large. Dark ink 2 is 7.70:1 and dark paper labels 7.21:1.                                                                                                                                                                                                                                          |
| Non-text contrast                               | The empty-day dot is 3.01:1 (3.04 dark). Warm-up blocks are a 1.30:1 fill inside a 3.01:1 edge. Meal marks are edged in ink. Pigments run 3.51 (run) to 6.79:1 (lift) on paper and 4.06 to 7.86 on white. Control borders, chart bars and the macro track are 3.59:1 (4.12 dark). To-do fills are 1.76–1.93:1 inside full-pigment edges. Food's 1.63:1 on paper is carried by the bowl's ink outline. Round buttons and segment trays (#f4f4f5, 1.10:1) are identified by their ink glyphs. **Fail:** onboarding's not-started dots at 1.21:1. |
| Targets ≥ 44 pt                                 | 1,114 interactive elements; 2 under 44 (Log-Typing reps 25.8 × 51.2, RIR 32.3 × 51.2). System's Undo is 36.4 pt wide. **Overlaps:** the RIR ⓘ over the figure by 30 × 7 pt (7 boards), over RIR's − by 30–32 × 9 at 360 and 320, and by 44 × 5.2 on Log-200; Log-Typing's Set 2 line under Hold by 72.5 × 13.2. Tab targets end 4 pt above the indicator, and 11 pt above the edge at 375 × 667.                                                                                                                                               |
| Log against the entry's columns                 | Centres match within 0.1 pt at 402 (89.3 / 149.6 / 210 / 270.3 / 330.7), 375 (86.2 / 141.3 / 196.5 / 251.6 / 306.8), 360 (83.7 / 136.3 / 189 / 241.6 / 294.3) and 320 (74.3 / 121.6 / 169 / 216.3 / 263.7). The latest line ends 8.0 pt over the rule (Log, Log-Pounds-375, Log-Android), but overlaps by 13.2 pt on Log-Typing. History keeps the same grid at 26 px.                                                                                                                                                                         |
| Clipping                                        | No phone board clips at its size; Food-320's scrolled strip leaves a 3.3-pt sliver of "19", by design. Main is 601 pt and System 136 pt taller than their frames.                                                                                                                                                                                                                                                                                                                                                                              |
| 200% text                                       | Log-200 docks the entry (Save at 764–840 of 874), the dash is a button and the steppers are 64 pt. The exercise name and prescription sit above the first screen. Simulated 200% overflows on 9 of 11 other boards (issue 10).                                                                                                                                                                                                                                                                                                                 |
| Names                                           | Every control has a name: "62.5 kilograms, suggested. Type a load"; "RIR not set, target 2. Use the target"; "Set 1: 60 kilograms, 4 reps, 2 reps in reserve. Edit"; calendar days by contents; charts carry their data. Sheets are modal dialogs labelled by their titles. The gaps are in issue 20.                                                                                                                                                                                                                                          |
| Floors and input                                | No text under 12 px, and every field is 16 px. Focus is a 3-px ink ring at a 2-px offset, ringed in ground, and swaps to #edeef0 / #111214 in dark.                                                                                                                                                                                                                                                                                                                                                                                            |
| axe-core (WCAG 2.0–2.2 A and AA, best practice) | No contrast or name violations. Flagged: `listitem` (Appearance ×3), `landmark-one-main` (Log-200), `region` (the sr-only h1 and pinned buttons outside landmarks), and `target-size` only where rows scroll under the tab bar.                                                                                                                                                                                                                                                                                                                |

## 7. Persona red flags

- **Lifter between sets**
  - The ⓘ overlaps the RIR dash, and at 360 and 320 it overlaps the RIR −, so a thumb can open the
    explanation instead of stepping RIR.
  - The likeliest error, a save the server never answered, is not drawn on the screen where it
    happens.
  - Three boards show suggested figures with no reason and no Why.
  - After each save the entry returns to the suggestion (app rule). A lifter holding 60 × 4
    against a 62.5 × 3 suggestion steps load down and reps up every set.
  - **Good:** a set as suggested takes two taps (the dash, then Save). The entry reads as the
    log's next line at every width. Saving… → Saved happens where the eye is, and the rest pill
    refills.
- **Screen reader and 200% text**
  - At 200% the exercise name and rep range are above the first screen.
  - Only Log is drawn at 200%; simulated 200% breaks Workout, Food, Training, Running and Friends.
  - The in-progress row never says it is in progress, and Check-in's radios read "1"–"5".
  - **Good:** every figure is a named button. Save is `aria-disabled` and described by the app's
    sentence, which becomes an alert on a tap. A save is announced. Charts carry their data, and
    calendar days are named by what they hold.
- **Power user**
  - History shows about two undated sessions per screen.
  - There is no "same as last set".
  - The last set of an exercise leads nowhere drawn.
  - **Good:** typed entry with Previous, Next and Done above the pad. Hold-to-repeat, Superset,
    Quick add and saved meals, filters, and an exercise's whole life on Exercise.

## 8. Keep

1. **The log and the entry on one grid** (Log, Log-Android, Log-Pounds-375, Log-Pounds-320,
   History). The figures stand over their figures within 0.1 pt at every width. The log stands
   8 pt over the entry. Warm-ups sit on one quiet line, and only done things are drawn.
2. **The honest save** (Moment, Moment-Reduced, Log-Pounds-375, System). Save waits, with the
   app's own reason. Saving… stops a second tap, nothing is written early, and the line lands and
   is announced. Rest refills to 3:00.
3. **The calendar back on paper** (Progress, Calendar, Day, Run). 3:1 dots, today ringed, every
   past day a named link, dates on the calendar page, and months that scroll.
4. **Progress in ink** (Running, Recovery, Body, Exercise, Past-Workout). Left scales and data in
   the charts' names, with no art where the owner did not want it.
5. **The alphabet's discipline and the bowl** (Alphabet, Today, Training, Workout, Food-Over).
   Compositions are centred within 1 pt, sit on one baseline with nothing drawn under them, and
   use dashed only for skipped. The bowl's layers are true by area (breakfast 445 kcal fills
   19.3% of it).
6. **Craft floors.** 2,177 text elements with the lowest small text at 5.75:1, nothing under
   12 px, and 1,114 targets with 2 under 44.
