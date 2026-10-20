# Plan and independent programmes

Rebuilt as Plan on 20 October 2026 (ADR 0058); the Training layout of 18 October is superseded.

Surface mode: Operate. This extends Form v2; it preserves its fonts, pigments, controls,
fluid scale, navigation and PWA behaviour.

Plan is what comes next and how it is built; Today is now, and Progress is what is done. Plan
opens with This week: every sport's sessions by date, Monday to Sunday. Today's rows point to
Today, past ones read Done, Skipped or Missed, and a run, ride or swim opens its page to move or
skip it. The lifting day Today offers stands on today, wherever the calendar put it. Then a card
per programme, and Past programmes. Logging is Today's: its cards, and Log for anything else.
Profile keeps general coach settings.

Only existing programmes have cards. A card names its sport and programme, how it runs, where it
has got to and any change waiting, and opens the programme's one page, `/plan/[sport]`. It never
names the next session, which is Today's, or draws a bar, which is the page's. The page holds
Edit programme, coach review and changes to approve; Replace, Duplicate and End programme sit
under its More options. Ending asks for confirmation, closes outstanding sessions and preserves
completed history; the programme moves to Past programmes, every sport's in one list. New
programme offers a sport, then Repeating, Progressive or With the coach. There are no templates:
session templates, saved routines, the session library, one-off scheduling and single sessions
from the coach are set aside, their data kept. Four empty sport cards and sport tabs stay
rejected. A merged Today and Plan, and a switch inside one tab, were rejected too: the screen
opened several times a day grows longer, and programme management hides below it or behind a
control.

## Direction contract

THESIS: See what comes next at a glance; understand a programme on one page; edit repeated work
once.

OWN-WORLD: Form v2's ground and surface, Jost titles and Atkinson text, existing sport pigments
and marks, native fields and 44-point or larger actions. No new palette or component family.

STORY: Open Plan to see the week: what was done, skipped or missed, what Today has for today,
and what comes. Open a programme to see how it runs and where it has got to, then edit or end
it; start a new one by sport and method. Go back to Today to log.

FIRST VIEWPORT: Plan heading with New programme, This week with its dates and a step to either
side, then the programme cards: two columns on desktop, one on phones and at larger text. With
no programme, New programme is the page's own button, and the week shows only when something is
dated.

FORM: New programme asks for the sport before the method. Repeating and Progressive open the
builder already set to run that way; With the coach opens the sport's questions. A sport with a
programme says what the new one replaces. Ending is confirmed in place and says what goes and
what stays. Moving a session asks only for its new date. Logging's form is Today's Log, where
the session a log counts as and its training date are separate questions.

BEHAVIOUR: One active programme per sport. Lifting follows session order; endurance follows
dates. This week reads both: the lifting day Today offers on today, other days on the dates the
calendar gave them, and a session missed once its day has passed unanswered. A run, ride or swim
programme's weeks carry no dates; the dates are This week's. Coach context includes the other
programmes; changes to them are separate proposals for approval. Existing drafts and history
stay reachable. Motion follows the existing shell, with no new entrance sequence. Reuse the
existing online PWA and local draft recovery.

EDITING: One selected day or session. Programme settings and advanced details are disclosed on
request. Strength distinguishes a rolling cycle, a repeating week, and a finite sequence of
independent days. Endurance offers a repeating-workout outline and a week view; only identical
prescriptions are grouped. Choose this session or matching future repeats, with an affected
count. Four-day repetitions keep separate occurrence identities even when two fall in one week.
Progressive targets and individual exceptions stay independent. A manual replacement is a new
block with an explicit start date; an edit keeps the existing start and position. See ADR 0057.

## Verification

Use disposable local accounts. Required captures of Plan, a strength and an endurance
programme's page, New programme and Past programmes: desktop at 1440, phone at 390, phone at
320, and 390 with 200% root text. Verify This week against Today (today's rows lead there, the
lifting day Today offers stands on today, missed and skipped sessions read so), stepping between
weeks, a programme's weeks without dates, New programme's three methods, End programme and Past
programmes, programme editing, history preservation, keyboard/native fields, manifest and
service worker. Logging is verified with Today and Log. Installed iOS/Android OS-specific
behaviour still needs a real device check.

Closed programme policy remains ADR 0054 pending the owner's answer about backdated scheduled
logs after a programme is replaced or ended; a session of an ended programme keeps its answer,
and Counts as cannot move it. Past sessions of a continuing programme stay loggable.
