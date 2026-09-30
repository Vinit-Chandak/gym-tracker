# Overload revamp: how to design and build it with Claude

Prepared 30 September 2026. Nothing in the application has changed yet. The tools this plan
relies on are listed in [the toolkit](skills.md); the current interface is captured in
[the iPhone 17 screenshot catalogue](../../audits/iphone17-design-screenshots-2026-09-30.md).

## The recommendation

Explore and decide the look in Claude Design, build it in Claude Code.

- **Claude Design** is where divergence is cheap. It draws live phone-sized artboards on a
  canvas, puts directions side by side, takes comments and direct edits, links artboards into
  clickable prototypes, and keeps a design system: tokens for both themes, type, spacing,
  radii, shadows, component previews and a written brand book. What it draws is an HTML
  mockup, not Overload's components, data or performance.
- **Claude Code** is where the real thing gets built: Overload's components, real data, both
  themes, motion on a phone, the committed skills and the screenshot tooling to check every
  screen. Exploring three directions in production code is slow, costly and hard to compare.

So: a few short sessions in Claude Design to choose the direction and freeze it into a design
system on a handful of anchor screens, then area-by-area work in Claude Code against that
system. Doing all 75 screens as mockups would waste the shared usage allowance, and large
canvases are reported to slow down or stop loading. Motion is designed and judged in code, on
a phone: a canvas can show the intent of a transition, not how a sheet follows a thumb.

### Where Claude Design runs

