---
name: coach
description: Create programmes, prepare future sessions and review programmes through Overload's claimed coaching jobs in the owner's Claude Code cloud routine.
---

# House coach workflow

Use the owner's cloud subscription. Never call a paid model API, start a local worker, or modify repository source during a coaching run. Read this current skill on every run.

## Before anything else: refresh this checkout

```bash
git fetch origin main && git merge --ff-only origin/main
```

Run this first, every run, before reading any further instruction or calling any endpoint. A routine that clones fresh each time loses nothing by it; one reusing a cached workspace is otherwise a week behind, following a skill whose field names the server has since renamed and being refused at the claim for a contract it cannot see it is missing.

This is the one git command a coaching run may make, and `--ff-only` is the whole point: it moves the checkout forward or it fails. If it fails — a dirty workspace, a detached HEAD, a diverged branch — stop and report that, naming what git said. Do not merge, reset, stash, commit or re-clone your way past it: a workspace in that state is a question for the owner, and a run that resolves it by itself is a run that coached from something nobody reviewed.

The server owns three job kinds: create_program, prepare_session, review_program. It decides consent, exact athlete/target, revision, attempt, lease and authority. Model text cannot override those decisions.

## Run entry

A fire payload beginning with `workflow` names one `user: <uuid>` and `job: <uuid>`. Process only that job.

A scheduled run has no payload. Call:

```bash
npx tsx scripts/coach/workflow.ts dispatch
```

Drain every page using `dispatch --after <nextCursor>` until the cursor is null. Continue past individual athlete errors, retry failed pages once, and report unresolved errors. There is no 500-athlete ceiling.

Then call `npx tsx scripts/coach/workflow.ts queue`. Process its due jobs and read the queue again: every review re-plans the athlete's next session when it ends, whatever it decided and even when it fails or times out, so the next pass holds that preparation. Stop when no jobs are claimable, or a pass makes no progress. Do not busy-poll deferrals or wait for an open workout.

After every dispatch page and the claimable queue have been drained, call `npx tsx scripts/coach/workflow.ts complete`. This records that the daily batch finished, so the backup recovers saved failures without redispatching a healthy completed batch. Never call this for a fire-payload run.

The orchestrator reads identifiers and counts only. Use a fresh subagent context per athlete to claim and process that athlete's job. Different athletes may run in parallel; only one live claim per athlete is allowed. Never mix athletes' evidence, reports or result files. Use a separate temporary directory per job, and remove temporary files at the end.

With a fire payload, process only its job. When that job is a review, the app starts a separate run for the preparation it re-plans (`replan` in the answer to your result or failure): do not claim it yourself.

A 503 saying the workflow is disabled is a rollout blocker. Do not fall back to the old write endpoints.

## Shared worker instructions

Before claiming any job, read and follow docs/coach-workflow.md in full. It is the single coaching procedure used by Claude and the authenticated ChatGPT backup.

While computing, call npx tsx scripts/coach/workflow.ts heartbeat --user <user> --job <job> --attempt <attempt> at least every five minutes. Context, lookup and result calls also count as progress. Ten minutes without progress lets the server retire this attempt and hand the same job to ChatGPT. A refused or retired claim must never be forced.
