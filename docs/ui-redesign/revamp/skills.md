# The revamp toolkit: skills and where they live

Prepared 30 September 2026, before any design work. Nothing in the application changed.

The ground-up revamp is designed and built with Claude. This page lists every skill added for
it, why each one earned its place, which ones were turned down, and the settings that came
with them. How the pieces are used together is in [the workflow](README.md).

## Where things are installed

| Place                                                    | What is there                                                    | Reaches                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| This repository, `.claude/skills/` and `.claude/agents/` | The skills below, copied from their sources at a pinned commit   | Every Claude Code session on this repository: cloud (claude.ai/code and the app), desktop and CLI |
| The claude.ai account                                    | Plugins installed from the Anthropic directory, if any are added | Every cloud, desktop and signed-in terminal session, on any repository                            |
| Claude Design                                            | Design systems and design canvases                               | claude.ai, and Claude Code through the Artifact tool                                              |

Skills are committed rather than installed per machine because cloud sessions start from a
fresh clone: they load project skills from the checkout, but not plugins declared in
`.claude/settings.json` and not anything in `~/.claude`. A copied skill is also reviewable and
cannot change underneath us. Each skill folder holds an `UPSTREAM.md` with its source,
commit and licence, and any local change.

## The skills

Auto: Claude picks the skill up when the request matches its description. Manual: it runs
only when typed, such as `/prototype`.

### Direction, critique and polish

| Skill                   | Use it for                                                                                                                                                                                                                                                                                                                                                                                          | Runs                                      | Source                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `impeccable`            | The design lead. `/impeccable shape`, `critique`, `audit`, `polish`, `bolder`, `quieter`, `distill`, `harden`, `onboard`, `animate`, `colorize`, `typeset`, `layout`, `adapt`, `clarify`, `extract`, `document` and more. Keeps durable product truth in `PRODUCT.md` and the visual system in `DESIGN.md`. Four subagents in `.claude/agents/` do its finish review, documentation and asset work. | Auto, or `/impeccable <command> <target>` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) 4.4.0, Apache-2.0 |
| `web-design-guidelines` | A terse `file:line` review against Vercel's Web Interface Guidelines: accessibility, focus, forms, animation, touch, safe areas, dark mode, copy.                                                                                                                                                                                                                                                   | Auto                                      | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), MIT  |

### Motion

| Skill                           | Use it for                                                                                                                                                                                                            | Runs   | Source                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `emil-design-eng`               | The craft bar behind the motion skills: when to animate, easing, duration, origin, interruption, polish details.                                                                                                      | Auto   | [emilkowalski/skills](https://github.com/emilkowalski/skills), MIT |
| `animate`                       | Building one animation, deciding in order: whether to animate, purpose, tool, properties, curve, interruption, exit.                                                                                                  | Auto   | emilkowalski/skills                                                |
| `find-animation-opportunities`  | Finding places that should move, and rejecting the ones that should not. Read-only.                                                                                                                                   | Auto   | emilkowalski/skills                                                |
| `improve-animations`            | Auditing all existing motion and writing prioritised, self-contained plans. Read-only.                                                                                                                                | Auto   | emilkowalski/skills                                                |
| `review-animations`             | A strict review of motion code.                                                                                                                                                                                       | Manual | emilkowalski/skills                                                |
| `animation-vocabulary`          | Naming an effect you can describe but not name, to prompt with the right word.                                                                                                                                        | Auto   | emilkowalski/skills                                                |
| `vercel-react-view-transitions` | Route transitions, shared elements, directional navigation and Suspense reveals with React's `<ViewTransition>`, which the App Router supports without configuration. Next.js 16.3's own guide recommends this skill. | Auto   | vercel-labs/agent-skills, MIT                                      |

### Feeling native on iPhone and Android

| Skill           | Use it for                                                                                                                                                                                                          | Runs | Source              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------- |
| `apple-design`  | Apple's interface and motion principles translated for the web: immediate response, 1:1 tracking, interruptible springs, velocity handoff, rubber-banding, sheets, materials and depth, reduced motion, typography. | Auto | emilkowalski/skills |
| `mobile-native` | The platform-layer fixes that make a web app feel installed: hover on touch, tap highlight, `dvh`, input zoom, tap latency, overscroll, safe areas, long-press selection, status-bar colour.                        | Auto | emilkowalski/skills |

### Exploration

| Skill             | Use it for                                                                                                        | Runs   | Source              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | ------ | ------------------- |
| `prototype`       | Several genuinely different versions of one piece of UI behind a live picker, then promoting the winner.          | Manual | emilkowalski/skills |
| `pick-ui-library` | Choosing a library from a curated list (Motion, NumberFlow, Sonner, Vaul, recharts…) instead of hand-rolling one. | Manual | emilkowalski/skills |

## Settings that came with them

- **`skillListingBudgetFraction: 0.02`** in `.claude/settings.json`. Claude sees a listing of
  every skill's description, capped by default at 1% of the context window. When the listing
  is over the cap, the least-used skills lose their descriptions first, and new skills are
  the least used. Doubling the cap keeps the design skills discoverable; the listing costs only
  what it actually contains.
- **`IMPECCABLE_NO_TELEMETRY=1`** in the same file's `env`. Impeccable's engine otherwise
  sends one anonymous ping when a design-direction round resolves.
- **Impeccable's design-detector hooks are not installed.** They re-scan UI files after every
  edit and at the end of every turn. That suits a design session but not the rest of the work
  in this repository, including the coach routine. Turn them on for a session with
  `/impeccable hooks on`, which writes the uncommitted `.claude/settings.local.json`. Without
  the hook, Impeccable asks for one detector run at the end instead.
- **Impeccable's engine** is a small binary its launcher downloads once, from the project's
  GitHub releases with a checksum check, into `~/.impeccable/`. The skill still works, with
  less automation, if the download is refused.
- **Prettier and ESLint skip the copied skills** (`.prettierignore`, `eslint.config.mjs`), so
  `npm run check` never rewrites or lints third-party files. Overload's own `coach` skill is
  still formatted.
- `web-design-guidelines` reads a pinned copy of the guidelines in its `reference/` folder
  instead of fetching the live file on every run, and carries one project override: Overload
  writes headings and buttons in sentence case.

## Updating a skill

Copy the skill folder again from its source at a newer commit, keep the local changes its
`UPSTREAM.md` lists, and update the commit there. Read the diff before committing it: a skill
is instructions Claude follows.
