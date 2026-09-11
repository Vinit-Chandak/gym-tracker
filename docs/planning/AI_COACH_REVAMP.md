# Application and industry review: AI coaching

This records the application audit and relevant industry patterns reviewed on September 11, 2026. The follow-up [implementation plan](AI_COACH_IMPLEMENTATION_PLAN.md) is the authoritative handoff for the next session; its [scientific-policy appendix](AI_COACH_SCIENCE.md) records evidence and limitations.

The original recommendations have been consolidated into that plan following the user's decisions: personalized onboarding, daily 04:00 session preparation, one weekly program review, optional preparation before training at another gym, frozen active sessions, and continued use of the owner's Claude setup. Manual program authoring and programless tracking remain complete supported paths.

## Current behavior

The existing implementation has useful foundations, but program creation, daily coaching, and logging are different capabilities today.

| Area               | What the application currently does                                                                                                                                                                  | Implication                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding         | Collects profile details, a first gym, equipment, and a program selection. Profile details include a goal, body weight, height, date of birth, units, and time zone. The later steps can be skipped. | There is no structured intake for training experience, realistic frequency, session duration, preferences, or current lifting baselines.      |
| Templates          | Offers one eight-week Strength + Aesthetics Hybrid blueprint with six training days and a mobility day.                                                                                              | Different starting loads do not make the same frequency, priorities, and exercise structure suitable for everyone.                            |
| Initial AI program | The coach context returns `no_programme` without an active program. Its service API can store session plans and change proposals, but cannot create an initial program.                              | Switching the coach on cannot bootstrap a new athlete's plan.                                                                                 |
| Overnight coaching | An externally scheduled Claude Code routine lists enabled athletes and plans their earliest pending training slot at a default location.                                                             | The documented 04:00 schedule belongs to the owner's routine. It is not an app scheduler operating at 04:00 in each athlete's time zone.      |
| Upcoming session   | A stored plan can supply exercises, substitutions, machines, warm-ups, sets, reps, loads, RIR, and running targets.                                                                                  | This changes one upcoming session within an existing program; it does not rebuild the entire program every morning.                           |
| Program changes    | The coach proposes an exercise or run patch. The athlete applies it in Settings, creating a new version and carrying over progress and slot lineage.                                                 | Versioning exists. Changing the number or arrangement of training days is outside the current patch contract.                                 |
| Gym changes        | Today's gym picker changes the persistent default gym. Asking the coach to re-plan is a separate action.                                                                                             | A one-session location choice and a permanent preference are currently conflated. A plan for another gym is not used for the lifting session. |
| Check-in           | Starting creates the session and consumes its coach plan before the optional recovery check-in. Check-in produces advice and a manual hold-loads option.                                             | Today's check-in does not automatically regenerate that session. This was previously an explicit product choice.                              |
| Feedback           | Completing a workout records its results and program progress. Saving a check-in, changing notes, or completing a workout does not fire the routine.                                                 | The coach learns at its next scheduled run or an explicit re-plan, rather than immediately after each change.                                 |
| Ad hoc workouts    | Users can start an empty workout at an active location, add exercises, log sets, and finish without program references.                                                                              | Free logging already exists and feeds the normal history and analytics.                                                                       |
| Manual programs    | The UI can adopt the template, view a program, and approve coach proposals. There is no program authoring screen or save-workout-as-routine action.                                                  | Manual creation needs a UI and authenticated write flow, although the blueprint writer can already materialize programs.                      |

Repository evidence: [onboarding program step](<../../src/app/(onboarding)/welcome/programme/page.tsx>), [profile fields](../../src/components/profile-fields.tsx), [templates](../../src/db/seed/data/templates.ts), [program actions](../../src/server/actions/programs.ts), [coach service](../../src/server/coach-service.ts), [planning context and due selection](../../src/server/repositories/coach-plans.ts), [session actions](../../src/server/actions/sessions.ts), [program revisions](../../src/server/repositories/program-revisions.ts), and [gym selection](<../../src/app/(app)/today/gym-switcher.tsx>).

The ad hoc path creates a normal `workout_sessions` row with nullable program fields. History joins program days optionally, and analytics includes completed workouts independently of program membership. An ad hoc workout therefore needs no hidden program. It also does not automatically complete a scheduled program slot. [Workout schema](../../src/db/schema/workouts.ts), [session repository](../../src/server/repositories/sessions.ts), [training data](../../src/server/repositories/training-data.ts), [analytics](../../src/domain/analytics.ts).

## Gaps to address before expanding coaching

### Running payload transport

