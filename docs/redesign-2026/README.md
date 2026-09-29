# Overload redesign, 2026

**Goal:** a complete UI and UX redesign of the installed app on iPhone and Android that is minimal, intuitive, creative and attractive, and keeps every feature and the ten decisions in [`docs/ui-redesign/README.md`](../ui-redesign/README.md).

**Status:** Phase 0 (preparation), set up on 29 September 2026. Next is Phase 1: three directions in Claude Design. The step-by-step process, prompts and research are in [playbook.md](playbook.md).

## Where things are

| What                                          | Where                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Product truth                                 | [`PRODUCT.md`](../../PRODUCT.md)                                                                          |
| The shipped system, "Form 1"                  | [`DESIGN.md`](../../DESIGN.md); tokens in `src/styles/form/`                                              |
| The ten decisions every redesign keeps        | [`docs/ui-redesign/README.md`](../ui-redesign/README.md)                                                  |
| Process, prompts and research                 | [playbook.md](playbook.md)                                                                                |
| Claude Code kit: design skills, review agent  | [`.claude/README.md`](../../.claude/README.md)                                                            |
| Claude Design: the new system, empty for now  | [Design System](https://claude.ai/artifact/X8UrTaqvCTiiNF8t5e51rg) (filled in Phase 2)                    |
| Claude Design: the canvas convention to reuse | "Gym Tracker — Graph Fixes": rows "As they draw today", "Built" and "Decided: …", one sticky per decision |

## What the redesign must fix

Observed on the `/preview` screens at 390 × 844 in both themes:

- Every screen is the same bordered rounded box with a small uppercase label, a title, grey text and a full-width button, so nothing leads.
- Numbers, the heart of a lifting app, are never celebrated: no display figures, and load × reps reads like any other text.
- The logging grid is heavy: five columns of bordered inputs, a copper "Save" on every set row, a cryptic "…" set menu and info icons.
- Today shows no week, streak, volume or records, and leaves its lower half empty.
- Brand expression stops at the wordmark's copper full stop.
- "Previous on this machine", Overload's most distinctive fact, is one line of text instead of numbers inside each set row.

## Defaults to avoid

Anthropic's `frontend-design` skill (vendored in `.claude/skills/frontend-design/`, updated September 2026) names five clusters that generated design falls into by default:

1. a warm cream background (near `#F4F1EA`) with a high-contrast serif display and a terracotta or warm-clay accent;
2. a near-black background with a single bright acid-green or vermilion accent;
3. a broadsheet layout with hairline rules, zero border-radius and dense newspaper columns;
4. the SaaS-card kit: identical rounded cards, one radius regardless of hierarchy, the same soft grey shadow under each, and gradient washes as decoration;
5. template chrome: a tracked-out ALL-CAPS eyebrow above every heading, meta strings joined with middle dots ("A · B · C"), "WORD — fragment" labels, tinted near-black standing in for black, monospace for small data labels, and "→" appended to link and button text.

Form sits in or near three of them: its canvas `#f4f3ee` with a copper accent (1), one 12 px box for everything (4), and ALL-CAPS eyebrows with middle-dot meta strings such as "Cycle 1 of 8 · Day 3" and "4 exercises · 11 sets" (5). The skill's own caveat applies: each trait is legitimate when chosen for a reason, so the redesign may keep one deliberately, never by default. The same skill also warns against accenting a single word in a headline, labels above content that add nothing, numbered markers on content that is not a sequence, and fade-and-slide entrances on every section.

## Principles for the new design

- **One emphasised action per state**, such as Log set, Start next set or Finish; everything else stays quiet. Google's Material 3 Expressive research found emphasis through size, colour, shape and containment let people find the key element up to four times faster.
- **The numbers are the hero:** load × reps, times and distances in a figures style with tabular numerals, readable at arm's length.
- **Previous performance lives in the set row**, from the same machine at the same gym.
- **Motion is fast on every set and generous once:** press feedback of about 120 ms and no celebration when logging, one orchestrated moment for a personal record, and meaning kept under reduced motion.
- **Glass only on navigation,** never behind content.
- **Borrow platform behaviour, never platform chrome:** no drawn status bars, home indicators, Activity rings or SF Symbols.

## Measures of success

| Measure                                               | Target                            |
| ----------------------------------------------------- | --------------------------------- |
| Taps to log a set identical to last time              | 1                                 |
| Taps to log a changed set                             | 3 or fewer                        |
| Time from opening a workout to the first logged set   | Under 60 s                        |
| Smallest target                                       | 44 px; 56 px to complete a set    |
| Text contrast, both themes                            | 4.5:1; 7:1 for small copper text  |
| axe on the audited routes                             | No serious or critical violations |
| Features and the ten decisions in `docs/ui-redesign/` | All intact                        |

## Platform rules in short

- **iPhone:** 44 pt targets and 17 pt body text; a labelled tab bar that stays visible and holds only navigation; sheets with grabbers; keep `statusBarStyle: "default"` (decision 0022; `black-translucent` is still broken in iOS 26 standalone apps); splash screens only through `apple-touch-startup-image`; no Vibration API; Screen Wake Lock in Home Screen apps from iOS 18.4; Safari 26 ignores `theme-color` and samples the page and fixed-element backgrounds instead.
- **Android:** 48 dp targets with 8 dp spacing; 3–5 navigation destinations; system back closes the top sheet first; manifest `screenshots` and a `description` for the richer install sheet; a monochrome icon; the bottom bar padded with Chrome's `safe-area-max-inset-bottom` pattern.
- **Both:** `overscroll-behavior-y: contain` on the root scroller; `inputmode="decimal"` or `"numeric"` with at least 16 px text; a wake lock during workouts; sets saved locally the moment they are completed.

The full checklists, with sources, are in [playbook.md](playbook.md).

## Phases

| #   | Phase                                                     | Status                                                                                  |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 0   | Prepare: screenshots, kit, brief, Form 1 in Claude Design | Kit, `PRODUCT.md`, `DESIGN.md` and this brief done; baseline screenshots with the owner |
| 1   | Explore three directions in Claude Design                 | Next                                                                                    |
| 2   | Lock the new system in code, then in Claude Design        |                                                                                         |
| 3   | Design every screen and link a clickable prototype        |                                                                                         |
| 4   | Hand off and rebuild one area per pull request            |                                                                                         |
| 5   | Motion                                                    |                                                                                         |
| 6   | Polish for iPhone, Android and the installed PWA          |                                                                                         |
| 7   | Verify with the audits, the review agent and real phones  |                                                                                         |
| 8   | Optional promo video                                      |                                                                                         |

Record the chosen direction as decision 0041 in `docs/decisions/`, and each later phase's decisions the same way.
