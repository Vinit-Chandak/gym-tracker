# Friends, comparison and leaderboards — implementation plan

Status: decisions locked on 2026-09-14. Phase 0 and phase 1 implemented on 2026-09-14 (see the
notes under phase 1); phase 2 next.
Owner: Vinit. Written after a full read of the codebase on `main` at `33cdbe7`.

This plan adds people to an app that was built for one person at a time: a username, following
with approval, a profile others can see, a leaderboard among the people you follow, and a
head-to-head comparison of any friend's training with yours, overall and per exercise. It is
modelled on Hevy's comparison screens (the four screenshots in the request) and departs from
them where this app already knows better, such as which exercises are honestly comparable.

`PRODUCT_REQUIREMENTS.md` §11 lists "public profiles" and "leaderboards" as non-goals. That was
a decision for V1 with one user. Section 12 of this plan records the reversal as an architecture
decision record, so the change of direction is written down where the original was.

---

## 1. Decisions already made

These were asked and answered before this plan was written. They are not open.

| #   | Question                                     | Decision                                                                                                                                                                                                     |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Follow model                                 | One-way follow. Each account chooses "approve requests" (default) or "anyone can follow me". A follower sees your shared stats; you see theirs only if you follow them back.                                  |
| 2   | Where it lives                               | The **Settings** tab becomes **Profile**. The profile page keeps everything Settings has today and gains **Friends**. Leaderboard and Compare live inside Friends. Streamlined so nobody is overwhelmed.      |
| 3   | Who is in your circle                        | You plus the people you follow (accepted). Followers you do not follow back are not ranked against you.                                                                                                      |
| 4   | Running                                      | A separate sport. Compare and Leaderboard carry a Lifting / Running switch from day one; shared stats are keyed by sport so a third sport is a new value, not a redesign. Lifting ships first, Running next. |
| 5   | Body weight                                  | Opt-in, off by default. When both people share it, exercise comparison adds a per-kilogram row and the leaderboard gets a relative-strength ranking. Otherwise body weight never leaves the account.         |
| 6   | Estimated 1RM                                | Extended from barbell-only to barbell **and** dumbbell, app-wide (Progress and Compare agree). Bodyweight movements compare by most reps and heaviest added load, holds by longest time, carries by distance. |
| 7   | Extras in scope                              | Records announced at finish; friends' recent activity on the Friends page; username asked at signup as well as in setup.                                                                                     |
| 8   | Extras out of scope                          | Invite link. (Cheap later: the hooks it needs exist once usernames do.)                                                                                                                                      |

---

## 2. What the codebase dictates

Read before designing; each of these shaped a decision below.

**Every read is owner-only, enforced by Postgres.** `withUser(db, userId, fn)` sets the JWT
claims and switches the connection to the `authenticated` role, so Row Level Security applies to
the app's own Drizzle queries. Every user-owned table has an `ownerPolicy`. No code path in the
app reads another account's rows, and several repository queries rely on RLS as their **only**
filter (`listExercises` selects `user_id is not null` with no user id; test helpers look gyms
up by slug alone). Widening any existing policy to "owner or follower" would silently mix a
friend's rows into your own lists. That rules out the obvious approach and is why §5 introduces
separate shared tables.

