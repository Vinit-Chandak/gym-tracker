# Personal Training Tracker — Product Requirements

## 1. Product Goal
Build an iPhone-friendly personal workout tracking web app/PWA that Vinit can use across multiple gyms to log strength training, hypertrophy work, running, recovery, symptoms, and progression. The app should be fast enough to use between sets, preserve exercise/machine context, and expose structured data that can later be reviewed by an AI coach/ChatGPT to recommend changes to sets, reps, loads, exercise selection, and running volume.

The app is not intended to be a generic social fitness network. It is a private, single-user-first training system optimized for decision-quality data and progressive training.

## 2. Primary User
- Name: Vinit
- Age: 28
- Height: 173 cm
- Recent measured body weight: ~59.5 kg (scanner measurement; body composition values are not trusted as ground truth)
- Primary priorities, in order:
  1. Strength
  2. Aesthetics / muscle mass
  3. Staying lean
  4. Marathon / running development
- Training availability: 5–6 days/week
- Typical gym session duration: ~60–90 minutes
- Combined run + gym day: ~2 hours, up to ~2h20
- iPhone user; prefers PWA/web app installable from Safari rather than App Store distribution

## 3. Key Product Principles
1. Gym logging must be extremely fast.
2. The app must remember the previous workout and previous set performance.
3. Machine-based exercises must be gym-aware because machines differ by location and stack numbers are not directly comparable.
4. Free-weight exercise history should remain globally comparable across gyms.
5. The app must track load, reps, RIR/RPE, rest, symptoms, and relevant recovery context.
6. Program changes should be versioned and explainable.
7. AI should analyze and propose adjustments; it should not silently rewrite programming without explicit approval.
8. Data belongs to the user and should be exportable.
9. Read-only AI access should be the default future integration mode.
10. Do not overbuild the first version. Prioritize workout logging and useful analytics.

## 4. Multi-Gym Requirement
Vinit trains at 2–3 gyms. Equipment differs by gym.

The app must have a gym selector at the start of every workout. A workout session is associated with exactly one gym/location, with the option for a special value such as `Outdoor` or `Home` for runs/mobility.

### Gym-aware exercise behavior
Exercises fall into three broad categories:

#### A. Portable / globally comparable
Examples:
- Barbell bench press
- High-bar squat
- Conventional deadlift
- Dumbbell press
- Dumbbell curls
- Pull-ups
- Bodyweight movements

For these, performance can be compared across gyms as long as the load units and movement standard are the same.

#### B. Machine-dependent
Examples:
- Leg press
- Lat pulldown
- Seated row
- Pec deck
- Reverse pec deck
- Leg extension
- Seated leg curl
- Cable machines

Machine weight stacks, leverage, pulley ratios, sled angles, and plate-loaded geometry differ. Therefore the app must treat a specific machine at a specific gym as an `equipment_instance` or `machine_profile`, not just as an exercise name.

For example:
- Exercise: `Leg Press`
- Gym: `Anytime Fitness - Company`
- Machine profile: `45° Slant Leg Press #1`
- Type: `plate_loaded_sled`
- Manufacturer/model: optional
- Notes: optional

Performance trends should default to comparison within the same machine profile. Cross-machine comparison can exist later but should be labeled approximate/non-equivalent.

#### C. Cable-station-dependent but somewhat portable
Cable stack numbers often differ because of pulley ratios. Treat cable exercises as gym/machine aware if the exact stack is being used for progression.

## 5. MVP Features

### Authentication
- Private account login
- Single-user-first architecture is acceptable, but schema should not block multiple users later

### Gym management
- Add/edit/archive gyms
- Gym name
- Optional address/notes
- Equipment inventory by gym
- Set default gym

### Equipment / machine profiles
- Add equipment profile to a gym
- Equipment category
- Manufacturer/model if known
- Plate-loaded vs selectorized
- Unit: kg / lb / plates / stack index
- Optional pulley ratio or notes
- Optional photo later
- Mark equipment active/inactive

### Exercise library
Exercise-level fields:
- Name
- Movement pattern
- Primary muscle groups
- Secondary muscle groups
- Exercise category: barbell / dumbbell / bodyweight / cable / machine / cardio / mobility
- Requires equipment? yes/no
- Default rep range
- Default rest period
- Default RIR target
- Form notes
- Video/form URL

### Exercise-to-equipment compatibility
A single exercise can have multiple usable equipment options.
Example:
- Calf raise → Smith machine OR leg press
- Row → seated cable row OR machine row
- Lateral raise → dumbbell OR cable

The program should be able to define preferred equipment and fallbacks by gym.

