# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: an athlete who trains five or six days a week at two or three gyms, lifting first and running
(sometimes cycling or swimming) beside it, with a phone in hand between sets. iPhone-first, installed
as a PWA from Safari; Android from Chrome. A small circle of friends on the same app follow each other.

Situations that matter, in order of how often they happen:

1. Between sets, 60–180 seconds of rest, one hand, sweaty, under gym lighting, standing. Reading the
   next target and logging the set just done.
2. In the morning (or the night before), reading what the coach planned for today and why.
3. In the evening, logging food against the day's targets.
4. About weekly, reading a coach proposal and approving, asking for changes or declining it.
5. Occasionally: setting up a gym's machines, creating or editing a programme, comparing with a friend.

Secondary (inferred from the brief, not confirmed): the owner's friends, who have their own accounts and
the same features. There is no coach-side or admin user interface; the coach is an automated routine.

## Product Purpose

Overload is an AI-coach-driven training system. The house coach plans the athlete's next training day
overnight (exercises and machines for the gym they will be at, sets, reps, RIR, loads, warm-up, a
one-line reason per exercise, and the run when the day runs). The athlete logs it fast. About once a
week, on a rest day, the coach reviews the training that happened and proposes changes to the
programme, which the athlete approves. Nothing in the programme changes without approval, and every
change carries its reason.

Success: the athlete opens the app and knows what to do today and why; every set is logged in seconds;
the coach's reasoning is visible enough to be trusted; progress and recovery are legible over months.

## Positioning

The mechanism a neighbouring app cannot truthfully copy: a coach that reads the athlete's real history
per gym and per machine (stack numbers from different machines are never mixed), plans the next session
with reasons, and revises the programme as versioned, explained, approval-gated changes. Programmes are
data (blueprints), so the coach, a template and a hand-built plan all produce the same kind of thing.

## Operating Context

- Multi-gym: a workout belongs to one gym; each gym has its own machines (from a catalogue of 92 kinds);
  per-gym programme fit with fallback exercises; a one-off "re-plan at another gym" before a session.
- Programme: a blueprint of cycle days (e.g. Lower A, Upper A), each with exercises, sets, rep bands,
  RIR, rest and loads; versioned; "Cycle" is the only full view; "Changes" holds proposals, request
  outcomes and past reviews as day-grouped diffs.
- The coach runs daily at 04:00 Asia/Kolkata and on explicit requests. Programme creation and pre-start
  gym re-plans share three requests per athlete per local day. "Ask for a review" is once a week. A
  note to the programme becomes a durable request answered at the next nightly run. The app shows
  whether a job is working or waiting for the next nightly run, and a tap can start it now.
- A six-step intake creates a programme request: goals and a brief, weekly availability (lifting and
  running separately), starting point, optional self-reported lifts, reports (PDF/JPEG/PNG/CSV/text/
  Markdown, up to five per request), confirmation. Drafts show targets, rationale, uncertainties and
  opening-session guidance, and can be edited, discarded or activated.
- Logging: three measures (reps, seconds held, metres covered); warm-up vs working sets; RIR for rep
  sets, RPE for timed sets and carries; supersets; substitutions with a reason; add/skip exercises;
  next-load suggestions from the machine's own history; records announced on finish; a check-in of
  recovery readings; a rest timer that is off by default and must never dominate the screen.
- Sports: lifting, running, cycling, swimming; activities logged, scheduled (occurrences: scheduled,
  done, skipped, settled), templated; pools, bikes, trainers and venues as resources.
- Food: seven meals in eating order; foods and saved meals in "My foods"; targets from the goal's split
  (55/25/20 default), protein per kg of body weight; any past day editable; a dot per day.
- Progress: training totals, weekly sessions, muscle split (body map), body weight, strength trends and
  estimated 1RM, running pace and distance, recovery charts, and History (sessions and activities).
- Friends: follow with approval, a person's page, Compare (radar, bar pairs, per-exercise), Leaderboard
  (period totals, all-time bests, per kg of body weight), records, privacy switches.
- Units: kg/lb, cm/ft, km/mi, m/yd, stored metric; time zones per account.
- Offline: unsaved set rows are retained for manual retry; everything else needs a connection.
- Technical: Next.js 16 App Router, React 19, Tailwind CSS v4, server actions, Supabase/Postgres with
  RLS, Vitest; no third-party component kit; ~150 routes; every page is server-rendered and streamed.
- Android and iOS native apps are planned soon (inferred from the brief): the visual system must port to
  native without depending on web-only chrome.

## Capabilities and Constraints

Everything the app does today is kept. The five tabs: Today, Training, Food, Progress, Profile. Under
Profile: Edit profile, Friends (People, Find people, Leaderboard, Compare), Programme (Cycle, Changes,
drafts, jobs, create, manual builder, history), Gyms and machines, Exercise library, Rest timer, AI
coach, Coach access (tokens), Appearance (Light/Dark/System), Privacy, Password, Install, Delete
account, Sign out. Onboarding: You → Sports → Gym → Machines → Plan. Auth: sign in, sign up, forgot and
reset password, a "not configured" state.

Constraints: large-text sizes must still fit; the rest timer and the "in progress" resume strip are
shell-level and must not take much of the screen; the bottom navigation must leave the page readable
beneath it; tests in the repository assert on copy and roles, so user-visible wording is kept unless
deliberately changed with the tests.

Terminology (keep): programme (British), cycle, day, occurrence, proposal, review, request, draft,
intake, routine, template, gym, machine, exercise, set, warm-up, working set, RIR, RPE, est. 1RM,
records, check-in, re-plan, follow, people, leaderboard, compare, targets, My foods, meals.

Undecided (recorded, not invented): whether a dedicated "Coach" tab replaces or joins a current tab;
the native apps' shells.

## Brand Commitments

Name: Overload. Existing line: "Progressive overload, one set at a time." Voice: plain, direct, sentence
case, British spelling, no hype, no gamification badges. Both Light and Dark themes are a feature. The
brief (confirmed in the user's own words) frees everything visual: look, animation, navigation, art,
icons, typography, colours and themes may all be replaced, and the coach-driven purpose must lead.

## Evidence on Hand

- 700 screenshots of the incumbent interface (iPhone 17 canvas, light and dark), outside the repo.
- A seeded local database with six accounts and 56 months of lifting, running, cycling, swimming, food,
  body weight and coaching states; `password123`; see docs/audits/local-56-months.md.
- The shared library: 268 exercises, 92 equipment kinds, warm-up protocols, programme templates.
- Installed icon libraries: Phosphor and Lucide. No photography, no illustration assets, no logo beyond
  a dumbbell glyph. Nothing commercial (prices, testimonials, customer counts) exists or may be invented.

## Product Principles

1. The coach leads. Every day opens on what the coach planned, and why, before anything else.
2. A set is logged in seconds, one-handed, readable at arm's length.
3. Machine truth: a machine's numbers belong to that machine at that gym; never blend them.
4. Nothing changes without the athlete's approval, and every change shows its reason.
5. Keep every feature; spend the screen on the few things that matter at that moment.

## Accessibility & Inclusion

WCAG 2.2 AA as the floor; 44 px targets; text resizes without clipping; reduced motion honoured; colour
never the only signal (food-day dots, macro states, superset groups all pair colour with text or shape);
focus visible everywhere; screen-reader names on every control.
