# Training Context for Personal Workout Tracker

This file captures the training context established in the planning conversation. It exists so an implementation agent can seed realistic program data and understand why certain fields/features matter.

## User and Goal
- Age: 28
- Height: 173 cm
- Recent weight measurement: ~59.5 kg
- Goal: build significantly more muscle and strength while remaining lean, athletic, and aesthetic rather than bulky
- Priority order:
  1. Strength
  2. Aesthetics / muscle mass
  3. Staying lean
  4. Marathon / running development
- Can train 5–6 days/week
- Normal gym session: ~1–1.5 hours
- Combined running + gym day: ~2 hours, sometimes up to ~2h20

## Body Composition Scanner
An Evolt 360 BIA scan was provided. It should NOT be treated as ground truth for body composition or nutrition prescriptions. The user specifically does not trust its body-fat/muscle estimates or its ~198–206 g/day protein recommendation. The scan can be treated only as a rough dated measurement reference.

Useful stable measurements from the scan:
- Date: 26 Jul 2026
- Height: 173 cm
- Weight: 59.5 kg

## Current Strength / Performance Anchors
These are user-reported gym performance values and should be treated as approximate baselines, not strict maxes.

### Chest / Pressing
- Barbell bench press: 70 kg × 2 clean reps
- Incline barbell bench: ~60–62 kg × 4
- Incline dumbbell press: 25 kg DBs × 12; ~30 kg DBs × 4
- Seated DB shoulder press: ~20 kg DBs × 8–10
- DB lateral raise: ~10 kg × 8–12, though strict higher-rep work may require lighter weight

### Pulling
- Pull-ups: ~14 reps first set, then ~8, then ~6, full extension, controlled
- Lat pulldown: machine-dependent; on one Precor machine ~80 kg
- Seated row: machine-dependent; roughly ~68–76 kg for 8–12 on one machine

### Arms
- Preacher curl: around 30 kg bar/implementation for ~9–10 reps depending on setup
- Hammer curl: ~15 kg DBs × 10
- Triceps: overhead cable extensions, single-arm overhead extension, pushdowns, single-arm pushdowns, occasional close-grip bench
- Forearms are a development priority

### Legs
- High-bar free-bar squat: 70 kg × 5
- Conventional deadlift: 110 kg × 3
- Slant/45° leg press: ~180 kg × 6–9 with decent ROM on one machine
- Leg extension: ~78–84 kg × 7–10 on one machine
- Seated/lying leg curl equivalent: ~55–60 kg × 8–10 on one machine
- DB Romanian deadlift history: 17.5–22.5 kg DBs × 8–10
- Calf raises: typically lighter load, more reps
- Hip abduction/adduction machines used

### Core
- Cable crunch: roughly 54–59 kg × 8–12 on one Precor cable system

## Exercises Commonly Used

### Chest
- Bench press
- Incline bench press
- Incline dumbbell press
- Pec deck / chest fly

### Biceps
- Cable curls / bench-supported cable curls
- Preacher curls
- Hammer curls
- Incline dumbbell curls

### Triceps
- Overhead triceps extension
- Single-arm overhead triceps extension
- Triceps pushdown
- Single-arm pushdown
- Occasional close-grip bench press

### Back
- Pull-ups
- Lat pulldown
- Seated row
- Chest-supported row when available
- Hyperextensions historically, but these trigger transient low-back pain afterward and should currently be excluded

### Legs
- High-bar squat
- Leg press
- Leg extension
- Leg curl
- Hip abductors / adductors
- RDLs
- Calf raises

### Shoulders
- Shoulder press
- DB lateral raise
- Cable lateral raise
- Face pulls
- Reverse pec deck / rear delt fly

### Core
- Cable crunches
- Side plank / trunk-control work can be included

## Current Pain / Symptom Context

### Shin
- Improved compared with earlier period
- Bilateral
- Diffuse over several centimeters rather than a pinpoint spot
- Often more toward the sides
- Associated with running / after running
- Does not normally hurt during ordinary walking/rest
- Should be tracked separately left/right in the app

