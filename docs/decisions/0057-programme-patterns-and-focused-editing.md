# Programme patterns and focused editing

Date: 18 October 2026. The owner requested a complete Training rebuild, retaining Form v2.

## Decision

Training leads with existing programmes, their cadence, progress and next session. View and
Edit are immediate; replacement, duplication and archive are secondary actions on the programme.
Logging remains a compact row, and saved work and the session library stay available. No new
typeface, palette, animation package or UI library is introduced.

The editors show one selected day/session. Settings and advanced targets are disclosed when
needed. Review shows changed prescriptions, grouping identical repetitions instead of printing
the whole programme twice. The athlete still explicitly applies the reviewed draft.

| Programme                  | Representation                                             | Editing behaviour                                 |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| Four-day strength cycle    | Four days, including rest                                  | Edit a day once for future cycles                 |
| Weekly strength programme  | One week and its weekdays                                  | Edit the week once                                |
| Progressive strength block | Finite sequence, up to 364 independent days                | Each day has its own targets and is followed once |
| Repeating endurance        | Dated occurrences grouped by exact prescription and series | This session or matching future repeats           |
| Progressive endurance      | Week selector and independent prescriptions                | Different targets remain separate                 |

Cadence and prescription equality are separate concepts. Names alone never establish a repeat.
Explicit series metadata and legacy lineage are preferred; exact-content legacy occurrences can
be recognised when their cadence is regular. A single-session exception splits from its former
group. Bulk changes preserve dates and occurrence identities. New four-day repetitions mint
distinct occurrence lineages, so two in the same week are both real sessions. Past and logged
prescriptions are frozen by the repository, not merely disabled by the interface.

`repeats: once` adds a single-pass strength sequence without changing existing weekly/rolling
records. Its scheduled end is the final day, and repeat cycles retain their 31-day limit.
Migration 0062 expands only the allowed repeats constraint. No historical records are rewritten.

A manual draft retaining the programme slug edits the current block. A newly built or duplicated
manual draft has a new slug and starts a new block, with the selected start date. The activation
path enforces this distinction. Replacement closes the old programme's outstanding work while
preserving logged history, and affects only the selected sport. Renaming a day or changing its
focus requires review but does not reset progress.

## Research and consensus

Independent UX, interface and domain audits agreed on reusable patterns, explicit editing scope,
and progressive disclosure. The following informed the decision; forum reports are examples of
pain, not evidence of market-wide adoption.

- [Boostcamp's builder](https://www.boostcamp.app/features/program-builder) distinguishes repeating
  and periodized weeks. Its [users report repetitive editing and lost changes](https://www.reddit.com/r/Boostcamp/comments/1jjqd2u/program_changes_are_completely_gone/).
- [Hevy routines](https://www.hevyapp.com/features/gym-routines/) separate reusable plans and logs.
- [TrainingPeaks recurrence](https://help.trainingpeaks.com/hc/en-us/articles/11461052547853-Recurring-Workouts)
  demonstrates individual/future editing scopes. Its documented limitations are not requirements here.
- [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) and
  [mobile accordion guidance](https://www.nngroup.com/articles/mobile-accordions/) support a focused
  editor with visible context rather than an endless stack of open forms.

The installed Overload, Impeccable, mobile, accessibility and Vercel React guidance supplied the
design and verification checks. The user's instruction to decide autonomously superseded optional
design interviews. The existing Form v2 visual system remains the authority.
