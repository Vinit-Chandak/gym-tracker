# The revamp toolkit: skills and where they live

Prepared 30 September 2026, before any design work. Nothing in the application changed.

The ground-up revamp is designed and built with Claude. This page lists every skill added for
it, why each earned its place, what was turned down, and the settings that came with them. How
the pieces are used together is in [the workflow](README.md).

## Where things are installed

| Place                                                    | What is there                                                  | Reaches                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| This repository, `.claude/skills/` and `.claude/agents/` | The skills below, copied from their sources at a pinned commit | Every Claude Code session on this repository: cloud (claude.ai/code and the app), desktop and CLI |
| The claude.ai account                                    | Nothing new. See [below](#the-claudeai-account)                | Every cloud, desktop and signed-in terminal session, on any repository                            |
| Claude Design                                            | Design systems and canvases, none yet                          | claude.ai, and Claude Code through `/design` and the Artifact tool                                |

Skills are committed rather than installed per machine because a cloud session starts from a
fresh clone: it loads project skills from the checkout, but not plugins declared in
`.claude/settings.json` and nothing from `~/.claude`. A committed copy is also reviewed, pinned
and shared with every session. Each skill folder holds an `UPSTREAM.md` with its source,
commit, licence and any local change.

## The skills

Auto: Claude uses the skill when the request matches its description. Manual: it runs only
when typed, such as `/prototype`.

### House rules

| Skill         | Use it for                                                                                                                                                                                                                                                                       | Runs | Source                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------- |
| `overload-ui` | Read first for UI, motion or PWA work: which skill owns which job, which rule wins when skills disagree with each other or with Overload's decisions, the limits in force, how to verify, and a checked list of what installed web apps can and cannot do on iPhone and Android. | Auto | Written for this repository |

### Direction, critique and review

| Skill                   | Use it for                                                                                                                                                                                                                                                                                                                                                                                                  | Runs                                      | Source                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `impeccable`            | The design lead. `/impeccable init`, `shape`, `critique`, `audit`, `polish`, `bolder`, `quieter`, `distill`, `harden`, `onboard`, `animate`, `colorize`, `typeset`, `layout`, `adapt`, `clarify`, `extract`, `document` and more. Keeps durable product truth in `PRODUCT.md` and the visual system in `DESIGN.md`. Four subagents in `.claude/agents/` do its finish review, documentation and asset work. | Auto, or `/impeccable <command> <target>` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) 4.4.0, Apache-2.0          |
| `web-design-guidelines` | A terse `file:line` review against Vercel's Web Interface Guidelines: accessibility, focus, forms, animation, touch, safe areas, dark mode, copy.                                                                                                                                                                                                                                                           | Auto                                      | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), MIT           |
| `accessibility`         | An evidence-led WCAG 2.2 pass: audit with Lighthouse or axe, find the failing component, fix it, audit again, and check by keyboard and screen reader.                                                                                                                                                                                                                                                      | Auto                                      | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills), MIT |

### Motion

