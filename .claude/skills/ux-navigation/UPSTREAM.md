# Upstream

- Source: https://github.com/Uxcel-Lab/product-skills/tree/5007cd0241ccaa51ae2e4681f9618912dc10e239/ux/components/navigation
- Commit: `5007cd0241ccaa51ae2e4681f9618912dc10e239` (2026-07-02), the head of `main` on 2026-10-20; this skill is unchanged since tag `v1.0.0`
- Licence: MIT, Copyright (c) 2026 Uxcel Lab; upstream's licence is copied verbatim to `LICENSE`
- Vendored: 2026-10-20 for the Overload UI revamp; see docs/ui-redesign/revamp/skills.md
- Local changes: hand-offs to Uxcel skills that are not installed here now name the installed equivalent, or are dropped, in the opening hand-off line and in "Validate the result":
  - `ux-heuristics-audit` → `/impeccable critique`, `ux-accessibility-audit` → `accessibility`, `ux-microcopy-audit` → `/impeccable clarify`, `ux-mobile-responsiveness-audit` → `mobile-native`;
  - `ux-aesthetics-audit` dropped: Impeccable owns visual review, and upstream already suppressed this lens under a design system;
  - the orchestrator `ux-design-review` and its policy `docs/orchestration-policy.md` (Tier A auto-run, Tier B offered) dropped: every lens is offered rather than run unasked, and the `overload-ui` skill settles which skill owns which job.
- Not changed: the website conventions (logo top-left, breadcrumbs, footers, mega menus) and the Title Case examples. The `overload-ui` skill says where they do not apply.
