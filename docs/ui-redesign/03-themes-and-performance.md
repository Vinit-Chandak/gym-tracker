# Themes, motion and performance

Form will support System, Light and Dark. Switching colour mode is a local rendering operation: no backend request, route navigation, stylesheet download or workout-state reset is necessary. A zero-latency promise across every device and network would be misleading; the implementation must meet the measured targets below and expose real save/network status.

## 1. Theme behaviour

### Appearance contract

The design identity is always Form. The document has a Form marker and an appearance preference: System, Light or Dark. System follows the operating system; an explicit choice overrides it. The supplied CSS implements the palette selection through custom properties and a media query. It does not depend on React to determine the system colour scheme.

Use the same semantic roles in both modes: canvas, surface, raised surface, primary/muted/subtle ink, separator/control border, accent/on-accent, success, warning, danger, focus and chart/body-volume colours. Never invert colours with a CSS filter. Do not repeat the component markup for each mode.

Native selects, date fields, scrollbars and other browser-provided controls also need the matching `color-scheme`; recolouring only app backgrounds leaves an incomplete theme. See [MDN: color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme). System mode follows [prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme).

### First paint and persistence proposal

1. Default to System for a new browser. Include both palettes in the initial CSS; never fetch the second palette on the first toggle.
2. Persist the tiny validated enum locally. Mirror it to a small first-party preference cookie so a full server-rendered request can emit the manual mode before CSS paints. No database/profile read is needed for this preference.
3. For a static/cached shell where a cookie cannot be read without changing the rendering strategy, use a bounded early head initializer to apply the stored enum before first paint. It must not import a library, query layout or wait for hydration. A storage failure falls back to System.
4. Select the cookie-aware or static-shell strategy after measuring its effect on the installed Next.js rendering path. Do not add `cookies()` to a formerly cacheable root without reviewing the consequence. Avoid divergent server and client initial attributes; prefer server-known mode, and if a pre-paint attribute adjustment is necessary, isolate any justified hydration-warning suppression to that attribute boundary rather than suppressing errors across the app.
5. On a user change, update the document's appearance attribute immediately, then persist the validated preference. OS changes affect System only. A cross-tab storage notification updates the mode without reloading the session.
6. Keep the appearance control's initial server/client markup stable. Do not replace the page with a “mounted” placeholder to hide a theme mismatch. Render a neutral preference label until its client state is available if needed; the colours themselves must already be correct.

Device-local appearance is proposed; synchronising it through the account is a separate choice. Do not introduce an extra authenticated request on every page just to choose light or dark. Store no workout or account information in the appearance cookie. If a restrictive CSP is added, authorise the small initializer using the project's nonce/hash strategy instead of relaxing the policy.

### Theme transitions and motion

Apply the new colours in one update. An immediate switch is the default; a site-wide animated colour fade can repaint every surface and is not required for smoothness. Do not animate layout or temporarily block input during a mode change.

Use short transform/opacity transitions only where they explain interaction: approximately 120 ms for small feedback and up to 180 ms for a sheet. Content is readable and controls work before the animation ends. No looping ambient animation, blur-heavy backdrop, animated gradient, spring physics bundle or page-wide entry choreography. Reduced-motion settings set the motion tokens to zero; loading states still convey progress without relying on movement.

### Full surface coverage

Update the existing fixed dark `colorScheme`/`themeColor` in `src/app/layout.tsx`, the `THEME_COLOR` assumption in `src/lib/app.ts`, and any hard-coded values in charts/body-map/tooltip/loading/offline surfaces during integration. Browser `theme-color` should reflect the effective mode, including manual override; media-qualified metadata alone reflects the OS, not necessarily the user's explicit choice.

Installed launch/splash colours come from the manifest and platform behaviour. Use a deliberate manifest fallback and test actual iOS/Android installed launch. A runtime preference cannot guarantee that every OS-controlled splash screen adopts that choice before the app runs. Document any platform limitation; do not claim a fully seamless splash change based on a desktop browser test.

