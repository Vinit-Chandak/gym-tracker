# Auditing the coaching screens

How to stand the coaching flows up on one machine and walk them, and what walking them found.

The stack is a local PostgreSQL, the auth stand-in from [local development](local-dev.md), the
three seeded accounts, and one more script that writes the coaching state those accounts do not
have: a coach proposal against the running programme, requests in every state, reviews, notes
and diagnostics receipts. None of it ships. The script and the browser driver live outside the
repository, the way `docs/qa-audit.md` keeps its runtime out of it; everything needed to write
them again is below.

## The database, on a machine that has no server running

[local development](local-dev.md) assumes PostgreSQL is already listening. Where it is not —
a container, a fresh checkout — start one of your own. `initdb` refuses to run as root, so the
cluster belongs to the `postgres` user:

```sh
sudo -u postgres /usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/audit/data --auth=trust
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/audit/data \
  -l /var/lib/postgresql/audit/server.log \
  -o '-c listen_addresses=127.0.0.1 -p 5432 -c fsync=off -c synchronous_commit=off' start
```

Keep the data directory somewhere `postgres` owns and nothing else rewrites. A scratch
directory under `/tmp` is the wrong choice: a tool that resets its permissions takes the
server down mid-write, and the cluster has to be moved before it will start again.

Then the schema, the shared library and the three accounts, exactly as in local development:

```sh
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/overload_dev
export DIRECT_DATABASE_URL=$DATABASE_URL
psql -U postgres -h 127.0.0.1 -c "create database overload_dev"
psql -U postgres -h 127.0.0.1 -d overload_dev -f scripts/dev/auth-stub.sql
npm run db:setup
SEED_DATABASE_URL=$DATABASE_URL npm run dev:seed
```

`.env.development.local` is the one in local development plus the coaching switches, because
every screen below is behind them:

```sh
COACH_WORKFLOW_ENABLED=true
COACH_SERVICE_TOKEN=dev-coach-service-token
COACH_ROUTINE_FIRE_URL=http://127.0.0.1:54399/fire
COACH_ROUTINE_FIRE_TOKEN=dev-routine-token
```

The fire URL is never called by anything in this audit — no screen here starts a coach run —
but with it unset the AI coach screen says on-demand coaching is not configured, which is a
sentence about the server rather than about the flows.

## The coaching fixture

One script, run after `dev:seed`, against the same database. It writes, for `@vinit`:

- **A proposal.** Read the active programme with `readProgramBlueprint`, change a copy of it,
  and store it as a `program_drafts` row with `source: "weekly"`, `status: "ready"`,
  `baseProgramId` set to that programme and `jobId` set to a succeeded `review_program` job.
  Cover every operation the diff can show: one slot retargeted, one replaced, one added with
  no lineage, one moved to another day, one reordered within its day, a run occurrence
  changed, a day field changed, and the programme's length changed. **Add run targets for any
  week the new length adds** — a programme with a running day and no run for a week cannot be
  activated, and a proposal that cannot be approved audits the refusal instead of the flow.
- **Requests**, one row per ask, with distinct `createdAt`: `proposed` (pointing at the draft,
  with `changeRefs` taken from `diffOperationIds`), `needs_answer`, `waiting`, `deferred` with
  a `reconsiderAfter`, and two settled ones — `not_recommended` and `already_satisfied` —
  decided by the _earlier_ review, so the change screen shows the asks its own review answered
  and not every ask ever made. Each gets a `coach_request_decisions` row.
- **Notes** the asks were quoted from: one unreviewed, one `remembered`, one
  `queued_for_review`.
- **Reviews**: one `proposal` pointing at the draft, one `no_change` with no draft.
- **Diagnostics**: one receipt inside the thirty days and one already past its `expiresAt`.
- `coach_preferences` with `mode: "coach"`, `profiles.aiCoachEnabled` true, and a memo
  overview — without the switch on, the screen is being read in a state nobody trains in.
- Finally, set every draft's `sourceRevision` to the account's current
  `coach_source_revisions.revision`. The script's own writes bump it, and a draft left behind
  it is drawn as stale, with "Check current data" standing between you and the decision.

For `@shreyash`, a draft with `baseProgramId: null`, which is the other view of the same
route: the full programme to read, and Start.

The script deletes what it wrote before writing it again, so it can be re-run. It cannot undo
an **approval**, though — that archives a programme and activates a new one. After walking the
approve flow, drop the database and start again, or the next proposal is computed against a
programme that already contains the change.

