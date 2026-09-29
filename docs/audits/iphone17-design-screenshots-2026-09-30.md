# iPhone 17 design reference — 30 September 2026

The screenshot package captures the audited app before merging it into `main`, using the
synthetic 56-month database described in [the local runbook](local-56-months.md).
The application checkout is `41fbc8ea4055d12d969c813039e6a68f2e564485`; this screenshot
tooling does not change the application's UI. The running production build contains the
final application changes at `67ad25b4b9a65fcfb21b82706dae3380a0218f2d`.

## Deliverable

- Local ZIP: `output/design-revamp-iphone17-2026-09-30.zip`.
- Offline searchable index: `output/design-revamp-iphone17-2026-09-30/bundle/index.html`.
- 700 PNGs: 372 phone captures and 328 page captures.
- 186 captures per theme: 154 route cases, 22 menus/dialogs/client states and 10 additional
  forms/onboarding states. Light and dark coverage is identical.
- Normal 16 px text; 402 × 874 CSS pixels at DPR 3, producing 1206 × 2622 phone PNGs.
- WebKit emulation with an edge-to-edge app canvas, without Safari or system chrome.
  These are browser captures, not screenshots taken on physical iPhone hardware.

The physical pixel dimensions match [Apple's iPhone 17 specification](https://www.apple.com/iphone-17/specs/).
Full-page images are provided where supported. Nine very tall history/exercise list cases
per theme exceed the harness's 32,000-pixel capture limit: their page image uses the first
viewport, labelled `Page capture` in the index and `fullPage: false` in the manifest.
The uniformly sized phone images are suitable for importing into design tools.

All 80 production page route templates were visited. There are 75 rendered templates;
the root and four legacy run templates intentionally redirect and capture their destinations.
Supplementary captures cover the actual onboarding Machines screen, signed-in password
reset, the application 404, programme intake steps and interactive overlays. Six development
preview routes deliberately return 404 in the production build and are documented as unavailable.
Native OS picker popups and software keyboards are outside headless browser screenshots.

The ZIP includes an HTML index, CSV mapping and JSON metadata. It contains no database dump,
auth session or fixture credentials. Images and ZIPs are local artifacts, excluded from Git.

## Reproduce

Start the isolated production app and auth stub using the local runbook. Use its seeded
fixture manifest. From PowerShell at the repository root:

```powershell
$env:AUDIT_BASE_URL = 'http://localhost:3102'
$env:AUDIT_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/overload_audit_20260929'
$env:AUDIT_OUTPUT_DIR = 'output/design-revamp-iphone17-2026-09-30'
$env:DESIGN_OUTPUT_DIR = $env:AUDIT_OUTPUT_DIR
$env:DESIGN_FIXTURES = 'output/audit-2026-09-29/fixtures.json'
New-Item -ItemType Directory -Force $env:AUDIT_OUTPUT_DIR | Out-Null
Copy-Item -LiteralPath $env:DESIGN_FIXTURES -Destination "$env:AUDIT_OUTPUT_DIR/fixtures.json"
$env:AUDIT_DEVICE = 'iphone17'
$env:AUDIT_FONT_SIZE = '16'
$env:AUDIT_CAPTURE_VIEWPORT = 'true'
$env:AUDIT_EXPAND_DETAILS = 'false'
$env:AUDIT_THEME = 'light'
node scripts/dev/audit-browser.mjs
$env:AUDIT_THEME = 'dark'
node scripts/dev/audit-browser.mjs
node scripts/dev/capture-design-overlays.mjs
node scripts/dev/capture-design-states.mjs
node scripts/dev/package-design-screens.mjs
Compress-Archive -Path "$env:AUDIT_OUTPUT_DIR/bundle/*" -DestinationPath "$env:AUDIT_OUTPUT_DIR.zip"
```

Use a fresh output directory when repeating a package: the packager deliberately refuses to
mix an existing bundle with new captures. Inspect each command's exit code before continuing.
The route and overlay scripts preserve seeded data. The intake script creates local disposable
accounts because the wizard automatically saves drafts, then removes those accounts and
verifies cleanup. No external coach generation is invoked.

## Verification

- All 308 route captures, 44 overlays and 20 supplementary states succeeded without final
  browser errors; production preview unavailability is recorded separately.
- Every phone PNG has the expected dimensions; all 700 image files and their metadata match.
- Independent route inventory found no missing production template and confirmed theme symmetry.
- The offline catalog loaded all 700 images without errors. Theme, category, search, state
  and full-page controls were exercised in a browser.
- Representative light/dark pages, appearance and calendar dialogs, food portion editing,
  workout help, onboarding equipment, password reset and programme forms were visually inspected.
- Screenshot scripts passed ESLint, Prettier and syntax checks. The existing full application
  validation is recorded in [the comprehensive audit](2026-09-29-comprehensive-audit.md).
