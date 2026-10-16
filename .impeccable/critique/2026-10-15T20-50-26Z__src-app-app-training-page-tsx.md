---
target: Training as the home for independent sport programmes and logging
total_score: 25
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 4
target_identity: "file:C:\\Users\\defoz\\Documents\\gym-tracker\\src\\app\\(app)\\training\\page.tsx"
target_fingerprint: "sha256:c63886ebfd30394309b1fe27b2ef3db6a88cb4aabe692c0668d6021acbb96ab7"
target_path: "C:\\Users\\defoz\\Documents\\gym-tracker\\src\\app\\(app)\\training\\page.tsx"
timestamp: 2026-10-15T20-50-26Z
slug: src-app-app-training-page-tsx
---

Method: dual-agent (A: /root/training_design_review; B: /root/training_evidence_review).

Target: src/app/(app)/training/page.tsx and its immediate programme-management flow.
Evidence: current source and archived Training screenshot. A fresh local browser request returned ERR_CONNECTION_REFUSED. No current rendered UI, installed hardware, or live-data flow was verified.

Recommendation: Training is the home for logging and programme management. Put sport logging first, followed by compact independent programme cards. Keep full cycles/prints and dated schedules on programme detail. Keep shared coach configuration in Profile.

Options assessed:

- Logging plus compact programme cards: best fit for immediate logging and visibility of all active sports.
- Log/Programmes segmented views: reduces first-screen content but hides programme state and reviews.
- Sport workspaces: strong local ownership but adds switching and hides cross-sport context.
- Agenda first: duplicates Today and misrepresents sequence-based lifting as fixed dates.
- Full cycle and commands inside every sport card: grows substantially with four sports and pushes logging down.

Incumbent source-backed provisional Nielsen scores (0-4): system status 3; real-world match 2; control 3; consistency 3; prevention 3; recognition 2; efficiency 2; minimalism 2; recovery 3; help 2. Total 25/40. Runtime interaction and responsive rendering remain unverified.

Specific strengths: meaningful prints encode real training; exact occurrence associations and blank actual measurements; useful existing draft recovery and archive protections. Preserve those behaviours.

Priority findings:
P1: Full programme cycle precedes logging, and lifting has no logging shortcut. Add a real strength start/resume flow with Training as navigation origin.
P1: Programme management spans Profile and Training. Give each sport one canonical programme detail and scope creation/edit/replacement to it.
P1: Top-level sport shortcuts currently create standalone activities. Offer explicit planned/standalone choice when applicable; never match by sport/date silently.
P1: Database uniqueness, active-programme reads, coach/draft targets and occurrence closure still assume one active programme per account. Four cards require underlying programme isolation first.
P2: Surface pending draft/review/completion within the owning programme card. Sport shortcut preferences must not hide existing programme commitments or drafts.

Independent detector: 0 findings across the two requested TSX targets (each exit 0 and []). No false positives. This does not assess imported components, rendered CSS, programme independence, or information architecture.

Persona risks: distracted athletes need Log/Resume before cycle reading; low-vision and keyboard users need growing targets, wrapping text and explicit per-sport control names; new users need a useful no-programme state and clear standalone/planned intent.

Responsive implementation: retain ADR 0052 compact/medium/expanded classes and fluid tokens. Test 0/1/4 programmes, long/identical names, active/draft/review/complete states, disabled sport shortcuts, open workout and unsaved drafts. Capture 320, 402x874, 768, 1440 widths, 16/32px root text, both themes, in Chromium/WebKit. Include focus, keyboard and target checks, not just overflow.

PWA implementation: preserve online app plus local drafts. Re-run production manifest/assets, worker privacy boundaries, offline fallback, acknowledged-save/retry identity, reload after reconnect, and update while workout open. Installed iPhone/Android safe areas, keyboard, Back and touch require real hardware confirmation.

Parent baseline: 46 tests passed across manifest, service worker, PWA provider, platform and Training day model. No programme migration or production UI change was made in this review.

Open design questions: compact active programme cards plus create rows for enabled sports, versus full empty cards; top logging should explicitly choose planned/standalone when a plan exists, versus standalone shortcuts with planned work exclusively on Today. Recommended: compact cards/create rows and explicit planned/standalone choice.
