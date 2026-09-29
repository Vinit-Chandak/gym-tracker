# Product

<!-- impeccable:product-schema 1 -->

<!-- Drafted on 2026-09-29 from the repository's own documentation: README.md, docs/planning/PRODUCT_REQUIREMENTS.md, docs/decisions/ and docs/ui-redesign/README.md. Lines marked "(to confirm)" are inferences awaiting the owner's confirmation. -->

## Platform

web

## Users

- **Primary:** people who strength-train at more than one gym and want machine history kept per gym and per machine, so stack numbers from different equipment are never mixed. They log between sets, often one-handed, on an iPhone or an Android phone with the app installed to the home screen.
- **Also served:** runners and mixed-sport athletes (runs, rides, swims), and people tracking food and macros alongside training.
- **Friends:** people an athlete lets follow them. They see a short, separate list of shared training numbers, never the athlete's gyms, machines, programmes or full history.
- The product began as its owner's personal training system and is now multi-user; each account's data is private by default. (to confirm) Whether the redesign targets a wider public audience or the owner and friends first.

## Product Purpose

Overload makes progressive overload easy to practise and easy to see. It says what to train next, makes logging a set fast enough to do between sets, remembers every previous set on the same machine at the same gym, and turns that history into progress, records and programme decisions. Success means a session is logged without friction and the next session's loads are obvious.

## Positioning

- **Gym-aware history.** Machine-dependent exercises keep separate history per gym and per machine; free-weight and bodyweight lifts stay comparable everywhere.
- **A coach that proposes.** The AI house coach plans programmes, prepares sessions and reviews programmes, but every draft and change is reviewed by the athlete before it applies.
- **Private by default.** An opt-in friends layer (follow with approval, compare, leaderboards) instead of a social network.

## Operating Context

- Used mid-session in gyms: sweaty hands, one thumb, bright or dim lighting, interruptions, and poor or no signal in some gyms.
- Installed as a PWA from Safari on iPhone and Chrome on Android. There is no native app and no app-store listing.
- A session belongs to one gym, chosen before starting. One workout is unfinished at a time; the athlete moves freely between tabs and returns to the active session.
- Five tabs: Today, Training, Food, Progress, Profile.
- Weights and heights are stored once, in kilograms and centimetres, and shown in the account's units (kilograms and centimetres, or pounds and feet).

## Capabilities and Constraints

- Strength logging in which each set owns its load, its reps (or seconds held, or metres covered) and its RIR or RPE; set types; supersets for the current workout; a rest timer; substitutions; ad hoc workouts.
- Running and other sports; recovery and symptoms; body weight as a running record.
- Food and macros: meals of the day, my foods, targets from the goal, and any day on the Food tab.
- Progress: charts, history and a body map; records announced when a workout finishes.
- Friends: following with approval, a person's page, compare and leaderboards, governed by four privacy switches.
- AI coach: creates programmes from an intake, prepares sessions and reviews programmes; drafts are reviewed before they apply.
- One shared reference library: 92 kinds of machine, 268 exercises, warm-up protocols and programme templates.
- Ten decisions any redesign must preserve are listed in `docs/ui-redesign/README.md`. Progressive disclosure may change where something lives, never whether it is available.
- Technical: Next.js 16 App Router, React 19, Tailwind CSS v4 over CSS-variable tokens, Supabase Postgres with row-level security. Phone layouts lead. Appearance is System, Light or Dark, kept on the device.

## Brand Commitments

- Name: **Overload**. Tagline: "Progressive overload, one set at a time."
- Voice: plain and sentence-case, with as few words per screen as the task allows (decision 0014); figures and facts rather than pep talk.
- (to confirm) Whether the wordmark's copper full stop and the copper accent are binding, or free to change in the redesign.

## Evidence on Hand

- Screens with made-up data: `/preview`, `/preview/logging`, `/preview/food`, `/preview/coaching`, `/preview/headers` and `/preview/icons` (`npm run dev`).
- A seeded audit of about 68 routes across six accounts, with screenshots on Pixel 7, iPhone 13, a 320 px phone and desktop in both themes (`docs/local-dev.md`).
- Decision records in `docs/decisions/` and audits in `docs/audits/`.
- No testimonials, user counts, reviews, press or benchmarks exist; do not invent them.

## Product Principles

1. Logging a set must be faster than remembering it.
2. The previous performance on the same machine at the same gym is always one glance away.
3. Every set is its own record.
4. The coach proposes; the athlete decides.
5. Private by default; sharing is explicit and narrow.

## Accessibility & Inclusion

- Targets of at least 44 px, editable text of at least 16 px, and text contrast of at least 4.5:1 in both themes, including the eight superset hues.
- Layouts verified at 320–480 px and at 200% text (decision 0013). Never shrink tap targets or editable text to make a layout fit.
