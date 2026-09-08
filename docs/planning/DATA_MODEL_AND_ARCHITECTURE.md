# Data Model and Architecture

## 1. Recommended Architecture

Frontend / server:
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui optional
- PWA manifest + installable iPhone experience

Backend/data:
- Supabase Postgres
- Supabase Auth
- Server-side database access through Next.js route handlers/server actions
- Zod schemas for input validation

Hosting:
- Vercel

Charts:
- Recharts or another lightweight React chart library

## 2. Core Design Decision: Machines Are Location-Specific
A machine stack value is not universal.

`80 kg lat pulldown` on Precor at Gym A is not necessarily comparable with `80 kg lat pulldown` at Gym B because pulley ratios, lever arms, cable routing, stack calibration, and ROM differ.

Therefore:
- `exercise` describes the movement concept
- `gym` describes the location
- `equipment_instance` describes the exact machine/implement available at that gym
- `set_log` references an equipment instance where relevant

Free weights can use generic equipment such as `Barbell` or `Dumbbells`, optionally with gym context but global load comparison remains valid.

## 3. Suggested Tables

### users
- id uuid PK
- email
- display_name
- created_at

### gyms
- id uuid PK
- user_id FK
- name
- slug
- address optional
- notes optional
- is_default boolean
- is_active boolean
- created_at

Special virtual locations may include:
- Outdoor
- Home

### equipment_types
Canonical categories, e.g.:
- barbell
- dumbbell
- smith_machine
- cable_station
- selectorized_machine
- plate_loaded_machine
- bodyweight
- treadmill
- bike

Fields:
- id
- name
- category

### equipment_instances
Represents the specific item/machine at a gym.

Fields:
- id uuid PK
- user_id FK
- gym_id FK
- equipment_type_id FK
- name (e.g. `Precor Lat Pulldown #1`)
- manufacturer optional
- model optional
- resistance_mode: `free_weight | plate_loaded | selectorized | bodyweight | cardio`
- unit: `kg | lb | plate_count | stack_index | none`
- pulley_ratio optional numeric/text
- angle_degrees optional
- notes optional
- is_active boolean
- created_at

Examples:
- Gym A / Precor Seated Row / selectorized / kg
- Gym A / 45° Slant Leg Press / plate_loaded / kg
- Gym B / Matrix Lat Pulldown / selectorized / kg

### exercises
Canonical movements independent of a particular gym.

Fields:
- id uuid PK
- name
- slug
- category: `strength | hypertrophy | cardio | mobility`
- movement_pattern
- primary_muscles jsonb or relation
- secondary_muscles jsonb or relation
- load_portability: `global | equipment_specific | context_dependent`
- default_rep_min
- default_rep_max
- default_rir
- default_rest_seconds
- form_notes
- form_url
- is_active

Examples:
- Barbell Bench Press → global
- Pull-up → global
- Leg Press → equipment_specific
- Cable Lateral Raise → context_dependent/equipment_specific

### exercise_equipment_options
Many-to-many compatibility relation.

Fields:
- id
- exercise_id
- equipment_type_id optional
- equipment_instance_id optional
- preference_rank optional
- notes

Can support gym-specific fallback mappings.

### programs
- id
- user_id
- name
- version integer
- status: draft/active/archived
- start_date
- end_date optional
- notes
- created_at

### program_days
- id
- program_id
- day_index
- name
- focus
- recommended_gym_id optional

### program_exercises
- id
- program_day_id
- exercise_id
- order_index
- sets
- rep_min
- rep_max
- target_rir
- rest_seconds
- preferred_equipment_instance_id optional
- target_load optional
- progression_rule jsonb optional
- notes

### program_exercise_fallbacks
- id
- program_exercise_id
- gym_id optional
- fallback_exercise_id
- fallback_equipment_instance_id optional
- rank
- notes

Example:
If `Smith calf raise` unavailable at Gym B, use `leg press calf press` on Gym B's horizontal leg press.

### workout_sessions
- id
- user_id
- program_id nullable
- program_day_id nullable
- gym_id
- started_at
- completed_at
- body_weight optional
- sleep_hours optional
- sleep_quality optional 1–5
- energy optional 1–5
- fatigue optional 1–5
- soreness optional 1–5
- back_pain_pre optional 0–10
- shin_left_pre optional 0–10
- shin_right_pre optional 0–10
- notes

### workout_exercises
Represents an exercise actually performed in a session.

- id
- workout_session_id
- exercise_id
- equipment_instance_id nullable
- planned_program_exercise_id nullable
- order_index
- substitution_reason optional
- notes

