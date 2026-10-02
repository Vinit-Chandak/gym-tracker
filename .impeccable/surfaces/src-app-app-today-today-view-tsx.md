---
version: 1
slug: "src-app-app-today-today-view-tsx"
primary_target: "src/app/(app)/today/today-view.tsx"
related_targets:
  [
    "src/app/(app)/layout.tsx",
    "src/components/shell/bottom-nav.tsx",
    "src/app/(app)/workouts/[sessionId]/workout-view.tsx",
  ]
---

# Surface brief: the app shell and Today (the coach's sheet)

## Scope and visitor mode

Operate. The whole installed app, entered through Today. The athlete is completing a task: read what the
coach planned, start it, log it; later, read a proposal and decide. Every other tab inherits this world.

## Audience, job, task, content, constraints

A self-coached lifter-runner at one of two or three gyms, phone in one hand between sets, under gym light;
in the morning at home reading the plan. Content is the athlete's own programme, the coach's plan with
reasons, their machine history and records. Constraints: every existing feature kept; large text must
fit; the rest timer and resume strip must stay small; the tab bar must leave the page readable; the
system must port to native Android/iOS later; both Light and Dark are features.

## Direction contract

THESIS: Overload is the coach's plan sheet. Every screen is a position on the training plan, and today is
the highlighted cell. It refuses the fitness dashboard (hero ring, stat cards, neon start button, streak)
and its calm-journal opposite (cream paper, serif, terracotta boxes).

OWN-WORLD: A sheet, not a stack of cards: paper-white in daylight, graphite-black at the gym, both with a
faint construction grid showing through. Ink text in Barlow (semi-condensed for dense data), tabular
numerals everywhere a number lives. One highlighter, fluorescent yellow with black ink on it, marks
today, the current step and the one primary action, and nothing else: a chosen cell in a segmented
control is inked in, and a marked row or tile in a picker takes the highlighter's soft tint with a
pen check; pen blue is the coach's own hand and every interactive word; pencil grey is anything
proposed and not yet confirmed. Hairline rules, 4 px corners,
no card inside a card, no decorative shadow; only a sheet that lifts (a bottom sheet) casts one.
Icons in one stroke weight (Phosphor regular). The signature data graphic is the periodisation chart:
stepped bars of weekly work with the cycle blocks banded behind them.

STORY: The athlete opens the sheet and sees today's session in the coach's hand, each exercise with its
target in pencil and its reason in pen. One tap starts it. Each set is inked over the pencil target. Over
weeks the chart fills, and proposals arrive as a pen layer over the programme that never edits it until
approved.

FIRST VIEWPORT (402x874, Today): a slim top line with the wordmark and the date; beneath it the cycle
strip, eight cycles as blocks and today's day cell filled with highlighter, with the "behind" count as a
pen note; the gym line (where you are, change); then the session block: the day's name set large, the
coach's one-line note in pen, the exercise rows as sheet rows (number, name, sets x reps @ RIR, load),
each with its pen reason beneath; the primary action "Start workout" as a full-width highlighter bar
sitting just above the tab bar, within thumb reach; the tab bar: five sheet tabs along the bottom edge,
the current one marked in highlighter.

FORM: the periodisation chart and programme sheet, candidate 4 of 7 on the ordered grounded list; seed
key 9dc70721; code-led (no image generation here). Raises, each named for its donor: viewport focus
(vertical feed): in the logger the current exercise owns the viewport and the next is one swipe away,
pre-rendered; visible armature (Crouwel): the grid is real and layouts reflow by whole cells; action
colour only where pressable (consumer canon): the highlighter never decorates; a layer that never edits
the terrain (orienteering map): proposals draw over the programme in pen and change nothing until
approved, and finished exercises are punched; one plot owns its screen (Saville): a progress section
shows one chart at a time at full width, never a grid of small charts; data density and the still
(Ikeda): tabular numerals at data density, and reduced motion holds a single still.
Signature interaction: pencil to ink. Motion grammar: ink arrives in 160 ms ease-out; sheets rise on a
short spring; tabs cross-fade 120 ms; nothing animates on page load.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict,
DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

Whether a dedicated Coach tab replaces Training or Profile holds the coach: resolved in build as "the coach
lives on Today and in Profile > Programme; no sixth tab" unless the build proves otherwise.
