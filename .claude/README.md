# Claude Code kit

Project skills and agents for this repository. Claude Code loads `.claude/skills/` and `.claude/agents/` from the checkout, locally and in cloud sessions (Claude Code on the web). Cloud sessions never install plugins, which is why the design skills are vendored here rather than added as plugins. The redesign they serve is described in [`docs/redesign-2026/`](../docs/redesign-2026/README.md).

## Skills

| Skill                           | Use it for                                                                                                   | Runs                                  | Source (licence)                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------- |
| `coach`                         | Overload's coaching jobs                                                                                     | In the coaching routine               | This repository                                   |
| `frontend-design`               | Aesthetic direction and choices that don't read as templated defaults, when building or reshaping UI         | Automatically when relevant           | `anthropics/skills@8a1541c` (Apache-2.0)          |
| `impeccable`                    | `/impeccable critique`, `audit`, `typeset`, `colorize`, `layout`, `polish`, `harden`, `animate`, `document`… | Only when typed: `/impeccable …`      | `pbakaus/impeccable@40f990f`, v4.4.0 (Apache-2.0) |
| `mobile-native`                 | Making the PWA feel installed: safe areas, tap states, `100vh`, input zoom, pull-to-refresh, status bars     | Automatically when relevant           | `emilkowalski/skills@d16ebe6` (MIT)               |
| `animate`                       | Building an animation: whether to, which properties, curve, duration, interruption, exit                     | Automatically when relevant           | `emilkowalski/skills@d16ebe6` (MIT)               |
| `review-animations`             | A strict review of motion code                                                                               | Only when typed: `/review-animations` | `emilkowalski/skills@d16ebe6` (MIT)               |
| `vercel-react-view-transitions` | React `<ViewTransition>` and route transitions in the App Router                                             | Automatically when relevant           | `vercel-labs/agent-skills@063bee9` (MIT)          |
| `web-design-guidelines`         | Vercel's Web Interface Guidelines as `file:line` findings; fetches its rules from GitHub each run            | Automatically when asked to review UI | `vercel-labs/agent-skills@063bee9` (MIT)          |

## Agents

| Agent           | Use it for                                                                                                                                                                                                     | Source (licence)                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `design-review` | A live review at 390, 360 and 320 px in light and dark, with screenshots, axe and gym measurements (taps per set, target sizes, contrast), triaged Blocker / High / Medium / Nit. Writes only under `output/`. | Adapted from `OneRedOak/claude-code-workflows@6a65344` (MIT) |

Examples:

- "Use the design-review agent on /preview/logging after this change."
- `/impeccable critique src/app/(app)/today`
- `/review-animations src/components/shell/rest-timer.tsx`
- "Review src/components/ui/set-table.tsx against the web design guidelines."
- `npx impeccable detect src/` runs Impeccable's deterministic anti-pattern rules with no model.

## Deliberately not included

- **Impeccable's hooks and helper agents.** The hooks run its detector after every UI edit and live in `.claude/settings.local.json`; the skill falls back to `reference/degraded/` without the agents. To add both on your own machine, run `npx impeccable install --providers=claude --scope=project`; it replaces the vendored folder, so re-apply the change listed under Modifications.
- **Playwright MCP.** Add it on your own machine only: `claude mcp add playwright -- npx @playwright/mcp@latest --mobile --isolated`. A committed `.mcp.json` would also load in the unattended coaching routine. Without it, the design-review agent drives the repository's own `@playwright/test`.
- **Claude Design.** Nothing to install. In a local, interactive terminal: `/design status`, `/design login`, `/design consent`.

## Keeping it lean

Every skill's description is added to every session's context, including coaching runs once this reaches `main`. `impeccable` and `review-animations` are user-invoked only (`disable-model-invocation: true`), so they cost nothing until typed. When the redesign ends, remove what has not earned its place.

## Updating a vendored skill

Copies here do not update themselves. To refresh one, clone its source, replace the folder (keeping its licence files), re-apply any modification below, and update the commit in the tables above. Vendored folders are excluded from Prettier (`.prettierignore`), and `impeccable/` from ESLint, so upstream files stay byte-identical.

## Modifications

- `skills/impeccable/SKILL.md`: `disable-model-invocation: true` added to the frontmatter, with a notice in the file.
- `skills/vercel-react-view-transitions/`: renamed from `react-view-transitions` to match the skill's name; `AGENTS.md`, a compiled single-file copy for other agents, left out.
- `skills/vercel-react-view-transitions/LICENSE` and `skills/web-design-guidelines/LICENSE`: added; the upstream repository declares MIT in its README but ships no licence file.
- `agents/design-review.md`: adapted to phone viewports and themes, Overload's design documents, a Playwright fallback without MCP, and gym-specific checks.

## Licences

Apache-2.0: `skills/frontend-design/LICENSE.txt`; `skills/impeccable/LICENSE` with `skills/impeccable/NOTICE.md`. MIT: the `LICENSE` file in each of `skills/mobile-native`, `skills/animate`, `skills/review-animations`, `skills/vercel-react-view-transitions` and `skills/web-design-guidelines`.

`agents/design-review.md` is adapted from software under the following licence:

```text
MIT License

Copyright (c) 2025 Patrick Ellis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
