# Coaching requests and programme review diffs

- Date: 19 September 2026.
- Status: Agreed implementation plan; implementation deferred.
- Baseline: `main` at `ad8fecac5ba8cb1b3e0a545784f50a1fa94f58a9` (PR #33).
- Planning branch: `codex/coaching-review-improvement-plan`.

The user confirmed the next-daily-run timing and accepted the remaining design decisions on
19 September 2026. This document records the agreed plan for later implementation.

## 1. Intended outcome and scope

The user supplied seven mobile screenshots and requested two improvements:

1. A request to change the programme must receive a concrete response. Remembering a preference
   is not equivalent to proposing, applying, or explaining a programme change. The user's example
   contains two requests: Bayesian cable biceps curls and more direct core work.
2. The full current programme should have one home. Programme reviews should show only actual
   differences, grouped by day, instead of repeating the current, proposed, and draft programmes.

The rep/load progression policy and its research basis are a separate, later task after the user
provides their spreadsheet. This plan neither changes progression thresholds nor treats the
current engineering limits as research-proven prescriptions. No exercise selection, sets, reps,
load, placement, or medical restriction is being prescribed for the user in this document.

## 2. Confirmed product decisions

All six decisions are agreed. The user's timing instruction is "after the next daily run only."

| ID  | Decision                                      | Agreed behaviour                                                                                                                                                                               |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Where the full programme lives                | Programme → Cycle is the only full current-programme view. Today retains its session preview and a shortcut.                                                                                   |
| D2  | When explicit programme requests are assessed | Assess in the next scheduled daily coach run only. Until then show that the request is waiting for that run. The next daily run can assess it even when the ordinary weekly review is not due. |
| D3  | Authority for changes requested by the user   | Present the proposed diff for approval before activation.                                                                                                                                      |
| D4  | Navigation between programme and changes      | Two tabs within Programme: Cycle and Changes.                                                                                                                                                  |
| D5  | Diff coverage and visual treatment            | Group by day; show paired replacements, green additions, red removals, and changed targets, order, or schedule. Labels/icons accompany colour.                                                 |
| D6  | Approval granularity                          | Approve the reviewed set together, with an option to ask for revisions.                                                                                                                        |

Sections 4–8 implement these decisions in the proposed workflow and acceptance criteria.
If implementation reveals a new substantive product choice that these decisions do not settle,
raise it with the user; routine technical choices should follow the agreed requirements.

## 3. Findings from the screenshots and current code

### 3.1 What is confirmed

| Evidence                             | Finding                                                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photo 1 and the Today implementation | Today shows an upcoming session and a compact programme shortcut. The session prescription and the full repeating programme serve different purposes. Confirmed D1 retains the session preview.         |
| Photo 2                              | The exercise screen shows its programme target alongside the coach's session target. This is relevant context for logging, not another full-programme view. Reworking progression is outside this task. |
| Photos 3–5 and `DraftPreview`        | The review displays identical muscle-set counts, a complete Current/Proposed comparison, and the proposed days again. These renders are not conditional on there being meaningful changes.              |
| Photo 6                              | The memo records the user's curls/core preference and says it belongs to programme review. It does not establish that the review acted on it or declined it for a particular reason.                    |
| Photo 7 and Programme page           | The existing Programme page already supplies the complete programme through its The cycle section. It is the natural canonical view.                                                                    |

The reviewed repository was initially behind remote `main`. It was fast-forwarded before this
plan was drafted. The baseline already includes three relevant fixes:

- `9ce84ab`: note dispositions, earlier reviews for queued requests, training-note ingestion, and
  a correction so warm-up-only/mobility sessions do not prevent a quiet-day review.
- `68488bf`: detect a routine checkout whose contract version differs from the deployed service.
- `f021ff2`: keep reviewed-note parsing stable across repeated validation.

Do not reimplement these changes or describe them as absent. Their deployment to the environment
in the screenshots has not been verified.

### 3.2 How the coach currently changes a programme

| Stage                    | Current behaviour                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saving a note            | `saveCoachNotesAction` saves the message and refreshes the coach page. It does not itself dispatch an immediate review.                                                                                                                                                                                                                      |
| Reading notes            | A planning job receives pending notes, eligible training notes, and the memo. The coach is instructed to return a disposition for each note it reads.                                                                                                                                                                                        |
| Note disposition         | `remembered`, `applied` (labelled as applied to the next session), `queued_for_review`, or `no_action`. Queued/no-action dispositions require a short detail. This is one disposition per source, not per individual request within a source.                                                                                                |
| Session preparation      | Prepares the next training occurrence. This job cannot return a replacement programme. An adaptation for one session is not a lasting programme revision.                                                                                                                                                                                    |
| Ordinary review cadence  | The shared batch boundary is 04:00 Asia/Kolkata. The ordinary review becomes eligible after seven days from its anchor. Between seven and ten days it waits until the athlete's previous local day has no non-warm-up set or logged run. At ten days it becomes due regardless. Due does not guarantee successful execution at that instant. |
| Earlier requested review | A `queued_for_review` disposition sets `reviewRequestedAt`. The dispatcher can bring the review forward without waiting seven days. This still depends on the note first reaching a coach job and then on dispatch/claim execution.                                                                                                          |
| Review context           | Reads the interval since the previous review anchor through the scheduled boundary, plus longer evidence and current programme/intake/memory. The sequence of programme days is not a fixed calendar timetable.                                                                                                                              |
| Review outcomes          | A review can retain the programme, apply an eligible future revision automatically, produce a proposal, ask for input, or defer. The date alone does not require novelty or extra volume.                                                                                                                                                    |
| Automatic authority      | The server examines the actual blueprint change and supporting evidence. Structural changes, added/removed slots, large or unsupported changes require review. Automatic numerical changes need the appropriate comparable evidence and individual/cumulative limits; rollout can disable automatic application.                             |
| Activation               | Validates the current source/programme/draft revisions and prevents a change during an open workout. A compatible revision continues the block; structural changes currently require a new block. Logged workouts retain their original prescriptions.                                                                                       |

The current automatic weekly set limits include at most one set and 25% per exercise and 20%
overall; relevant prescription changes also require two fresh comparable training dates. These
are existing implementation rules, not a scientific conclusion in this plan. Failing an automatic
change rule should route a valid request to a proposal or explanation; it is not a reason to
silently omit a requested exercise. Do not require performance history of a never-performed new
exercise merely to discuss or propose that exercise.

### 3.3 Remaining gaps

1. **A read receipt can outlive the request it was meant to track.** `updateCoachMemory` marks a
   queued note reviewed. `coachJobContext` excludes reviewed notes from the pending-note packet.
   The preference may survive in memory, but there is no durable list of unresolved programme
   requests supplied to each relevant review.
2. **There is no enforced request-to-decision link.** A successful review clears
   `reviewRequestedAt`, including a no-change review. The result contract has general rationale
   and optional memory, but no mandatory decision for each actionable request in scope. The
   original queued disposition is not advanced to a final programme outcome by this path.
3. **One note can contain several requests.** A single outcome cannot clearly represent curls
   accepted and core work awaiting clarification, for example.
4. **No-change reviews can still expose an unchanged draft.** The server supersedes an identical
   weekly blueprint, but retains its `draftId`; the job page links a draft found for that job
   without checking its status. The shared draft renderer still prints full programmes when
   reached directly. Manual identical drafts need consideration too.
5. **Review questions lack a complete dedicated continuation.** Saved work highlights creation
   jobs, and the existing answer action routes through programme creation. Programme-review
   questions need a discoverable answer path that resumes the review without creating an
   unrelated replacement programme.
6. **Review information is fragmented.** Recent review summaries, saved drafts, legacy patch
   proposals, and the current programme are separate presentations. They should link to one
   change detail rather than reproduce its contents.
7. **Exact exercise availability is not established.** No Bayesian-named exercise was found in
   the checked-in seed library. Production may contain a custom exercise. This is a diagnostic
   check, not a proven cause or permission to substitute generic cable curls silently.

### 3.4 What remains unknown about this incident

The screenshots do not identify the review job, the submitted result, the draft's origin/status,
the deployed commit, or the routine checkout. They also do not establish whether the note arrived
before that job's input snapshot. The memo update time alone cannot answer that question.

Before attributing this incident to model judgement, missing equipment, validation, or timing,
inspect the user's relevant records read-only: source note, review target and evidence boundaries,
job/attempt status and errors, result rationale, base/proposed blueprints, draft status, deployment
version, and routine contract/checkout version. Verify migration 0023 and the current note parsing
contract. Keep private account records out of committed fixtures; reproduce with synthetic data.
If these records are unavailable, retain that limitation rather than inventing a rejection reason.

## 4. Programme information architecture and diff design

### 4.1 One full programme, one change detail

The agreed navigation (D1 and D4) is:

- **Cycle:** the active programme summary, position, and complete days using the existing cycle
  components. This is where the user inspects the full current programme.
- **Changes:** pending proposals and completed reviews. Each entry has a date, outcome, compact
  summary, and a link to its change detail. Pending action comes first; older reviews are secondary.
- **Change detail:** review explanation, decisions on requests, changed-day groups, and the
  appropriate approval/revision controls. It contains no full current/proposed programme panels.
- **AI coach:** note entry, memo, and request status. A request links to the same change detail.
  Rename the ambiguous Programme and drafts entry to match the chosen destination.
- **Today:** retain the session preview and programme shortcut. A compact
  indicator may link to a pending decision, but must not reproduce the full diff or programme.

Keep existing deep links usable. Adapt legacy patch proposals and newer blueprint drafts to the
same change presentation without creating duplicate review records. An automatically applied
change is labelled Applied; a proposal is labelled Awaiting approval. Neither label can be
inferred merely from the existence of a draft.

Initial programme creation has no existing programme to compare against. Preserve a single full
preview for that case and the manual editor's editing function. Do not remove the user's ability
to inspect a first programme before starting it. Avoid rendering a second full preview beneath it.

### 4.2 Changed days and compact rows

Use one group per changed day, ordered by programme cycle order. Show the day name
and cycle-day identity; omit unchanged days and unchanged exercise rows. Do not output unchanged
muscle-count lines such as `Biceps 5 → Biceps 5`.

| Change                      | Presentation                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replacement                 | One row labelled Replaced, with the old exercise and the new exercise connected by an arrow. Use a muted red treatment for the old entry and a muted green treatment for the new entry. Stack the pair on narrow screens. |
| Addition                    | A plus icon, Added label, exercise name, and its proposed prescription in a muted green treatment. There is no invented old exercise.                                                                                     |
| Removal                     | A minus icon, Removed label, and the removed exercise in a muted red treatment. Do not rely on strike-through or colour alone.                                                                                            |
| Existing target changed     | Keep the exercise name once; list only changed fields, for example `Sets: 2 → 3` or `Rest: 60–90 s → 90 s`. Preserve units and unknown values.                                                                            |
| Exercise order changed      | A labelled move showing its old and new place; do not present every later exercise as moved merely because a new row was inserted.                                                                                        |
| Exercise moved between days | Link the source and destination day entries as one logical move. Both day groups explain where it went/came from. Do not invent a replacement.                                                                            |
| Run target changed          | Group under the relevant day; identify the affected cycle/week occurrences and changed duration, distance, effort, or instructions. Do not repeat unchanged run weeks.                                                    |
| Day/schedule changed        | Show the actual old and new day/schedule fields and affected scope. Distinguish an intended weekday from a projected calendar date.                                                                                       |
| Programme-level change      | A compact diff for changed name, block length, or other programme-wide fields. Such changes must not disappear because they do not belong to an exercise row.                                                             |

Show an effective boundary: future unstarted occurrences, the next applicable day, or a new block
start, according to the accepted change. A delayed workout or advancing date alone must not
produce a coach-authored schedule change. Never silently imply that completed workouts changed.

The blueprint stores targets and optional load notes; numeric per-set coach loads belong to
session plans. Display programme load changes only where those values actually exist. Do not
manufacture a numeric programme-load diff by comparing a session plan to a programme rep range.

Include the reason close to a changed item when useful, and link the user's request to the relevant
rows. More detailed evidence can be disclosed without repeating the programme. Reuse the app's
theme tokens, typography, icons, and spacing. Verify labels in light/dark and forced-colour modes,
keyboard access, readable contrast, 44px controls, long exercise names, and the mobile bottom bars.

### 4.3 No changes

A completed unchanged review shows:

- No programme changes, the review date, and a concise reason.
- A decision for every request covered by that review, including any question or explicit deferral.
- A link to Cycle when the user wants to inspect the current programme.

It shows no Current/Proposed panels, repeated days, unchanged muscle totals, empty day cards,
activation control, or actionable identical draft. A zero programme diff can still coexist with
an unresolved request; the request must retain its actual status.

Suppress creation of an actionable identical revision on the server, not only in the UI. Preserve
the review receipt and its reasoning. For old superseded/no-op draft URLs, show an honest status
and the associated review or current-programme link. Do not reactivate an obsolete draft.

### 4.4 Compute the diff from data

Introduce a deterministic domain diff alongside `assessProgramChange`. The assessment decides
authority; the diff describes what actually differs. A model's prose is not the diff source.

- Compare a stored base version with its proposed/applied version. Historical review diffs must
  not drift when today's active programme changes.
- Match exercise slots by stable lineage, not display name, slug alone, or array position. The
  same exercise may appear twice. Preserved lineage with a changed exercise is a replacement.
- For missing/unreliable lineage, use a verified mapping or present additions/removals honestly.
  Never guess replacement pairs from adjacent positions or similar names.
- Treat within-day ordering and cross-day movement separately from target changes. Identify
  meaningful reorders without cascading index noise from insertion/deletion.
- Match run occurrences using their supported identity. For a moved run with no trustworthy
  mapping, show its removal/addition rather than guessing.
- Compare every persisted user-relevant field, including measurement type, per-side targets,
  supersets, rest, RIR, progression instructions/rule, load notes, fallbacks, warm-up, and day notes.
  A substantive instruction change must not yield No programme changes.
- Normalise defaults and non-semantic ordering consistently. Preserve meaningful exercise order,
  unknowns, units, and prescription distinctions. Exclude only genuine storage metadata.
- Share the meaningful no-op definition between persistence and presentation, while retaining
  the existing independent authority checks. Do not weaken training rules through UI normalisation.
- Return structured operation IDs and references usable by request decisions. Count a replacement
  or move once even if both endpoints appear in the mobile presentation.

## 5. Coach request follow-through

### 5.1 Separate understanding, recommendation, and application

Extend the existing note system rather than introducing a separate conversation product. Keep
the original text and source identity. Reading a note can update memory while an actionable
request from that same note remains open.

Represent separate actionable items when a note contains more than one. Each item needs a stable
ID, owned source reference/quote, intended scope, created time, current state, latest explanation,
and links to its review, proposed changes, and applied revision where those exist. Preserve a
decision history. Use the same mechanism for Tell the coach and relevant workout/exercise notes.

Illustrative states, to be mapped onto the existing implementation without duplicating concepts:

| State                             | What the user can see                                                             | What must be true                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Waiting / assessing               | The coach has the request and when/what it is waiting for.                        | The actionable item remains in the relevant pending context.                                       |
| Needs an answer                   | One specific question and an inline response action.                              | Missing information is stated; unrelated answered facts are not asked again.                       |
| Proposed                          | The recommendation and a link to the matching diff.                               | The proposed operation actually exists and targets the intended request.                           |
| Deferred                          | Why now is unsuitable, and the date or observable condition for reconsideration.  | It remains open; postponement is not a terminal read receipt or daily retry loop.                  |
| Not recommended                   | A specific reason, relevant trade-off, and a feasible alternative when available. | A generic Programme unchanged sentence cannot stand in for this decision.                          |
| Applied                           | What changed, where, and when it takes effect.                                    | The programme revision was successfully activated; a draft or session-only change is insufficient. |
| Already satisfied                 | Where the requested feature exists in the active programme.                       | Verify the actual request, not just a broad muscle-group match.                                    |
| Declined / withdrawn / superseded | The user's decision or newer request that replaced it.                            | Retain the record and prevent the same suggestion returning without a relevant change.             |

State names are an implementation recommendation, not a requirement to show a large status
dashboard. Present the shortest useful explanation beside the original request and on its review.

### 5.2 Require a decision for every request in scope

Supply a bounded, complete-for-this-job `requestsToAddress` packet separate from the memory summary.
Include unresolved items even if their source note was already read. Explicitly page overflow;
never interpret context truncation as resolution. Record which item IDs/revisions were included
in the claimed input snapshot.

Extend the result contract with structured decisions referencing those request IDs. On submission:

1. Check ownership, version, and that each required request has exactly one valid decision.
2. Require the appropriate reason, question, reconsideration condition, or change reference.
3. Verify that a claimed addition/replacement links to actual blueprint diff operations. A programme
   request cannot be marked Applied merely because tomorrow's session contains the exercise.
4. Distinguish Proposed from Applied in the transaction that saves/activates the programme.
5. Reject incomplete or inconsistent resolution before accepting a successful review. Keep durable
   pending state across failures; retries repair the same logical work.
6. Do not clear requests submitted after the claim snapshot. Replace the single blanket
   `reviewRequestedAt = null` completion signal with per-request completion/remaining-work logic.

Classification of a new free-text note also needs a visible acknowledgement. Preserve all distinct
asks; a model cannot escape the decision requirement by calling every actionable request a
remembered preference. Use focused evaluations for multi-request extraction and ambiguous wording;
server reference checks alone cannot prove semantic understanding.

### 5.3 Coach reasoning the user can act on

The coach should consider the exact request, confirmed goals, available equipment/exercises,
session time, existing programme work, and relevant reported constraints. Explain the decisive
trade-off without generating a long internal reasoning transcript.

For this case, evaluate the two requests independently. Bayesian curls are not automatically
satisfied by any other curl variation. More direct core work should produce a specific proposal
or a useful question about an essential ambiguity. Do not prescribe particular days or doses in
advance of that evaluation. If the exact exercise is absent from the accessible library, say so
and offer the existing custom-exercise path or ask about an explicitly identified alternative.
Do not create a global library exercise or silently substitute a different variation.

Insufficient evidence for an automatic progression is different from a user preference that can
be evaluated as a proposal. Keep that distinction in policy text, prompts, validation, and the
user-facing reason. A past observation in memory must not become an invented confirmed restriction.

### 5.4 Timing and continuation

**Confirmed D2: assess explicit programme requests in the next scheduled daily coach run only.**
Saving a request does not start an immediate assessment or fire an on-demand routine.

- Save the note/request durably and show Waiting for the next daily coach run. Use the existing
  shared 04:00 Asia/Kolkata schedule; the result becomes available when that run completes. Do not
  present the schedule time as a guarantee of completion.
- The next daily run must consider eligible pending requests even when the ordinary seven-to-ten-day
  programme review is not due. A review-specific request is not allowed to disappear into memory
  or be marked queued during that run without an assessment of what should happen to it.
- Discover and classify requests in the daily workflow, and process programme-level assessment in
  that same batch where inputs allow. Reuse the existing durable job, attempt, lease, and routine
  machinery. If a separate review job is needed, drain it in the same daily run; do not require a
  second nightly run merely because the first job could only prepare a session. An unrelated
  on-demand gym/session run must not become a new trigger for programme-request assessment.
- Batch/coalesce eligible requests for the same athlete/programme while retaining each item and
  its receipt. Plain factual notes need not each create a complete programme revision.
- Record the request snapshot used by that daily run. A message or answer saved after the run has
  captured its inputs stays pending for the next daily run; it must not be silently marked handled.
- If an ordinary programme review is due, combine the request assessment with it. Otherwise keep
  the request assessment's purpose and evidence explicit; it must not falsely count as a complete
  scheduled training review or repeatedly reuse progression evidence. Preserve complete scheduled
  evidence coverage.
- A request can yield a proposal, a question, a reasoned non-recommendation, or an explicit deferral.
  Assessment timing does not itself authorise application: D3 still controls approval.
- A delayed or failed daily run leaves the request pending with an honest status. Retries belong
  to that scheduled work and must not lose or duplicate decisions. Saving notes does not spend
  the existing on-demand programme-creation/gym-change allowance.
- Preserve the current open-workout protection. Save the request and state the blocker while
  delaying any operation that requires a stable programme. Never rewrite an in-progress workout.
- Resume a review question as the same kind of request, with answers linked to its original
  question/item. Save answers for the next daily run under the same timing rule; do not dispatch
  an immediate answer-driven assessment or route it through whole-programme creation.

### 5.5 Approval and future application

Under confirmed D3/D6, offer Approve changes, Ask for revisions, and Decline on the reviewed set.
The revision request should identify what the user wants reconsidered and retain the base context.
An explanation the user disagrees with can receive a follow-up; disagreement must not silently
change a confirmed constraint or bypass validity checks.

Apply once against the exact current base/draft/source revisions. Recompute the displayed
assessment after revalidation; a refreshed client draft must not retain an assessment for older
props. If relevant inputs changed, show the new assessment/diff before accepting approval.
Declining or an application failure does not satisfy the original request as Applied.

Preserve block position, slot lineage, completion/skip events, and historical prescriptions for
compatible revisions. Keep the existing new-block decision for structural changes and display
that consequence. Invalidate incompatible unused session plans and prepare the next applicable
session through the existing workflow. Numeric automatic changes unrelated to explicit requests
retain the current policy; D3 is not a silent global removal or expansion of coaching autonomy.

Approval applies to the reviewed set as a whole. If the user wants only some of its changes,
Ask for revisions records that preference for the next daily run. The coach recomputes the
proposal, including dependencies and resulting volume/schedule, and shows the revised diff
for approval before applying it.

## 6. Implementation sequence and likely touchpoints

Read the installed Next.js guides relevant to modified routes/actions before writing application
code, as required by AGENTS.md. The planning investigation read the local layouts/pages guide;
that does not substitute for checking the installed version during future implementation.

| Phase | Deliverable                                                                                                               | Likely touchpoints                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Use confirmed D1–D6; verify the incident and deployed baseline when records are available; capture synthetic regressions. | This plan; review/job/attempt records; migration 0023; routine contract check.                                                                                         |
| 1     | Deterministic programme diff and shared meaningful no-op behaviour, independent of rendering.                             | New `src/domain/program-diff.ts` and focused tests; `program-blueprint.ts`; `program-change.ts`; `program-drafts.ts`; `coaching-jobs.ts`.                              |
| 2     | Cycle/Changes navigation and a single diff renderer, including existing no-op links.                                      | Programme page and `cycle-day.tsx`; `draft-page.tsx`; `draft-preview.tsx`; `saved-work.tsx`; `activity.tsx`; `job-page.tsx`; `job-status.tsx`; legacy `proposals.tsx`. |
| 3     | Durable actionable requests and decision history linked to existing notes.                                                | Coach schema/repositories and a new migration; source revision handling; existing note ingestion and dispositions.                                                     |
| 4     | Request-aware context/result validation, trigger policy, question continuation, and approval linkage.                     | `coaching-workflow.ts`; `coaching-context.ts`; `coaching-jobs.ts`; `coaching-guardrails.ts`; coaching actions; dispatch adapter; draft activation.                     |
| 5     | Explain outcomes at the request and change detail; update coach instructions and tests together.                          | AI-coach settings/page; shared request components; `coach-policy.ts`; `.claude/skills/coach/SKILL.md`; workflow contract/CLI; `docs/coach-automation.md`.              |
| 6     | Validate migrations, multi-user isolation, end-to-end behaviour, mobile rendering, and rollout compatibility.             | Repository/component tests; development preview fixtures; build/type/lint checks; synthetic model evaluations.                                                         |

Database design should extend the current note/disposition work. Add owned request items and
linked decision records where a single note row cannot represent multiple independent requests.
Keep original workout/exercise notes in their current history tables; store coaching decisions
beside them. Retain account isolation and transactional/idempotent writes.

Migration/backfill rules:

- Carry `queued_for_review` items forward as unresolved rather than complete.
- Treat old Reviewed/Remembered entries as read receipts, not proof of implementation.
- For a remembered historical actionable request, recover its owned source and assess it; if its
  meaning or current relevance is uncertain, surface that uncertainty rather than auto-applying it.
- Link existing proposal/activation records only where the relationship is verifiable.
- Preserve no-change review history and old links without leaving actionable identical drafts.
- Make the backfill idempotent. Do not reset all reviewed notes and repeatedly replay them.
- Bump the result contract when required and release schema, service validation, CLI, policy, and
  routine skill coherently. Retain the current contract-skew check; never work around a stale
  routine by guessing fields or accepting an empty answer set.

## 7. Verification and acceptance criteria

### 7.1 User-visible acceptance

- [ ] The full current programme appears in its canonical Cycle destination only. Other entry
      points link to it; the Today behaviour matches D1.
- [ ] Every review of an existing programme shows only actual changes, grouped by changed day.
- [ ] A replacement visibly names both old and new exercises as one operation.
- [ ] Additions/removals are distinct and understandable without colour vision.
- [ ] Target/order/schedule coverage matches D5, including relevant programme-wide changes.
- [ ] A no-change review has a reason and request outcomes, no repeated programme, and no Apply.
- [ ] The curls/core example produces two separate decisions, even if only one can be proposed.
- [ ] Saving an explicit request does not trigger an immediate coach run. It remains visibly
      pending until the next daily run, which assesses it without waiting for the ordinary weekly
      review or requiring another nightly run solely to hand it off.
- [ ] Each accepted request links to the actual diff; Applied appears only after successful
      activation and identifies the effective future scope.
- [ ] A declined/not-recommended/deferred request explains why; a deferral has a return condition.
- [ ] A question is visible, can be answered in place, and resumes the correct review.
- [ ] Pending/failed requests remain discoverable after navigation, retries, and newer notes.
- [ ] Approving, declining, and asking for revisions follow D3/D6 without modifying past or open workouts.

### 7.2 Meaningful automated checks for implementation

| Area               | Required scenarios                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diff identity      | Identical blueprints; replacement with preserved lineage; repeated exercise names/slugs; missing lineage; add/remove; target plus replacement; within-day reorder; insertion without cascading moves; movement between days; structural day changes.                                        |
| Diff completeness  | Reps/duration/distance and per-side changes; unknown-to-known values; RIR/rest; superset; progression/load notes; warm-up/fallback changes; run occurrences; programme name/length; meaningful instruction-only edits; no identical muscle-count rows.                                      |
| No-op persistence  | A review returns `no_change`; a review submits an identical blueprint; unchanged manual draft; old superseded draft URL; creation with no base; no extra programme revision or activation for a no-op.                                                                                      |
| Request coverage   | One note with curls and core asks; read-but-unresolved queued note reaches later review; remembered preference does not close an action; missing/duplicate/foreign request IDs rejected; result claims an addition absent from the diff; session addition cannot close a programme request. |
| Decision lifecycle | Proposed → approved → applied; rejected/withdrawn; already satisfied by the exact exercise; deferred with condition; non-recommendation with reason; question and answer; partial decisions; old legacy dispositions.                                                                       |
| Reliability        | Duplicate note submissions and results; expired attempts; failed dispatch; new note during a claimed review; daily/request/scheduled jobs competing; changed active programme or intake; changed draft; open workout; repeated evidence; quota/coach-off behaviour.                         |
| Continuation       | Review clarification resumes review rather than creation; answers stay linked; unresolved requests remain queued; completed review clears only covered items; no permanent nightly requeue loop.                                                                                            |
| Data protection    | Ownership and RLS for request/source/decision/proposal joins; migration preserves historical workouts and note sources; request overflow remains pending and pageable.                                                                                                                      |
| UI behaviour       | Correct links/status for creation, proposal, applied, unchanged, superseded, failed, and needs-input cases; updated assessment after refreshing a draft; no second programme rendered under the diff.                                                                                       |

Include dedicated timing checks: submitting a request does not dispatch a routine; an unrelated
on-demand session job does not assess it; the next daily batch handles both ordinary-review-due
and not-due cases; a required review handoff drains in the same batch; notes/answers arriving after
the input snapshot wait for the next daily run; and an open workout or a failed batch produces an
explicit pending/blocker status rather than a falsely completed request.

Run the focused domain, repository, route/action, and component tests for changed behaviour, then
the project's required type, lint, format, test, and production-build checks. Use the repository's
existing commands and investigate failures against the actual changed scope. Do not claim a full
application pass from documentation checks.

Review implementation fixtures at 320px and a typical phone width, plus desktop, in both themes.
Cover all change kinds, a long exercise name, an empty diff, a mixed request outcome, an applied
review, and an open-workout footer. Verify that the navigation island/resume strip does not hide
the final diff row or approval controls, and keyboard/focus behaviour remains usable.

Use synthetic coaching evaluations as well as schema tests. Include a feasible explicit request,
an absent exact library exercise, conflicting preferences, two requests with different outcomes,
a request saved after the review snapshot, and a note whose actionable part is wrongly classified
as mere memory. Passing reference validation alone does not prove that the coach understood the ask.

### 7.3 Planning handoff

The planning deliverable is this agreed document committed on
`codex/coaching-review-improvement-plan`, branched from the `main` baseline recorded above.
Before delivery, check Markdown formatting, local source links, the Git diff, and the committed
file list. Report the verified commit, branch, and document path.

The acceptance checkboxes in section 7.1 and test scenarios in section 7.2 belong to the later
implementation. This planning task does not claim that those application changes or tests have
been completed. Only this Markdown document belongs in the planning commit; preserve existing
unrelated untracked work. Publishing, deployment, and the later progression research are outside
this handoff.

## 8. Source map

The current implementation, not older planning prose, establishes the baseline described above.

- [Review cadence](../../src/domain/coach-cadence.ts) and
  [dispatch/result acceptance](../../src/server/repositories/coaching-jobs.ts).
- [Note dispositions and memory contract](../../src/domain/coach-memory.ts),
  [note receipt persistence](../../src/server/repositories/coach-memory.ts), and
  [job context](../../src/server/repositories/coaching-context.ts).
- [Migration 0023](../../src/db/migrations/0023_coach_note_dispositions.sql) and
  [coach schema](../../src/db/schema/coach.ts).
- [Change authority](../../src/domain/program-change.ts),
  [evidence checks](../../src/server/repositories/coaching-guardrails.ts), and
  [draft activation](../../src/server/repositories/program-drafts.ts).
- [Current duplicated preview](../../src/components/coaching/draft-preview.tsx) and
  [draft page data](../../src/components/coaching/draft-page.tsx).
- [Programme and Cycle](<../../src/app/(app)/profile/programme/page.tsx>),
  [saved work](../../src/components/coaching/saved-work.tsx), and
  [coaching activity](../../src/components/coaching/activity.tsx).
- [Job status](../../src/components/coaching/job-status.tsx),
  [question continuation actions](../../src/server/actions/coaching-workflow.ts), and
  [note submission](../../src/server/actions/coach.ts).
- [Current coaching policy](../../src/domain/coach-policy.ts),
  [runtime coach skill](../../.claude/skills/coach/SKILL.md), and
  [routine setup](../coach-automation.md).
- [Existing interface conventions](../decisions/0016-today-and-the-programme.md) and
  [previous AI coach plan](AI_COACH_IMPLEMENTATION_PLAN.md). Older schedule/authority statements
  in these documents must not override the current code or the user's decisions for this work.