The service's `planBodySchema` omits `run`. Zod removes that unknown property before `storePlan` receives the payload. A mixed lifting-and-running payload can return success while storing `run: null`; a payload containing only running is rejected after its run disappears. The domain schema and submission script do support running, so their validation does not catch this transport mismatch.

Both outcomes were reproduced through the actual service handler against an isolated database. The fix needs an endpoint-level regression test that submits and reads back the entire plan. [Service envelope](../../src/server/coach-service.ts#L56), [domain contract](../../src/domain/session-plan.ts), [submission script](../../scripts/coach/submit.ts).

### Incomplete history presented as four weeks

`planningContext` fetches workouts from approximately the last fourteen days, capped at forty records, then constructs four weekly lifting-volume buckets from those records. A completed workout twenty-one days ago contributes to the normal four-week volume query but contributes zero to the coach's summary. This was reproduced with one logged working set.

Fetch the complete requested aggregation window separately from the short narrative history. Return coverage dates and truncation explicitly. Distinguish a partial current week from a complete previous week. The coach's helper also counts sets from unfinished sessions, whereas the main volume query uses completed sessions; report current-session workload separately so these measures have clear meanings. [Context and volume helper](../../src/server/repositories/coach-plans.ts#L397), [main volume query](../../src/server/repositories/muscle-volume.ts).

### Personal assumptions in shared instructions

The house-coach skill contains universal wording about strength taking priority over running, excluding weighted hyperextensions, and specific back and shin symptoms. The original training-context document explains their personal origin. New athletes should have their own priorities, exercise restrictions, and symptom locations.

Retain general coaching principles, move personal constraints into the corresponding athlete's confirmed profile, and avoid passing founder-specific planning documents into unrelated athletes' coaching context. Generalize symptom collection beyond the lower back and shins. Do not carry the blanket claim that lifting is unaffected by shin pain into a general-purpose coach. [Coach instructions](../../.claude/skills/coach/SKILL.md#L157), [original context](TRAINING_CONTEXT.md), [recovery rules](../../src/domain/recovery.ts).

### Contracts and stale results

The server verifies several ownership and reference constraints, but the checks are narrower than the coaching contract describes. For example, verifying that a machine exists at a gym does not verify that it supports the specified movement; numerical bounds alone do not ensure the correct reps, duration, or distance measure. The writer detects duplicate slot IDs but does not require every prescribed slot to be explicitly kept, substituted, or dropped.

A job also needs to identify the exact program version, target occurrence, gym, and input revision it planned. Current submissions identify a cycle/day and resolve the active program at write time. Request association does not prove that the result answers the newest still-valid request. Two gym requests that finish out of order can replace each other's plans. Introduce explicit stale-result rejection and transactional acceptance before generating plans automatically from more events. [Plan writer](../../src/server/repositories/coach-plans.ts#L980).

### Job state and program context

Requests older than fifteen minutes stop appearing as pending, but this read does not persist a failed state. The separate failure query ignores rows still marked requested. A timeout can therefore disappear from the waiting UI without becoming an actionable failure. The due-user scan also has a fixed five-hundred-account limit and no pagination or freshness test.

The supplied `programme` context is mostly metadata, with detailed prescriptions for the next day. Full-program generation and review need the whole blueprint, pending and completed parts, prior proposals including rejections, and applicable preferences across training locations. The instruction to avoid repeating a rejected proposal needs those decisions in the context. [Request state](../../src/server/repositories/coach-plans.ts#L1405), [due selection](../../src/server/repositories/coach-plans.ts#L160), [program context](../../src/server/repositories/coach-plans.ts#L733).

## Relevant industry patterns

These are documented product patterns, not independent evidence that a particular commercial algorithm produces better training outcomes.

| Product or source | Documented pattern                                                                                                                                                                           | Recommendation for this app                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Fitbod            | Onboarding asks about experience, goals, and equipment. Gym profiles hold location-specific preferences, while session modifications can temporarily change duration or equipment. [^1] [^2] | Combine a durable athlete profile with temporary session constraints.                                      |
| Hevy              | Supports empty workouts, reusable routines, and copying a past workout; completed workouts can also become routines. [^3] [^4]                                                               | Make manual planning and free logging complete experiences. Saving a routine should be an explicit action. |
| RP Hypertrophy    | Uses performance and subjective feedback to adjust later weight, reps, and set volume; users can override prescriptions. [^5]                                                                | Close the feedback loop and distinguish effort, recovery, and lack of time.                                |
| Freeletics        | Offers an Adapt Session action for temporary constraints such as time, equipment, and body areas. The adaptation can apply to one day. [^6]                                                  | Put practical adaptation controls next to Start workout.                                                   |
| ACSM              | Its 2026 guidance for healthy adults emphasizes consistency and individualization around goals, enjoyment, and sustainable participation. [^7]                                               | Optimize for a plan people can follow; avoid unnecessary daily changes to the entire program.              |

The product opportunity is to combine these ideas with this app's existing machine-specific history. Personalization should be evident in the chosen schedule, achievable session duration, preferred exercises, equipment availability, and explanation of changes.

## Implementation handoff

See the [implementation plan](AI_COACH_IMPLEMENTATION_PLAN.md) for the onboarding questions, accepted coaching cadence and authority, task contracts, minimal context, data changes, performance requirements, delivery phases, and release checks. Timing and local-versus-cloud execution questions remain explicit decisions there; they were not resolved by inspecting a deployment.

The planning phase does not introduce automatic routine calls after workout completion or readiness updates, coaching during an active workout, or a separately billed model integration. The routine API's lack of idempotency and account-level limits require application-side request tracking and bounded retries. Cloud routines and local Desktop tasks have different availability and dispatch requirements. [^8] [^9]

## Evidence scope and validation

Application findings refer to `main` at commit `d9075a6cd672a6391b451fcdba1705896e31fcde`, fetched for this review on September 11, 2026. The branch is `codex/ai-first-coaching`. The review covered onboarding and profile validation, program schemas and materialization, scheduling, session logging, equipment resolution, comparable history, recovery and analytics, the coach's instructions and scripts, service endpoints, and relevant interface entry points.

Nine existing test files passed, containing 101 tests: coach plans, program revisions, program materialization, sessions, analytics/export coaching, session-plan validation, program-blueprint validation, program patches, and comparable-history rules. Three additional temporary isolated checks reproduced the two running-transport outcomes and the missing older lifting volume. Those checks confirmed defects; they were not acceptance tests demonstrating correct behavior and were removed after the audit. No production data was used.

The deployed routine's enabled state, actual schedule, current subscription allowance, and production latency were not verified. The 04:00 and minutes-long descriptions come from repository documentation and code. The public sources below establish documented product behavior and provider constraints; this is a focused comparison of relevant industry patterns rather than an exhaustive market census or a clinical validation of the proposed coach.

## Sources

[^1]: Fitbod Help Center. [Getting Started with Fitbod: A New User's Guide](https://help.fitbod.me/hc/en-us/articles/30721771750039-Getting-Started-with-Fitbod-A-New-User-s-Guide). Updated April 16, 2026; accessed September 11, 2026. Used for onboarding inputs, customization, and learning from logged performance.

[^2]: Fitbod. [Get the Most Out of Your Gym Profile: Personalize Your Experience](https://fitbod.me/blog/your-gym-profile/). February 6, 2026; accessed September 11, 2026. Used for persistent gym preferences and temporary session modifications.

[^3]: Hevy Help Centre. [How to Log a Workout in the Hevy App](https://help.hevyapp.com/hc/en-us/articles/35361530647959-How-to-Log-a-Workout-in-the-Hevy-App-Step-by-Step-Guide). Accessed September 11, 2026. Used for empty workouts, routines, and repeating past workouts.

[^4]: Hevy. [How to Create Folders and Gym Routines](https://www.hevyapp.com/features/gym-routines/). Accessed September 11, 2026. Used for saving completed workouts as reusable routines.

[^5]: RP Help Center. [How does the app determine when to add weight, reps, and sets?](https://help.rpstrength.com/hc/en-us/articles/32600173777815-How-does-the-app-determine-when-to-add-weight-reps-and-sets). June 5, 2025; accessed September 11, 2026. Used for the documented performance and subjective-feedback loop, not as independent efficacy evidence.

[^6]: Freeletics, Ellie. [Adapt Today](https://www.freeletics.com/en/blog/posts/quick-adapt/). Page displays a relative publication date; accessed September 11, 2026. Used for temporary session adaptations based on time, equipment, and body areas.

[^7]: American College of Sports Medicine. [ACSM Unveils Landmark 2026 Resistance Training Guidelines](https://acsm.org/resistance-training-guidelines-update-2026/). March 17, 2026; accessed September 11, 2026. Official summary of the position stand for healthy adults; used for consistency and individualization principles, not injury-specific prescriptions.

[^8]: Anthropic, Claude Platform Docs. [Trigger a routine through the API](https://platform.claude.com/docs/en/api/claude-code/routines-fire). Living documentation, accessed September 11, 2026. Used for lack of provider idempotency, account-level allowances, and quota failures.

[^9]: Anthropic, Claude Code Docs. [Automate work with routines](https://code.claude.com/docs/en/routines). Living documentation, accessed September 11, 2026. Used for supported triggers, scheduling, preview status, and subscription usage.