| Skill                           | Use it for                                                                                                                                                                                                          | Runs   | Source                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `emil-design-eng`               | The craft bar behind the motion skills: when to animate, easing, duration, origin, interruption, polish details.                                                                                                    | Auto   | [emilkowalski/skills](https://github.com/emilkowalski/skills), MIT |
| `animate`                       | Building one animation, deciding in order: whether to animate, purpose, tool, properties, curve, interruption, exit.                                                                                                | Auto   | emilkowalski/skills                                                |
| `find-animation-opportunities`  | Finding places that should move, and rejecting the ones that should not. Read-only.                                                                                                                                 | Auto   | emilkowalski/skills                                                |
| `improve-animations`            | Auditing all existing motion and writing prioritised, self-contained plans. Read-only.                                                                                                                              | Auto   | emilkowalski/skills                                                |
| `review-animations`             | A strict review of motion code.                                                                                                                                                                                     | Manual | emilkowalski/skills                                                |
| `animation-vocabulary`          | Naming an effect you can describe but not name, to prompt with the right word.                                                                                                                                      | Auto   | emilkowalski/skills                                                |
| `fixing-motion-performance`     | Rules for smooth motion on a mid-range phone: compositor-only properties, no layout thrashing, scroll-linked motion without scroll events, bounded blur.                                                            | Auto   | [ibelick/ui-skills](https://github.com/ibelick/ui-skills), MIT     |
| `vercel-react-view-transitions` | Route transitions, shared elements, directional navigation and Suspense reveals with React's `<ViewTransition>`, which the App Router supports without configuration. The Next.js 16.3 guide recommends this skill. | Auto   | vercel-labs/agent-skills, MIT                                      |

### Feeling native on iPhone and Android

| Skill                 | Use it for                                                                                                                                                                                                                                                           | Runs | Source                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| `apple-design`        | Apple's interface and motion principles translated for the web: immediate response, 1:1 tracking, interruptible springs, velocity handoff, rubber-banding, sheets, materials and depth, reduced motion, typography.                                                  | Auto | emilkowalski/skills                                                                                 |
| `mobile-native`       | The platform-layer fixes that make a web app feel installed: hover on touch, tap highlight, `dvh`, input zoom, tap latency, overscroll, safe areas, long-press selection, status-bar colour.                                                                         | Auto | emilkowalski/skills                                                                                 |
| `modern-web-guidance` | The Chrome and Edge teams' guides to current platform patterns, each with browser support and fallbacks: dialogs, sheets and drawers, swipe actions, scroll snap, view transitions, `linear()` springs, forms, INP. 153 guides, searched locally through `INDEX.md`. | Auto | [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance), Apache-2.0 |

No iOS or Android design skill written for the web exists: Apple publishes none, Google's
`android/skills` covers Jetpack Compose only, and the HIG and Material copies on GitHub are
written for SwiftUI and Compose. The iPhone and Android layer is therefore `apple-design`,
`mobile-native`, `modern-web-guidance` and the checklist inside `overload-ui`.

### Exploration

| Skill             | Use it for                                                                                                                              | Runs   | Source              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------- |
| `prototype`       | Several genuinely different versions of one piece of UI behind a live picker, then promoting the winner.                                | Manual | emilkowalski/skills |
| `pick-ui-library` | Choosing a library from a curated list (Base UI, Sonner, Motion, NumberFlow, recharts, dnd kit and others) instead of hand-rolling one. | Manual | emilkowalski/skills |

## The claude.ai account

Nothing was added to the account. Every design plugin in its directory either duplicates the
committed set or works against it:

- Anthropic's `frontend-design` is where Impeccable started; both would compete for every UI
  request, and it is written for landing pages.
- Anthropic's `Design` plugin is built for Cowork and registers Slack, Figma, Linear, Asana,
  Atlassian, Notion and Intercom servers; its critique and accessibility skills duplicate
  Impeccable and `accessibility`.
- VectorLab, design-skills, ux-ui-audit and ux-superpowers are young and barely used, and
  VectorLab's rules contradict the motion skills (no springs, `ease-in` exits) and edit
  `CLAUDE.md`.
- Superdesign needs its own account and uploads pages to its service, which Claude Design
  already covers.

Two directory plugins stay on offer: Figma's official plugin, if the design ever lives in
Figma, and Expo's official skills, if the app is ever rebuilt natively.

## Considered and not installed

| Candidate                                    | Why not                                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| ui-ux-pro-max                                | A keyword search over CSV catalogues of styles and palettes; reviewers report near-identical layouts, and it keeps its own design memory |
| taste-skill                                  | Built for landing pages and portfolios, with GSAP-heavy motion                                                                           |
| interface-design                             | Sound for product UI, but a second design memory beside Impeccable's                                                                     |
| ehmo/platform-design-skills (iOS, Android)   | Written for SwiftUI and Compose, last changed in March, bundles Apple's HIG as a PDF; Impeccable already carries a distilled version     |
| Community PWA skills                         | Teach retired rules (Lighthouse PWA scores, service-worker install requirements)                                                         |
| GSAP skills                                  | Proprietary licence and 27–40 KB of JavaScript, against a 5 KiB shell budget                                                             |
| Rive and Lottie                              | 0.4–0.8 MB of WebAssembly runtime                                                                                                        |
| Motion's AI kit                              | Only worth it if Motion is adopted; its useful parts are paid                                                                            |
| design-motion-principles, userinterface-wiki | Second-hand summaries of the motion skills installed; userinterface-wiki also teaches `ease-in` exits                                    |
| Jakub Krehel's skills                        | Good, but overlap Impeccable and the motion skills; a candidate for a second-opinion review later                                        |
| shadcn                                       | Only useful with a shadcn `components.json`, which Overload does not have                                                                |
| Remotion                                     | Video, not interfaces                                                                                                                    |

## Settings that came with them

- **`skillListingBudgetFraction: 0.02`** in `.claude/settings.json`. Claude sees a listing of
  every skill's description, capped by default at 1% of the context window. Over the cap, the
  least-used skills lose their descriptions first, and new skills are the least used. Doubling
  the cap keeps the design skills discoverable; the listing costs only what it contains.
- **`IMPECCABLE_NO_TELEMETRY=1`** in the same file's `env`. Impeccable's engine otherwise sends
  one anonymous ping when a design-direction round resolves.
- **Impeccable's engine** is a small binary its launcher downloads once, from the project's
  GitHub releases with a checksum check, into `~/.impeccable/`. It was tested in a cloud
  session on 30 September 2026 and ran (engine 0.1.8). The skill still works, with less
  automation, if the download is refused.
- **Impeccable's design-detector hooks are not installed.** They re-scan UI files after every
  edit and at the end of every turn. That suits a design session but not the rest of the work
  in this repository, including the coach routine. Turn them on for a session with
  `/impeccable hooks on`, which writes the uncommitted `.claude/settings.local.json`. Without
  the hook, Impeccable asks for one detector run at the end instead.
- **Prettier and ESLint skip the copied skills** (`.prettierignore`, `eslint.config.mjs`), so
  `npm run check` never rewrites or lints third-party files. Overload's own `coach` and
  `overload-ui` skills are still formatted.
- **Two copies were adapted, and say so in `UPSTREAM.md`.** `web-design-guidelines` reads a
  pinned copy of the guidelines instead of fetching the live file on every run, and accepts
  sentence case. `modern-web-guidance` searches its pinned guides locally instead of running
  the newest npm package on every call, and no longer tells Claude to run it first for every
  HTML, CSS and JavaScript task.

## Updating a skill

Copy the skill folder again from its source at a newer commit, keep the local changes its
`UPSTREAM.md` lists, and update the commit there. Read the diff before committing: a skill is
instructions Claude follows.
