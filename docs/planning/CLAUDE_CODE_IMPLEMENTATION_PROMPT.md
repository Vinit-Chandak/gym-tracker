# Claude Code Implementation Prompt

You are implementing a private, iPhone-first personal training tracker in an existing empty Git repository.

Read these repository files first and treat them as source-of-truth requirements:
- `PRODUCT_REQUIREMENTS.md`
- `TRAINING_CONTEXT.md`
- `DATA_MODEL_AND_ARCHITECTURE.md`
- `vinit_final_8_week_strength_aesthetics_hybrid.xlsx`

Do not start by generating the entire application in one uncontrolled pass. Work in explicit phases, keep the repository buildable after every phase, and make sensible commits/checkpoints.

## Product Summary
Build a PWA workout tracker for a single primary user who trains at multiple gyms. Different gyms have different machines, and machine stack/load values are not necessarily comparable. The core domain model must therefore distinguish:

`exercise` — canonical movement
`gym` — physical location
`equipment_instance` — exact machine/implement at a gym
`workout_session` — one training session at one gym
`workout_exercise` — exercise performed in that session
`set_log` — individual set performance

Free-weight lifts are globally comparable; machine/cable lifts should normally be compared only on the same equipment instance.

## Preferred Stack
Use:
- Next.js latest stable with App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui if helpful, but do not over-depend on it
- Supabase Postgres + Supabase Auth
- Zod for validation
- Vercel-compatible architecture
- Recharts for simple analytics
- PWA manifest / installable iPhone experience

Use a clean and conventional project structure. Avoid unnecessary abstractions.

## Phase 0 — Repository Foundation
1. Initialize Next.js app in the current repo.
2. Add TypeScript strict configuration.
3. Add Tailwind.
4. Add lint/format scripts.
5. Add `.env.example` with Supabase variables only; never commit secrets.
6. Add README with local setup instructions.
7. Add basic PWA manifest and mobile viewport/safe-area support.
8. Build a dark mobile-first shell with bottom navigation:
   - Today
   - History
   - Progress
   - Gyms
   - Settings

Acceptance criteria:
- `npm run build` succeeds.
- App renders well at iPhone-sized viewport.
- No Supabase dependency required just to render the shell.

## Phase 1 — Database Schema + Supabase
Implement migrations/schema for at least:
- users/profile
- gyms
- equipment_types
- equipment_instances
- exercises
- exercise_equipment_options
- programs
- program_days
- program_exercises
- program_exercise_fallbacks
- workout_sessions
- workout_exercises
- set_logs
- runs
- daily_recovery
- program_change_proposals

Use UUID PKs, timestamps, useful indexes, and RLS policies scoped to authenticated user.

Important constraints:
- `equipment_instance.gym_id` is required for physical machines.
- Machine-based set logs must preserve `equipment_instance_id` through the workout exercise.
- Never collapse different machines into one global weight history.
- Preserve raw weight/unit/reps/RIR values.

Create seed scripts for:
- canonical exercises from the provided 8-week plan
- one placeholder gym representing the company Anytime Fitness
- known equipment at that gym
- the current 8-week program structure

Do not hardcode secrets.

Acceptance criteria:
- Fresh database can be migrated and seeded.
- Seeded program contains all current training days/exercises.

## Phase 2 — Gym + Equipment Management
Build a mobile UI for:
- gym list
- create/edit/archive gym
- set default gym
- view equipment at gym
- add/edit/archive equipment instance

Equipment form fields:
- display name
- equipment type
- manufacturer/model optional
- resistance mode
- unit
- optional angle/pulley ratio/notes

UX requirement:
The user trains at 2–3 gyms, so changing/selecting gym must be obvious and fast.

## Phase 3 — Exercise Library + Gym Compatibility
Build exercise library pages.

Each exercise should show:
- name
- category
- muscles
- default rep range
- RIR
- rest time
- load portability
- form link

Implement equipment compatibility/fallbacks.
Example:
- calf raise can use Smith machine or leg press
- reverse pec deck uses a pec deck configured in reverse mode

For each gym, display whether planned exercises are:
- directly available
- available with fallback
- unavailable

## Phase 4 — Today's Workout / Logging UX
This is the highest-priority UX.

