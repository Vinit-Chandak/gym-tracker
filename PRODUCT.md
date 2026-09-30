# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who lift, and often also run, ride or swim, following a programme. They use Overload
in the gym between sets: one hand, sweaty, glancing, in bright gyms and dark ones. At home
they log meals several times a day and check progress about once a week.

## Product Purpose

Overload tells the athlete what they owe today (the programme day, its runs, anything
scheduled), where they will train, and lets them record every set of a workout as a
permanent record. It also logs food against daily targets and shows how training is going
over time. Success is logging a set in seconds without thinking, and trusting the numbers.

## Positioning

A programme-driven training log with a load suggestion for every exercise (add load, hold,
repeat, reduce, step back and more), each set kept as its own record, the gym fixed per
session, and food and endurance sports alongside lifting in one app.

## Operating Context

- Between sets: rest timer running, the next set to enter, often with load and reps already
  suggested and effort (RIR or RPE) still to enter.
- Before a session: pick the gym, start or resume, see the plan and any runs owed today.
- Food: seven fixed meals a day, logged by hand from the athlete's own foods.
- Weekly: totals, weekly sessions, strength, running, recovery and body trends.

## Capabilities and Constraints

- The feature contract for the core loop is `docs/ui-redesign/revamp/features.md`; nothing
  in it may be dropped, only moved, regrouped or put one tap away.
- The decisions in `docs/ui-redesign/README.md` bind every redesign: one row per set with its
  own load, reps and RIR; one unfinished workout at a time; the gym fixed per session and
  said once; free movement between exercises; System, Light and Dark appearance.
- A PWA today; native iOS and Android apps are coming, so patterns must exist on both
  (tab bar, stack navigation, sheets, lists, steppers) and nothing central may rely on hover.
- Five destinations stay reachable: Today, Training, Food, Progress, Profile.
- Typefaces must be licensed for the web and for embedding in native apps.

## Brand Commitments

- The name Overload stays. Everything else (identity, colour, type, layout, navigation,
  motion) is open.
- The user wants it minimal, complete, creative, intuitive and attractive: colourful,
  contrasty, little text.
- References the user likes (30 September 2026): Apple Fitness (vivid rings, big bold
  numbers, glanceable), Duolingo (playful chunky shapes, bright friendly colour), Revolut
  and Monzo (bold colour cards, smooth, premium).
- Sentence case, British English.

## Evidence on Hand

Real sample content lives in the seed data, preview fixtures and audit seed cited by the
feature inventory. Never invent numbers, features or claims.

## Product Principles

1. Numbers are the product: loads, reps, effort, times and calories are large, tabular and
   never ambiguous about units.
2. One thumb: primary actions sit in reach; targets are at least 44 px.
3. Show, don't write: state is carried by shape, colour and position, backed by words where
   colour alone would be the only signal.
4. Progressive disclosure moves a feature; it never removes one.

## Accessibility & Inclusion

Body text at 4.5:1 or better in both themes, colour never carries meaning alone, layouts
survive 200% text, zoom is never disabled, reduced motion is respected.
