# Upstream

- Source: https://github.com/GoogleChrome/modern-web-guidance/tree/84ae7251ee919239d5ea85aef25897983f26601e/skills/modern-web-guidance
- Commit: `84ae7251ee919239d5ea85aef25897983f26601e` (2026-09-28)
- Licence: Apache-2.0
- Vendored: 2026-09-30 for the Overload UI revamp; see docs/ui-redesign/revamp/skills.md
- Local changes: `SKILL.md` searches the local `guides/` through a generated `INDEX.md` instead of running `npx modern-web-guidance@latest` (which fetches the newest package on every call and sends telemetry by default); its description no longer tells Claude to run it first for every HTML, CSS and JavaScript task; guides for on-device AI, WebAssembly and WebMCP are omitted. The guides themselves are unchanged (package 0.0.191, commit 84ae725).