Escalation warning for product logic: if pain becomes pinpoint, progressively worse, present while walking/resting, or consistently increasing during runs, the app should flag that progression should stop and assessment should be considered.

### Lower back
- Central/lateral lower back just above glutes
- Mainly happens after weighted hyperextensions/hip extensions
- Typically lasts ~15–20 minutes and resolves
- No major pain during standard lifting was reported
- No reported radiation/numbness/tingling in the planning conversation
- Weighted hyperextensions should be omitted from the current program
- RDL/deadlift/trunk-control work should be logged with symptom context

## Sleep / Recovery
- Average sleep: ~5.5–6 hours/night
- Sleep continuity/quality is reportedly decent (falls asleep easily, usually does not wake repeatedly)
- Duration is insufficient relative to training goals and should be treated as a recovery constraint
- Sleep tracking is therefore valuable for analytics and adjustment decisions

## Running Baseline
Recent running has been inconsistent, but the user has previous 3K/5K experience.

Reported examples:
- Can comfortably run ~25–30 min around ~6:37/km under good conditions
- Has done 5K runs, one around 42 min
- Has done 3K runs around ~6:30/km
- Has done ~2.2 km around ~5:30/km at stronger effort
- Screenshot history showed best-effort entries including approximately 1K 5:16, 1 mile 8:37, 5K 37:23, but these were described as effort/pushing stats rather than stable easy pace
- Recent couple of runs around ~1 km and ~2.2 km

The initial program should rebuild consistent easy running rather than assume marathon-training readiness.

## Current 8-Week Program Structure
The generated plan uses:

- Monday: Lower A — squat strength + quad focus
- Tuesday: Upper A — bench strength + back
- Wednesday: Easy run + arms/forearms
- Thursday: Lower B — deadlift + posterior chain + unilateral legs
- Friday: Upper B — pull-up strength + incline/chest/shoulders
- Saturday: Easy run + light upper accessories/core
- Sunday: Rest + mobility

The exact spreadsheet is provided separately as `vinit_final_8_week_strength_aesthetics_hybrid.xlsx`.

## Current Programming Philosophy
- Strength compounds use lower/moderate rep ranges and stay shy of failure
- Accessories typically use moderate/higher reps
- RIR is preferred over simplistic muscle-fiber-based rep prescriptions
- Use double progression on most accessories
- Use conservative load increases on squat/bench/deadlift
- Do not compare machine stack weights across different machines as though equivalent
- Two easy runs/week initially
- Avoid speed work until consistent running tolerance is rebuilt
- Program changes should be based on trend, not one bad workout

## Warm-up Philosophy
Pre-session warm-up should be:
1. Short general movement
2. Dynamic mobility relevant to session
3. Exercise-specific ramp-up sets

Long static stretching is better placed after training or separately rather than being the main pre-performance strategy.

Lower-body warm-up examples:
- Easy bike/treadmill 4–5 min
- 90/90 hip switches
- Adductor rock-backs
- Glute bridge
- Bodyweight squats
- Ramp sets for first compound

Upper-body warm-up examples:
- Easy cardio 3–5 min
- Arm circles / controlled shoulder rotations
- Light cable row or face pull
- Ramp sets for first compound

Running warm-up examples:
- Walk → easy jog
- Ankle rocks
- Leg swings
- Walking lunges
- Calf raises

## Gym / Equipment Facts
The user trains at multiple gyms and equipment varies.

Confirmed available at at least one gym:
- Smith machine
- Cable station
- Assisted pull-up machine
- Seated leg curl
- Pec deck that can be configured as reverse pec deck
- Slant / 45° leg press
- Horizontal leg press

Not available at that gym:
- Dedicated hip-thrust/glute-drive machine
- Dedicated calf machine

This is the central reason the app must model `gym + equipment instance + exercise` rather than only exercise names.
