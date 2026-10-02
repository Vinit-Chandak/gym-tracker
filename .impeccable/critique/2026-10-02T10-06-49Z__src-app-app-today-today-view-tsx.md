---
target: Today, the coach's sheet, and the flow it anchors
total_score: 29
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/gym-tracker/src/app/(app)/today/today-view.tsx"
target_fingerprint: "sha256:462495e1f5a29a2ff0a78abba8753e8fdf60cc71c5d9282615cd6104fbd62161"
target_path: /home/user/gym-tracker/src/app/(app)/today/today-view.tsx
timestamp: 2026-10-02T10-06-49Z
slug: src-app-app-today-today-view-tsx
---

Method: dual-agent (A: design review sub-agent · B: detector and browser-evidence sub-agent), synthesised by the build thread after A returned and before B's findings were read.

Target: `src/app/(app)/today/today-view.tsx` (Today, the coach's sheet) and the flow it anchors: Today → check-in → the workout logger → Progress → Profile › Programme and the coach's proposals, with the shell and the system under all of them. Mode: Operate. Assessed on the build as it stood after the five tab rebuilds and before this run's fix batch; the fixes applied in the same run are noted per issue.

## Design Health Score

| #   | Heuristic                       | Score     | Key issue                                                                                                                                                                   |
| --- | ------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Visibility of System Status     | 3         | Nothing marked the current exercise on the session overview; approving a proposal confirms only by landing back on the Changes tab.                                         |
| 2   | Match System / Real World       | 3         | "24 behind" named no unit; "Unrecorded machine", "Instructions only", "re-plan" are system words; the day-note tip prints raw fields glued with middots.                    |
| 3   | User Control and Freedom        | 3         | Reopen, Unskip, Discard, Keep it, drafts retained offline. Approve stated neither its undo nor when it applies.                                                             |
| 4   | Consistency and Standards       | 3         | Two Resume affordances on Training against none on Today; "Log it" full-width on Today and compact on Training; two vocabularies for answering a proposal (legacy "Apply"). |
| 5   | Error Prevention                | 3         | Complete disabled until a set is saved; drafts block Finish. Changing gym spends one of three daily coach requests without saying so; Decline has no confirmation.          |
| 6   | Recognition Rather Than Recall  | 3         | The logger dropped the coach's RIR target that Today had printed; the rest timer switch lives two levels away in Profile.                                                   |
| 7   | Flexibility and Efficiency      | 2         | One-tap Save over pencil targets, then the way to the next exercise was a reach to the top-left plus a row tap; the check-in interposes on every start; no repeat-last-set. |
| 8   | Aesthetic and Minimalist Design | 3         | The behind count twice in the first viewport; two circled-i buttons in the set-grid header; the Programme page stacked seven controls before content.                       |
| 9   | Error Recovery                  | 3         | Row-level Retry, `role=alert` beside the source, "Connection lost. Your entries are still here."                                                                            |
| 10  | Help and Documentation          | 3         | InfoTips at the right moments; nothing explains the "Coach" badge or "behind" where they appear.                                                                            |
|     | **Total**                       | **29/40** | **Good**                                                                                                                                                                    |

All ten heuristics apply in Operate mode; none marked n/a.

## Design Specificity Verdict

**LLM assessment.** Authored for this product, not for the category. Today's first viewport is unmistakably the coach's sheet: the cycle strip places the day on the plan, the day's name is the largest ink on the page, the coach's sentence sits beneath it in ballpoint blue with the pencil glyph, and every exercise row carries its target in the condensed data voice with the coach's reason in pen beneath. The logger continues the metaphor honestly: the coach's targets sit in the cells as pencil placeholders, typed values turn to ink, the set's number cell inks on save, and the highlighter walks down the Save column one row at a time. The body map in passes of the same yellow, the cycle cells reused as day numbers in the programme, and the diff drawn as a pen layer are choices no neighbouring app could lift unchanged. Daylight and graphite are one sheet.

Where it went generic: the Profile settings list; the Progress header (a native select beside a Filters button); the Leaderboard's stacked filters; the Food macro bars; the Programme page's header block. Two promises of the direction contract were unbuilt at assessment: the periodisation chart (the signature graphic) and the "viewport focus" raise (the next exercise one tap away). Both are built in this run's fix batch.

**Deterministic scan.** `impeccable detect --json src/app src/components`: exit 0, zero findings (engine 0.1.8; a sanity set outside the repo produced four findings, so the result is real). The static ruleset is narrow (fonts, easings, layout transitions, type hierarchy, buzzwords, section markers), so "clean" is clean against that set.

**Browser evidence.** Injection preflight passed on /today; the live server served `detect.js`; overlays were injected on five pages (Today, a session, Progress, Profile › Programme, Food) and the server was stopped afterwards. Console findings: `undersized-ui-text` on the five tab-bar labels at 10.85px on a 402px viewport (every page; real, fixed in this run: the floor is now 11px); `layout-transition` on the programme progress bar's `transition: width` (real, fixed: it fills by transform); `flat-type-hierarchy` on the session page (body 16, h1 18, h2 18; reported as-is); `text-occlusion` on a button inside a closed `<details>` (measured: 4.8% overlap when closed, none when open; a detector artefact, false positive). No horizontal overflow on any page; no console errors; `prefers-reduced-motion` rules present.

## Overall Impression

The world holds: one sheet, one highlighter, the coach's hand visible everywhere it should be, and a logger that is faster and more honest than the category's. What was missing was the macro view the direction promised (the programme as a periodisation chart) and the micro path the athlete takes five times a session (the way on from a finished exercise). The single biggest opportunity was to close those two, which this run did; what remains is copy and consistency work at the edges.

## What's Working

1. **The plan row with its pen reason** (`planned-exercises.tsx`, `coach-plan.tsx`): number in the margin, name, target in the data voice, reason in pen beneath, supersets sharing one rule. It is the product's thesis as a component, and it survives 320px and 200% text.
2. **Pencil to ink in the set grid** (`set-grid.tsx`, `use-set-rows.ts`): targets as placeholders, typed values as ink, the identity cell inking on save, the highlighter on exactly one Save, effort never pre-filled. A matching set is one tap.
3. **Shell discipline**: one highlighter per screen holds; the session strip is one 48px row with a 2px draining line and "Go" as a chip, so the rest-timer constraint is met; the nested header says the gym once.

## Priority Issues

- **[P1] No way forward from a finished exercise; no current step on the overview.** Why: the most frequent transition in the session, one-handed, cost a reach to the top-left and a row tap with no mark of where you are. Fix: after Complete, a primary "Next: <exercise>"; on the overview the first exercise still to do carries the highlighter and Finish is secondary until all are settled. Status: fixed in this run. Suggested command: /impeccable polish.
- **[P2] The logger lost the coach's RIR target.** Why: RIR decides whether the set was right; the athlete had to carry it from Today. Fix: the coach headline reads "100 kg × 5 · RIR 2". Status: fixed in this run (the per-set RIR as the grid's own hint remains open). Suggested command: /impeccable clarify.
- **[P2] Today's sticky action bar leaked the rows beneath it.** Why: in the first viewport of the primary screen, under the one primary action. Fix: bleed to the gutters, sit flush on the tab bar, rule the top. Status: fixed in this run. Suggested command: /impeccable layout.
- **[P2] The proposal cut the athlete's words and hid when a change applies.** Why: the weekly high-stakes decision. Fix: the ask printed whole, once, under the headline; lines tagged "Answers your ask"; one line in the panel: applies to every week still to come, logged sessions keep what they were prescribed. Status: fixed in this run (always offering "Why" when a rationale exists remains open). Suggested command: /impeccable clarify.
- **[P2] Profile › Programme opened on a wall of controls.** Why: the coach's second home opened on administration, with Changes below the fold. Fix: tools and facts folded into "Details and tools", the page opens on Changes when something waits. Status: fixed in this run (tabs under the title is done; a "Manage" sheet was not needed). Suggested command: /impeccable distill.