**The library already says what is comparable.** `exercises.load_portability` is `global` for
155 of 268 shared movements (barbell, dumbbell, bodyweight: the load means the same
everywhere), `equipment_specific` for 91 (machine and cable: "stack numbers differ between
machines"), and `context_dependent` for 22 (Smith machine, cardio, a few others). The Progress
screen already keeps one series per machine for that reason. Across people the rule is the
same rule: only `global` exercises from the shared library (`user_id is null`) are comparable.
A movement someone added themselves has an id nobody else has.

**Finished workouts are immutable.** `logSet`, `deleteSet` and the rest throw
`SessionFinishedError` once `completed_at` is set; `discardSession` only removes a session with
no sets. Runs can be created, edited and deleted (`createRun`, `updateRun`, `deleteRun`). So
derived, shareable numbers have exactly four places to stay in sync: `finishSession`, and the
three run writes. Body weight has one: `recordBodyWeight`.

**Numbers come from one place.** ADR 0024: Progress and the exercise page draw the same trend
from `performanceSeries`; `readMuscleVolume` and `trainingAnalytics` both use
`addExerciseVolume` so the body map and the sets-by-muscle chart never disagree. Anything shared
with a friend must be computed by those same functions, or a friend will see a different
number from the one you see.

**The profile is cached.** `getRequestProfile` keeps onboarded profiles in memory for a minute
per instance and every profile write calls `profileChanged`. A username lives on the profile, so
editing it goes through the same path. Anything about *other* people is read live.

**Navigation is five tabs, decided twice.** ADR 0017 and `lib/nav.ts`: Today, Runs, History,
Progress, Settings. Detail screens keep their section's tab lit (`UNDER_SETTINGS`). The
decision here renames the fifth tab rather than adding a sixth.

**Sport is already a concept.** `domain/sport-scope.ts` defines `TrainingSport = "workout" |
"run"` and the coach plan carries per-sport summaries. The shared stats reuse that type and the
UI labels the two sports "Lifting" and "Running".

**Migrations run on production deploys only.** `db:deploy` applies migrations before the build
and re-seeds the library; preview deployments share the production database and skip
migrating, so any page that touches a new table errors on previews until merged. Each phase
below that adds a table is therefore its own PR, merged and deployed before the next.

**Tests run the real migrations on PGlite** with a stub of `auth.users` (which has
`raw_user_meta_data`), `auth.uid()` and the three roles. Hand-written SQL in migrations
(functions, triggers, views) is exercised by the test suite, so the security-definer helpers
below are testable end to end.

**Conventions to keep.** Server actions begin with `requireUser()` and parse `FormData` with
Zod through `parseForm`; every dynamic segment is checked with `requireUuid` (usernames need
their own check); pages are server components passing plain props to `"use client"` views;
URL search params carry filter state so the server answers with only the data asked for;
`PageProps<"/route">` types page props; the app's Next.js 16 differs from training data and
`node_modules/next/dist/docs/01-app/01-getting-started/` (`03-layouts-and-pages`,
`04-linking-and-navigating`, `07-mutating-data`, `16-proxy`) must be read before each phase.
Charts are hand-drawn SVG in `components/ui/chart.tsx` (multi-series capable) and theme tokens
`--ov-series-1..4` are the only series colours. Load the `dataviz` skill before drawing the new
radar and bar pairs.

---

## 3. Product design

### 3.1 The principle: one door, one question per row

Social features sprawl. The design below is held to four rules so it does not.

1. **One door.** Everything about other people is behind **Profile › Friends**. The only other
   places that mention friends are the small cards that lead back there: an exercise page's
   leaderboard card and the finish screen's records.
2. **One question per row.** A screen asks for at most two choices, each in its own control:
   sport (Lifting / Running) and period (7 / 30 / 90 days / 1 year). Never a third.
3. **Defaults that are the answer most of the time.** Compare opens on Lifting, last 30 days.
   The leaderboard opens on Lifting, last 30 days, workouts. The exercise leaderboard opens on
   the metric that suits the movement (e1RM for a barbell lift, most reps for a pull-up).
4. **Nothing to react to.** No feed, no likes, no comments, no notifications beyond a request
   count. Activity is a quiet list.

### 3.2 Navigation

- `NAV_ITEMS`: the fifth tab becomes `{ href: "/profile", label: "Profile", icon: User }`.
- Every `settings/*` route moves to `profile/*`. `settings/profile` (the edit form) becomes
  `profile/edit`. `next.config.ts` gains permanent redirects `/settings → /profile`,
  `/settings/profile → /profile/edit`, `/settings/:path* → /profile/:path*`, so bookmarks, the
  coach documentation and any emailed link keep working. 67 `"/settings…"` hrefs and 17
  `revalidatePath("/settings…")` calls change in the same PR (mechanical, grep-driven).
- `UNDER_SETTINGS` becomes `UNDER_PROFILE = ["/exercises", "/gyms", "/u"]`; `SECTION_LABELS`
  gains `profile: "Profile"` and `u: "People"`.
- New routes:

| Route                                | Screen                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `/profile`                           | Profile tab: header card, Friends row, then the current Settings groups |
| `/profile/edit`                      | The existing profile form, plus username                               |
| `/profile/privacy`                   | Who can follow you, what followers can see                             |
| `/profile/friends`                   | Leaderboard and Compare cards, search, requests, following/followers, activity |
| `/profile/friends/leaderboard`       | Leaderboard                                                            |
| `/profile/friends/compare`           | Pick who to compare with (people you follow)                           |
| `/u/[username]`                      | A person's profile as others see it (your own too)                     |
| `/u/[username]/compare`              | Head-to-head: stats bars, muscle split, exercises in common            |
| `/u/[username]/compare/[exerciseId]` | One exercise head-to-head with the friends' leaderboard for it         |

`/u/…` is short on purpose (Hevy uses `/user/…`, Strava `/athletes/…`): it appears in the
address bar on a phone. Segments `compare` and `leaderboard` under `/profile/friends` are static
and therefore never collide with a username; the reserved-name list in §4.1 keeps `u`,
`profile`, `friends`, `compare` and `leaderboard` from ever being usernames anyway.

### 3.3 Profile tab (`/profile`)

Top to bottom, in the order the existing Settings page already follows (who you are, what you
train, how it looks, who can get in, the app, the way out), with two additions at the top:

1. **Header card** (new): avatar (§3.5), display name, `@username`, "Followers 3 · Following 5"
   (each tappable, opening the matching list on the Friends page), and an **Edit profile**
   link to `/profile/edit`. The warning "Add your height and date of birth" that Settings shows
   today stays on this card.
2. **Friends row** (new): a `LinkRow` to `/profile/friends` with a count badge when requests
   are waiting ("2 requests").
3. Training, Preferences (gains a **Privacy** row → `/profile/privacy`), Account, Install, Sign
   out and Delete account: unchanged.

### 3.4 Friends (`/profile/friends`)

Sections in order. Each is a box; a section with nothing in it is left out rather than shown
empty, except the first two.

1. **Two cards side by side: Leaderboard, Compare.** Compare leads to the pick-a-friend list;
   with nobody followed it leads to an empty state ("Follow someone to compare") with the
   search field focused.
2. **Requests** (only when any): rows with avatar, name, `@username`, Accept and Decline.
3. **Find people**: one search field, "Username or email". Results appear beneath it as rows
   with a follow button in the state that applies (§3.6). A query containing `@` is looked up
   as an exact email; anything else matches the start of a username or any word of a display
   name, case-insensitively, twenty results at most.
4. **People**: a two-way segmented control, "Following (5)" / "Followers (3)". Rows open
   `/u/[username]`. A follower row has a quiet "Remove" behind a disclosure; a following row
   has "Unfollow". Both confirm in a sheet.
5. **Recent activity**: the last twenty shared sessions of people you follow, newest first:
   "phani03 · Upper A · 18 sets · 6,240 kg · 2 records · Yesterday". Runs read "phani03 · Run ·
   5.2 km · 28:10 · 5:25 /km". Rows open that person's profile. Nothing here can be reacted to.

### 3.5 Avatars

No uploads (no storage in the stack). An `Avatar` component draws the first letter of the
display name (or username) on a circle whose hue is derived deterministically from the
username, with the ink colour chosen for contrast on either canvas. It is what Hevy's `V` and
`P` circles are. Sizes: row (36px), header (64px), compare (88px).

### 3.6 Following

States a follow button can be in, and what a tap does:

| You see          | Meaning                                                        | Tap                                         |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------- |
| **Follow**       | Not following; they accept anyone                              | Follows immediately                         |
| **Request**      | Not following; they approve requests                           | Sends a request → **Requested**             |
| **Requested**    | Pending their approval                                         | Cancels the request (confirm)               |
| **Following**    | Accepted                                                       | Unfollows (confirm in a sheet)              |
| **Follow back**  | They follow you, you do not follow them                        | As Follow / Request                         |

Whether it says Follow or Request is decided by the database trigger from the target's privacy
setting at insert time, not by the client, so a stale page can never grant itself an accepted
follow (§5.2). Declining a request deletes the row; the requester sees **Request** again and
can ask again. There is no block list; "Remove follower" plus "approve requests" covers a small
friend group, and a block table is a two-hour addition if ever needed.

### 3.7 Privacy (`/profile/privacy`)

Four switches, each with one sentence under it, saved on change (the rest-timer row is the
pattern):

| Switch                                | Default | Effect                                                                                                     |
| ------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Approve follow requests               | on      | Off means anyone in the app can follow you without asking.                                                 |
| Share training with followers         | on      | Off means followers see your profile card only: no stats, no records, not on their leaderboards.           |
| Share body weight for relative strength | off   | On means followers who also share theirs see "per kg of body weight" rows and rankings.                    |
| Let people find me by email           | on      | Off means the exact-email lookup does not return you; username search still does.                          |

Above the switches, one box lists in plain words what a follower can and cannot see (the two
lists in §3.8), because a privacy screen that does not say what it protects is decoration.

### 3.8 What a follower can see, and what they never can

Shown on the privacy screen and recorded in the ADR. This is the contract the data model in §5
enforces; nothing outside the two shared tables and the directory view is ever readable by
another account.

**Visible to an accepted follower (when sharing is on):**

- Profile card: display name, username, join month, follower and following counts.
- Per finished workout: date, the programme day's name or "Workout", duration, working sets,
  volume in kilograms, sets per muscle group, number of records set.
- Per finished workout and shared-library exercise: working sets, total reps, top weight, best
  estimated 1RM, best set volume, most reps in a set, longest hold, longest carry.
- Per run: date, distance, duration, pace.
- Body weight (latest reading only), **only** if both people opted in.

**Never visible to anyone:**

- Notes on sessions, sets or runs; substitution reasons.
- Check-ins and recovery: sleep, energy, fatigue, soreness, back or shin pain.
- Gyms, machines, addresses; which machine a set was on.
- Programmes, prescriptions, the coach's plans, memos, notes and reports.
- Exercises you created yourself (they have no counterpart in anyone else's account).
- Email address (the exact-match lookup returns a profile, never the address).
- Height, date of birth, sex, training goal.

### 3.9 Comparability rules

An exercise is **comparable across people** when all three hold:

1. It is in the shared library (`exercises.user_id is null`).
2. Its `load_portability` is `global`.
3. For load-based metrics, the set was logged in `kg` or `lb` (converted to kg; `stack_index`,
   `plate_count` and `none` carry no physical weight).

Machine and cable exercises (`equipment_specific`) and Smith-machine or cardio movements
(`context_dependent`) still count toward sets, volume and the muscle split, because a set is a
set and the app already treats a machine's kilograms as that person's kilograms on Progress.
They are never ranked or compared per exercise. The compare screen says so in one line rather
than listing them: "4 machine exercises in common are not compared: loads differ per machine."

**Which metrics apply** follows the exercise's measure (`default_prescription_type`) and
whether it is loaded:

| Movement                              | Primary metric (decides "Stronger") | Also shown                                  |
| ------------------------------------- | ----------------------------------- | ------------------------------------------- |
| Barbell or dumbbell, counted in reps  | Estimated 1RM                       | Heaviest weight, best set volume, most reps |
| Bodyweight, counted in reps           | Most reps in a set                  | Heaviest added load, best set volume        |
| Counted in seconds (plank, hang)      | Longest hold                        | Heaviest load held                          |
| Counted in metres (carry, sled)       | Longest carry                       | Heaviest load carried                       |

**Estimated 1RM** (decision 6): `estimated1RM` in `domain/analytics.ts` accepts modality
`barbell` **or** `dumbbell`, unit kg or lb, weight > 0, reps 1–10, Epley `w × (1 + r/30)`.
Dumbbell loads are logged as they are shown on the bell (the convention the equipment
instance's `load_convention` records); this plan does not double per-hand loads, and says so
in the InfoTip. The Progress e1RM chart gains dumbbell series as a side effect; ADR 0026 notes
it.

**Units.** Everything shared is stored in kilograms, seconds and metres. Both sides of a
comparison are shown in the viewer's `preferred_unit` via `fromKilograms`, so a person in
pounds reads both bars in pounds.

**Body weight ratio** (decision 5): when both people share body weight, load metrics gain a
second line "1.18× body weight" and the exercise leaderboard offers a "per kg" ranking that
lists only people sharing. Uses each person's latest reading, not the reading on the day.

### 3.10 Compare, overall (`/u/[username]/compare`)

Controls: sport (Lifting / Running) and period (7d / 30d / 90d / 1y), both in the URL. Default
Lifting, 30d.

1. **Head-to-head header**: two large avatars with "VS" between, names under each. The
   viewer is always on the left. No verdict badge here: "more active" is not a contest anyone
   asked to enter.
2. **Muscle split**: a six-axis radar (Back, Chest, Core, Shoulders, Arms, Legs, mapping the
   twelve `BODY_REGIONS` down as §6 lists) with one polygon per person, drawn as each person's
   **share** of their own working sets, so a friend who trains twice as much still compares by
   shape. Legend under it with the two names; the same six numbers as a small table behind
   "View values", as every chart in the app has.
3. **Stats**: one row per metric, each a pair of horizontal bars scaled to the larger value,
   with the values at the bar ends and the difference as a percentage with an arrow, coloured
   from the viewer's side (success when ahead, muted when behind, as `Headline` already does).
   Lifting: Workouts, Workout time, Total volume, Working sets, Active days, Records set.
   Running (phase 8): Runs, Distance, Time, Best pace, Longest run.
4. **Exercises in common** (Lifting): comparable exercises both people logged in the period,
   as rows with the exercise's region under the name, leading to the exercise comparison. The
   one-line note about machine exercises sits under the list.
5. **States**: the friend does not share training → the header and a sentence, nothing else.
   No data in the period for one side → bars still draw, the empty side reads "0" and the
   percentage is "—". The other person is you → redirect to your own profile.

### 3.11 Compare, one exercise (`/u/[username]/compare/[exerciseId]`)

Only reachable for comparable exercises; anything else is `notFound()`.

1. **Header**: exercise name and region, the two avatars, and a **Stronger** badge under
   whoever leads on the primary metric (§3.9) over all time. A tie shows no badge.
2. **Metrics**: bar pairs for the metrics that apply to this movement, all-time bests with the
   date each was set under the value. The body-weight ratio line appears under load metrics
   when both share.
3. **Trend**: the existing `Chart` with two series, one per person, of the primary metric per
   session over the selected period (the period control lives here too; the bests above are
   always all-time). Series colours are `--ov-series-1` (viewer) and `--ov-series-2` (friend),
   named in the legend, as the sessions chart on Progress already does.
4. **Friends' leaderboard**: the exercise leaderboard (§3.12) filtered to this exercise and the
   primary metric, top five plus your own row if outside it, with a link to the full board.

### 3.12 Leaderboard (`/profile/friends/leaderboard`)

Two modes, chosen by a segmented control, plus the sport switch. The period control appears in
Activity mode only.

- **Activity** (default): metric select (Workouts, Working sets, Total volume, Active days,
  Records set; Running: Runs, Distance, Time, Best pace, Longest run) and period. Ranks you
  and the people you follow. Default: Lifting, last 30 days, Workouts.
- **Exercise**: an exercise picker listing only comparable exercises that at least one person
  in the circle has logged, most-shared first, then a metric select limited to the metrics
  that apply. Ranks all-time bests with the date each was set. A "per kg" variant of the load
  metrics appears when at least two people in the circle share body weight.

Rows: rank, avatar, name (your own row reads "You" and is highlighted), value in your unit.
Equal values share a rank. People with no data for the metric are listed after the ranked
rows, greyed, with "—", so a friend's absence is visible rather than mysterious. A friend who
turned sharing off is simply not listed; the privacy screen told them that would happen.

An exercise's own page gains a **Friends' leaderboard** card (comparable exercises only): the
top three plus you on the primary metric, and a link to the full board with that exercise
preselected. This is the Hevy screenshot's bottom card, and the most natural way anyone finds
the leaderboard at all.

### 3.13 Records (decision 7)

A **record** is a strict improvement of a comparable exercise's metric over every earlier
finished session. A first-ever performance is not announced (a new account's first workout
would otherwise proclaim twenty records). Records are computed when a session finishes and
stored with that session's shared row.

- **At finish**: the finished-workout screen shows a "Records" card when the session set any:
  "Barbell bench press · e1RM 88 kg (was 85)". Lives on the workout page, so it is there
  whenever the workout is reopened, not only in the moment.
- **On the exercise page** (yours): a "Your records" tile row (the applicable metrics, each with
  its date), above the trend.
- **On a profile** (`/u/…`): "Records" lists the person's five best lifts by e1RM, then other
  movements by their primary metric, for the chosen period's sport.
- Records count toward the "Records set" leaderboard metric and appear in activity rows.

### 3.14 A person's profile (`/u/[username]`)

Header card as on your own profile tab, with the follow button in place of Edit (or "This is
you · Edit profile" for yourself). Below it, if you may see their training (§5.4): a period
control, three stat tiles (Workouts, Working sets, Volume), the single-person muscle split
radar, Records, and a full-width **Compare** button. If you may not: one line, "Follow
@phani03 to see their training", or "phani03 keeps their training private" when they follow
you but share nothing. Your own profile shows exactly what a follower would see, plus a note
saying so: the privacy screen's promise, demonstrated.

### 3.15 Username at signup and in setup

- **Signup form** gains a Username field between Name and Email, with the rules under it and a
  live availability check (debounced server action → `username_available()`, §5.3). The value
  travels in `options.data.username`; the auth trigger uses it if still free, otherwise falls
  back to generating one (§4.1). Signup never fails on a username race.
- **Welcome step 1** shows the username the account has ("Your username is **vinit** — change
  it?") as an editable field, so a generated one can be corrected before anyone sees it.
- **Profile edit** has the same field. Changing it is allowed at any time; `/u/old-name` then
  stops resolving. With a group of friends that is acceptable and the ADR says so.

### 3.16 Running (decision 4, second release)

Same screens, sport switched to Running. Shared per-run rows carry distance, duration and
pace. Compare shows Runs, Distance, Time, Best pace (fastest average pace over a run of at
least 1 km), Longest run; the muscle split and exercises-in-common sections do not apply and
are not rendered. Leaderboard Activity metrics as listed above; no Exercise mode. Outdoor and
treadmill are not separated in the shared row (the app keeps them apart on Progress; a
comparison of weekly kilometres does not need to). Activity rows show runs from the first
release, since the row shape exists from phase 4.

---

## 4. Identity

### 4.1 Username

- `profiles.username text not null`, unique index on `username` (stored lowercase, so no
  `lower()` index is needed), check constraint `username ~ '^[a-z0-9](?:[a-z0-9._]{1,18}[a-z0-9])?$'`
  and `username !~ '\.\.'` (3–20 characters, lowercase letters, digits, dot, underscore, no
  leading, trailing or doubled dots).
- **Reserved** (rejected by validation and by the generator): `me`, `u`, `profile`, `settings`,
  `friends`, `compare`, `leaderboard`, `admin`, `overload`, `coach`, `api`, `auth`, `login`,
  `signup`, `welcome`, `today`, `runs`, `history`, `progress`, `gyms`, `exercises`,
  `workouts`, `preview`, `support`, `help`. One list in `domain/username.ts`, mirrored as a
  SQL array in the generator function so the trigger and the form agree.
- **Generation** (`public.generate_username(base text, preferred text) returns text`, SQL,
  security definer): if `preferred` is valid, unreserved and free, use it; else sanitise `base`
  (the email's local part, lowercased, non-matching characters dropped, padded to three
  characters), then append `2`, `3`, … until free; if `base` yields nothing, `athlete_` plus
  the first eight hex characters of the profile id.
- **Backfill** in the migration: every existing profile gets `generate_username(email local
  part, null)` before the column becomes `not null`.
- `handle_new_auth_user()` is replaced to insert `generate_username(split_part(email,'@',1),
  raw_user_meta_data->>'username')`. `ensureProfile` (the fallback for pre-trigger accounts)
  does the same through a Drizzle `sql` call.
- Validation: `usernameSchema` in `server/validation/username.ts` (lowercase, trim, regex,
  reserved list); `profileInputSchema` and `basicProfileInputSchema` gain it; the signup schema
  gains it as optional-but-validated-if-present.

### 4.2 Directory view

`public.profile_directory` (Drizzle `pgView`, hand-finished in the migration with
`security_barrier = true`), owned by the migration role and therefore reading `profiles`
without RLS, exposing **only**:

`id, username, display_name, joined_at (= created_at), follow_approval, followers (count of
accepted follows where followee_id = id), following (count where follower_id = id)`.

`GRANT SELECT ON public.profile_directory TO authenticated`. This is how search, profile
headers, follower counts of third parties and the leaderboard's names are read. No email, no
measurements, no privacy switches other than `follow_approval` (which the follow button needs
to say Follow or Request).

### 4.3 Lookups that must not enumerate

Two security-definer SQL functions, `GRANT EXECUTE` as noted:

- `public.find_profile_by_email(candidate text) returns setof profile_directory`: exact match
  on `lower(email)`, only when the target's `discoverable_by_email` is true. Authenticated only.
- `public.username_available(candidate text) returns boolean`: true when valid, unreserved and
  unused. Granted to `anon` and `authenticated` because the signup form asks before an account
  exists. It reveals only that a name is taken, which the signup form would reveal anyway.

The signup availability action runs `select public.username_available($1)` on the app's
database client **outside** `withUser`, the one deliberate exception to the rule that
application code always runs inside it. It returns a boolean and nothing else; the exception
is commented at the call site and in the ADR.

---

## 5. Data model and security

### 5.1 Privacy columns on `profiles`

```
follow_approval        boolean not null default true
share_training         boolean not null default true
share_body_weight      boolean not null default false
discoverable_by_email  boolean not null default true
```

Owner-only, like every other profile column. Read by the trigger and helper functions below as
the migration role.

### 5.2 `follows`

```
follower_id  uuid not null references profiles(id) on delete cascade
followee_id  uuid not null references profiles(id) on delete cascade
status       follow_status not null            -- enum: 'pending' | 'accepted'
created_at   timestamptz not null default now()
accepted_at  timestamptz
primary key (follower_id, followee_id)
check (follower_id <> followee_id)
index (followee_id, status), index (follower_id, status)
```

RLS, all `to authenticated`:

- select: `follower_id = auth.uid() or followee_id = auth.uid()`
- insert: with check `follower_id = auth.uid()`
- update: using and with check `followee_id = auth.uid()` (accepting)
- delete: `follower_id = auth.uid() or followee_id = auth.uid()` (unfollow, cancel, decline,
  remove follower)

Trigger `before insert on follows`, security definer: sets `new.status` to `'pending'` when
the followee's `follow_approval` is true, else `'accepted'` with `accepted_at = now()`,
ignoring whatever the client sent. A second `before update` trigger allows only
`pending → accepted` and stamps `accepted_at`. Nothing the client says about status is ever
trusted.

### 5.3 Shared stats: the only rows another account can read

Two tables, both written by the owner and readable by approved followers. The prefix
`shared_` is deliberate: anyone reading the schema sees at once what leaves an account.

**`shared_session_stats`** — one row per finished workout or logged run.

```
id                    uuid pk
user_id               uuid not null references profiles(id) on delete cascade
sport                 training_sport not null      -- enum from TrainingSport: 'workout' | 'run'
source_id             uuid not null                -- workout_sessions.id or runs.id (no FK: sport decides)
title                 text not null                -- programme day name, or "Workout" / "Run"
occurred_on           date not null                -- civil date of started_at in the owner's zone
started_at            timestamptz not null
duration_seconds      integer not null             -- workouts: completed_at − started_at, capped at 4 h
working_sets          integer not null default 0
volume_kg             numeric(10,2) not null default 0   -- Σ weight_kg × reps over kg/lb working sets
distance_meters       numeric(9,1)                 -- runs
pace_seconds_per_km   numeric(7,1)                 -- runs
muscle_sets           jsonb not null default '{}'  -- Record<MuscleGroup, number>, half-weighted secondaries
records               jsonb not null default '[]'  -- [{ exerciseId, metric, value, previous }]
created_at, updated_at
unique (user_id, sport, source_id)
index (user_id, sport, occurred_on desc)
```

**`shared_exercise_stats`** — one row per finished workout × shared-library exercise.

```
id                        uuid pk
user_id                   uuid not null references profiles(id) on delete cascade
workout_session_id        uuid not null                -- no FK across the privacy boundary; owner cascade suffices
exercise_id               uuid not null references exercises(id) on delete restrict
occurred_on               date not null
comparable                boolean not null             -- library exercise with global load portability
working_sets              integer not null
total_reps                integer
top_weight_kg             numeric(7,2)                 -- kg/lb sets only, converted
best_e1rm_kg              numeric(7,2)
best_set_volume_kg        numeric(9,2)
most_reps                 integer
longest_duration_seconds  integer
longest_distance_meters   numeric(8,1)
created_at
unique (user_id, workout_session_id, exercise_id)
index (user_id, exercise_id, occurred_on desc)
index (exercise_id, comparable) where comparable      -- the leaderboard's entry point
```

**`shared_body_weight`** — at most one row per person, the latest reading, written by
`recordBodyWeight` alongside `profiles.body_weight_kg`.

```
user_id uuid pk references profiles(id) on delete cascade
weight_kg numeric(5,2) not null
measured_on date not null
updated_at
```

### 5.4 Who may read a shared row

Two security-definer, `stable` SQL functions, granted to `authenticated`:

```sql
can_view_training(owner uuid) returns boolean:
  owner = auth.uid()
  or (exists (select 1 from follows
              where follower_id = auth.uid() and followee_id = owner and status = 'accepted')
      and (select share_training from profiles where id = owner))

can_view_body_weight(owner uuid) returns boolean:
  owner = auth.uid()
  or (can_view_training(owner)
      and (select share_body_weight from profiles where id = owner)
      and (select share_body_weight from profiles where id = auth.uid()))
```

Policies on the three shared tables: select `using (can_view_training(user_id))` (body weight:
`can_view_body_weight`); insert, update, delete owner-only. Both functions read `follows` and
`profiles` as their owner, which is why they are functions and not inline subqueries: an inline
subquery on `profiles` would itself be filtered by the profile owner policy and always return
nothing for someone else.

Every query against these tables in application code names the user ids it wants (yours, one
friend's, or the circle's) explicitly. RLS is the guarantee, not the filter. That rule is
written above each repository.

### 5.5 Keeping the shared rows true

| Event                                | Effect                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `finishSession`                      | Computes the session's stats from its slots and sets, upserts one session row and one exercise row per library exercise, detects records against the owner's previous maxima, returns them to the action. |
| `createRun`, `updateRun`             | Upserts the run's session row (sport `run`).                                                                              |
| `deleteRun`                          | Deletes it.                                                                                                                |
| `recordBodyWeight`                   | Upserts `shared_body_weight`.                                                                                              |
| Account deletion                     | Cascades from `profiles`; nothing to do.                                                                                   |
| Existing history                     | `npm run db:backfill:shared-stats`: a `tsx` script on `DIRECT_DATABASE_URL` that walks every account's finished sessions and runs in date order with the same domain functions, upserting on the unique keys. Idempotent; run once after the deploy that adds the tables, and again at any time. |

The computation is one pure function, `sessionStats(workout, timeZone)` in
`domain/shared-stats.ts`, built on `performanceSeries`'s rules (warm-ups excluded), `estimated1RM`,
`addExerciseVolume` and `convertLoad`. A test asserts that for a fixture workout the shared
exercise row's `top_weight_kg`, `best_e1rm_kg` and `best_set_volume_kg` equal the last point of
the corresponding `performanceSeries` (in kg), so Compare and Progress cannot disagree.

### 5.6 Migrations

Three, one per phase that needs one, each generated by `drizzle-kit generate` from the schema
and then hand-finished (the `0001_auth_bridge.sql` and `0018` precedent) with the SQL Drizzle
cannot express:

- `0019_usernames_and_privacy`: columns, check, unique index, `generate_username()`, backfill,
  replaced `handle_new_auth_user()`, `profile_directory` view (Drizzle `pgView` declaration plus
  `alter view … set (security_barrier = true)` and the grant), `find_profile_by_email()`,
  `username_available()` with grants.
- `0020_follows`: enum, table, policies, the two triggers, `can_view_training()`.
- `0021_shared_stats`: `training_sport` enum, three tables, policies, `can_view_body_weight()`.

Each is exercised on PGlite by the tests in §9. The PGlite auth stub already provides
`raw_user_meta_data`, `auth.uid()` and the roles the functions need.

---

## 6. Domain layer (pure, unit-tested, no I/O)

| Module                            | Exports                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain/username.ts`              | `USERNAME_PATTERN`, `RESERVED_USERNAMES`, `normaliseUsername`, `isValidUsername`, `usernameFromEmail`                                                        |
| `domain/analytics.ts`             | `estimated1RM` accepts `dumbbell` (change)                                                                                                                   |
| `domain/shared-stats.ts`          | `sessionStats(workout, timeZone) → { session, exercises[] }`, `runStats(run, timeZone)`, `SHARED_METRICS`, `metricsForExercise(exercise)`, `primaryMetric(exercise)` |
| `domain/records.ts`               | `detectRecords(previousMaxima, exerciseStats[]) → Record[]` (strict improvement, no first-timers)                                                            |
| `domain/muscle-split.ts`          | `SPLIT_GROUPS` (Back, Chest, Core, Shoulders, Arms, Legs), `MUSCLE_SPLIT_GROUP: Record<MuscleGroup, SplitGroup>`, `muscleSplit(muscleSets) → shares summing to 1` |
| `domain/compare.ts`               | `compareValues(a, b, lowerIsBetter?) → { leader, percent }`, `strongerVerdict(metrics)`, `periodBounds(period, today)` for `7d | 30d | 90d | 1y`             |
| `domain/leaderboard.ts`           | `rank(rows) → ranked rows with shared ranks and a trailing "no data" group`                                                                                  |
| `domain/avatar.ts`                | `avatarHue(username)`, `avatarInitial(displayName, username)`                                                                                                |

`MUSCLE_SPLIT_GROUP` maps the twelve `BODY_REGIONS` of `domain/muscles.ts`: back → Back; chest
→ Chest; shoulders → Shoulders; biceps, triceps, forearms → Arms; quads, hamstrings, glutes,
hips, calves → Legs; core → Core.

---

## 7. Server layer

**Repositories** (`server/repositories/…`, every function takes `DbOrTx` and the user ids it
reads, per the rule in §5.4):

- `people.ts`: `searchDirectory(tx, query)`, `findByEmail(tx, email)`, `getDirectoryProfile(tx,
  username)`, `usernameAvailable(db, candidate)` (the outside-`withUser` exception).
- `follows.ts`: `followState(tx, viewerId, targetId)`, `listFollowing`, `listFollowers`,
  `listRequests`, `requestFollow`, `acceptFollow`, `declineFollow`, `unfollow`,
  `removeFollower`, `circleIds(tx, viewerId)` (you + accepted following).
- `shared-stats.ts`: `writeSessionStats` (called by `finishSession`), `writeRunStats`,
  `deleteRunStats`, `writeBodyWeight`, `readPeriodTotals(tx, userIds, sport, range)`,
  `readMuscleSets(tx, userId, range)`, `readExerciseBests(tx, userIds, exerciseId)`,
  `readExerciseTrend(tx, userIds, exerciseId, range)`, `readExercisesInCommon(tx, a, b, range)`,
  `readRecords(tx, userId, sport, range)`, `readActivity(tx, circleIds, limit)`,
  `readLeaderboard(tx, circleIds, sport, metric, range)`.
- `sessions.ts`: `finishSession` computes and writes stats inside its transaction and returns
  `records` on `FinishedSession`. `runs.ts` writes and deletes on its three paths.
  `body-weight.ts` upserts the shared reading.
- `training-data.ts`: unchanged. The backfill script reads through it as the migration role.

**Actions** (`server/actions/…`, all `requireUser()` first):

- `people.ts`: `searchPeopleAction`, `checkUsernameAction` (signup, no user).
- `follows.ts`: `followAction(targetId)`, `unfollowAction`, `cancelRequestAction`,
  `acceptRequestAction`, `declineRequestAction`, `removeFollowerAction`; each revalidates
  `/profile`, `/profile/friends` and `/u/[username]`.
- `privacy.ts`: `setPrivacyAction(key, value)` for the four switches; calls `profileChanged`.
- `profile.ts`: username joins `saveProfileAction` and `saveOnboardingProfileAction`; a unique
  violation on save is caught and reported on the field ("That username is taken").
- `auth.ts`: `signUpAction` passes `username` in the user metadata.

**Validation**: `username.ts` (schema + reserved list), `people.ts` (search query: 1–64
characters), `period.ts` (`7d | 30d | 90d | 1y`, default `30d`), `sport.ts`
(`workout | run`, default `workout`), `requireUsername(param)` beside `requireUuid`.

**Caching**: the profile cache is untouched (username rides on the profile). Directory,
follow and shared reads are live. Search results are a server action response, not a page,
so nothing is prefetched.

---

## 8. UI components

New, in `components/ui/` unless noted:

| Component                     | Purpose                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `avatar.tsx`                  | Initial on a deterministic hue; three sizes                                                              |
| `compare-bars.tsx`            | One metric as a labelled pair of bars with values, percentage and arrow; server-renderable               |
| `radar-chart.tsx`             | Six-axis SVG radar, one or two polygons, legend, `View values` table; theme series colours               |
| `rank-list.tsx`               | Leaderboard rows: rank, avatar, name, value; "You" highlighted; trailing no-data group                   |
| `period-select.tsx`           | Segmented control for 7d / 30d / 90d / 1y bound to the URL, `useTransition` pending state                |
| `sport-switch.tsx`            | Lifting / Running segmented control bound to the URL                                                     |
| `components/follow-button.tsx` | The five states of §3.6 with confirm sheets for the destructive ones                                    |
| `components/person-row.tsx`   | Avatar, name, `@username`, trailing slot (follow button, value or chevron)                               |
| `components/people-search.tsx` | Field + debounced action + results                                                                      |
| `components/records-card.tsx` | The finish-screen and profile "Records" card                                                             |

Reused as-is: `Card`, `Section`, `List`, `LinkRow`, `Row`, `Badge`, `SegmentedControl`,
`SectionSelect`, `Sheet`, `FilterSheet`, `EmptyState`, `StatTile`, `Chart` (two series),
`InfoTip`, `PageHeader`, `PageContent`, `Switch` (privacy), the icon family (add `Users`,
`UserPlus`, `Trophy`, `Scales` from Phosphor duotone).

---

## 9. Phases

Each phase is one pull request, merged and deployed before the next begins, because previews
cannot see a table their branch adds. Sizes: S under a day, M one to two days, L three or more.

### Phase 0 — Record the decision (S)

- `docs/decisions/0026-friends-and-what-a-friend-can-see.md`: context (V1 non-goal reversed),
  the eight decisions, the shared-tables architecture and the rejected alternatives (widened
  RLS; security-definer query functions), the two visibility lists, consequences (username
  URLs break on rename; sharing off drops you from boards silently; first performances are not
  records; dumbbell e1RM appears on Progress).
- Link the ADR and this plan from `README.md`.

### Phase 1 — Profile tab and usernames (M)

- Move `settings/*` to `profile/*`, `settings/profile` to `profile/edit`; redirects in
  `next.config.ts`; update the 67 hrefs, 17 `revalidatePath` calls, `nav.ts`, coach docs and
  `SETUP.md`. Tests in `nav.test.ts` and `page-header.test.tsx` updated.
- Migration `0019`. Schema: username column and check, privacy columns, `profile_directory`
  view. Hand-written: generator, backfill, trigger, lookups, grants.
- `domain/username.ts`, `validation/username.ts`, `ensureProfile` fallback.
- Username on the signup form with availability check; on welcome step 1; on profile edit.
- Profile header card with `Avatar` (counts read from the view; both zero for now).
- **Acceptance**: every existing account has a valid unique username after migrating; a new
  signup with a taken username still succeeds with a suffixed one and is told on step 1;
  `/settings/coach` redirects to `/profile/coach`; `npm run check` green.
- **Tests**: username validation and generation (domain + PGlite collision cases); the view
  exposes only its listed columns and every profile; `find_profile_by_email` respects
  `discoverable_by_email`; `username_available` for taken, reserved, invalid.
- **As built** (decisions taken with the owner during implementation):
  - The header card shows avatar, name, `@username` and Edit profile; the follower and
    following counts wait for phase 2, when the Friends page they open exists, and
    `profile_directory` gains its two count columns in migration `0020` with the `follows`
    table they count. Nothing dead ships.
  - The live availability check runs under the username field on all three forms (signup,
    Welcome step 1, Profile › Edit), one shared `UsernameField`; the unique index still has the
    last word on save.
  - The username pattern is `^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$` (the optional group in §4.1
    would have admitted one-character names); the reserved list is one SQL function,
    `username_reserved()`, called by both the check constraint and the generator, and a test
    holds it to `RESERVED_USERNAMES` word for word.
  - The auth trigger retries on a unique violation with a generated name, so a race between
    two signups on the same username cannot fail the signup.
  - Migration `0019` is named `0019_usernames_and_privacy`, generated by drizzle-kit and
    hand-finished as §5.6 describes.

### Phase 2 — Following (M)

- Migration `0020`. Schema and policies; triggers and `can_view_training()` hand-written.
- Repositories and actions for follows; privacy page and action.
- `/profile/friends` with search, requests, following/followers (Leaderboard and Compare cards
  present but leading to "coming soon" empty states is **not** acceptable: they are omitted
  until phase 4 and 5 so nothing dead ships).
- `/u/[username]` profile card with the follow button; training section omitted until phase 3.
- Friends row with the request badge on `/profile`; counts on the header card.
- **Acceptance**: alice requests bob (approval on) → pending; bob accepts → following; bob
  switches approval off → carol follows instantly; declining deletes; self-follow rejected by
  the check; removing a follower deletes the row.
- **Tests**: RLS (bob cannot read alice's follows with carol; alice cannot accept her own
  request; the client-supplied status is ignored by the trigger); `can_view_training` truth
  table across approval, acceptance and `share_training`; `FollowButton` state rendering.

### Phase 3 — Shared stats and records (L)

- Migration `0021`. Schema, policies, `can_view_body_weight()`.
- `domain/shared-stats.ts`, `domain/records.ts`, `domain/muscle-split.ts`; `estimated1RM`
  accepts dumbbell (update its tests and the Progress InfoTip copy).
- Writes from `finishSession`, the run paths and `recordBodyWeight`.
- `scripts/backfill-shared-stats.ts` and the `db:backfill:shared-stats` script; a paragraph in
  `SETUP.md` ("after deploying this release, run it once").
- Records card on the finished workout page; "Your records" tiles on the exercise page;
  training section on `/u/[username]` (tiles, single radar, records); recent activity on the
  Friends page.
- **Acceptance**: finishing a fixture workout writes one session row and one row per library
  exercise with numbers equal to `performanceSeries`; a second, heavier session reports the
  records; deleting a run removes its row; the backfill run twice changes nothing; bob sees
  alice's rows only after acceptance and only while she shares.
- **Tests**: parity with `performanceSeries`; `detectRecords` (strict, no first-timers, per
  metric); `muscleSplit` sums to one and maps every muscle group; RLS on all three tables;
  backfill idempotence on PGlite; run update re-writes pace.

### Phase 4 — Compare (L)

- `domain/compare.ts`; `compare-bars.tsx`, `radar-chart.tsx` (load `dataviz` first),
  `period-select.tsx`, `sport-switch.tsx`.
- `/profile/friends/compare` (pick a friend), `/u/[username]/compare`,
  `/u/[username]/compare/[exerciseId]` with the two-series trend and the body-weight ratio line.
- Compare card on the Friends page and Compare button on profiles.
- **Acceptance**: the four screenshots' content is reproducible for two fixture accounts;
  percentages and the Stronger badge follow §3.9; a non-comparable exercise id is not found;
  a friend with sharing off shows the single-sentence state; units follow the viewer.
- **Tests**: `compareValues` (zero on either side, equal, lower-is-better), `strongerVerdict`
  ties, `periodBounds` at year and month edges; radar renders one and two polygons with the
  values table; bars render "—" for a missing side.

### Phase 5 — Leaderboard (M)

- `domain/leaderboard.ts`; `rank-list.tsx`; `/profile/friends/leaderboard` in both modes;
  the Leaderboard card on the Friends page; the Friends' leaderboard card on comparable
  exercise pages; the per-exercise board embedded on the exercise comparison.
- **Acceptance**: ranks are shared on ties; "You" is highlighted and present even with no
  data; the exercise picker lists only comparable, logged exercises; a "per kg" ranking appears
  only when two or more in the circle share body weight.
- **Tests**: `rank` ordering, ties and the no-data tail; `readLeaderboard` for each metric on
  PGlite with three accounts, one not sharing.

### Phase 6 — Running (M)

- `runStats` already written in phase 3; add the Running content to Compare and Leaderboard
  (metrics in §3.16), the run rows in activity are already there.
- **Acceptance**: sport switch on both screens; best pace ignores runs under 1 km; a person
  with no runs in the period reads "—".

### Phase 7 — Polish and docs (S)

- README section "Friends", SETUP backfill note, coach docs paths, screenshots in `docs/`.
- Empty states reviewed on a 320px phone; keyboard order on the search; `View values` tables
  on both charts read by a screen reader.

Not in this plan, recorded so it is not forgotten: invite link (decision 8), blocking,
comments or reactions, an inbox for requests, avatar uploads, a feed on Today.

---

## 10. Testing strategy

- **Domain**: Vitest unit tests per module in §6, table-driven where a rule has cases
  (username, records, compare, rank).
- **Database**: PGlite with the real migrations (`db.test.ts` pattern). Three accounts (alice,
  bob, carol) with the fixture programme; every policy in §5 has a positive and a negative
  case; every security-definer function has a truth-table test; backfill idempotence.
- **Parity**: the single most important test in the plan is that a shared exercise row equals
  `performanceSeries` for the same workout. It runs on the fixture and on a hand-built
  workout with dumbbell, bodyweight, hold and carry sets.
- **Components**: Testing Library for `FollowButton`, `CompareBars`, `RankList`, `RadarChart`
  (values table), the privacy switches.
- **Routes**: `nav.test.ts` for the renamed tab and `UNDER_PROFILE`; `page-header.test.tsx`
  for the new section labels; `proxy.test.ts` unchanged (`/u/…` is private like everything).
- `npm run check` (lint, format, typecheck, tests) must pass at the end of every phase.

---

## 11. Rollout

1. Merge phase 1; production deploy migrates and backfills usernames. Tell the friends their
   username (it is on their profile) and that they can change it.
2. Merge phase 2; nothing to run.
3. Merge phase 3; production deploy migrates; then run `npm run db:backfill:shared-stats`
   once against production with `.env.local` pointing `DIRECT_DATABASE_URL` at it. Until it
   runs, profiles and activity show only sessions finished after the deploy, which is
   harmless.
4. Merge phases 4–7 as they land.

Preview deployments built from a phase branch will error on the screens that touch that
phase's table. That is the existing trade (`SETUP.md` §7) and is why phases are separate PRs.

---

## 12. Risks and how the plan answers them

| Risk                                                                 | Answer                                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A widened policy leaks a friend's rows into your own screens         | No existing policy changes. Shared rows live in tables nothing else reads, and every read names its user ids. |
| Shared numbers drift from Progress                                   | One pure function on the same primitives; a parity test.                                                   |
| Someone enumerates emails through search                            | Exact-match function only, opt-out switch, username search never touches email.                            |
| A client grants itself an accepted follow                            | Status set by a security-definer trigger from the target's setting; client value ignored.                  |
| Username rename breaks a friend's bookmark                           | Accepted for a small group; recorded in the ADR.                                                           |
| Dumbbell e1RM over-counts per-hand loads                             | Loads are taken as logged; InfoTip says so; `load_convention` exists if a later change wants to normalise. |
| A forgotten session inflates "workout time"                          | Duration capped at four hours in the shared row; tip on the compare screen.                                |
| Twenty "records" on a first workout                                  | First performances are not announced.                                                                      |
| Previews break mid-phase                                             | One table per PR; deploy between phases.                                                                   |
| Backfill forgotten                                                   | SETUP step; the profile page shows a one-line owner-only note when finished sessions exist but no shared rows do. |

---

## 13. Open items that do not block starting

- Whether a **per-hand** convention for dumbbells should double the load for e1RM. Not now;
  the data to decide it (`equipment_instances.load_convention`) is already recorded.
- Whether followers-only visibility should extend to **programme day names** in activity rows.
  Included as the session title because "Upper A" is the least sensitive fact about a session;
  easy to blank if anyone objects.
- A **third sport** (e.g. cycling) needs a `training_sport` value, a `…Stats` function and
  its metrics list. No schema change beyond the enum.
