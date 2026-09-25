# One change at a time, shown once

On 25 September the owner had two coach proposals waiting at once. One answered their note
that Anytime Fitness has no horizontal leg press; the other added a Bayesian cable curl. Both
also changed every run in every remaining week, so the running change appeared twice and
approving either would have done it. Most of that running change was not real. Migration 0034
moved `program_runs` effort to a 1–5 scale but left stored blueprints on the old 1–10 scale.
Each proposal was therefore read as raising every easy run from 1–2 to 3–4. Approving one
would also have prescribed 3–4 out of 5, a hard run, where the athlete had approved an easy
one.

On a copy of that account, the change screen for one of them was 5,800 pixels tall:

- programme notes;
- the same run row for every week, including weeks already trained;
- a "Why this" for a change the athlete had asked for;
- a paragraph each about the decision, the approval, the training data and when it takes
  effect.

The Changes tab showed every settled request and every past review in full.

A declined change could return in the next review, and a decline and a request for revisions
were stored the same way. Session preparation for runs could not succeed: the writer was never
shown the approved run text it had to copy word for word. And rep targets had no basis beyond
the model's judgement. The research workbook reached the coach only as a general reference, so
nothing stopped a slot being given a range too narrow to progress in: no room to add a rep
before the next load step.

## Decisions

1. **One coach proposal waits at a time.** A review that proposes while another proposal is
   pending replaces it (`closed_as = 'replaced'`). The review sees the pending proposal as
   `pendingProposal` and is told to build on it. A result identical to the pending proposal
   leaves it in place. Requests carry over to the new proposal only if their change is kept
   exactly; otherwise they go back to the next review. Nothing is applied automatically while
   a proposal waits.
2. **Decisions stay decided.** `program_drafts.closed_as` records how a proposal closed:
   declined, sent back for revisions (with the note), discarded, replaced, or outdated. The
   coach reads this as `recentDecisions`. A declined change cannot be proposed again for
   14 days, unless the athlete asks for it again. The server identifies a repeat by a
   fingerprint that includes the direction of the change, so a run cut can come back as a run
   cut only after 14 days, while a run increase is a different change. A request for revisions
   brings the review forward.
3. **Weeks already trained are not changed.** The review is told the current week
   (`programPosition`). For a change that continues the block, the server restores any earlier
   week a result touches. A new block starts its weeks again, so it has no finished weeks to
   keep.
4. **Approving applies the change to every remaining week, from the next unstarted session.**
   The only question left on the screen is a start date, and only for a change that has to
   start a new block.
5. **A change is shown once.** `summariseProgramDiff` sits between the raw diff and the
   screen:
   - it hides programme notes;
   - it hides weeks already trained;
   - it folds one run's weekly rows into a single entry ("14–16 min in week 3, building to
     19–21 by week 8");
   - it shows prose once as its new text.

   The screen shows the headline, then the change, then the three answers. Lines produced by
   a request are tagged with the athlete's words. "Why" appears only when nobody asked for
   the change. The full programme with the change applied is linked last.

6. **Settled items move off the Changes tab.** The tab shows only what is waiting for the
   athlete, what the coach is still working on, and recent automatic updates. Past requests
   and changes have their own page. The review history section is gone: a review that changed
   nothing is not news, and one that changed something already has an entry.
7. **0037 rescales run effort in stored blueprints.** It applies 0034's halving to drafts and
   retained "programme before" records written before 0034 shipped. It then closes the
   proposals still pending from that time as `outdated` and returns their requests to the
   coach, whose next review proposes them again if they still apply. The template's easy runs
   are now 1–2 of 5, not 3–4.

   0034 also left every scheduled session's own prescription on the old scale, intending the
   next programme revision to rewrite it. Athletes who had approved nothing since still saw
   "Effort 3–4" on next week's easy run. 0037 applies that revision now:
   - It covers every session still ahead that is not logged or cancelled and whose
     prescription is on the old scale, including one copied unchanged by a move.
   - Each gets a new version with the effort halved.
   - The old version is kept as history, and a coach preparation written against it is
     withdrawn.

8. **Rep ranges start from a role band.** `src/domain/rep-bands.ts` assigns each exercise a
   role:
   - main compound;
   - free-weight compound;
   - machine compound;
   - isolation;
   - small isolation;
   - trunk.

   Each role has a strength band and a muscle band (reps and RIR), chosen by the athlete's
   goal. Each exercise lookup includes its band. A review sees how far each current slot is
   from its band. Outside the main barbell lifts, the server refuses a new or changed rep
   range narrower than two reps. The coach may depart from a band only for a reason it states.
   The bands are versioned (`REP_BANDS_VERSION`) with the policy.

9. **Run preparation copies from the approved prescription.** A preparation receives the
   approved prescription as `occurrence.prescription`. If it leaves out the guidance text,
   the approved text is kept. Today and the log screen show the prepared target when one
   exists.

## Not changed

The contract version stays 6. The context gained fields and renamed `decisions` to
`recentDecisions`, but no version of the skill referred to `decisions` by name. The shape of a
result is unchanged. A routine on an older clone therefore still claims and completes jobs.
Anything it gets wrong under the new rules (a repeated decline, a narrow range) is refused
with the issue named, and the attempt can correct it.

Programmes created from the template after 0034 and before this change keep whatever run
effort they were created with. 0037 corrects only what was written before 0034. A newer
active programme is the athlete's own and is left for them, or the next review, to change.
