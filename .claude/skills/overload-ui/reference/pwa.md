# Installed-app checklist: iPhone and Android

Last checked 30 September 2026. Support tables below come from MDN's browser-compat-data
8.1.3 (24 September 2026) unless another source is named. Platform support moves quickly:
confirm a capability in MDN or the matching `modern-web-guidance` guide before relying on it.

## Where it lives in Overload

- Manifest: `src/app/manifest.ts`. Standalone, starts at `/today`, and holds one splash and
  theme colour, the dark canvas, on purpose (see its comment).
- Viewport and Apple web-app metadata: `src/app/layout.tsx`. `viewport-fit=cover`, a
  theme colour per colour scheme, `apple-mobile-web-app-capable`.
- Service worker and offline page: `public/sw.js`, `public/offline.html`.
- Registration, install instructions and connectivity: `src/components/shell/pwa-provider.tsx`,
  `install-row.tsx`, `connectivity.tsx`.
- Next.js guides matched to the installed version:
  `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` and
  `offline-support.md` (the experimental `useOffline` retry).

## Install and launch

- Safari 26 has no installability requirements: every site added to the Home Screen opens as
  a web app unless the user turns off "Open as Web App". The manifest still supplies the name,
  icons, start URL and display mode. (WebKit, "WebKit features in Safari 26.0")
- iPhone has no install prompt: `beforeinstallprompt` is Chrome-only, so iPhone users need the
  written Add to Home Screen steps the Profile install row gives today.
- Manifest `shortcuts` and `share_target` work on Android only.
- Lighthouse removed its PWA category in version 12; ignore advice built on PWA scores.

## Edges and safe areas

- With `viewport-fit=cover`, content can sit under the notch, the Dynamic Island and the home
  indicator, and, from Chrome 135 on Android, under the gesture navigation bar. Pad fixed bars
  with `env(safe-area-inset-*)`. (Chrome, "Edge-to-edge")
- Chrome takes a fast path for `calc(env(safe-area-inset-bottom, 0px) + …)`, and
  `safe-area-max-inset-bottom` keeps a bottom bar steady while Chrome's bottom "chin" slides
  away. Safari does not have `safe-area-max-inset-bottom`, so keep the plain inset as the
  fallback.
- Give `html` and `body` an explicit background in both themes, so overscroll and the chin
  show the right colour.

## Keyboard

- Safari has no VirtualKeyboard API and ignores the viewport's `interactive-widget`. Keep an
  input and its actions above the keyboard with the `visualViewport` API, which both platforms
  support.
- Inputs at 16 px or larger, or Safari zooms the page (see `mobile-native`).

## Back

- Android's system back goes back in history. An open sheet or dialog should add a history
  entry, so back closes it instead of leaving the page. `CloseWatcher` and
  `<dialog closedby>` do this natively but are Chrome-only; the history entry works everywhere.
  See `modern-web-guidance`: `ui-behaviors/platform-controls-dismiss-dialog`.
- An installed iPhone web app has no browser back button: every pushed screen needs its own way
  back, and the left edge stays free for the system swipe.

## Capabilities

| Capability                            | iPhone, installed                                 | Android, Chrome |
| ------------------------------------- | ------------------------------------------------- | --------------- |
| Web Push                              | From iOS 16.4, only once added to the Home Screen | Yes             |
| App icon badge (`setAppBadge`)        | From iOS 16.4, installed web apps                 | No              |
| Vibration (`navigator.vibrate`)       | No                                                | Yes             |
| Keep the screen on (Screen Wake Lock) | From iOS 18.4                                     | Yes             |
| Install prompt event                  | No                                                | Yes             |
| View Transitions                      | From iOS 18                                       | Yes             |
| `@starting-style` entry animation     | From iOS 17.5                                     | Yes             |
| Spring curves with `linear()`         | From iOS 17.2                                     | Yes             |

An iPhone cannot be made to vibrate from script, so a rest timer that ends cannot buzz it.
Design that moment without haptics.

## Updates and offline

- Overload's `public/sw.js` calls `skipWaiting()` and `clients.claim()`, so a new version takes
  over pages that are already open. A revamp that changes the shell or cached assets must not
  break a page loaded under the old version mid-workout; if it could, wait and offer a reload
  instead.
- Logging happens in basement gyms. Next's experimental `useOffline` keeps a failed navigation
  or Server Action pending and retries it when the network returns; the bundled guide shows how
  to tell the user.

## Checking on devices

Playwright's WebKit is not an installed iPhone app. Safe areas, the keyboard, rubber-banding,
tap delay and standalone behaviour need a real iPhone and a real Android phone with the app
installed.
