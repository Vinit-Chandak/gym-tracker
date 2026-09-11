# 0022 — A status bar at the bottom of the screen

Status: accepted, 2026-09-11. Follows [0017](0017-navigation-island-and-page-headers.md) and
[0021](0021-two-tasks-a-day-and-three-ways-to-count-a-set.md), whose seventh decision this
replaces.

Follow-up, 11 September 2026: later screenshots show an initial offset that disappears after
scrolling. The viewport dimensions and cause described below were inferred from a still image;
they do not establish the cause of that launch-only behavior. The
[performance and navigation audit](../performance-audit.md) records the new viewport positioning
and the remaining iPhone verification.

## Context

**The navigation island still floated, and now it was hollow too.** On the installed app the
island measured 90px tall — a 64px row of tabs and then a 26px band of empty glass under the
labels — and its bottom edge sat 70px clear of the bottom of the screen. 0021 had moved the
home-indicator inset _inside_ the island to stop it floating. It did not stop floating, because
the inset was never what lifted it.

Measured off a screenshot rather than reasoned about: on a 402×874pt iPhone the app runs in a
402×812 view. The island sits 8px above that view's bottom edge, exactly as its CSS asks, and
its shadow is clipped where the view ends. The missing 62px are not the app's to use — and 62px
is this phone's status bar. `apple-mobile-web-app-status-bar-style: black-translucent` lifts a
standalone web view up under the status bar without making it any taller, so the app was paying
for that bar twice: once at the top, where it is drawn, and once at the bottom, where the view
now stops. iOS goes on reporting a 34px bottom safe-area inset for a home indicator that is
already below the view, and the island spent that inset a second time inside its own glass.
That style is also deprecated, and it paints the clock white whatever is beneath it — white on
cream for anyone using Form's light palette.

**Every coach script went around the session's proxy.** Node's built-in `fetch` ignores
`HTTPS_PROXY` unless the process was started with `NODE_USE_ENV_PROXY=1` (Node 22.21 and
later), and nothing in `npx tsx scripts/coach/…` sets it. The proxy is where the environment's
API credential attaches the coach's bearer token, so the requests left without it and came back
`403 Host not in allowlist: <the app's own host>` — which reads exactly like an organisation
egress denial, is not one, and cost a nightly run before it was understood.

## Decisions

1. **The status bar goes back to iOS.** `statusBarStyle: "default"`. The web view then starts
   below the bar and ends at the bottom of the screen, which is a status bar's worth of app
   given back on every screen, and iOS tints the bar with the `theme-color` this app already
   keeps in step with the chosen palette, so the clock is legible in both.

2. **The island clears the home indicator rather than carrying it.** `--nav-gap` is
   `max(--nav-inset, env(safe-area-inset-bottom))` — a maximum, never a sum: the inset says how
   far the indicator needs things to stay from the bottom of the screen, not how much to add to
   a gap that is already there. Adding them is what had the island floating; padding the inset
   out inside the glass is what left the band under the labels. The island's height is now
   `--nav-height` and nothing else, so the glass is exactly as tall as its tabs, and
   `--nav-reserve` — the page's bottom padding and the resume strip's offset — follows.

3. **The coach's client points `fetch` at the proxy itself.** `scripts/coach/client.ts` sets
   undici's `EnvHttpProxyAgent` as the global dispatcher when a proxy is configured, so every
   coach script honours `HTTPS_PROXY` whatever started it, and a laptop or CI run is unchanged.
   `fail()` now prints an error's cause as well as its message: "fetch failed" on its own names
   nothing a transcript can act on.

## How it was checked

`src/app/(preview)` — kept for this in 0021 — rendered against Chromium's safe-area emulation
at the phone's own metrics: the island is 64px of glass with 1px of border under the tabs, 34px
above the bottom edge where a home indicator is reported and 8px where none is, and a 192px
rail at desktop widths as before.
