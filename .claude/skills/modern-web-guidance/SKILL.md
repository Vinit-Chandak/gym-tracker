---
name: modern-web-guidance
description: |
  The Chrome and Edge teams' guides to modern web platform patterns, each with browser support data and fallbacks. Use before building a UI behaviour or component from scratch, to find the platform's current way instead of an old pattern or a new dependency: dialogs, popovers, sheets and navigation drawers, swipe actions, carousels and scroll snap, view transitions and directional navigation, scroll-driven and entry/exit animation, springs with linear() easing, anchor positioning, container queries, forms and validation, accessibility, and performance work such as INP, long tasks and image priority.
---

# Modern Web Guidance

A library of best-practice guides from the Chrome and Edge teams, kept here as a pinned copy.
Search it, read the matching guide, then implement.

## When to use

- At the start of building a UI behaviour or component, to check whether the platform
  already has a standard pattern for it.
- Before adding a dependency for something CSS or HTML may now do natively.
- When a pattern needs to work in Safari on iPhone as well as Chrome on Android: every
  guide lists browser support and the fallback to ship.

## How to use

1. **Search the index.** `grep -i "<keyword>" .claude/skills/modern-web-guidance/INDEX.md`,
   with two or three keywords for what you want to achieve. Read the whole
   [INDEX.md](INDEX.md) only when the search finds nothing useful.
2. **Read the guide.** Each index line names `<category>/<id>`; the guide is
   `guides/<category>/<id>.md`. Read every guide that matches before writing code.
3. **Follow cross-references locally.** A guide may point to another guide as
   `npx -y modern-web-guidance@latest retrieve "<id>"`. Do not run that command: read
   `guides/*/<id>.md` instead.
4. **Verify against the guide.** Before finishing, check the implementation applies the
   guide's pattern and the fallbacks it requires, without forcing features nobody asked for,
   and that the user's request is fully met.

The guides are framework-agnostic. Adapt them to Overload's stack: Next.js App Router, React
19, Tailwind CSS v4.

## Browser support and fallbacks

- **Default:** guides assume Baseline Widely available features are safe without fallbacks.
  For a feature that is not Baseline Widely available, follow the guide's fallback
  recommendation unless the project states another browser support policy.
- **Overload's targets** are Safari on iPhone and Chrome on Android, installed as a PWA. Check
  each feature's Safari support in the guide before relying on it, and prefer progressive
  enhancement: the interaction must still work where the enhancement is missing.
- For a Baseline YYYY target, a feature qualifies if its "Baseline since" date is no later
  than YYYY.

## Pinned copy

The guides are a snapshot; see `UPSTREAM.md` for the commit. Guides for on-device AI,
WebAssembly and WebMCP were left out as irrelevant to this app. To refresh, copy the guides
again from upstream, regenerate `INDEX.md`, and review the diff.