## Persona Red Flags

**Casey (distracted, one-handed).** "All exercises" and the Progress section select sit at the top of the screen; the check-in interposes between Start workout and the session; tab labels rendered under 11px (fixed) and truncate at 200% text ("Train…", "Progr…"), as does the gym name in the gym switcher.

**Alex (impatient power user).** The check-in every session with the skip as a ghost link at the bottom; no repeat-last-set or save-all; the rest timer cannot be enabled from the logger; Enter does nothing in a set row.

**Sam (screen reader, low vision).** Superset membership was colour only (fixed: an sr-only "in a superset" rides with the number); the cycle strip is one link wrapping a list of labelled cells. Every input and icon button is named; focus rings are visible; charts carry value tables.

**The between-sets athlete (60–180 s, one hand, sweaty, standing).** Fails: the route to the next exercise (fixed); the missing RIR target (fixed); the 32px exercise name outweighs the 18px numerals that are read at arm's length; the circled-i over the Save column sits one slip from the next row's Save; the History tab opens with "No previous comparable session." above a list of the same lift.

## Minor Observations

- At 320px the day subtitle broke after the en dash ("70–" / "90 min"); fixed with word joiners.
- Strength opens on a series with one point and the machine select truncates ("Unrecorded machir"); default to the series with the most points.
- The gym sheet captioned "Home · Home" (fixed: no caption when the kind repeats the name).
- The finish page's skipped row wraps the exercise name against a long right-aligned reason; stack the reason under the name.
- Three identical occurrence blocks on Today, each with a full-width secondary "Log it"; Training's compact right-hand "Log it" is the better row.
- The empty account's Progress › Body shows the full grey body map with "0 sets" and no next step.
- Past requests lists the same ask twice with different verdicts; needs a date or revision marker per entry if the seed is honest.
- The seed contradicts itself (History shows 105 kg × 5 yesterday; the coach writes "same 100 kg as last week"); not counted against the design.

## Questions to Consider

- When the coach's reason and the History tab disagree on the same screen, which one is the sheet's truth, and should the logger refuse to show a coach line it can see is stale?
- Should the highlighter ever mark a record? A "66 kg (was 65 kg)" row in muted text is the quietest possible peak-end for a product named Overload.
- The coach has three daily requests; the sheet spends one silently when the athlete changes gym. Should every control that costs a request say its price?
- Does the check-in need to interpose on every start, or could it ride as one line in the logger's header until the athlete wants it?
