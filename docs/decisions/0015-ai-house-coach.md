# 0015 — The AI house coach runs as a routine on the owner's subscription

Status: accepted, 2026-09-10.

## Context

The owner wants the next session planned by a model from the last sessions, the programme, the
check-ins and recovery: exercises, machines, sets, reps, RIR, loads and warm-up, adjusted where
needed. Two constraints shaped the answer. No extra spend: the model must run on an existing
ChatGPT Pro or Claude Pro subscription, and neither includes API usage. And it must serve every
account, not only the owner's, without each friend setting anything up beyond a switch.

Claude Code routines run on a Pro plan, on a schedule and on demand through a per-routine HTTP
fire endpoint, in a cloud environment that can hold an API credential the session never sees.
That is enough to build the coach without an API key.

## Decisions

1. **One house routine plans for everyone.** A routine on the owner's account runs daily at
   04:00 and, when the app fires it, on demand. It clones this repository and follows the coach
   skill. Routines cannot be created for other accounts, so per-user routines would have meant
   per-user setup and token storage; one routine keeps onboarding to a switch in Settings.

2. **A service token, scoped by the athlete's own RLS.** The routine authenticates to
   `/api/coach/service` with one secret held by the server (`COACH_SERVICE_TOKEN`) and by the
   environment's API credential. It is not tied to an account: every request names an athlete,
   who must have `ai_coach_enabled`, and the read or write then runs inside `withUser` for that
   athlete. The service can never see across accounts, and the token can be rotated in two
   places.

3. **Each athlete is planned in a separate subagent.** The orchestrating session only lists who
   is due; a fresh subagent fetches one athlete's context into a file and writes the plan. One
   athlete's data is never in view while another's plan is written.

4. **Plans are rows against a slot and a gym, and are applied automatically.** `session_plans`
   holds exactly one active plan per (programme, cycle, day). It records the gym it chose
   machines for; starting the session at that gym consumes it, writing substitutions, drops and
   additions into the session's own rows and prefilling every set from the plan's targets under a
   `coach` suggestion kind. At another gym the rule takes over and Today offers a re-plan. A
   discarded empty session gives its plan back. Once a session has started it does not change.

5. **Structural validation only.** The server checks that every exercise is one the athlete can
   see, every machine stands at the chosen gym, every slot id belongs to the day, the slot is
   still pending and numbers are in range. It enforces no coaching rule. Judgement lives in the
   skill and in the athlete's memo, by the owner's explicit choice.

6. **A memo per athlete instead of rules.** `coach_memos` holds an overview the coach rewrites
   after every plan (profile, goals, constraints, progress, what to watch) and notes the athlete
   writes for the coach. Both are shown in Settings.

7. **Re-plans fire the routine from the app.** A request row is created, the routine's fire
   endpoint is called with the athlete, gym and request id in the payload, and Today polls until
   a plan lands or fifteen minutes pass. Three requests per athlete per day, because every one
   is a run on the owner's allowance.

8. **The time lives on the routine.** Vercel's free plan runs cron once a day with up to an
   hour of drift and cannot reschedule a routine, so the schedule is the routine's own, set in
   the owner's local time. Users cannot pick their own time; the owner can change it.

9. **The repository configures the run.** `.claude/settings.json` pins Opus 5 to high effort
   and installs dependencies in cloud sessions through a SessionStart hook. The routine's model
   is chosen on the routine itself.

## Consequences

- Migration `0008_coach_plans` adds `session_plans`, `coach_memos`, `coach_requests` and
  `profiles.ai_coach_enabled`. A deploy applies it.
- Three server variables: `COACH_SERVICE_TOKEN`, `COACH_ROUTINE_FIRE_URL`,
  `COACH_ROUTINE_FIRE_TOKEN`. Setup is in `docs/coach-automation.md`.
- Every athlete's plan runs on the owner's subscription and appears as a session on the
  owner's account. The Settings switch says so.
- The coach read API and its per-user tokens are unchanged and remain read-only.
- Deferred: programme-level changes through `program_change_proposals`, a ChatGPT custom GPT
  and a Claude connector for talking a plan over, and per-user plan times.
