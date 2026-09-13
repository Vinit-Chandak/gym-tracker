# Two ways in, and nothing asked twice

Programme creation asked everybody the same twenty-odd questions across six tabs, and the AI
coach screen explained its own scheduling. A review on a phone found a beginner being asked
which machine a self-reported lift was performed on, a required "rest day for your weekly
review" standing between them and a programme at all, and a screen whose first sentence was
the hour the nightly batch runs. This record covers what changed and the rules that now apply.

## Rules

1. **Ask how much to ask, first.** The opening screen is two cards: _I'm new to this_ and
   _I already train_. The guided route is one screen — goal, injuries, training days, gym or
   home, and one box to write or speak into. The detailed route is five steps. Both end at
   the same confirmed answers, so nothing downstream knows which was used.
2. **Scheduling is not a question.** The weekly review lands on a weekday the athlete does
   not train, chosen by `reviewWeekdayFor`: a free day beats a run day, a run day beats a
   lifting day, and a tie goes to the later day in the week, so a Monday-to-Friday lifter
   reviews on Sunday. It is derived when the intake is confirmed and again when a programme
   is activated, since the activated days are the real answer. The seven-day minimum between
   reviews is unchanged.
3. **Gym or home, and nothing else about the place.** `trainingLocation` is the only location
   question. The server resolves it to a location, creating one the first time somebody
   confirms, so no list of gyms and no question about machines appears during setup.
4. **Answers already given are shown, not asked for.** Height, weight and age arrive from the
   profile, in the account's own units, on the first screen rather than inside a collapsed
   "optional body measurements" section. They are required to confirm, because a programme
   written for a body nobody described is a guess.
5. **A self-report is prose.** What the athlete lifts now is one box — "incline bench 60 kg
   for 8" — replacing a per-exercise grid of load, unit, convention, machine, date and note.
   The coach treats it as a starting estimate and corrects it from logged sets.
6. **You can speak into any long answer.** `SpeechTextarea` puts a microphone inside the box
   where the browser has speech recognition, and draws nothing where it does not; the
   keyboard's own dictation key still works either way. Recognition is the browser's, so
   there is no upload, no key and no cost per minute.
7. **A step shows where you are, not a row of tabs.** Five bars and "Step 2 of 5", with Back
   and Continue in a bar that sticks above the navigation island. Six wrapped tab buttons and
   a "Save and finish later" hanging below the fold are gone; saving is continuous and the way
   out is one quiet control beside the step's name.

## What was removed outright

The review-day select and its save button on the AI coach screen, and `saveReviewWeekdayAction`
with them — which is what used to answer a review-day change with "Complete your coaching
intake first". The line saying when daily preparation runs and that logging does not start AI
runs. A succeeded run reported as activity. The location select and its "add a training
location" link. The `baselines` array, `priorities`, `physiqueGoal`, `measuredOn`,
`reviewWeekday` and `ageRange` from the intake; `ageYears` replaces the range, and
`recentTraining` carries the self-report.

## Not changed

The coach contract, the job and draft lifecycle, the seven-day review cadence, the programme
builder, and the four-step welcome flow with its gym and machine steps — those are next.
Existing intakes keep working: removed fields are dropped on the next parse, and an athlete
part-way through one lands on the route chooser with their answers intact.
