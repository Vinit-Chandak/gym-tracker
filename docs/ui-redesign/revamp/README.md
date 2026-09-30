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
truth. `/impeccable init` drafts a `PRODUCT.md` from the code and asks only for the gaps.
The brief should settle:

- who the app is for and the scene it is used in: between sets, one hand, sweaty, glancing,
  bright gyms and dark ones;
- what must not change: every feature and flow, one row per set with its own load, reps and
  RIR, the gym fixed per session, System/Light/Dark, phone-first
  ([the Form decisions](../README.md#decisions-that-implementation-must-preserve));
- the platform stance, the brand stance and the motion ambition (see [open decisions](#open-decisions));
- two to five reference apps, and exactly what is admired in each;
- three words for how it should feel, and the tropes it must avoid.

Group the 75 page templates into about ten archetypes before designing anything: Today, the
live workout logger, sheets and pickers, lists and history, detail pages, charts, forms and
settings, onboarding, and empty, loading and error states. The archetypes, not the pages,
are what gets designed.

### 1. Directions (Claude Design)

Start without the current interface, or the result is a repaint of it. Ask for two or three
genuinely different directions, each on the same three or four anchor screens (Today, logging
a set mid-workout, Progress, Food) at phone size in light and dark, with real data. Pick one,
then ask for two contrasting alternatives to test the choice.

Only then show the current app, so the direction is mapped onto real content and structure.
Uploads are capped at about 20 files per chat, so pick 12 to 16 phone captures from the
catalogue (one per archetype, core loop in both themes) rather than all 700 images. Use
comments for local fixes, chat for structural changes and direct edits for nudges.

### 2. Design system (Claude Design)

Freeze the chosen direction into a Claude Design design system: colour tokens for both themes,
the type scale and fonts, spacing, radii, shadows, previews of the primitives (button, field,
list row, sheet, tabs, stat, chart), and a README that states the voice, iconography and
platform rules. Tokens there have no motion family, so the motion principles (durations,
easings, springs, what never moves) go in the README and in the repository.

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
Those captures use WebKit, which cloud sessions do not ship: add
`npx playwright install webkit chromium` to the cloud environment's setup script (environment
menu in the session's title bar, then Edit), or take the captures on a laptop.

Once the new primitives exist, `/design-sync` can upload them to the Claude Design design
system, so later mockups use the real components. It is React-only, wants an entry file that
exports the components with their types and a compiled stylesheet, and its `/design-login`
step needs an interactive terminal, so run it from a laptop. Re-run it after changes: the
upload is a snapshot.

### 6. Motion (Claude Code)

`/improve-animations` and `find-animation-opportunities` plan it; `animate`, `apple-design`
and `vercel-react-view-transitions` build it; `/review-animations` checks it. Every motion
decision is judged on a real iPhone and a mid-range Android phone, installed as the PWA, with
reduced motion on and off.

### 7. Polish and audit (Claude Code)

`/impeccable audit` and `/impeccable polish` per area, `web-design-guidelines` on the diff,
the `mobile-native` checklist on devices, the axe checks already in the audit scripts, and
interaction latency measured on the slowest target phone.

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

## Open decisions

These are the user's to make before the brief is written.

1. **Platform stance.** One design for both phones, or iPhone- and Android-flavoured variants
   of the same design? Stay a PWA, or wrap it for the app stores later?
2. **Brand stance.** Keep the Overload name, wordmark and copper, or start the identity over?
3. **Motion ambition.** Quiet and fast, or expressive with authored moments (a set saved, a
   record set)?
4. **Type.** System fonts (SF on iPhone, Roboto on Android, always native, nothing to load)
   or a brand typeface?
5. **Scope and order.** The whole app in one revamp, or the core loop first?
