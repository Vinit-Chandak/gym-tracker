# ADR 0007: Phase 6 running

Date: 2026-09-08
Status: accepted

## Context

Phase 6 adds run logging and the running side of the warnings. The user decided: runs live in
their own Runs tab; a run records both distance and duration with the pace derived; shin
scores are entered once, after the run, and are optional; and treadmill runs are the same
kind of run with a "treadmill" flag rather than a separate type.

## Decisions

1. **A sixth tab.** Runs sits next to Today in the bottom navigation. The spec listed five
   tabs; the user asked for a separate Runs tab, so the navigation now has six. Gyms can be
   folded into Settings later if the bar feels crowded.

2. **One form, after the run.** Date and time (defaulting to now, entered in the profile's
   time zone), a treadmill checkbox, distance in km and duration in minutes and seconds (both
   required; the pace is shown live and stored as a generated column), optional RPE 1–10,
   optional shin scores before, during and after for each side, an optional link to one of
   the current cycle's planned runs, and notes. Runs can be edited and deleted.

3. **Planned runs follow the cycle.** The programme's runs are stored per week and weekday
   (Wednesday and Saturday). The "current week" is the cycle of the next pending slot, so it
   shifts with the lifting schedule instead of the calendar. A new run defaults to the first
   planned run of the cycle that has nothing logged against it; "Unplanned run" is always
   available. Runs never advance the lifting sequence.

4. **Volume is summarised by calendar week** (Monday to Sunday in the profile's time zone):
   minutes, km and run count for this week and last week. The spike flag fires once the
   current week already exceeds last week's minutes by more than 30 percent, and only when
   last week had runs. Advice only.

5. **Shin escalation from the numbers we have.** A side whose score rose during or after
   each of the last three runs, or whose after-run score climbed run after run, shows a
   "Shin check" card advising to stop adding time, keep runs easy or swap for walking or
   cycling, and get it assessed if the pain is pinpoint or present while walking. The
   qualitative parts of the training-context rule (pinpoint, at rest) are not collected as
   data; the notes field is the place for them.

6. **Runs are not tied to a gym.** The schema keeps `gym_id` and `surface` for later, but the
   form does not ask for either; treadmill is a flag on the run.

## Consequences

- No migration: the `runs` table from Phase 1 already had every column, including the
  generated pace.
- Today's run-day card links to the log form; the History tab still lists lifting sessions
  only. Merging runs into History and charting weekly volume belong to Phase 7.
- The coach API (Phase 8) can read runs and the weekly summary from the same repository.