| Surface                                                        | Use it for                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [claude.ai/design](https://claude.ai/design)                   | The standalone app: uploads, exports, send-to and handoff                                                  |
| The Design template in any claude.ai chat or the Artifacts tab | The same canvas and design systems, started from a conversation                                            |
| `/design <brief>` in Claude Code                               | Drafting a canvas from inside this repository, so the mockups start from real routes, copy and tokens      |
| `/design-sync` in Claude Code                                  | Uploading a React component library to a Claude Design design system, so later mockups use real components |

Claude Design draws on the same plan limits as Claude Code. It keeps no version history:
export a `.zip` at each milestone.

## The flow

### 0. Brief

Write the prompt once and keep it in the repository, so every session starts from the same
truth. `/impeccable init` drafts a `PRODUCT.md` from the code and asks only for the gaps; when
it asks for the platform, answer **web**, or it loads native iOS and Android guidance that does
not apply. The `overload-ui` skill already records which installed skill owns which job and
which rule wins when they disagree. The brief should settle:

- who the app is for and the scene it is used in: between sets, one hand, sweaty, glancing,
  bright gyms and dark ones;
- what must not change: every feature and flow, one row per set with its own load, reps and
  RIR, the gym fixed per session, System/Light/Dark, phone-first
  ([the Form decisions](../README.md#decisions-that-implementation-must-preserve));
- the platform, brand, motion and scope decisions (see [decisions](#decisions));
- two to five reference apps or screens, and exactly what is admired in each: references steer
  better than adjectives;
- three words for how it should feel;
- a named list of patterns to avoid. Anthropic's prompting guide for Opus 5.5 notes that
  "avoid a generic AI look" only swaps one default style for another, and that naming the
  patterns works: its own example list includes an off-white background and monospace labels,
  both of which Form uses today. Check each round's output for the default it fell into, and
  add it to the list.

Group the 75 page templates into about ten archetypes before designing anything: Today, the
live workout logger, sheets and pickers, lists and history, detail pages, charts, forms and
settings, onboarding, and empty, loading and error states. The archetypes, not the pages,
are what gets designed.

### 1. Directions (Claude Design)

Start without the current interface, or the result is a repaint of it. Every direction draws
the same content, taken from [the feature inventory](features.md); the ready-made prompt is
[prompts/01-directions.md](prompts/01-directions.md). Ask for two or three
genuinely different directions, each on the same three or four anchor screens (Today, logging
a set mid-workout, Progress, Food) at the iPhone 17 size the catalogue uses, 402×874, in light
and dark, with real data. Pick one, then ask for two contrasting alternatives to test the
choice.

Only then show the current app, so the direction is mapped onto real content and structure.
Uploads are capped at 20 files per chat, so pick 12 to 16 phone captures from the
catalogue (one per archetype, core loop in both themes) rather than all 700 images. Use
comments for local fixes, chat for structural changes and direct edits for nudges.

### 2. Design system (Claude Design)

Freeze the chosen direction into a Claude Design design system: colour tokens for both themes,
the type scale and fonts, spacing, radii, shadows, previews of the primitives (button, field,
list row, sheet, tabs, stat, chart), and a README that states the voice, iconography and
platform rules. Tokens there have no motion family, so the motion principles (durations,
easings, springs, what never moves) go in the README and in the repository.

Write the rules so they can be checked: "section titles are 15 px semibold", not "clean
headings". Vercel found that agents building pages from a `design.md` of checkable rules, a
constraining stylesheet and deterministic checks made 39 mechanical failures where the same
pages without it made 91, and that a failure once named and encoded tends to stay gone. When a
screen comes out wrong, fix the rule or the token, not just the screen.

### 3. Anchor screens and the core loop (Claude Design)

Draw one screen per archetype and wire the core loop as a clickable prototype: Today → start
→ log sets → rest → finish → summary. Add interactive artboards for the three or four moments
that matter most (a set saved, the rest timer, a sheet opening, a tab change) with their
durations and easings written beside them, as intent. Stop here: the remaining screens are
applications of these archetypes and are cheaper to do in code.

### 4. Handoff

Export the project as a `.zip` and commit it under `docs/ui-redesign/revamp/handoff/<date>/`,
then give Claude Code the artboard to build and the rule: build it from Overload's tokens and
`src/components/ui`, never by porting the mockup's HTML, and add the empty, loading and error
states the mockup left out. The committed zip works in every session; the "Send to Claude Code
Web" button has been reported to start a session without the repository attached.

### 5. Build (Claude Code)

On a branch, in this order, each step a reviewable pull request:

1. tokens and themes (`src/styles/`, the `@theme` in `globals.css`), keeping System, Light
   and Dark;
2. the primitives in `src/components/ui/`;
3. the shell: tab bar, headers, page and sheet transitions;
4. the core loop;
5. the remaining areas one at a time: Food, Progress and history, Programme and coach, Friends,
   Gyms and machines, Profile and settings, onboarding and auth.

Each pull request passes `npm run check` and carries before-and-after captures from the
existing scripts (`scripts/dev/audit-browser.mjs` at the iPhone 17 viewport, both themes).
Those captures use WebKit and the browsers matching the repository's Playwright 1.63, which
cloud sessions do not ship (they carry an older Chromium only). Install them in the cloud
environment's setup script (environment menu in the session's title bar, then Edit) with
`npx playwright install webkit chromium`, adding `--with-deps` if WebKit's system libraries are
missing, or take the captures on a laptop.

Keep the maker and the critic apart. After each area, a reviewer with fresh context (a
subagent such as Impeccable's finish reviewer, or a new session) compares the captures with
the anchor artboards and the `DESIGN.md` rules. Fix what it finds in tokens and components,
not page by page.

Once the new primitives exist, `/design-sync` can upload them to the Claude Design design
system, so later mockups use the real components. It is React-only, wants an entry file that
exports the components with their types and a compiled stylesheet, and its `/design-login`
step needs an interactive terminal, so run it from a laptop. Re-run it after changes: the
upload is a snapshot.

### 6. Motion (Claude Code)

`/improve-animations` and `find-animation-opportunities` plan it; `animate`, `apple-design`
and `vercel-react-view-transitions` build it; `/review-animations` and
`fixing-motion-performance` check it. Most of it needs no library: CSS transitions,
`@starting-style`, `linear()` springs and React's `<ViewTransition>` all work in Safari on
iPhone and Chrome on Android. Every motion decision is judged on a real iPhone and a
mid-range Android phone, installed as the PWA, with reduced motion on and off: agents can
check curves and timings but not how a gesture feels.

### 7. Polish and audit (Claude Code)

`/impeccable audit` and `/impeccable polish` per area, `web-design-guidelines` and
`accessibility` on the diff, the `mobile-native` and `overload-ui` PWA checklists on devices,
the axe checks already in the audit scripts, and interaction latency measured on the slowest
target phone.

## Practical rules

- One surface per session. Commit `PRODUCT.md` and `DESIGN.md` so the next session starts
  where the last one ended.
- Mockups decide look and layout; code decides motion, density and performance.
- Real content only: no lorem ipsum, no invented numbers.
- Keep the feature list next to every screen; progressive disclosure may move a control, never
  remove it.
- Keep Overload's icon set rather than whatever a mockup draws.
- Test on hardware. Emulation does not show sticky hover, tap delay, safe areas, the keyboard
  or rubber-banding.

## Decisions

Made by the user on 30 September 2026.

1. **Platform.** A PWA today, with native iOS and Android apps soon. The design system must
   translate to SwiftUI and Jetpack Compose: see "Portable to the native apps" in the
   `overload-ui` skill.
2. **Brand.** Keep the name Overload. Everything else starts again: the themes, the interface,
   the experience and the typography, rethought from the ground up. The aim is creative,
   minimal and intuitive. Form's copper, warm neutrals, wordmark and system face are not
   constraints.
3. **Motion.** Loosen Form's limits. The revamp may use richer, authored motion; `DESIGN.md`
   sets the new rules, and until then code merged to `main` keeps Form's.
4. **Type.** New typography, chosen for the brand rather than inherited. Faces must be licensed
   for the web and for embedding in the native apps.
5. **Scope.** The core loop first: Today, the workout and logging a set, Progress and Food. The
   rest of the app follows in the same language.
6. **Figma.** Not used today, available if needed.

The features each core-loop screen must keep are listed in [the feature inventory](features.md).
The first Claude Design prompt is in [prompts/01-directions.md](prompts/01-directions.md).

## Sources

Checked on 30 September 2026.

- Claude Design: [getting started](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)
  (shared usage limits, no version history, handoff and export options) and
  [file uploads](https://support.claude.com/en/articles/8241126-uploading-files-to-claude)
  (20 files per chat, 8000×8000 px).
- Claude Code: [`/design` and `/design-sync`](https://code.claude.com/docs/en/commands),
  [skills](https://code.claude.com/docs/en/skills) and
  [settings in cloud sessions](https://code.claude.com/docs/en/settings#settings-in-cloud-sessions).
- Anthropic, [prompting Claude Opus 5.5: frontend design defaults](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5#frontend-design-defaults).
- Vercel, [how our agents build on-brand pages with design.md](https://vercel.com/blog/how-our-agents-build-on-brand-pages-with-design-md)
  (31 August 2026).
- Platform facts behind `overload-ui`: [WebKit features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/),
  [Chrome on Android edge-to-edge](https://developer.chrome.com/docs/css-ui/edge-to-edge) and
  MDN's browser-compat-data 8.1.3.
