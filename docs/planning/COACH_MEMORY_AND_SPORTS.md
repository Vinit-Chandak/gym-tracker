# Coach memory and sport views

The programme can contain workouts, running and future sports. This change separates their presentation, keeping the existing combined programme calendar.

## What the coach receives

- Current profile: name, time zone, preferred load unit, age calculated from date of birth, latest body weight, height, sex if provided, and profile training goal. These now reach creation, daily preparation and weekly review directly.
- Confirmed intake: programme goal, experience, self-reported starting performance, original measurements, workout and running frequency, preferred days, available time, location, restrictions, preferences, avoided exercises, clarifications and attached reports.
- Active programme, equipment, logs, recovery, seven days of detailed history and 56-day exercise evidence.
- Coach memo and saved Tell the coach notes.

Current non-null profile measurements take priority over intake measurements. A conflicting goal needs clarification; it does not silently change the confirmed programme brief.

## What is remembered

The coach maintains useful preferences, repeated trends, exercise-specific observations, experiments and decisions. Each entry has an ID, category, text, optional sport, status, supporting source IDs, an optional direct quote, a reassessment date where needed, author provenance and update time. Maximum 40 entries / 3,000 words / 40,000 text characters, with 2,000 characters per entry. These are limits, not a request to fill them.

Direct athlete reports use `reported` with an exact, verified quote from an owned note or confirmed intake. Inferences remain `observation` or `hypothesis` and require reassessment within 56 days. Legacy athlete edits retain their protection. A newer note can explicitly correct or remove a remembered report; the coach must cite that correction. Evidence ownership and exact quotation are verified by the server; interpreting relevance and meaning remains the coach's responsibility.

Do not duplicate profile measurements, raw logs, calculated metrics or each day's plan. Do not store speculative diagnoses or turn one bad day into a persistent label. The old prose overview is treated as unverified context during transition.

## Tell the coach

There is no direct memo editor. Each submission is retained as a separate message, with a stable submission ID for retry protection. Existing saved notes are backfilled. The original submission time of legacy notes is unknown; their memo creation date is used conservatively rather than presenting them as freshly reported symptoms.

The next scheduled or otherwise authorized coaching job reads up to 50 oldest unreviewed notes plus the latest 10. The coach extracts useful information, applies explicit corrections and acknowledges reviewed message IDs atomically with its result. Excess pending notes remain pending for a later job. Saving a note does not start an extra AI call or change an open workout. Temporary session adjustments from recent notes require an exact quoted report and do not change the retained baseline.

## Sport destinations

Runs shows the current running prescription, run-specific summary, pace and stop guidance, workload warnings, and log/skip actions. Today shows workout guidance. Warning routing uses structured warning codes, including previously saved `run_jump` warnings. The 19 to 25 minute warning is a rounded `(25 - 19) / 19 = 31.58%` change; moving it does not alter the saved prescription.

New plans carry separate `sportSummaries.workout` and `sportSummaries.run`. Legacy combined summaries remain stored, but sport screens use a neutral fallback instead of guessing which sentences belong to which sport. Whole-programme reviews remain in programme/settings views. Run logging respects the explicitly selected occurrence rather than overwriting it with another day's coach targets.
