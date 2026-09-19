# The pre-session check-in (for review)

The check-in is the short, optional questionnaire that appears after you tap **Start** on a
session and before the exercise list. Everything on it can be skipped with one tap, and it can
be reopened from the session while the session is still open.

## What it asks

| Question                 | Scale                    | Why it is there                                    |
| ------------------------ | ------------------------ | -------------------------------------------------- |
| Sleep last night (hours) | number, e.g. 6.5         | Short sleep is the clearest signal to hold loads   |
| Sleep quality            | 1 (poor) to 5 (great)    | Separates a short but good night from a broken one |
| Energy                   | 1 (flat) to 5 (fired up) | How you feel walking in                            |
| General fatigue          | 1 (fresh) to 5 (wrecked) | Accumulated tiredness across the week              |
| Soreness                 | 1 (none) to 5 (severe)   | Muscle soreness from the last sessions             |

Every value is stored on the session itself. The lower-back and shin scores this screen used
to ask for are gone: they were one person's rehab tracking, and the app asks nobody for them
now. Anything of that kind belongs in the session's own notes, where the coach reads it.

## What it is used for

Since Phase 5 the scores produce **advice only**, shown in a "Recovery check" card at the top of
the session. Nothing here changes the prefilled targets: the card says what it saw and what it
would do about it, and every set is yours to set as you find it.

| Warning       | Fires when                                                | Advice shown                                                |
| ------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Short sleep   | Sleep under 6 h                                           | Hold loads rather than adding; keep RIR honest              |
| Low readiness | Sleep quality or energy at 1, or fatigue or soreness at 5 | Maintenance day: repeat last loads, stop at the planned RIR |

The thresholds live in `src/domain/recovery.ts` so they are easy to change. Progress charts the
same readings over the programme, next to body weight and volume.

## Open questions for you

1. Are the thresholds above right for you, or would you rather set them yourself in Settings?
2. Answered: advice only.
3. Is a separate day-level recovery log wanted for rest days (the schema has room for it), or
   is the per-session check-in enough?
