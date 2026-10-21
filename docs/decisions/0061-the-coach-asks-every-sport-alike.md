# ADR 0061: The coach asks every sport alike

Date: 2026-10-21
Status: accepted, built on the owner's request of 21 October 2026 ("go through the create
programme with coach workflow for the strength workout … the file attachment is not there for
runs … it might have run history … swimming or cycling history … put them in the other sport
workflows as well"). Amends ADR 0059 (the running questions) and ADR 0060 (decision 5).

## Context

New programme › With the coach asked each sport differently. Strength's questions (ADR 0060,
decision 5) took plans and reports to attach, let the athlete speak into every long answer,
asked what they lift now and the days they can train, showed the coach's earlier questions with
the answers given, kept Back and Continue in view, and said so, in one line with Build it
yourself, when the coach was taking no new programmes. Running's (ADR 0059) asked its goal,
fitness, week and places, but took no files, though a runner's history is most often a watch's
export, and kept its asking at the foot of a long form. Cycling's and swimming's were six boxes
with no days, nothing about where the athlete is now, and no files. Neither of the endurance
forms knew the coach was paused until the request was refused.

The server never made the difference: an intake of any sport carries `attachmentIds`, a creation
request reads the files it names, and a review reads them all.

## Decision

1. **Plans and reports for every sport.** Running, cycling and swimming take Reports and plans
   as strength does, in the same words and with the same limits (PDF, image, CSV or text, 5 MB
   each, five a request, twenty kept). The files are the account's, not one programme's: every
   kept file is listed with its tick, so a watch export added for a run can go with a ride.
   Remove deletes it from the account wherever it is listed. A file removed since the answers
   were saved is left out of them when they are opened again.
2. **Where you are now, for a ride or a swim.** Cycling and swimming ask, under Your fitness now,
   the sport's experience in its own words and "What you ride now" or "What you swim now", strength's
   What you lift now for their sport (`recentTraining`), with the files. Running keeps its own
   evidence (a recent race, a usual week, the longest run).
3. **The days, for a ride or a swim.** When you can ride (swim) asks Rides (Swims) a week, the
   days, as running asks them (leave empty for any, kept in the sport's own answers), and the
   minutes on a usual one.
4. **One layout for the three.** Cycling and swimming are laid out as running is: Your goal,
   Your fitness now, When you can ride (swim), Where you ride (swim), each a section of cards.
5. **What strength's questions do, every sport's do.** Dictation in the long answers (a goal in
   your own words, your brief, where you are now, what limits you); What the coach asked, folded,
   with the answers given on an earlier request; Ask the coach for a programme kept in view as
   the screen's pinned actions, with Save answers under it and any failure above it; and, while
   the coach takes no new programmes, its one line in place of the questions when nothing was
   answered yet, or above a disabled Ask with Save answers still open when something was.

Strength's two routes (New to this, I already train) and its Review step stay strength's: an
endurance form is one screen, read whole before Ask, and its experience question is the route.
Its body measurements stay strength's too: the coach reads them from the profile.

## Consequences

- The coach's create request for a ride or a swim carries `sports[0].preferredDays` and
  `recentTraining`; `docs/coach-workflow.md` says to honour them as it says for strength.
- `CoachFilesField`, `useCoachFiles` and `sendCoachFiles` (`src/components/coaching/coach-files.tsx`)
  hold the files for every form, setup's upload included; `CoachAsked` and `CoachPaused` hold the
  coach's questions and the paused line.
- Remove is named by its file ("Remove Watch export.csv"), as Download is.