### Workout plan / program
- Program name
- Program version
- Start/end date
- Day templates
- Exercise order
- Sets
- Rep range
- RIR target
- Rest target
- Optional target load / progression notes
- Preferred gym equipment profile where relevant
- Fallback exercise/equipment options

### Workout session
At session start:
- Date/time
- Select gym
- Select planned training day or ad-hoc workout
- Optional body weight
- Sleep hours
- Energy 1–5
- General fatigue 1–5
- Lower-back symptom 0–10
- Shin symptom 0–10
- Optional notes

During workout:
- Exercise card
- Previous session at same machine/gym where relevant
- Target sets/reps/RIR
- Current set weight/reps/RIR
- Add/delete set
- Automatic rest timer
- PR indicator
- Easy navigation to next exercise
- Ability to substitute exercise/equipment while preserving reason

### Set logging
Per set:
- Weight
- Weight unit
- Reps
- RIR or RPE
- Set type: warm-up / working / back-off / drop / failure / AMRAP
- Equipment instance if applicable
- Notes optional
- Timestamp optional

### Running
For each run:
- Date/time
- Outdoor / treadmill
- Gym/location if treadmill
- Distance
- Duration
- Average pace calculated
- RPE
- Shin discomfort pre / during / post
- Surface optional
- Notes
- Later: import from Strava/Apple Health if desirable

### Recovery / symptom tracking
Minimal fields only:
- Sleep duration
- Sleep quality 1–5
- Energy 1–5
- General soreness 1–5
- Lower back 0–10
- Left shin 0–10
- Right shin 0–10

## 6. Progression Logic — MVP
Do not make AI mandatory for progression.

Implement deterministic recommendations first:

### Double progression
For an exercise with `3 x 6–10 @ 2 RIR`:
- If all working sets reach upper rep bound with RIR >= target and technique is marked acceptable → recommend smallest load increase next session.
- If reps remain inside target range → keep load.
- If first working sets fall below lower rep bound or RIR is much worse than target → recommend repeating or reducing load.

### Strength compounds
For squat / bench / deadlift / incline bench:
- Load increases are conservative.
- Never auto-recommend failure/grinders.
- Keep progression history visible.

### Recovery-aware warnings
Do not automatically alter program solely because of one bad day.
Show warnings such as:
- Sleep below 6 h
- Significant symptom increase
- Two consecutive performance regressions
- Run volume increased strongly week-over-week

## 7. Analytics
MVP analytics:
- Exercise performance history
- Weight × reps trend
- Estimated 1RM trend for suitable barbell lifts
- Weekly working sets by muscle group
- Workout adherence
- Training frequency
- Running weekly distance/time
- Running pace trend
- Symptom trend
- Sleep vs performance overlay later

Machine-dependent analytics must filter/group by equipment instance.
Do NOT mix stack numbers from different machines as if they are identical.

## 8. AI / Coach Integration
Future APIs should provide structured read access:
- GET /api/coach/summary
- GET /api/coach/workouts?from=&to=
- GET /api/coach/exercises/:id/history
- GET /api/coach/running?from=&to=
- GET /api/coach/recovery?from=&to=
- GET /api/coach/program/current

Eventually expose these through a secure ChatGPT/custom integration/plugin.

Default future permissions:
- Read-only
- User-authenticated
- No public workout URLs unless explicitly generated
- Program writes require approval and version creation

## 9. Recommended Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui optional
- Vercel hosting
- Supabase Postgres
- Supabase Auth
- Drizzle ORM or Supabase client; choose one consistent approach
- PWA support with manifest + service worker/offline shell
- Recharts or lightweight chart library
- Zod for validation

## 10. UX Priorities
Gym use must require minimal taps.

Exercise card should prominently show:
- Exercise name
- Current gym + machine profile if relevant
- Prescription: sets × rep range @ RIR
- Previous comparable workout
- Suggested load
- Current set controls
- Rest timer

Large tap targets suitable for an iPhone in the gym.
Dark mode preferred.
Avoid forms with many required text fields.

## 11. Non-Goals for V1
- Social feed
- Public profiles
- Leaderboards
- Complex nutrition tracking
- AI-generated meal plans
- Coach marketplace
- Full Apple Health integration
- Fully autonomous program rewriting
- Cross-machine normalization pretending different gym machines are equivalent

## 12. Definition of a Successful MVP
Vinit can:
1. Open the PWA on iPhone.
2. Choose a gym.
3. Start the planned session.
4. See the correct equipment available at that gym.
5. Log every working set in seconds.
6. See previous comparable performance.
7. Complete an easy run and record symptoms.
8. Review progress charts.
9. Export/query data in a structure suitable for AI review.
