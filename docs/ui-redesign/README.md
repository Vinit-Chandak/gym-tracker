# Overload interface redesign

Planning baseline: 10 September 2026. Based on `origin/main` at `c61024b` (database round-trip and cache improvements), Next.js 16.3.4, React 19.2.8 and Tailwind CSS 4.

This package specifies how to implement **Form**, the user's selected design, across the existing phone-first app with **light and dark mode**. It contains design decisions, a feature-preserving implementation plan, acceptance criteria and CSS theme tokens.

**Status: implemented.** The specification below is the contract and stays as written; what was decided while building it, and what was measured afterwards, is recorded in [decision 0013](../decisions/0013-form-interface.md). A later pass that removed most explanatory text, moved what remained behind info tips, colour-coded supersets and split Today into one card per activity is recorded in [decision 0014](../decisions/0014-less-said-per-screen.md). The theme files now live in `src/styles/form/`. Field performance on real devices remains unmeasured.

## Read in this order

| Document                                               | Purpose                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [Layout specification](01-layout-specification.md)     | Screen hierarchy, set logging, navigation, responsive behaviour and every existing workflow |
| [Implementation plan](02-implementation-plan.md)       | Current code map, component boundaries, state ownership, dependencies and delivery phases   |
| [Themes and performance](03-themes-and-performance.md) | First-paint appearance, persistence, motion, performance budgets and release checks         |
| [Theme files](themes/README.md)                        | Token contract, Form's two palettes, import order and eventual Tailwind integration         |

## Decisions that implementation must preserve

1. **Load, reps and RIR belong to each set.** Remove the previous mockup's “Shared values” section and override mechanism. Each row contains its set identity/options, load, reps (or duration), RIR and save action. Identical values in separate sets remain visible because they are separate records, not redundant decoration.
2. Show an identical exercise prescription once above its rows. Show exceptions only where a prescription actually differs. Suggested RIR is not recorded RIR.
3. Keep one unfinished workout at a time. Allow free movement between exercises, all six app destinations and historical workouts. Returning must restore the active session and drafts.
4. Select the gym before starting. The gym is fixed for that session and appears once in session context, not on every exercise or set.
5. Keep all exercises in a normal, compact workout list. Opening an exercise uses a focused detail view; it must not expand a large empty area in that list.
6. Add/edit/remove supersets for the current workout only. Preserve programme-defined groupings without changing the programme template.
7. Support ad hoc workouts without invented programme, cycle or day metadata.
8. Preserve the current app's features. Progressive disclosure changes placement, not availability. Core logging fields and exercise selection must remain directly accessible.
9. Phone layouts lead. Adapt spacing and typography within readable bounds; never shrink tap targets or editable text to force a layout to fit.
10. Provide System, Light and Dark appearance. Keep theme changes local, immediate and independent of workout state.

These decisions supersede the shared-load/shared-RIR behaviour and any contrary wording in the earlier prototype or its feature-coverage notes. The prototype is a visual reference, not the production data model or final set-entry specification.

## Selected design: Form

| Aspect            | Decision                                                            |
| ----------------- | ------------------------------------------------------------------- |
| Character         | Compact training instrument                                         |
| Light palette     | Warm neutral, charcoal-green ink, dark copper                       |
| Dark palette      | Charcoal-green, warm pale ink, copper accent                        |
| Headings          | System sans serif, medium/semibold                                  |
| Detail typography | System sans; selective monospaced labels and tabular numbers        |
| Geometry          | Small radii and crisp ruled lists                                   |
| Behaviour         | One component tree, feature model and route structure in both modes |

The user's follow-up selects Form provided it has both light and dark mode. Form is therefore not locked to the dark appearance of its original mockup. The light palette is a complementary implementation proposal and still requires visual review on phones.

Fieldnotes is no longer an implementation candidate in this package. There is no end-user design-direction picker and no Fieldnotes theme file. Settings offers only the appearance modes System, Light and Dark.

## Scope of this commit

Only this documentation package and its theme CSS belonged in the planning commit; the implementation followed in the commits after it, phase by phase.

## Open decisions before the relevant phase

| Decision                                                      | Why it matters                                      | Outcome                                                                                                          |
| ------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Oldest supported iOS/Android browser and weakest target phone | Concrete first-paint, memory and frame-time budgets | **Still open.** Layout was verified in headless Chromium at 320–480 px and 200% text; field devices are untested |
| Persistence of session-only supersets across devices          | Requires an additive workout-level storage contract | **Settled.** `workout_exercises.superset_group`, migration 0007, seeded from the plan and backfilled for history |
| Appearance across devices                                     | Profile setting versus device/browser preference    | **Settled.** Device-local, with a pre-paint initializer rather than a cookie; see decision 0013                  |

No open decision licenses dropping an existing feature. If implementation discovers a mismatch with current source, update the mapping and resolve that specific conflict before shipping the affected workflow.
