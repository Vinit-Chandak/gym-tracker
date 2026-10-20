# The revamp toolkit: skills and where they live

Prepared 30 September 2026, before any design work. Nothing in the application changed.
[Updated 20 October 2026](#updated-20-october-2026): Impeccable upgraded to 4.7.0, and three
skills added for the app's structure and for tasks that cross screens.

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
| `impeccable`            | The design lead. `/impeccable init`, `shape`, `critique`, `audit`, `polish`, `bolder`, `quieter`, `distill`, `harden`, `onboard`, `animate`, `colorize`, `typeset`, `layout`, `adapt`, `clarify`, `extract`, `document` and more. Keeps durable product truth in `PRODUCT.md` and the visual system in `DESIGN.md`. Four subagents in `.claude/agents/` do its finish review, documentation and asset work. | Auto, or `/impeccable <command> <target>` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) 4.7.0, Apache-2.0          |
| `web-design-guidelines` | A terse `file:line` review against Vercel's Web Interface Guidelines: accessibility, focus, forms, animation, touch, safe areas, dark mode, copy.                                                                                                                                                                                                                                                           | Auto                                      | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), MIT           |
| `accessibility`         | An evidence-led WCAG 2.2 pass: audit with Lighthouse or axe, find the failing component, fix it, audit again, and check by keyboard and screen reader.                                                                                                                                                                                                                                                      | Auto                                      | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills), MIT |

### Structure and flows

Added 20 October 2026; see [why](#three-skills-for-structure-and-flows).

| Skill                               | Use it for                                                                                                                                                                                                                                                    | Runs   | Source                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| `ux-information-architecture-audit` | A severity-rated audit of the app's structure: which screens exist, where each fact lives, whether labels agree across screens, and whether someone dropped on any screen can find their way. Checks each change against the information map in `PRODUCT.md`. | Auto   | [Uxcel-Lab/product-skills](https://github.com/Uxcel-Lab/product-skills), MIT     |
| `ux-navigation`                     | Choosing and reviewing the navigation model from the shape of the content: tab bar, stacks, tabs, "where am I?" signals, touch targets. Its website conventions do not apply here.                                                                            | Auto   | Uxcel-Lab/product-skills, MIT                                                    |
| `cognitive-walkthrough`             | Walking one task, action by action, as a first-time user: would they know what to do, see the control, connect it to their goal, and see that it worked?                                                                                                      | Manual | [mastepanoski/claude-skills](https://github.com/mastepanoski/claude-skills), MIT |

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
- **`IMPECCABLE_NO_TELEMETRY=1`** in the same file's `env`. Impeccable's engine otherwise reports
  each design-direction choice. Engine 0.1.16 still honours the variable, as it does
  `DO_NOT_TRACK` and `impeccable telemetry off`: it sends no choice report, and still fetches
  the direction roll from impeccable.style, marked for the server to record nothing.
- **Impeccable's engine** is a small binary its launcher downloads once, from the project's
  GitHub releases with a checksum check, into `~/.impeccable/`. It was tested in a cloud
  session on 30 September 2026 and ran (engine 0.1.8). Impeccable 4.7.0 pins engine 0.1.16,
  which has not been run here yet. The skill still works, with less automation, if the
  download is refused.
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

## Updated 20 October 2026

Impeccable was upgraded and three skills were added. Nothing in the application changed.

### Impeccable 4.7.0

Copied again, with its four subagents, from tag `skill-v4.7.0` (commit `aeeb3d8`, 19 October
2026). The launcher now pins engine 0.1.16. The copy is still unchanged from upstream, and the
hooks are still not installed. What changed since 4.4.0:

- **4.5, app screens.** App screens keep the controls people already know; a direction lends
  only type, palette, density and one signature move, and the alternatives vary how the
  screen is organised, starting with the navigation model, rather than adding decoration. The
  rules are in `reference/mode-operate.md`, beside new ones for documents and landing pages.
- **4.5.2, built in code.** App screens and documents skip the generated image comp. Each
  direction card shows a quick HTML sketch of the first screen instead, drawn at the device's
  screen size for phone and native surfaces.
- **4.6, telemetry with a real off switch.** `impeccable telemetry off`, `DO_NOT_TRACK` or
  `IMPECCABLE_NO_TELEMETRY` stops every choice report. Engine 0.1.16's source still reads
  `IMPECCABLE_NO_TELEMETRY`, so [the setting](#settings-that-came-with-them) still applies.
  Critique also works on native projects: it runs the design review alone instead of
  reporting an empty web scan as clean.
- **4.7, a lighter skill.** The description that loads into every session is about 30%
  shorter; upstream's wording is kept. Two typography checks catch a paragraph that ends on
  one word and a heading whose last line is a stub, the detector raises fewer false alarms,
  and polish is no longer cut off after two rounds outside a full build.

Impeccable's engine offers `npx impeccable update` when a newer version is out. Decline it
here: it rewrites the committed copy in place. Update by copying, as [below](#updating-a-skill).

### Three skills for structure and flows

Impeccable reviews one surface at a time. Nothing installed looked at the whole app's
structure or at labels across screens, or walked a task from one screen to the next. The
[structure and flows](#structure-and-flows) skills fill that gap: the information architecture
audit for the structure and its labels, `ux-navigation` for how people move between screens,
and the cognitive walkthrough for one task followed across them. The walkthrough is manual: it
is a deliberate exercise with a named task and user, not a reflex.

They come from [Uxcel-Lab/product-skills](https://github.com/Uxcel-Lab/product-skills) at
commit `5007cd0` (the head of `main`; both skills are unchanged since v1.0.0) and
[mastepanoski/claude-skills](https://github.com/mastepanoski/claude-skills) at v1.9.2 (commit
`b6457af`), both MIT. Each folder carries its upstream licence as `LICENSE`.

The copies are adapted, and say so in `UPSTREAM.md`. The Uxcel skills hand off to the installed
equivalents (`/impeccable critique`, `/impeccable clarify`, `accessibility`, `mobile-native`)
instead of sibling Uxcel skills and an orchestrator that are not installed, and offer those
checks rather than running them unasked. `cognitive-walkthrough` is made manual. Prettier and
ESLint already skip all three: `.prettierignore` covers every folder in `.claude/skills/` except
`coach` and `overload-ui`, and ESLint ignores `.claude/skills/` entirely.

### Considered and not installed today

| Candidate                                                           | Why not                                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Uxcel's `ux-design-review`                                          | An orchestrator over Uxcel's audits; it competes with `/impeccable critique`         |
| EliaAlberti ux-audit                                                | Little used, and writes report folders into the repository; a second opinion at most |
| wondelai ux-heuristics                                              | Duplicates critique's Nielsen pass, and carries affiliate links                      |
| julianoczkowski/designer-skills, phazurlabs/sumi, bitjaru/styleseed | Each keeps a second design memory beside Impeccable's                                |
| szilu/ux-designer-skill                                             | Competes with Impeccable on every UI request                                         |
| keysjoao/laws-of-ux                                                 | Scores designs mechanically against the laws of UX                                   |
| tommyjepsen/awesome-ux-skills                                       | No licence                                                                           |
| GOV.UK-style writing skills                                         | No licence that allows a committed copy                                              |
| emilkowalski `break-ui`                                             | Overlaps `/impeccable harden`; a candidate later                                     |

## Updating a skill

Copy the skill folder again from its source at a newer commit, keep the local changes its
`UPSTREAM.md` lists, and update the commit there. Read the diff before committing: a skill is
instructions Claude follows.