Flow:
1. User opens Today.
2. Chooses gym (default preselected).
3. Chooses planned day or starts ad hoc session.
4. Records optional pre-session recovery:
   - sleep hours
   - sleep quality
   - energy
   - fatigue
   - lower-back symptom
   - left/right shin symptom
5. App resolves preferred/fallback equipment for that gym.
6. Exercise cards show prescription and previous comparable performance.
7. User logs sets quickly.

Exercise card must prominently show:
- exercise
- equipment/machine name if applicable
- target sets × rep range @ RIR
- rest target
- previous comparable session
- suggested starting load
- set rows with weight/reps/RIR
- add set
- complete exercise

For machines, previous comparable performance means same exercise + same equipment instance.
For global/free-weight movements, compare by exercise.

Implement a persistent rest timer.
Use large iPhone-friendly controls.
Optimize for minimal keyboard typing.

## Phase 5 — Deterministic Progression Engine
Implement rule-based recommendations before any AI.

For rep-range exercises:
- If all working sets hit top of rep range and achieved RIR is at or easier than target, suggest smallest configured load increase.
- If performance remains in range, hold load.
- If the user falls below minimum reps or RIR becomes significantly worse, suggest repeat or reduce.

Strength compounds:
- Conservative increments
- No automatic failure recommendations
- Respect current program-specific progression notes

Add warnings, not automatic program mutations, when:
- sleep < 6 h
- symptoms materially increase
- two comparable sessions regress
- run volume spikes

The program itself must only change through a versioned proposal/approval flow.

## Phase 6 — Running
Build run logging:
- outdoor/treadmill
- distance
- duration
- computed average pace
- RPE
- left/right shin pre/during/post
- notes

Seed the 8-week easy-running progression from the program workbook.

Add weekly run-volume summary.
Do not add marathon complexity yet.

## Phase 7 — History + Analytics
Implement:
- workout history
- exercise history
- machine-specific history filters
- estimated 1RM trends for bench/squat/deadlift
- weekly working sets by muscle group
- run distance/time trends
- symptom trends
- adherence

Critical rule:
Do not chart selectorized machine weight from different equipment instances as one continuous comparable load series unless the chart explicitly separates each machine.

## Phase 8 — Coach Read API
Implement authenticated read-only JSON endpoints suitable for future ChatGPT/AI access:
- `/api/coach/summary`
- `/api/coach/workouts`
- `/api/coach/exercises/[id]/history`
- `/api/coach/running`
- `/api/coach/recovery`
- `/api/coach/program/current`

Support date-range parameters.
Return compact, analysis-friendly JSON.
Do not expose private data publicly.

Add documentation for how a future external AI client could receive a scoped read token.
Do not implement autonomous AI program writes yet.

## Phase 9 — PWA Polish
- manifest/icons placeholders
- standalone mode
- safe-area padding
- good dark mode
- install instructions for iPhone Safari
- loading/error states
- optimistic set saves
- basic offline-friendly handling if straightforward

## Engineering Standards
- Keep domain types explicit.
- Use server-side validation.
- Use RLS.
- No Supabase service-role key in client bundle.
- No `any` unless truly unavoidable.
- Use small reusable components.
- Add tests for progression rules and comparable-history selection.
- Run lint/typecheck/build before finishing each phase.
- Document architectural decisions in `docs/decisions/` if you make a non-obvious choice.

## Important Domain Tests
Add tests for at least:
1. 80 kg lat pulldown on Machine A is NOT used as prior comparable load for Machine B.
2. Barbell bench history remains comparable across Gym A and Gym B.
3. Gym-specific fallback equipment resolves correctly.
4. Double progression recommends load increase only after all target criteria are met.
5. A program edit creates a new version/proposal rather than mutating historical prescription silently.
6. Run pace calculation is correct.
7. Workout history preserves the gym used at the time.

## Initial Visual Direction
Private premium utility app, not social media.
- dark charcoal background
- high contrast
- restrained accent color
- card-based workout UI
- large numeric controls
- minimal text entry
- one-handed iPhone use

## Before Coding
First output a concise implementation plan containing:
- directory structure
- schema/migration strategy
- auth strategy
- exact phases you will implement
- any requirement conflicts/questions

Only ask questions that genuinely block implementation. If a detail is unspecified but safe to make configurable, make it configurable instead of blocking.

Then implement Phase 0 and Phase 1 only.
Stop after Phase 1, summarize what changed, list commands to run, and wait for approval before continuing to Phase 2.
