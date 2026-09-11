# The AI house coach

Every morning at four, a coach plans the next training day of everyone who switched it on:
the exercises and machines for the gym they train at, the sets, reps, RIR and loads, a warm-up,
the run when the day runs, and one line per exercise saying why. Today shows the plan, and
starting the session uses it; the run screen opens prefilled with what the coach asked for.
From Today, anyone can also ask for a fresh plan at another gym. When the same problem keeps
coming back, the coach proposes a change to the programme itself, which the athlete approves or
rejects in Settings. Nothing else in the app changes: without a plan, the deterministic
progression rule sets the targets as it always has.

The coach runs on the app owner's Claude subscription, as a
[Claude Code routine](https://code.claude.com/docs/en/routines). No API key and no per-user
cost are involved. This page explains how the pieces fit and how to set them up once.

## How it fits together

| Piece                  | Where                                                     | Role                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Coach service API      | `/api/coach/service/…`, `src/server/coach-service.ts`     | What the routine reads and writes. One service token; every request names an athlete who has the coach on, and runs under that athlete's RLS.                                                                                                                                                                                                                                                                |
| Plans, memos, attempts | `session_plans`, `coach_memos`, `coach_requests`          | A plan waits for one programme slot at one gym, and carries the run when the day runs. The slot's two halves — the session and the run — are completed separately, so a plan for a day that does both is answered by a finished workout _and_ a logged run. The memo is what the coach knows about an athlete. Every attempt — a re-plan asked from Today, and each night's run — lands in `coach_requests`. |
| Programme proposals    | `program_change_proposals`, `src/domain/program-patch.ts` | A change to the programme itself, as a patch against slot lineage. Approving one writes the next programme version; nothing is edited in place.                                                                                                                                                                                                                                                              |
| The routine            | claude.ai/code/routines, on the owner's account           | Runs nightly, and on demand when the app fires it. Clones this repository and follows the coach skill.                                                                                                                                                                                                                                                                                                       |
| The skill and scripts  | `.claude/skills/coach/SKILL.md`, `scripts/coach/`         | The coaching method, the output contract, and small scripts that fetch context, validate and submit a plan.                                                                                                                                                                                                                                                                                                  |
| Today and the session  | `src/app/(app)/today`, `…/workouts/[sessionId]`           | Show the plan, ask for a re-plan, and prefill every set from the plan once the session starts.                                                                                                                                                                                                                                                                                                               |

A nightly run lists who is due, then plans each athlete in a separate subagent with a fresh
context, so no athlete's numbers are ever in view while another's plan is written. A re-plan
run receives the athlete, gym and request in its fire payload and plans that one athlete.

The server checks structure only: real exercises, machines that stand at the chosen gym, slot
ids from the day being planned, a run only on a day that runs, numbers in range. What the plan
prescribes is the coach's judgement, guided by the skill and by the athlete's memo and notes.

Alongside the check, the app reads the plan back against what was last managed and stores what
it noticed — a load that jumps further than a few of its own steps, a day at half its usual
volume, a strength lift at or past failure, a run much longer than the last one. These
warnings never block a plan; they are shown beside it, so the athlete sees what the coach did
before they train it.

## One-time setup

You need: the app deployed on Vercel, a Claude Pro or Max account, and about fifteen minutes.

### 1. A service token, on the server

Generate a random secret and add it to Vercel as `COACH_SERVICE_TOKEN` (Production). Any
string of at least 16 characters works; this makes a good one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Redeploy after adding it. Until it exists, the service endpoints answer `503`.

### 2. A cloud environment the routine runs in

At [claude.ai/code](https://claude.ai/code), open the settings of the environment the routine
will use (the **Default** one is fine) and add:

- **API credential**: name it `Overload coach`, allowed website = your app's host (for example
  `overload.vercel.app`), header `Authorization` with prefix `Bearer`, value = the token from
  step 1. Anthropic's proxy adds it to every request the routine makes to that host; the
  routine itself never sees it.
- **Environment variable** `COACH_APP_URL` = your app's origin, for example
  `https://overload.vercel.app`. This is not a secret.

**Trusted** network access is enough: hosts named on an API credential are reachable regardless
of the allowlist, and `npm` is on the default list.

API credentials live on the environment, not on the routine, and the section appears only when
editing an environment that already exists: at claude.ai/code, the cloud icon above the message
box opens the selector; hover the environment and click its settings icon; the section sits
below **Environment variables**.

**If your account has no API credentials section**, the scripts also accept the token as an
ordinary environment variable: add `COACH_SERVICE_TOKEN` = the secret next to `COACH_APP_URL`,
and switch **Network access** to **Custom** with your app's host in **Allowed domains** and
**Also include default list of common package managers** ticked (or pick **Full**). An
environment variable is readable by every session that runs in that environment, so keep
that environment for the routine and your own sessions only.

### 3. The routine

Create a routine at [claude.ai/code/routines](https://claude.ai/code/routines), or ask Claude
Code to create it for you, with:

- **Repository**: this one. The routine clones the default branch, so the coach skill and
  scripts must be merged to `main`.
- **Environment**: the one from step 2.
- **Model**: Claude Opus 5. The repository's `.claude/settings.json` sets its effort to high.
- **Schedule**: daily at 04:00 in your local time zone.
- **Prompt**:

```text
You are the house coach for the Overload training app. Follow the skill at
.claude/skills/coach/SKILL.md in this repository, exactly as written.

If a <routine-fire-payload> block is present and its first line is "replan", this run is a
re-plan for one athlete: read the user, gym, request and reason lines from the payload and run
the skill's "Plan one athlete" flow for that athlete only, with trigger replan and that request
id. If the plan cannot be stored, report it with scripts/coach/fail.ts.

Otherwise this is the nightly run: list who is due with scripts/coach/due.ts and plan each
athlete in a separate subagent, as the skill describes.

Never change, commit or push repository files, and never open a pull request. The app's origin
is in the COACH_APP_URL environment variable; the service token is attached by the
environment's API credential, so no request needs a token from you.
```

Remove connectors the routine does not need; it needs none. A routine created from a Claude
Code session may arrive without a repository or model set: open it, **Edit**, and check both
before enabling it.

### 4. Let the app fire the routine

Open the routine, **Edit**, **Add another trigger**, choose **API**, copy the URL, then
**Generate token** and copy it at once. Add both to Vercel as `COACH_ROUTINE_FIRE_URL` and
`COACH_ROUTINE_FIRE_TOKEN` (Production) and redeploy. This is what "Re-plan" and "Ask the coach"
on Today use. Without them, overnight plans still work; only on-demand plans are unavailable,
and Settings says so.

### 5. Switch the coach on

Each athlete opens **Settings → AI coach** and turns it on. The notes field there is read
before every plan: goals, niggles, what to avoid. The first plan arrives after the next
overnight run, or at once after **Ask the coach for a plan** in Today's More options.

To try it without waiting, open the routine and click **Run now**. The run appears in your
session list; its transcript shows every athlete it planned and why.

## Day to day

- **Overnight**: one run plans everyone who is due. A plan is made for the athlete's default
  gym and the next slot of their programme that trains — lifting, running, or both. Only rest
  days are skipped. A day that only runs is planned at whatever location is active, so an
  athlete whose only place is Outdoor still gets their run.
- **Runs** are planned like everything else: the mode, how long, how hard, how it should feel,
  and when to cut it short. Today shows it on the day's run card, and **Log a run** opens with
  those numbers already filled in, against the programme's own planned run so the block still
  counts. Nothing is fixed until it is logged.
- **Today** shows the plan inside the day's card: the coach's sentence under the day's name,
  a Coach badge, and the plan as the card's last row. If the default gym has changed since,
  a line under the button says which gym the plan was made for. Starting a session at the
  plan's gym uses it; at any other gym the rule takes over.
- **Re-plan** lives in Today's More options sheet, as "Re-plan with the coach" or "Ask the
  coach for a plan": pick a gym, add a line for the coach if you like, and the app fires the
  routine. Today refreshes itself until the plan lands, usually within a few minutes. Each
  athlete gets three requests a day (`REPLAN_DAILY_LIMIT`), because every one is a run on the
  owner's plan, which also has a daily run allowance shown at claude.ai/code/routines.
- **Once a session has started it is fixed.** A later plan applies to the next session.
- **Discarding an empty session** gives its plan back. Skipping a slot, or marking it a rest
  day, drops the plan that was waiting for it.
- **Suggested changes** appear in **Settings → Programme** when the coach thinks the programme
  itself is wrong: a movement that keeps stalling, a day that is too much, a run block that
  should grow. Each says what it would change and why. **Apply** writes the next version of the
  programme — the same days, every slot keeping its identity, the athlete's position in the
  sequence carried across — and archives the old one, so every session ever logged still points
  at the prescription it was actually given. **Not now** files it away. A change cannot be
  applied while a session is open.
- **Recent runs** in **Settings → AI coach** lists what the coach tried and what came of it. A
  night that could not plan says so there, and Today says so too instead of showing nothing.

## What the coach sees, and who pays

The coach reads one athlete at a time: profile, memo and notes, the programme and next slot,
the gym's machines, the day's prescriptions with comparable history and the rule's own
suggestion, a bounded recent sample of completed workouts, check-ins, runs and recovery, four weeks of running
load with any shin trend in it, four weeks of working sets by muscle, its own last three plans
with what was actually done against each, and the exercise library resolved at that gym. It
never reads another athlete.

The four calendar-week workload summaries are aggregated from the complete database window,
independently of the recent forty-record narrative samples. `volumeCoverage` supplies exact
start and exclusive-end timestamps, marks the partial current week, and counts incomplete
workouts separately. Week boundaries are Monday–Sunday in the athlete's time zone; they are
not the owner's scheduled review periods. Warm-ups and unfinished workouts do not contribute
to lifting volume. Actual performed exercises determine muscle coverage, with full credit
for primary muscles and half credit for secondary muscles.

`recent.from`/`to` label the narrative date window; `workoutsHasMore` and `runsHasMore` under
`recent` flag omitted records. `running.historyHasMore` flags older run details. Neither
narrative sample is a workload total. `lastPlans[].performed.completedAt` distinguishes
completed outcomes from work still in progress.

That last one is what makes it a coach rather than a generator: without it, every night is the
first night. Comparable history follows a programme slot by its lineage, not by the row it was
written to, so a revision never loses what a slot has been doing.

Runs draw down the owner's subscription usage and count against the daily routine allowance.
Every run is a session on the owner's account, and its transcript is visible there; athletes
should know their training data passes through it.

## Local testing

With the app running locally and `COACH_SERVICE_TOKEN` in `.env.local`:

```bash
export COACH_APP_URL=http://localhost:3000 COACH_SERVICE_TOKEN=<the token>
npx tsx scripts/coach/due.ts
npx tsx scripts/coach/context.ts --user <id> --out /tmp/coach/<id>.json
npx tsx scripts/coach/submit.ts --user <id> --file /tmp/coach/<id>.plan.json
npx tsx scripts/coach/attempt.ts --user <id> --status planned
npx tsx scripts/coach/propose.ts --user <id> --file /tmp/coach/<id>.proposal.json
```

`scripts/coach/submit.ts` validates the file the way the server does before sending it, and
prints the server's issues when something named in the plan does not belong to the athlete.

## Troubleshooting

| Symptom                                       | Cause and fix                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Service answers `503 not configured`          | `COACH_SERVICE_TOKEN` missing on the server, or shorter than 16 characters. Add it and redeploy.                                              |
| `401` from the service                        | The environment's API credential does not match the server token, or is not sent for this host.                                               |
| `403` for an athlete                          | The coach is switched off for that account, or the id is wrong.                                                                               |
| `409 Nothing to plan`                         | No active programme, the programme is complete, or no real gym is active.                                                                     |
| `422` with issues                             | The plan named an exercise, machine or slot the athlete does not have. The issues say which.                                                  |
| `422 That day has no lifting`                 | The next slot only runs, so the plan takes a run and no exercises.                                                                            |
| `422` on `run.programRunId`                   | The reference must match the exact programme, cycle and weekday of the target occurrence. Use `slot.programRunId` from that context, or null. |
| A proposal is refused                         | It names a slot the programme no longer has, or a session is open. Re-read the context and propose again.                                     |
| Today keeps waiting                           | A request older than 15 minutes counts as failed; the run's transcript says what happened.                                                    |
| "Re-plan" says the routine rejected the token | `COACH_ROUTINE_FIRE_URL` or `COACH_ROUTINE_FIRE_TOKEN` is wrong or was regenerated. Update and redeploy.                                      |
| The routine cannot reach the app              | `COACH_APP_URL` unset, or the credential's allowed website does not match the app's host.                                                     |
