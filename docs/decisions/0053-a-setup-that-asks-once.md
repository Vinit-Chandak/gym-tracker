# ADR 0053: A setup that asks once

Date: 2026-10-11
Status: accepted; amends decision 7 of
[ADR 0041](0041-gym-basics-the-coach-backup-rule-and-machines-with-several-types.md) and the
onboarding flow of the
[onboarding, equipment and technique plan](../planning/ONBOARDING_EQUIPMENT_TECHNIQUE_PLAN.md#onboarding-flow).
Decision 2's units amended by [ADR 0056](0056-distances-start-from-the-weight-unit.md): the
weight chosen in the sheet carries the distances with it, and they are kept on the profile.

## Context

The [onboarding audit of 10 October 2026](../audits/2026-10-10-onboarding.md) walked sign-up to
Today as a beginner and as an experienced lifter. Everyone went through the same six screens.
The name, the username and the password were each asked twice, and the machines step asked a
newcomer to recognise machines they had never stood in front of. One six-day template was
chosen for everyone, swimmers included. Thirteen bugs turned up along the way, among them a
swimmer told to add a gym and a resume that sent beginners back to the machines step.

On 10 October the owner chose a shorter flow, drawn on a Claude Design canvas, with four
decisions recorded in the audit. On 11 October they asked for it to be built, with the bugs
fixed.

## Decisions

1. **Sign-up asks for a name (optional), an email and a password with Show.** There is no
   username field and no second password box. The username is made from the name
   (`Bea Newcomer` becomes `bea.newcomer`). When the rules accept nothing from the name, it is
   made from the email, and it is numbered 2 to 9 when taken. It can be changed later in
   Profile.
2. **The first step asks two things:** "Which sounds like you?" and "What do you train?".
   Nothing is ticked until the athlete taps.
   - Units and the time zone come from the phone, shown as one line that names only what the
     chosen sports use ("lb · miles · New York time"), and are changed in a sheet.
   - Pounds, miles and yard pools apply where the language's region is the United States,
     Liberia or Myanmar; metric applies elsewhere.
   - Someone who does not lift finishes setup here.
3. **Where comes before what.** A lifter chooses Gym, Home or Outdoors, then gives a name if
   they want one. There is no Skip, so Today always has a place to start a workout from.
4. **Machines in setup** depend on the place and on experience:
   - **New to this, at a gym:** no machines step. The basics are assumed, and the workout asks
     about anything else the first time it is used
     ([ADR 0041](0041-gym-basics-the-coach-backup-rule-and-machines-with-several-types.md),
     decision 3).
   - **Already trains, at a gym:** an optional "Anything unusual at {gym}?". It shows the
     basics as one line with Review, then five machines that a serious gym has and a chain gym
     does not: a belt squat, a glute-ham developer, a trap bar, a reverse hyper and a safety
     squat bar. One search covers every type. The basics are included in it, marked "Usually
     here, counted already", with Not here beside them. Browse all holds everything else.
   - **Home and outdoors, whatever the answer:** the place's short set, as pictures to tick,
     and Browse all. Nothing is assumed there.
   - **No Skip.** Continuing with nothing chosen is the way past, and it keeps whatever was
     ticked.
5. **A beginner's plan is the coach's.** The coach's questions sit on one screen inside setup:
   - What they ask: goal, days, height, weight and age, and anything that hurts.
   - What is filled in from setup: the place, the sports, the experience, the units, and any
     height, weight or age already on the profile.
   - While the coach writes, the athlete may look around the app. Signing in again returns
     them to the writing screen, then to the programme the coach wrote.
   - They start that programme or ask for changes. "Just log workouts for now" is always the
     alternative.
6. **Someone who already trains chooses how to start**, from four options:
   - **Log my own workouts:** pinned and first.
   - **Set up my split:** named days in order. Each exercise starts at the library's usual
     target for three sets, and the split repeats from a start date.
   - **Follow a programme.**
   - **Let the coach write it:** the detailed questions, without asking again what setup
     already knows.
7. **Setup resumes from what is saved:** the first step's answers, then a place, then a
   programme being written or already written. A step that may be passed with nothing chosen
   is never resumed.
8. **Today follows the answer.** Someone who does not lift is never asked for a gym and logs
   their sports from Today. Someone who chose to log their own workouts sees Start a workout
   first and Choose a programme after it.

## Consequences

- **Removed screens and actions:**
  - The sports step (`/welcome/sports`) now redirects to the first step.
  - The profile step's form, the first-gym form and setup's Skip link are gone, along with
    `saveOnboardingProfileAction` and `chooseSportsAction`.
  - Setup no longer links its programme builder (`/welcome/programme/manual`).
- **Step dots** follow each athlete's own path:
  - three (You, Where and Your plan) for a beginner at a gym;
  - four for a home path or for someone who already trains;
  - none for someone who does not lift.
- **The coach in setup** uses the same intake and actions as Profile's coach form. That form is
  unchanged.
  - Asking for changes to a first programme discards its draft and asks the coach again,
    passing on the notes.
- **The split** writes a programme blueprint directly: a sequence of days, with each weekday
  counted from the start date, repeated 52 times.
- **Older accounts:**
  - Their sports defaults stay until they choose.
  - An account part-way through setup resumes at the first step of the new flow that it has
    not answered.
