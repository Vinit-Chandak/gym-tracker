---
name: taste-app-screens
description: Measured rules for screens people work in, from a study of 23 real product screens, and a dated registry of what makes an interface read as generated. Use when deciding or reviewing an Overload screen's colour share, surfaces, titles, lists, figures, charts or phone layout, and as a second opinion beside Impeccable's critique. Read overload-ui first.
---

# App screens, measured

Three references copied from the taste skill, without its scripts or libraries:

- [references/app-screens.md](references/app-screens.md): the app-screen chapter. What the 23 screens
  do with colour (about 3% of pixels, on data rather than chrome), surfaces, titles, KPIs, charts,
  tables and lists, forms, density, empty and error states, the phone (section 12), the house rules
  (section 13) and the tells of generated dashboards (section 14).
- [references/colour.md](references/colour.md): roles, proportion, surfaces by tone, dark grounds,
  contrast, and the colour families generated pages fall into (cream with terracotta; violet and
  indigo).
- [references/tells.md](references/tells.md): the dated registry of tells.

## How to use them here

- They are evidence, not law. Overload's own decisions win where they differ (`overload-ui`,
  Precedence), and so does the owner in the session.
- The study measured desktop screens. Its phone section is house rule, and Overload's
  `DESIGN.md` sets the phone layout.
- The chapters mention `draw.mjs`, `inspect.mjs`, `lint.mjs`, `library/*.json` and `assets/*`. Those
  are not installed: skip any step that runs them and apply the rule or the measurement by hand,
  measuring contrast with `better-colors`.
- Its bans on gradients and on glass come from web pages and dashboards. On a phone app, a fade at a
  scroll edge (content passing under pinned actions) is a scroll affordance rather than decoration;
  `DESIGN.md` says where Overload uses one.
