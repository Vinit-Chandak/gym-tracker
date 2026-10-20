# Upstream

- Source: https://github.com/Uxcel-Lab/product-skills/tree/5007cd0241ccaa51ae2e4681f9618912dc10e239/ux/audits/information-architecture
- Commit: `5007cd0241ccaa51ae2e4681f9618912dc10e239` (2026-07-02), the head of `main` on 2026-10-20; this skill is unchanged since tag `v1.0.0`
- Licence: MIT, Copyright (c) 2026 Uxcel Lab; upstream's licence is copied verbatim to `LICENSE`
- Vendored: 2026-10-20 for the Overload UI revamp; see docs/ui-redesign/revamp/skills.md
- Local changes: references to Uxcel skills and an orchestrator that are not installed here now name the installed equivalent, or are dropped:
  - the generative skills it validates after: `ux-menus` and `ux-search` dropped, `ux-navigation` kept;
  - scope discipline: the orchestrator `ux-design-review` and its policy `docs/orchestration-policy.md` ("Tier B — offered") replaced by "offered, not auto-run", with the `overload-ui` skill settling which skill owns which job;
  - overlaps and the do/don't table: `ux-microcopy-audit` → `/impeccable clarify`, `ux-accessibility-audit` → `accessibility`;
  - overlaps: "Search interaction design belongs to `ux-search`" → "is out of scope".
