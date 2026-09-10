# Boxes, not rules

Form grouped ordinary rows with a rule between them and reserved a filled panel for a
decision, a summary or a form section. On a phone that read as lines: a rule under every
heading, a rule between every row, a rule around every list, and on Settings little else.
The user asked for the opposite — related things in slightly lifted boxes, the way Hevy's
settings screen does it — on every screen, and for Settings to be rearranged. Each choice
below was put to them with a rendered comparison before anything was built.

## Decisions

1. **A box is the grouping.** Anything that belongs together sits in a rounded box filled
   with the surface colour and no outline, in both palettes; the lift from the canvas is
   its only edge. `Card` is the padded box (a summary, a decision, a form section) and
   `List` is the box of rows. The card radius token grows to 0.75rem so a box reads as one
   object. Outlined boxes, edge-to-edge bands, a hairline or a shadow in light mode were
   offered and declined.
2. **Rows keep one hairline, running the full width of the box.** Never on the box's own
   top or bottom edge, so a list adds no line to the box it sits in. The `box-rows`
   utility draws it and hands the box's corners to the first and last row, so a pressed
   row's highlight follows the rounding without the box clipping anything that has to
   escape it, such as an open info tip. `ruled-list` remains for rows inside something
   that is already a box: an open disclosure, a sheet.
3. **Section titles become small labels above their box.** The heading with a rule under
   it is gone. A box that stands for one thing (adherence, a chart, a Today card) keeps
   its title inside.
4. **Settings is rows that open pages.** One box per group — profile, Training,
   Preferences, Account, App, then Sign out and Delete account — with a leading icon on
   every row, which is the one place icons are used: on Settings the rows are fixed
   destinations, while in a data list the text is the identifier. The profile row shows
   the name and nothing else. Editing the profile, changing the password and deleting the
   account each get their own page under Settings; Appearance shows the current mode and
   opens the three choices in a sheet; the rest timer stays a switch in its row; Install
   is a row that either prompts or opens the two-line instructions in a sheet.
5. **The chrome keeps two lines and loses one.** The page header's bottom rule goes, since
   the boxes below give a page its structure. The bottom navigation keeps its hairline so
   it reads as a bar over scrolling content, and tabs keep their accent underline.
6. **The set grid stays on the page.** The logger boxes the exercise (name, machine line)
   and, in the Log tab, the prescription and suggestion; the rows themselves keep their
   hairlines and the full page width. Decision 0013 measured the one-line grid against a
   320px phone with a single page gutter, and a padded box would have taken that width
   back.

## Consequences

- Every screen changed, but no feature did: the same links, forms, sheets, drafts and
  actions reach the same places. The three new Settings pages carry the forms that used
  to unfold in place.
- `Section` is a label, `Disclosure` is a box unless told it is `inline`, and the
  segmented control sits on a raised track with no outline so it can live inside a box.
  Selectable tiles (programme templates, onboarding machines) and the gym switcher's
  options are raised rather than outlined, with a transparent border reserved for the
  chosen state so nothing shifts when it is picked.
- The superset rule keeps its 3px stroke; a row inside a box takes it out of its own
  gutter so names still line up with the rows around it.
- Validation: lint, formatting, TypeScript and the 222 tests pass. Every screen was
  rendered statically with fixture data against the production stylesheet and reviewed at
  320 and 390 CSS px in both palettes; nothing overflows and no control falls under 44px.
  Field measurements on real devices remain open, as in decisions 0013 and 0014.