The public offline page cannot read an authenticated profile. Let it use the same Form/System fallback and a small local appearance read if appropriate, with no private cache or network dependency. Test native autofill, selection, disabled fields, dialogs/backdrops, warning states, focus indicators and browser chrome in both modes.

## 2. Frontend work that must remain local

| Interaction                  | Work allowed on the immediate input path               | Work to keep off that path                                                      |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Type a set value             | Update that row's draft; cheap sanitisation            | Page refresh, network save, full history recomputation or global context update |
| Change colour mode           | Change an attribute/custom-property selection          | Route reload, theme download or rebuilding the page tree                        |
| Open another loaded exercise | Change focused exercise and restore its draft          | Mounting every logger or fetching the same session again unnecessarily          |
| Rest tick                    | Update the small countdown from its deadline           | Re-rendering the workout list, charts or all inputs                             |
| Open a Progress tab          | Show controls and the selected view                    | Rendering all chart/body-map components at once                                 |
| Search a loaded catalogue    | Filter the relevant normalized fields                  | Blocking the input on a server request for every character                      |
| Save a set                   | Immediate row-level pending feedback; validated action | Claiming success before acknowledgement or disabling the whole app              |

Keep the existing server authentication, RLS and mutation validation. Fast UI does not mean bypassing data checks. Reconcile server results into the affected state; use targeted invalidation rather than unconditional full refresh after every keystroke or local view change.

## 3. Loading and bundle strategy

