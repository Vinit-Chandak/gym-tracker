# Friends, and what a friend can see

Reverses one line of `PRODUCT_REQUIREMENTS.md` §11, where "public profiles" and "leaderboards"
were listed as non-goals. That was decided for V1, with one person using the app. The app now
has a handful of accounts who train together and want to see how each other is doing, and the
plan in [`docs/planning/FRIENDS_COMPARE_LEADERBOARD_PLAN.md`](../planning/FRIENDS_COMPARE_LEADERBOARD_PLAN.md)
adds following, a profile others can see, a head-to-head comparison and a leaderboard among
the people you follow. This record keeps the reasons where the original non-goal was written.

## Decisions

Eight questions were asked and answered before the plan was written. They are not open.

1. **One-way follow, with approval by default.** Each account chooses "approve requests" or
   "anyone can follow me". A follower sees your shared stats; you see theirs only if you
   follow them back.
2. **The Settings tab becomes Profile.** Everything Settings had stays; the page gains a header
   card and a Friends row. Leaderboard and Compare live inside Friends. Nothing about other
   people appears anywhere else, except the small cards that lead back there.
3. **Your circle is you plus the people you follow.** Followers you do not follow back are
   not ranked against you.
4. **Running is a separate sport.** Compare and Leaderboard carry a Lifting / Running switch
   from day one; shared stats are keyed by sport so a third sport is a new value, not a
   redesign. Lifting ships first.
5. **Body weight is opt-in, off by default.** When both people share it, an exercise
   comparison gains a per-kilogram row and the leaderboard a relative-strength ranking.
   Otherwise body weight never leaves the account.
6. **Estimated 1RM extends from barbell to barbell and dumbbell**, app-wide, so Progress and
   Compare agree. Bodyweight movements compare by most reps and heaviest added load, holds by
   longest time, carries by distance.
7. **In scope besides the screens:** records announced at finish, friends' recent activity on
   the Friends page, and a username asked at signup as well as in setup.
8. **Out of scope:** an invite link. Cheap later, since usernames give it every hook it needs.

## The architecture: separate shared tables, no widened policy

Every read in this app is owner-only, enforced by Postgres: `withUser` switches the
connection to the `authenticated` role and every user-owned table carries an owner policy.
Several repository queries rely on RLS as their _only_ filter. Three ways to let a friend see
your numbers were weighed:

- **Widen existing policies to "owner or follower".** Rejected. Any query that leans on RLS
  as its only filter would silently mix a friend's rows into your own lists, and there is no
  way to audit that from the schema alone.
- **Security-definer query functions that read the raw tables on a follower's behalf.**
  Rejected. Every such function is a hand-written hole in the one guarantee the schema makes,
  and each new metric would need another one.
- **Separate `shared_*` tables** that the owner writes when a workout finishes, a run is
  saved or a body weight is recorded, and that approved followers may read. **Chosen.** The
  prefix says at a glance what leaves an account; the tables hold only the fields listed
  below; every existing policy is untouched; and the rows are computed by the same domain
  functions Progress uses, so a friend sees the number you see.

Two `security definer` functions, `can_view_training(owner)` and `can_view_body_weight(owner)`,
decide the read policies on those tables. They are functions rather than inline subqueries
because a subquery on `profiles` inside a policy would itself be filtered by the profile
owner policy and return nothing for anyone but you. Application code still names the user
ids it reads, yours or a friend's or the circle's, every time: RLS is the guarantee, not the
filter.

## Identity

A username (`profiles.username`, lowercase, 3–20 characters of letters, digits, dot and
underscore, unique, never a reserved route name) is the public handle and the URL,
`/u/[username]`. It is asked at signup, shown and editable on Welcome step 1, and editable
from the profile. Existing accounts are backfilled from the local part of their email; a
collision gets a numeric suffix. A small `security_barrier` view, `profile_directory`,
exposes id, username, display name, join month, follow-approval setting and follower counts,
and nothing else: it is how search, headers and leaderboard names are read.

Two lookups run as `security definer` so that nothing can be enumerated:
`find_profile_by_email` matches an exact address and only when that account allows it;
`username_available` reports only that a name is taken, which the signup form would reveal
anyway. The signup availability check is the one deliberate call to the database outside
`withUser`: it returns a boolean and nothing else, and the call site says so.

## What a follower can see

Shown on the privacy screen and enforced by the shared tables. Visible to an accepted
follower when sharing is on:

- Profile card: display name, username, join month, follower and following counts.
- Per finished workout: date, the programme day's name or "Workout", duration, working sets,
  volume in kilograms, sets per muscle group, number of records set.
- Per finished workout and shared-library exercise: working sets, total reps, top weight,
  best estimated 1RM, best set volume, most reps in a set, longest hold, longest carry.
- Per run: date, distance, duration, pace.
- Body weight, latest reading only, and only if both people opted in.

Never visible to anyone:

- Notes on sessions, sets or runs; substitution reasons.
- Check-ins and recovery: sleep, energy, fatigue, soreness, back or shin pain.
- Gyms, machines, addresses; which machine a set was on.
- Programmes, prescriptions, the coach's plans, memos, notes and reports.
- Exercises you created yourself.
- Email address, height, date of birth, sex, training goal.

## Consequences

- **A username rename breaks `/u/old-name`.** Accepted for a small group of friends; the
  alternative, a history of former names, is more machinery than the case deserves.
- **Turning sharing off drops you from friends' leaderboards silently.** The privacy screen
  says it will.
- **A first-ever performance is not a record.** A new account's first workout would otherwise
  announce twenty of them. Records are strict improvements over an earlier finished session.
- **Dumbbell estimated 1RM appears on Progress**, as a side effect of decision 6. Dumbbell
  loads are taken as logged, not doubled per hand; the InfoTip says so and
  `equipment_instances.load_convention` is there if a later change wants to normalise.
- **Each phase that adds a table is its own pull request**, merged and deployed before the
  next, because preview deployments share the production database and cannot see a table
  their branch adds.
- **Shared rows for history that predates the tables come from a backfill script**, run once
  after the deploy that adds them. Until then profiles show only sessions finished since.
