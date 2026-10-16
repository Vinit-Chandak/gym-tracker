# Redesigning Overload with Claude Design

Researched 29 September 2026. This is a proposed workflow, not a replacement for the existing design contract. No application changes or skill installations were made for this research.

Follow-up verification: the Motion free-skill page and discovery endpoint referenced below both returned HTTP 404 when fetched directly. Omit that skill from the install bundle until a working official source is available; use Emil Kowalski's animation guidance meanwhile. The current Impeccable installer requires Node.js >=22.18.0, while this machine has 22.14.0. Update Node before installation.

## Recommendation

Use Claude Design to explore and refine the product experience, then Claude Code to implement the selected direction in this repository. Start with Impeccable for design critique, Emil Kowalski's mobile and animation guidance, and Vercel's interface review skill. Add a motion library only where an interaction needs it. Use a separate video project for promotional animations.

The desired outcome for Overload: a calm, distinctive training tool that makes the next action obvious and makes repetitive logging fast. Evaluate beauty while entering a real set, correcting a meal, and recovering from a failed save.

## What the repository tells us

- Next.js 16.3.4, React 19, Tailwind CSS 4, Supabase and Drizzle; this is a web app/PWA.
- Current navigation is Today, Training, Food, Progress and Profile in `src/lib/nav.ts`. Older design documents describe navigation that has since changed.
- Existing tokens live in `src/styles/form/foundation.css` and `form.css`; shared controls live in `src/components/ui/`.
- The app covers strength, running, cycling, swimming, food, recovery, coaching, programmes, gyms, friends and privacy.
- Existing contracts include per-set load/reps/effort, timed/distance exercises, gym-specific machine history, persistent drafts and one active workout.
- The manifest, service worker, local audit fixtures, Playwright scripts and accessibility tooling already exist. Build on them.
- The September 26 audit documents broad interaction coverage. Existing screenshots are historical evidence; capture fresh ones before judging today's UI.

Useful inputs: `README.md`, `src/lib/nav.ts`, `docs/ui-redesign/`, `docs/decisions/`, `docs/audits/2026-09-26-comprehensive-audit.md`, and `docs/audits/local-56-months.md`. Reconcile old specifications with current routes and later decisions.

## Current Claude Design entry points