## Driving the screens

Chromium with `playwright-core`, one context at 390 px and one at 1280 px, signing in through
`/login` as `vinit@local.test` / `password123`. Per route: a full-page screenshot, the console
errors, the failed requests, `document.documentElement.scrollWidth > clientWidth`, and the text
of every `[role="alert"]`. The last two are what catch a screen that is technically rendering
and still wrong.

Routes: `/profile/programme`, `/profile/programme?view=changes`,
`/profile/programme/drafts/<id>`, `/profile/ai-coach`, and the dev fixtures
`/preview/coaching?view=changes` and `?view=unchanged`.

The decisions are worth driving rather than reading: click Approve, Ask for revisions, Decline,
Send answer and "I no longer want this", then check the database. What each one must leave
behind is in the next section.

## What to check, and what it should say

| Flow                 | The screen                                                | The database                                                                                         |
| -------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Save a note          | "Waiting for the next daily coach run" beside it          | A `coach_notes` row; **no job queued**                                                               |
| Two asks in one note | Two rows, independent outcomes                            | Two `coach_program_requests` rows on one `source_id`                                                 |
| Answer a question    | The ask returns to "Waiting for the next daily coach run" | A note carrying `request_id`; the request back to `waiting`; **no job queued**                       |
| Approve              | Lands on Changes; the ask reads "Applied"                 | Old programme `archived`, new one `active`; draft `activated`; decisions `proposed` → `applied`      |
| Ask for revisions    | Lands on Changes; the ask waits again                     | Draft `rejected`; request `waiting` with `draftId` cleared; the words saved as a note; no job queued |
| Decline              | Lands on Changes; the ask is settled                      | Draft `rejected`; request `declined` with a decision row                                             |
| No-change review     | A reason and a date, with nothing to open                 | `coach_weekly_reviews.outcome = 'no_change'`, `draft_id` null; no draft in `editing` or `ready`      |

## Migration 0024, against notes that were really queued

The backfill in `0024_coach_program_requests.sql` is the one piece that cannot be judged from
a fresh database, because it exists to read rows written by the code before it. Build a
database from `0000`–`0023` only — apply the files in order, splitting each on
`--> statement-breakpoint` — insert the legacy shapes, then apply `0024` and read what it
carried:

- a `coach_notes` row with `disposition = 'queued_for_review'` → **one open request**, quoting
  the note and summarised by its `disposition_detail`;
- one with `disposition = 'remembered'` → **nothing**; a read receipt is not an unanswered ask;
- one with `queued_for_review` and empty text → **nothing**;
- a `coach_note_reviews` row for `workout:<uuid>` whose session has notes → **one request**;
- one for `exercise:<uuid>` with no `detail` → **one request**, summarised by the note's text;
- one whose `source_id` is `workout:not-a-uuid` → **nothing, and no error**: the uuid cast is
  guarded inside the pattern rather than beside it, because Postgres does not promise to
  evaluate a guard first;
- one for a workout that no longer exists → **nothing**.

Then run both `INSERT`s again. They must add nothing, and `coach_notes` must be untouched
throughout.

## What this found

Fixed on `claude/epic-carson-8uuwbz`:

- **Programme creation could close an ask, and was obliged to.** Only the daily programme
  review may decide a request; the guard covered session preparation and not programme
  creation. A creation run that noticed an ask in a note could mark it not recommended — and
  if it did not, its whole result was refused, because an ask opened in a result must be
  decided in that result. Now only `review_program` decides; the other two hand an ask on to
  the next daily review.
- **The change screen showed half of what was asked.** "What you asked for" listed only the
  asks pointing at that draft, so the second ask in one note — the one still needing an answer
  — was missing, exactly the case the `?view=changes` fixture was drawn to show. It now lists
  every ask that review answered.
- **A deferral's date was printed raw** (`Back on 2026-10-03`) where the rest of the app writes
  `3 Oct 2026`.
- **The change screen had no title**, so the browser tab read `Overload` where every other
  screen names itself.

Checked and sound: the diff against repeated exercise names, missing lineage, insertion versus
reorder, cross-day moves in both directions, and run occurrences across weeks and weekdays; a
request saved after a run's snapshot surviving to the next run; an on-demand gym change never
becoming a hearing; the no-change review leaving no draft to apply; diagnostics expiring after
thirty days and taking nothing else with them; and migration 0024 against every legacy shape
above. No sideways scroll and no console errors on any of the screens, at 390 px or 1280 px.
