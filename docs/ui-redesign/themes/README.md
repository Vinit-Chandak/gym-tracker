# Form theme tokens

These CSS files are implementation assets for the plan. They are **not imported by the current app** and do not change its appearance in this branch. There is one design, Form, with light and dark palettes; no Fieldnotes asset or runtime style picker is included.

## Files and activation

| File                             | Purpose                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------- |
| [foundation.css](foundation.css) | Shared scale, responsive dimensions, motion and semantic light/dark selection |
| [form.css](form.css)             | Form typography/radii and complete light/dark colour primitives               |

During implementation, import foundation then Form once from the root CSS entry. Set `data-overload-design="form"` on the document root. Set `data-overload-mode` to `system`, `light` or `dark`; an absent or invalid mode falls back to System. Mode persistence and first-paint handling are specified in [Themes and performance](../03-themes-and-performance.md), not implemented here.

The palette is selected entirely through CSS. System follows `prefers-color-scheme`; an explicit mode wins regardless of OS preference. Each mode sets `color-scheme` for native controls. `prefers-reduced-motion` zeros the motion durations. Forced colours maps critical semantic colours to system colours; do not disable forced-colour adjustment on controls.

The files define tokens and `color-scheme` only. They do not apply a body background, font, grid, transition or component style by themselves. The planned integration maps existing utilities and components to those tokens. This deliberate boundary keeps the planning commit free of screen implementation.

## Semantic contract

Component styles consume `--ov-*` semantic values. The `--ov-light-*` and `--ov-dark-*` variables are private palette inputs; components must not reference them directly or hard-code a mode's hex values.

| Semantic role | Tokens / usage                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Surfaces      | `--ov-canvas`, `--ov-surface`, `--ov-surface-raised`, `--ov-accent-soft`                                                     |
| Text          | `--ov-ink`, `--ov-ink-muted`, `--ov-ink-subtle`, `--ov-on-accent`                                                            |
| Edges         | `--ov-line` for separators; `--ov-line-strong` for essential control boundaries                                              |
| Actions       | `--ov-accent`, `--ov-accent-strong`, `--ov-on-accent`                                                                        |
| Feedback      | `--ov-success`, `--ov-warning`, `--ov-danger`, `--ov-focus`                                                                  |
| Charts        | `--ov-series-1` through `--ov-series-4`; retain consistent labelled series assignments                                       |
| Body map      | `--ov-volume-0` through `--ov-volume-4`; pair the scale with volume labels/table                                             |
| Typography    | `--ov-font-body`, `--ov-font-heading`, `--ov-font-mono`, `--ov-text-*`, line heights and heading weight                      |
| Layout        | `--ov-page-gutter`, `--ov-section-gap`, `--ov-row-gap`, `--ov-control-height`, `--ov-set-columns`, `--ov-content-max`, radii |
| Motion/layers | `--ov-duration-*`, `--ov-ease-standard`, `--ov-z-*`, `--ov-backdrop`                                                         |

The set grid token reserves a 44 px set-options cell, flexible load/reps/RIR cells and a 44 px save cell. It assumes a single page gutter and a 6 px column gap. Avoid nesting it inside another padded card on the smallest phones. Enlarged text can require the accessible reflow described in the layout specification.

## Mapping existing Tailwind names

At integration, map the current Tailwind v4 names to semantic tokens using the appropriate top-level `@theme inline` aliases. This preserves utilities already used across the app while resolving variables at their point of use. Keep runtime values outside `@theme`; do not put a nested theme block under a mode selector. [Tailwind theme variables](https://tailwindcss.com/docs/theme) documents this aliasing distinction.

| Current token                                | Planned value                             |
| -------------------------------------------- | ----------------------------------------- |
| `--color-canvas`                             | `var(--ov-canvas)`                        |
| `--color-surface` / `--color-surface-raised` | Corresponding `--ov-surface*`             |
| `--color-ink` / muted / subtle               | Corresponding `--ov-ink*`                 |
| `--color-line` / strong                      | Corresponding `--ov-line*`                |
| `--color-accent` / strong / on-accent        | Corresponding semantic action values      |
| `--color-success` / warning / danger         | Corresponding feedback values             |
| `--font-sans` / mono                         | Body / mono stacks                        |
| `--radius-card` / control                    | Corresponding Form radius values          |
| Existing page/panel spacing                  | Corresponding bounded Form spacing tokens |

Also consume the focus, chart, body-volume and backdrop roles; a utility alias alone does not fix hard-coded SVG or metadata colours. Import order, production CSS output and route transitions must be verified after integration. Do not leave the current `:root { color-scheme: dark; }` rule active against the new mode contract.

## Palette review

Form dark retains the reviewed charcoal-green/copper character. Form light uses a warm neutral canvas with darker copper so the accent remains legible on pale surfaces. The same spacing and typography apply in both modes, preventing colour changes from altering layout.

Before adoption, inspect the final components under real lighting, native controls, zoom and disabled/hover/focus states. Token-level contrast checks are necessary but cannot certify the eventual whole interface. The performance document defines the release matrix and first-paint checks.

## Validation of these assets

Validated on 10 September 2026: both files parse as CSS; all 119 declared tokens/reference dependencies resolve; 108 designated text/control/chart contrast pairs pass. Across the checked neutral and accent-soft surfaces, the minimum normal-text ratios are 4.70:1 in light mode and 5.44:1 in dark mode; the checked control/chart ratios are at least 3.10:1 and 3.64:1 respectively. Decorative dividers and body-volume bands are not treated as text or control outlines.

Forty static selector/media combinations cover system/manual/absent/invalid preference, both OS modes, reduced motion and forced colours. These checks validate the token cascade, not real-browser rendering or first-paint persistence. The two source CSS files total 2,067 bytes when gzipped together, below the proposed 5 KiB theme budget. Actual application performance remains unmeasured until integration.