Open [Claude Design](https://claude.ai/design), or select Output > Design in a Claude conversation. Current documentation also describes `/design` and `/design-sync` in Claude Code. `/design-sync` brings in a product design system from code; `/design` supports creating and moving designs between design work and implementation. Export/handoff options include HTML/ZIP and Claude Code. Availability can depend on the account and rollout. [Official workflow](https://support.claude.com/en/articles/14604416-get-started-with-claude-design).

A full redesign should use the current interface as a functional baseline. Explicitly ask for a new visual direction, then save the selected tokens and components as the new design system. Simply importing the existing styling may reproduce the look you want to change. Claude can extract a design system from code and visual assets. [Design-system setup](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design).

The installation commands below target Claude Code. Do not assume a local skill installation also installs that skill in hosted Claude Design. Give Design the resulting brief, references and design rules as project context.

## A small, useful skill set

| Resource                                                                                                    | Job in this project                                     | Recommendation                                                      |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| [Impeccable](https://github.com/pbakaus/impeccable)                                                         | Plan, critique, simplify, adapt and polish the UI       | Primary design workflow; apply its aesthetic opinions with judgment |
| [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) | Visual direction and typography                         | A simpler alternative to Impeccable                                 |
| [Emil Kowalski skills](https://github.com/emilkowalski/skills)                                              | `mobile-native`, `emil-design-eng`, `review-animations` | Particularly relevant to a phone-first workout app                  |
| [Vercel agent skills](https://github.com/vercel-labs/agent-skills)                                          | `web-design-guidelines` and React performance review    | Quality checks during implementation                                |
| [Motion motion-react](https://motion.dev/docs/react-app-builders)                                           | Correct React layout, exit and gesture animation        | Optional implementation guidance; free and usable without MCP       |
| [Remotion skills](https://www.remotion.dev/docs/ai/skills)                                                  | React-based videos and rendering                        | Optional, for a product demo video                                  |
| [HyperFrames](https://github.com/heygen-com/hyperframes)                                                    | HTML-based video authoring and rendering                | An alternative video workflow                                       |

My recommendation is one primary visual-design skill, with mobile, animation and review skills used for specific passes. A long list of overlapping style instructions makes the brief harder to control. System fonts, for example, can be a deliberate choice for this app even when a style pack discourages them.

In PowerShell, from this repository, these are suggested commands for you to run when starting the redesign:

```powershell
npx impeccable install --providers=claude --scope=project
npx skills@latest add emilkowalski/skills
npx skills add vercel-labs/agent-skills
```

In the interactive skill selectors, choose Claude Code and project scope. Select the Emil and Vercel skills named above. Reload Claude Code afterward. The commands install guidance; they do not redesign the app by themselves. These commands follow the maintainers' linked READMEs; they were not executed in this research.

Suggested Claude Code sequence, after installation:

```text
/impeccable init
/impeccable shape the Today-to-workout-logging flow
/impeccable critique the selected prototype
/impeccable adapt the selected prototype for phone and tablet
/impeccable harden the workout logger
/impeccable polish the approved screens
```

The current Impeccable command format is `/impeccable <command>`. Older posts may show standalone commands. [Maintainer documentation](https://github.com/pbakaus/impeccable).

If the implementation needs Motion, install its guidance with:

```powershell
npx skills add https://motion.dev --skill motion-react
```

This installs the skill, not the application's `motion` runtime dependency. Simple press and opacity transitions may need only CSS. [Motion's official pack](https://motion.dev/docs/react-app-builders).

## The redesign, step by step

1. **Capture the current product.** Use local fixtures and fresh screenshots. Map routes, primary tasks, entry/exit paths and loading, empty, error, offline and saved states. Record the tap sequence for starting a workout, logging another set and adding a repeat food.
2. **Choose references with reasons.** Supply 3-5 mobile app references. Annotate what matters: number readability, navigation, meal entry, spacing or motion. Use references for specific decisions, rather than asking to clone a whole product.
3. **Explore three directions.** Design the same Today, active exercise logger and Food screens in each direction. Make the variations differ in composition, typography and interaction, not just color. Keep real names, realistic set values and long labels.
4. **Choose by doing.** In each prototype, start a session, log a set, correct it and add food. Compare reachability, reading effort, tap count and recovery from mistakes. Test with the keyboard visible.
5. **Define the selected system.** Record semantic colors for both themes, type scale, spacing, control sizes, icon usage, sheets, navigation, form states, chart styling and motion rules. Include example components and behavioral states.
6. **Prototype complete journeys.** Expand through workout completion, training/programme management, food, progress, coaching, onboarding and profile/privacy. Maintain a feature-coverage table with every existing workflow and its new location.
7. **Hand off and implement incrementally.** Use Design's Claude Code handoff or exported files. Have the coding agent map the design onto existing tokens, components and routes. Read the installed Next.js guides before implementation, as required by `AGENTS.md`.
8. **Verify before rollout.** Reuse existing audit fixtures and flow scripts. Inspect actual browser screenshots and accessibility results, then test on an iPhone and Android phone in browser and installed modes. Keep remaining hardware checks explicit.

Suggested initial visual direction: clear white and charcoal surfaces, legible numbers, compact headings, distinctive but restrained color, and generous space around frequent actions. Keep neutral surfaces alongside useful status/chart colors. Put personality into type, composition and a few interaction details. Let alternate prototypes challenge this direction.

## Ready-to-use prompts

### First, ask Claude Code for the design brief

```text
Prepare a redesign brief for Overload without changing application code.
Read AGENTS.md, README.md, src/lib/nav.ts, the current UI components and
theme files, docs/ui-redesign, later decisions, and the September 26 audit.
Treat running behavior and current routes as evidence when older docs differ.

Produce a screen and workflow inventory, a feature-preservation checklist,
and a state matrix for the most important flows. Identify where users must
read too much, make unnecessary choices, or reach awkwardly while training.
Use local fixture data and fresh screenshots where available.

Prioritize Today -> start/resume -> log/edit set -> rest -> finish,
Food -> add/repeat/edit entry, and Progress -> inspect history.
Include training/programmes, coaching, recovery, friends, privacy and setup
in the full inventory. Label uncertainties and proposed behavior changes.
```

### Then, give Claude Design this brief

```text
Redesign Overload, an existing phone-first training and nutrition PWA.
The desired feel is minimal, intuitive, creative and attractive, with fast
one-handed use between sets. Use the attached inventory and screenshots as
functional context; explore a new visual identity.

Create three distinct directions for Today, an active exercise logger,
and Food. Show realistic data, light and dark themes, and a keyboard-open
logger. Make the directions differ in hierarchy and composition as well
as styling. Start with the usable app experience.

Preserve per-set load, reps/time/distance and effort; gym-specific history;
one active workout; saved drafts; session resume; food editing; and truthful
save/error states. Use the existing five destinations as the baseline.
Explain proposed navigation changes and where every affected feature goes.

Favor readable numbers, clear primary actions and reachable controls.
Use 48 CSS-pixel targets for frequent touch actions where practical.
Support smaller screens through reflow, larger text and reduced motion.
Keep exercise names and core logging values visible. Include empty,
loading, validation-error and disconnected states in the chosen direction.
```

### After selecting a direction, refine motion

```text
Create a motion specification for the selected Overload interface.
For each effect, state trigger, starting/ending state, purpose, timing,
interrupt behavior and reduced-motion alternative.
Focus on press feedback, set-save feedback, sheet open/close, tab indicator
changes and workout completion. Use existing motion tokens as a baseline.
Keep repeated logging immediately usable. Keep input positions stable and
make pending, confirmed and failed saves visually distinct.
Review the motion using Emil's animation guidance. Use CSS for simple
effects and Motion only where it adds meaningful interaction behavior.
```

### Implementation handoff

```text
Implement the approved Overload design in this repository.
Read AGENTS.md and relevant installed Next.js documentation first.
Map approved tokens and components onto the existing implementation.
Preserve domain rules, authorization, data contracts and draft behavior.
Keep any necessary behavior changes explicit in the implementation plan.

Deliver shell/tokens first, then Today and workout logging, then Food,
Training/programmes, Progress, coaching, onboarding and Profile/friends.
Reuse the local audit environment and existing tests. Verify saved data,
retry behavior, keyboard focus, mobile overflow, dark mode, reduced motion
and 200% text. Compare screenshots against the approved design throughout.
Report which checks still require a physical iPhone or Android device.
```

## iOS, Android and PWA requirements

Use a shared Overload visual identity. Respect platform behavior around it. Native points, Android dp and web CSS pixels are different units; the PWA needs its own explicit sizing rules.

| Area          | Guidance to give Claude                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS           | Use Apple HIG for clear navigation, accessible controls, text growth and reduced motion. Apple's default iOS target recommendation is 44 x 44 pt. Test Safari and Home Screen mode, safe areas and the on-screen keyboard. |
| Android       | Use Material/Android guidance for hierarchy, navigation and accessible controls. Android recommends targets of at least 48 x 48 dp. Test browser/system Back, gesture-navigation insets, keyboard and larger windows.      |
| This PWA      | Recommend 48 x 48 CSS px for frequent touch controls. Reflow the logger instead of shrinking fields. Check safe-area padding, modal focus/scroll, deep links, Back and visible feedback.                                   |
| Accessibility | Aim for WCAG 2.2 AA. Normal text generally needs 4.5:1 contrast; large text 3:1. Include labels, focus, keyboard operation, non-color status cues and reduced motion.                                                      |
| Installation  | Show platform-appropriate install help. `beforeinstallprompt` is not available on Safari; do not design one universal install button around it.                                                                            |
| Disconnection | Preserve input and accurately distinguish unsaved, pending, confirmed and failed work. The current retry behavior is not proof of a full background-sync queue.                                                            |
| Testing       | Cover 320, 360, 390 and 430 CSS-pixel widths plus tablet/desktop, landscape, 200% text, both themes, long content, empty accounts and keyboard-open forms. Browser emulation supplements hardware testing.                 |

Sources: [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Apple motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion), [Android accessibility](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views), [Android platform translation](https://developer.android.com/design/ui/mobile/guides/foundations/translate-designs), [PWA app design](https://web.dev/learn/pwa/app-design), [installation prompts](https://web.dev/learn/pwa/installation-prompt), [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

WCAG's AA target-size criterion is generally 24 x 24 CSS px with defined exceptions; that is an accessibility floor, not my recommended size for workout controls. [WCAG target sizing](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## What the motion-video examples actually show

Opus 5.5 is an official model released on September 22, 2026. [Anthropic announcement](https://www.anthropic.com/claude-opus-5-5).

I searched publicly indexed X posts and Reddit discussions, then checked maintainers' documentation. Some current X posts could not be fetched directly. These are examples and self-reports, not comparative benchmarks:

- A [Remotion announcement quoted on X](https://x.com/wcandillon/status/2015345960491069718) explicitly connects Claude Code video creation with Remotion's agent skills.
- [This creator's X post](https://x.com/I_amDamola/status/2040764964084834399) describes a brief-to-Claude-Code workflow with a Remotion skill installed.
- [Charlie Hills's own account of his Opus 5.5 motion board](https://charliehills.substack.com/p/opus-55-motion-graphics) says references, explicit states and iteration were needed. The accessible article describes an editable HTML output; the complete kit requires subscription/sign-in.
- [A Reddit comparison](https://www.reddit.com/r/ClaudeCode/comments/1syachi/best_skill_for_uxui_impeccable_vs_uxui_pro_max_vs/) contains mixed opinions about Impeccable, Taste and Anthropic's design skill. It supports trying a small comparison, not declaring a universal winner.
- [Another discussion](https://www.reddit.com/r/ClaudeAI/comments/1rkvlkh/best_skills_for_front_end_ui_animation/) emphasizes interaction states and accessibility alongside visual effects.

For these code-driven workflows, the agent authors the animation and a rendering framework produces the video. A showreel does not establish that a particular hidden skill was used. Without the exact clip, its stack cannot be identified reliably.

For an Overload demo, choose one separate project:

```powershell
# React-based video project
npx create-video@latest
# Inside the generated video project
npx skills add remotion-dev/skills
```

The React workflow and skill installation are documented by [Remotion](https://www.remotion.dev/docs/ai/skills). Ask the agent to storyboard, preview and render using the generated project's tooling.

Alternatively, [HyperFrames](https://github.com/heygen-com/hyperframes) supports HTML-based video work, requires Node.js 22+ and FFmpeg, and publishes this CLI sequence:

```powershell
npx hyperframes init overload-demo
cd overload-demo
npx hyperframes preview
# Run separately when ready to render
npx hyperframes render
```

Use a sibling video workspace. A promotional video does not require adding video tooling to the gym app runtime.

```text
Create a 15-second Overload product demo using approved UI and synthetic
workout data. Storyboard three beats: start today's session, log a set,
see progress. Match the chosen design system. Keep text readable on a
phone and let the actual interaction carry the video. Preview the full
timeline, inspect representative frames, fix clipping and timing, then
render an MP4 and retain editable source. Do not change the app.
```

## First milestone

Produce three interactive directions for Today, exercise logging and Food, then choose one after completing those tasks on a phone. The rest of the redesign should follow that tested direction and its documented component system.