- Keep the streamed shell and account boundary. Use route loading UI that matches the final title/list/tab dimensions; do not wait for every chart to fetch before showing navigation.
- Keep Server Components for data-heavy/static content and narrow Client Components for real interaction. Pass only useful serialized data into the browser. Do not embed the entire seed catalogue, all programme weeks and all history in every route as the prototype does.
- Reuse the existing CSS/Tailwind and small SVG chart implementation. A new charting, animation, global-state or runtime-theme dependency requires measured value and bundle review.
- System font stacks are the default; no new font request. If a custom font becomes a deliberate design choice, evaluate a self-hosted subset, fallbacks and layout shift separately.
- Lazy-load secondary expensive views such as the body map and rarely used editors at appropriate client boundaries. Keep the primary set input/save controls in the initial interactive path. Do not delay a basic button behind a lazy import. Next documents the relevant client/server restrictions in [Lazy loading](https://nextjs.org/docs/app/guides/lazy-loading).
- Preserve partial route prefetching/loading shells for primary destinations. Do not prefetch every historical workout, catalogue detail and programme-fit route from large lists. Prioritise likely return paths and user intent, and verify actual network behaviour on this installed Next.js version.
- Keep machine resolution, progression and analytics on their established data path. On `main`, reference data is already cached and profile invalidation already exists. Do not add a competing cache with stale-user or stale-equipment behaviour.
- Long histories/catalogues can paginate or window after profiling. Typical workouts need a plain complete list; virtualisation would complicate focus, find-on-page and variable row heights without a demonstrated benefit.
- Mount only active chart views; retain control state separately. For large datasets, aggregate to the displayed period while preserving extrema and missing-data semantics. Theme changes should update SVG token colours without refetching or recalculating the dataset.

## 4. Performance acceptance targets

Targets are release gates to measure, not results achieved by this planning commit. Capture a production-build baseline at the start of implementation and compare on the same devices, data, hosting region and network profile.

| Measure                        | Target / evaluation rule                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core Web Vitals                | At mobile p75, LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1; seek lower interaction latency for the logger                                                                                                           |
| Warm local interaction         | p95 visible feedback within 100 ms for theme switch, set edit, loaded exercise switch and local tab controls on the agreed phone                                                                                |
| Mutation feedback              | Pending feedback within 100 ms; separately report time to server acknowledgement and failure recovery                                                                                                           |
| Theme switch                   | No network request, no navigation, no input/focus loss, no layout shift attributable to colour mode                                                                                                             |
| Set typing                     | No sustained UI-thread task above 50 ms caused by the logger; profiling must show row-local updates rather than whole-page renders                                                                              |
| Motion/scroll                  | Target smooth 60 Hz scrolling and transitions on agreed devices; inspect frame time/jank under realistic data rather than averaging only a fast desktop                                                         |
| Initial JS change              | Proposed redesign budget: at most +15 KiB gzip versus the same route's baseline critical client chunks, and at most +5 KiB shared-shell JS; investigate any increase rather than treating the ceiling as a goal |
| Theme payload                  | Proposed ceiling: 5 KiB gzip for the two palette/foundation CSS files combined and 1 KiB gzip for any future first-paint initializer                                                                            |
| Font/animation/theme libraries | Zero new network font requests and zero new dependencies solely to deliver the approved Form styling/mode switch                                                                                                |
| Requests per navigation        | No extra duplicate profile, active-session or reference lookups caused by decorative UI; record cold/warm separately                                                                                            |
| Memory/listeners               | Repeated workout/tab/theme navigation reaches a stable memory range; timers/listeners/observers are cleaned up; no accumulating hidden logger/chart trees                                                       |

The Core Web Vitals thresholds are the published “good” thresholds, assessed at the 75th percentile. The tighter local-interaction, payload and frame-time budgets above are project proposals. [web.dev: Web Vitals](https://web.dev/articles/vitals) distinguishes field metrics from lab tests; a good Lighthouse score alone does not prove responsive interactions or field INP.

Measure frontend handling, transfer time, server response and paint separately. Backend cold starts or a failed connection can delay data even when the interface responds immediately. Show honest progress and retries; do not conceal latency behind unconfirmed optimistic success.

## 5. Required verification matrix

| Dimension     | Cases                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Appearance    | System/light OS, System/dark OS, explicit Light on dark OS, explicit Dark on light OS                                                              |
| Startup       | New browser, persisted preference, direct deep link, slow/disabled JavaScript, delayed hydration, unavailable storage, full reload                 |
| Phones        | 320/360/390/430/480 CSS px; agreed older iPhone Safari; modern iPhone; midrange Android Chrome                                                     |
| Installed app | Cold/warm launch, background/resume, OS theme change, rest deadline expiry, keyboard and home-indicator safe areas                                 |
| Content       | Long exercise/machine names, max numeric values, a typical workout and the current maximum row count, long history/catalogue, missing observations |
| Network       | Normal, throttled mobile, high response latency, interrupted save and offline/reconnect                                                            |
| Navigation    | Every tab during a workout, exercise switch with draft, historical workout during active session, back/forward and refresh                         |
| Accessibility | 200% text, browser zoom, screen reader, keyboard, reduced motion, forced colours, contrast and visible focus                                       |

Record a trace for theme switch, typing, set save, exercise navigation and first Progress/Body load. Include initial-load and warmed-route measurements. Run repeated trials and report median/tail latency with conditions. Use temporary instrumentation that does not record private workout values; persistent analytics collection is a separate deployment decision.

## 6. Theme and accessibility checks

Normal text targets at least 4.5:1 contrast against its actual surface. Essential control outlines, focus and chart marks target 3:1 against adjacent surfaces; subtle decorative dividers need not meet the same criterion. Verify disabled/read-only distinctions and do not rely only on colour for saved/error/group/volume meaning. Pair chart series and muscle-volume bands with labels or patterns and an accessible table.

Do not lower contrast using arbitrary component opacity after validating a token. Check the final composited appearance: a passing foreground/background token pair does not validate a half-transparent tooltip, overlay or disabled control. See [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Use the supplied 44 px control target and responsive grid budgets as starting constraints. Respect input text size and zoom before enforcing a single-row layout. A usable enlarged-text fallback is preferable to hidden or clipped numeric values.
