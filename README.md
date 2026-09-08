# Training Tracker

Private, iPhone-first workout tracker for one lifter who trains at several gyms.
It logs strength and hypertrophy sessions, easy runs, recovery and symptoms, and keeps
machine history **per gym and per machine** so that stack numbers from different
equipment are never mixed up.

The product requirements, training context and data model that drive this build live in
the planning documents supplied with the project (`PRODUCT_REQUIREMENTS.md`,
`TRAINING_CONTEXT.md`, `DATA_MODEL_AND_ARCHITECTURE.md`, `CLAUDE_CODE_IMPLEMENTATION_PROMPT.md`
and the 8-week programme workbook).

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, Turbopack) on Vercel
- TypeScript (strict) and React 19
- Tailwind CSS v4 with a small set of design tokens (`src/app/globals.css`)
- Postgres for data (provider and auth wiring are set up in Phase 1)
- PWA manifest so the app installs from iPhone Safari

## Status

| Phase | Scope                                        | Status  |
| ----- | -------------------------------------------- | ------- |
| 0     | Repository foundation, PWA shell, bottom nav | done    |
| 1     | Database schema, auth, migrations, seed data | pending |
| 2     | Gym and equipment management                 | pending |
| 3     | Exercise library and gym compatibility       | pending |
| 4     | Today's workout and set logging              | pending |
| 5     | Deterministic progression engine             | pending |
| 6     | Running                                      | pending |
| 7     | History and analytics                        | pending |
| 8     | Coach read API                               | pending |
| 9     | PWA polish                                   | pending |

Architectural decisions are recorded in [`docs/decisions/`](docs/decisions/).

## Local setup

Requires Node.js 20.9 or newer (Node 22 recommended) and npm.

```bash
npm install
cp .env.example .env.local   # not needed for Phase 0; the shell renders without a database
npm run dev
```

Open <http://localhost:3000>. To preview the iPhone layout in a desktop browser, use the
device toolbar (for example iPhone 15, 393 × 852) in the browser dev tools.

## Scripts

| Command                | What it does                                              |
| ---------------------- | --------------------------------------------------------- |
| `npm run dev`          | Start the development server                              |
| `npm run build`        | Production build                                          |
| `npm run start`        | Serve the production build                                |
| `npm run lint`         | ESLint (Next.js core-web-vitals + TypeScript rules)       |
| `npm run lint:fix`     | ESLint with auto-fix                                      |
| `npm run format`       | Prettier, writes changes                                  |
| `npm run format:check` | Prettier, check only                                      |
| `npm run typecheck`    | Generate Next.js route types, then `tsc --noEmit`         |
| `npm run check`        | lint + format check + typecheck (run before every commit) |

## Project structure

```
src/
  app/
    layout.tsx          root layout: metadata, viewport (safe areas, dark theme)
    manifest.ts         PWA manifest (served at /manifest.webmanifest)
    icon.svg            favicon; apple-icon.png is the iPhone home-screen icon
    page.tsx            redirects "/" to /today
    (app)/              the five tabs share one shell with the bottom navigation
      layout.tsx
      today/  history/  progress/  gyms/  settings/
  components/
    shell/              bottom navigation, page header, page content container
    ui/                 small reusable primitives (button, card, empty state)
  lib/                  helpers and shared config (class merging, nav items)
public/icons/           PNG icons referenced by the manifest
docs/decisions/         architecture decision records
```

## Install on iPhone

1. Deploy the app (Vercel) so it is served over HTTPS.
2. Open the URL in Safari on the iPhone.
3. Tap **Share**, then **Add to Home Screen**.

The app then launches in standalone mode with the dark theme colour and safe-area padding
for the notch and home indicator.

## Environment variables

See [`.env.example`](.env.example). Phase 0 needs none. Secrets are never committed;
Vercel project settings hold the production values.
