# Responsive interface and navigation

Updated from remote default branch commit `e87d006` before implementation.

## Interface

- Shared gutters scale from 12–32 px, card padding from 14–24 px, and text sizes within bounded `clamp()` ranges. Inputs stay at 16 px to avoid iOS focus zoom; controls retain at least 44 px targets.
- Bottom navigation owns the entire visible safe-area tap target. At 1024 px, it becomes a 192 px sidebar. Content can expand to 1024 px; focused forms can keep a narrower measure.
- Keep surfaces for grouped content. Use plain divided sections for supporting information. Date ranges, summary numbers, gym metadata, unavailable equipment and secondary settings no longer each need a card.
- Progress uses a single horizontally scrollable tab strip with arrow, Home and End keyboard navigation. The selected panel is labelled by its tab. History's detailed filters and profile editing are progressively disclosed.
- Native selects give their wrapper its own layout classes so a select and adjacent button can share space correctly. Long list labels and buttons can wrap. The body illustration stays bounded on large screens.

## Navigation and reads

The shared layout previously awaited the profile gate before returning the navigation shell. The shell now renders synchronously, with the account gate and private content inside Suspense. Page/action authentication and database row-level security remain enforced.

`getRequestProfile` uses React's render-scoped cache, keyed by user ID and email. The layout and pages share the result in the same render; this is not a persistent or cross-account data cache. Server actions retain their transactional profile reads.

The old fixed loading bar lived inside each link, including blurred headers and clipped list containers. Feedback is now portalled to the document body. Primary navigation also displays a spinner on the pressed item. Both pending links and committed loading pages provide slow-request feedback after eight seconds and an explicit retry. No automatic reload discards ongoing work.

The page-loading retry is a native same-document link revealed by CSS after eight seconds. This also works in initial streamed HTML before React effects run; a JavaScript-only timer was found to start too late in the long initial-load test.

Default Next partial prefetch remains enabled. We do not force all six tabs' live datasets to prefetch simultaneously. The existing service worker was reviewed: private pages, actions and RSC responses remain network-only; its static-asset cache is unchanged.

`withUser` sets the transaction-local role and JWT claims in one statement, saving one database round trip per protected transaction. Tests verify the authenticated role, isolation between accounts and restoration of the connection's role/claims afterwards.

The body map now aggregates non-warm-up sets from completed sessions by exercise in one query. It no longer needs a second download of workout, exercise and set records, and its counts are not capped by the history page's 500-record limit.

## Validation

- `npm run check`: lint, formatting, TypeScript and 188 tests pass.
- Production build passes.
- Browser checks at 320, 390, 768 and 1440 px; no document overflow on the checked Progress, Gym and History screens. At the smallest viewport, the select text is 16 px and navigation targets measure approximately 51 × 60 px.
- Actual shared components in an isolated local Next preview with sample data and a deliberate 1.8-second server delay: Today, Runs, History, Progress, Gyms and Settings each complete with one click. A DOM observer recorded the first feedback at about 3 ms; destination content arrived at 1.84–1.86 seconds.
- Progress keyboard switching, narrow-screen scrolling to Body, History filters and clearing filters verified in the browser.
- A 30-second initial request exposes the retry link after eight seconds. Navigating away during that wait reaches Gyms with one click and about 4 ms to feedback.
- Database measurements against the configured connection (three samples per operation): previous body-map record read median 323 ms, aggregate median 209 ms. Including read-only transaction setup, statement counts decrease from seven to five. These measure the database operation, not full navigation latency.

The sample-data preview has no authentication bypass in the product and is excluded from the application build. A real signed-in iPhone/PWA check remains necessary after deployment, especially after backgrounding the app or moving between mobile networks. Hosting cold starts and network latency can still vary; the interface now acknowledges the request while waiting.
