# Food UI, data flow and PWA audit — 25 September 2026

## Scope and environment

Audited draft PR [#76](https://github.com/Vinit-Chandak/gym-tracker/pull/76), starting at
`3fb891acb69463a660dd39af526057bc3552acb1`, on its existing branch
`claude/sleepy-curie-dne2x3`. Review covered the food routes and previews, Today integration,
targets and profile weight updates, forms, summaries, validation, actions, repository reads
and writes, ownership policies, migrations, shared sheets/navigation, manifest, worker,
installation controls and offline handling. Relevant installed Next.js guides were read.

The production build ran on loopback port 3100, with the repository's local authentication
stand-in on 54321 and a dedicated PostgreSQL **17.4** database, `overload_audit_food`.
Hosted credentials and environment files were not changed. The local food allowlist enabled
Sam and Vinit; Alex exercised the disabled state. No production migration, deployment or
feature-flag change was performed.

## Findings and fixes

| Finding                                                                                                                                                               | Resulting behavior                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| An unnamed food disappeared from the meal read because Drizzle treated its nullable name as the absent-row sentinel for the left join. Today and Food could disagree. | The joined item selects its non-null ID first. Unnamed foods, including zero-kcal entries, survive readback.                                                                                           |
| A blank or invalid hidden protein field prevented saving the fixed preset.                                                                                            | An unused invalid ratio defaults to 1.8; validation remains active when body-weight mode uses it. Preview and protein hint use the same saved precision.                                               |
| Rounded energy could appear inside the band while the badge said Over.                                                                                                | Energy totals, rows, chips, sheet totals and band endpoints show up to one decimal. Macro summaries stay in whole grams, as the owner requested.                                                       |
| A reload discarded a disconnected meal form; retrying after a lost reply could duplicate it.                                                                          | Per-account device drafts persist on input. Manual retry uses transactional submission receipts. An unchanged retry succeeds once; a changed payload under a committed key is refused.                 |
| Midnight could move an unfinished entry to the next day or leave the screen stale.                                                                                    | Recovered drafts retain and display their original date, as requested. The visible online Food screen refreshes when the account's calendar day changes.                                               |
| Four rigid numeric columns, fixed chrome, and a tall footer could hide inputs or Save with enlarged text or a short viewport.                                         | Grids reflow, text wraps, the sheet follows the visual viewport, and short screens use scrolling chrome and a single sheet scroll region where needed. Close and both deletion methods stay reachable. |
| The PWA forced portrait orientation and its offline page did not mention meal recovery.                                                                               | Orientation is unrestricted, offline guidance explains local meal drafts, and worker cache versions advance to deliver it. Private pages and actions remain network-only.                              |
| Deleting a referenced bike or pool tried to null both the resource and its required owner.                                                                            | Migration 0039 clears only `resource_id`. The activity, ownership and logged snapshots remain intact.                                                                                                  |

Editing is disabled while a meal save or deletion is pending, so an in-flight save cannot silently
discard newly typed values. Starred meals remain independent copies. Storage errors leave the
form usable and explicitly say when this device could not keep a draft. Local storage is scoped
by account; it is device persistence, not encrypted storage or cross-device synchronization.

## Verification

- Full Vitest suite: **200 files, 1,506 tests passed**. A subsequent targeted rerun also passed
  the four target-form tests after aligning the protein hint with saved precision, and
  22 tests across food and shared navigation/PWA components after the final layout fixes.
- Lint, formatting, TypeScript and a production build.
- Production-build browser audit: **14 scenario groups per engine, 28 total**, passing in
  Chromium and WebKit with no page errors. Coverage includes first-use and populated states,
  flag-off routing, target presets, validation/focus, multiple foods, unnamed foods, stars,
  edits, both deletion paths, matching Today totals, profile weight changes, zero-carb warning,
  draft reload/retry, a deliberately lost committed-save response, original-day recovery,
  account isolation, discard, install controls, manifest/icons, worker caches and offline recovery.
- Responsive matrix: 320×568, 390×844, 768×1024 and 1440×900; 200% root text at 320×568 and
  568×320; and a 390×300 viewport. Each runs in light and dark mode, checks horizontal overflow
  and reaches both the kcal field and Save. Targets expand at each size without overlapping
  their summary label and value. Axe checks cover the open meal sheet at 390×844 in
  both palettes. Long names and maximum per-item amounts are included.
- PGlite regression tests cover real migration application, resource deletion and RLS,
  retry receipts, rollback, changed payloads and retry after deletion. PostgreSQL 17.4 checks
  additionally replayed migrations 0038–0040 twice inside a rolled-back transaction and verified
  bike/pool deletion preserves owner, parent activity and snapshots.

The reproducible browser runner is `npm run audit:food`; setup is in
[local development](../local-dev.md#food-audit). Local screenshots, browser results and command
logs are under `output/food-audit/` and `output/food-audit-*`. They are not application assets.

## Deployment and limits

Before merging, integration with `main` at `410bb84` preserved Today's read-only transaction
and deferred coach-job cleanup. Because those changes prefetch complete tabs, successful food
actions now revalidate both `/today` and `/today/food`; refreshing alone could reuse an older
Today snapshot. The action tests assert both invalidations, and the production browser audit
checks Today totals after meal changes.

After PR #76 was merged and its production deployment succeeded, the owner requested food
tracking for everyone. The rollout gate was removed from Today, `/today/food` and all actions;
`FOOD_TRACKING_ENABLED` is no longer read. Production deployments apply migrations before the
build, including **0040** for save receipts. Previews still share production data and do not
migrate it. The browser runner now checks availability for the previously excluded account.

The gate-removal follow-up passed 76 focused tests, lint, formatting and a production build
including TypeScript. With the obsolete flag explicitly set to `false`, all 14 browser scenario
groups passed in each of Chromium and WebKit without page errors. Direct profile fixture resets
also advance the profile cache version so sequential browser runs cannot reuse an old weight.

These are automated Chromium/WebKit runs with Pixel 7/iPhone 13 browser emulation, varied
viewports and text sizes, plus visual screenshot review. They do not prove physical
iOS/Android home-screen installation,
OS text scaling, a real soft keyboard, or every device size. The install-prompt event is simulated;
manifest, assets, worker control and offline fallback are exercised against the built app.
WebKit's lost-response check withholds a real committed response at the browser fetch boundary,
because Playwright routing does not intercept that service-worker-controlled request. Its
offline-navigation check disconnects a loopback proxy to exercise a real transport failure.
There is no offline private-page cache or background upload: reconnect before reopening a saved
device draft and explicitly save it. No past-day browsing UI was added.
