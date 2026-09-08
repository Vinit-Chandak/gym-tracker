# ADR 0001: Phase 0 foundation choices

Date: 2026-09-08
Status: accepted

## Context

The implementation prompt asks for a Next.js (latest stable, App Router), TypeScript strict,
Tailwind, Vercel-compatible PWA shell that renders without any database dependency. Several
smaller choices were not specified and are recorded here so they are easy to revisit.

## Decisions

1. **Next.js 16.3 with Turbopack, scaffolded by `create-next-app`, npm as package manager.**
   Turbopack is the default for both `dev` and `build` in Next 16; no custom webpack config
   is used, so nothing opts out of it. `npm` matches the `npm run build` acceptance criterion.
   The generated `AGENTS.md` is kept: `next dev` re-adds it, and it points coding agents at
   the version-matched docs in `node_modules/next/dist/docs/`.

2. **`src/` directory, `@/*` import alias, route group `(app)` for the tabbed shell.**
   `/` redirects to `/today`. The manifest `start_url` is `/today` directly so the installed
   app opens without an extra hop. Auth screens (Phase 1) will sit outside the `(app)` group so
   they render without the bottom navigation.

3. **System font stack instead of a hosted web font.** On iPhone this renders as SF Pro,
   which looks native, needs no download and removes a build-time network dependency
   (`next/font/google` fetches fonts during `next build`). Numeric controls use
   `tabular-nums` so weights and reps line up.

4. **Tailwind CSS v4 with design tokens in `@theme`** (`canvas`, `surface`, `ink`, `accent`
   and semantic colours) plus `@utility` helpers for iPhone safe areas (`pt-safe`, `pb-safe`,
   `pb-nav`). No shadcn/ui yet: the shell only needs a button, a card and an empty state.
   shadcn primitives (dialog, sheet, select) can be added when forms arrive in Phase 2.

5. **Viewport: `viewport-fit=cover`, zoom disabled (`maximum-scale=1`).** Full-bleed layout
   with safe-area padding is required for the notch and home indicator. Disabling pinch-zoom
   avoids accidental zooming with sweaty hands between sets; inputs are kept at 16px+ so iOS
   never auto-zooms on focus. This is a UX default and easy to reverse.

6. **PWA manifest only, no service worker in Phase 0.** iPhone Safari installs from the
   manifest plus `apple-mobile-web-app-*` meta tags alone. Offline behaviour is scheduled for
   Phase 9 (Next 16 offers an experimental `useOffline` retry mode; Serwist is the fallback for
   full offline caching).

7. **Icons are generated, not designed.** A simple dumbbell glyph on the charcoal background is
   rendered to PNG (192, 512, 512-maskable, 180 apple-icon) as placeholders. The glyph stays
   inside the 80% maskable safe zone.

8. **`typedRoutes: true` and stricter TypeScript** (`noUncheckedIndexedAccess`,
   `noImplicitOverride`, `noFallthroughCasesInSwitch`). Links to unknown routes fail the
   build, and array/record access must handle `undefined`.

9. **Private app defaults:** `robots: noindex, nofollow`, `X-Frame-Options: DENY`,
   `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
   `poweredByHeader: false`.

## Consequences

- The shell builds and renders with no environment variables.
- The Postgres provider and auth approach are deliberately **not** decided here; they are the
  subject of ADR 0002 once confirmed with the user, because they shape Phase 1 (RLS policies,
  session handling, seed strategy).
