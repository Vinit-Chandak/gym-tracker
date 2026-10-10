---
target: onboarding flow (signup → welcome → Today), beginners vs experienced, mobile
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/home/user/gym-tracker/src/app/(onboarding)/welcome"
timestamp: 2026-10-10T12-20-14Z
slug: src-app-onboarding-welcome
---
Method: dual-agent (A: design review sub-agent · B: detector + browser sub-agent), synthesised with the parent's own seven-device walkthrough.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live counts and pending labels are good; step dots count by position (a swimmer's skipped steps read "completed"); the coach and builder swap the dots for a second 5-bar wizard; Today never confirms what setup did |
| 2 | Match System / Real World | 2 | IANA time zone as free text ("London" refused); "7-day cycle (6 lifting days)"; "plate horn", "iso-lateral" for beginners; Strength vs Lifting; three names for "no programme" |
| 3 | User Control and Freedom | 3 | Back/Skip/Save and exit exist; Skip drops ticked machines; Start training adopts 8 weeks with no preview; Plan's Back is hard-wired to Machines |
| 4 | Consistency and Standards | 2 | Signup, coach intake and builder are Form v1 boxes beside the v2 frame; chosen = ink fill except the template card's outline; location asked twice with different options |
| 5 | Error Prevention | 2 | Decisive question has no default; free-text time zone; basics missing from search; a 6-day split pre-chosen for novices and swimmers; skipping the gym allows a plan Today cannot start |
| 6 | Recognition Rather Than Recall | 3 | Drawings and identification sheets are first-rate, but the step asks a newcomer to recall a gym floor she has not seen |
| 7 | Flexibility and Efficiency | 2 | No fast lane: experienced list 8–14 screens; builder 9 fields per day; "log a workout now" only on the last screen |
| 8 | Aesthetic and Minimalist Design | 3 | Sports and Gym exemplary; Welcome stacks print, key and five controls; Plan has six exits |
| 9 | Error Recovery | 2 | Stale experience error; time zone error suggests no fix; invalid username shown as a grey hint; "no gym" surfaces only on Today |
| 10 | Help and Documentation | 3 | ⓘ and identification sheets well placed; nothing explains what the template commits to |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

LLM: about half authored for Overload (the print, sport marks, "What does PureGym Leeds have?", "Usually here (18)", inverting line drawings, identification sheets, a template drawn as its first day's print). It turns generic at the commitment and the payoff: a boxed five-field sign-up, a one-card "Choose a programme", Form v1 questionnaire and builder, and a generic empty Today. Missed: build the athlete's first print as they answer; make the workout's just-in-time machine check the setup promise; preview a plan as its week of prints; let "Which sounds like you?" visibly change the plan.

Deterministic: impeccable detect over 28 onboarding files: 0 findings (control file proved the scan runs on TSX). Live overlay on 8 pages: 2 true low-contrast findings, both coach textareas' placeholders (#85878e on #f4f4f5, 3.3:1; dictation.tsx:305). Axe at 390 and 320: no WCAG A/AA violations; landmark-one-main and region on all 8 pages (no main landmark).

## Priority Issues

- [P1] The endings contradict the choices just made: swim-only lands on "Add a gym to start training"; a skipped gym yields a plan Today cannot start; "Just track my workouts" leads Today with "Choose a programme". Fix: sport- and mode-aware empty states on Today; dots from the chosen sports. Command: /impeccable onboard, /impeccable harden.
- [P1] The plan step ignores what setup learned: one pre-chosen 6-lifting-day template for novice, veteran and swimmer; six exits, two identical; alternatives under the fold at 320 pt. Fix: one recommendation from the answers, at most two alternatives, a beginner template (new content), a week-of-prints preview, one "no programme" exit. Command: /impeccable onboard, /impeccable distill.
- [P1] Beginners are quizzed on equipment the workout already asks about. Fix: drop the step for new gym-goers (basics assumed), keep it optional for experienced lifters and for home/outdoors. Command: /impeccable distill.
- [P1] "Say it once" broken: name and username at sign-up and again; experience, location and running re-asked by the coach; two titles and two Backs. Fix: email + password (+ optional name) at sign-up; username deferred to Friends; coach prefilled from profile and gym. Command: /impeccable distill, /impeccable clarify.
- [P2] The programme sub-flows and sign-up are off-system (boxes, floating shadowed action card, dashed drop zone, sub-44 pt arrows, 291-option selects). Fix: rebuild in the onboarding frame. Command: /impeccable layout, /impeccable polish.
- [P2] Welcome buries the decisive question among five controls, with a free-text time zone and a stale error. Fix: one question as two large tiles; units and zone from the device as one line with Change. Command: /impeccable clarify.

## Persona Red Flags

Beginner (Bea): username rules before value; an error on a question she did not know was required; running pre-ticked; a four-paragraph "Which chest press?" quiz; "Start training" adopts six days; day one is Lower A, 70–90 min.
Experienced (Alex): re-types name and username and gets alex_mv2c0nzz; searches "pec deck" and finds only a rear delt machine; registers combination machines he may not own; 8+ screens of list; after "Just track", Today pushes "Choose a programme".
Accessibility-dependent (Sam): errors differ from hints by weight only, no mark on the control; no main landmark; 291-option native select; typing an IANA zone.
Swimmer: dots mark Gym and Machines completed; offered the lifting hybrid; Back after reload lands on the gym step; Today says "Add a gym".

## Minor Observations

Signup heading in a Card (DESIGN.md: never in a box); Welcome key orphans "Swimming" at 320 pt; straight apostrophe in "I'll train without a programme"; "What does Home have?"; revisited Gym step's primary is still Add gym; template card's chosen state is an outline; coach Review says "missing" six ways; drawings arrive after their tiles; machine ticks are lost on reload until Add.

## Questions to Consider

1. If the workout already asks about any machine with the same drawing, what does the machines step give a beginner?
2. What if setup drew the athlete's first print as they answered, ending on their own Day 1?
3. Why does a flow that asks "Which sounds like you?" end on the same pre-ticked plan for a novice, a powerlifter and a swimmer?
4. Does an account need a username before it has a friend?
5. For "I already train", is the best first programme the first logged workout?