### set_logs
- id
- workout_exercise_id
- set_index
- set_type: warmup/working/backoff/drop/amrap/failure
- weight numeric nullable
- unit
- reps integer nullable
- rir numeric nullable
- rpe numeric nullable
- duration_seconds nullable
- distance_meters nullable
- technique_rating optional 1–5
- completed_at
- notes

### runs
- id
- user_id
- workout_session_id nullable
- gym_id nullable
- mode: outdoor/treadmill
- started_at
- duration_seconds
- distance_meters
- average_pace_seconds_per_km generated/calculated
- rpe
- shin_left_pre
- shin_right_pre
- shin_left_during
- shin_right_during
- shin_left_post
- shin_right_post
- surface optional
- notes

### daily_recovery
Optional separate daily log when no workout occurs.
- id
- user_id
- date
- sleep_hours
- sleep_quality
- energy
- fatigue
- soreness
- back_pain
- shin_left
- shin_right
- notes

### program_change_proposals
For future AI/coach recommendations.
- id
- user_id
- program_id
- source: manual/ai/rule_engine
- status: proposed/approved/rejected/applied
- summary
- rationale
- patch jsonb
- created_at
- approved_at

### personal_records
Optional derived/cache table; can also compute dynamically.
- exercise_id
- equipment_instance_id nullable
- record_type
- value
- workout_exercise_id
- achieved_at

## 4. Comparable Performance Logic

### Global comparison
Use for:
- Barbell lifts
- Dumbbell lifts
- Pull-ups/bodyweight where standard is stable

Filter by exercise only, possibly bodyweight context for pull-ups.

### Equipment-specific comparison
Use for:
- Selectorized machines
- Cable stacks
- Plate-loaded lever machines
- Leg presses

Filter by:
- exercise_id
- equipment_instance_id

The UI should show:
`Previous on this machine`
not merely `Previous workout`.

### Approximate cross-machine view
Optional future feature only.
Could show reps/RIR trends separately per machine, but should avoid pretending 70 kg on one machine equals 70 kg on another.

## 5. Suggested API Surface

### App APIs
- GET /api/gyms
- POST /api/gyms
- GET /api/gyms/:id/equipment
- POST /api/equipment
- GET /api/exercises
- GET /api/program/current
- POST /api/workouts
- POST /api/workouts/:id/exercises
- POST /api/workouts/:id/sets
- PATCH /api/sets/:id
- POST /api/runs

### Coach/read APIs
- GET /api/coach/summary?from=&to=
- GET /api/coach/workouts?from=&to=
- GET /api/coach/exercise/:exerciseId/history?equipmentInstanceId=
- GET /api/coach/recovery?from=&to=
- GET /api/coach/running?from=&to=
- GET /api/coach/program/current

Return JSON optimized for analysis, not UI rendering.

## 6. PWA / iPhone Requirements
- Mobile-first layout
- `viewport-fit=cover`
- Safe-area handling for iPhone notch/home indicator
- App manifest
- Home-screen icon placeholders
- Standalone display mode
- Dark mode
- Large controls usable with sweaty hands
- Rest timer that survives page navigation
- Optimistic set logging
- Offline-tolerant queue later; MVP can require connectivity if necessary

## 7. Security
- Supabase RLS on every user-owned table
- Never expose service-role key in browser
- Use server-side routes for privileged operations
- Coach/API access tokens should be revocable
- Read-only scopes by default
- No public workout data unless user explicitly creates a share link

## 8. Seed Data Needed
Seed the current training plan from the companion spreadsheet and training context file.

Seed gym examples as placeholders only, not authoritative names unless user enters them:
- Gym A / Company Anytime Fitness
- Gym B
- Gym C
- Outdoor

Seed known Gym A equipment:
- Smith machine
- Cable station
- Assisted pull-up
- Seated leg curl
- Pec/reverse pec deck
- 45° slant leg press
- Horizontal leg press

Known absent Gym A equipment:
- Dedicated hip-thrust/glute-drive machine
- Dedicated calf machine

## 9. Analytics Queries Worth Supporting Early
- Last comparable performance for an exercise + machine
- Best estimated 1RM for bench/squat/deadlift over time
- Weekly working sets by muscle group
- Weekly run distance/time
- Average RIR trend
- Number of missed/under-target sets
- Symptom vs run-volume trend
- Sleep hours vs compound performance
- Adherence to program days

## 10. Design Rule
When in doubt, preserve raw data. Derived metrics can be recomputed later.
Do not destroy machine identity, gym identity, original units, or the exact logged RIR/reps/load.
