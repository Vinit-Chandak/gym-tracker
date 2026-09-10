# A navigation island, and a header that says where you are

Follows [0015](0015-grouped-boxes.md) and [0016](0016-today-and-the-programme.md). Six tabs,
a title with a footnote under it and three controls that misbehaved on a real phone.

## Navigation

Five tabs, not six. Gyms is a place you set up once and rarely revisit, and it was already
reachable at Settings › Gyms and machines, so it gives its share of the thumb's reach back
to the four screens used every session. Its own pages keep Settings selected while you are
in them — the same rule the exercise library already followed, now a list rather than a
special case.

**Decided: an island rather than a bar.** The navigation floats clear of all four edges,
rounded, with the page running underneath it. That only reads as intentional if you can see
there is more page down there, so the island is the canvas at 72% behind a blur — and the
`@supports` fallback for a browser without a backdrop filter is an _opaque_ island, never a
see-through one, because 72% of a canvas over unblurred body text is unreadable, not subtle.

The island owns a `--nav-reserve` variable: its height, its gap and the safe-area inset in
one number. The page's bottom padding and the active-workout strip both read that, so
nothing has to re-derive what the navigation costs. `--ov-nav-height` grew from 3.75rem to
4rem: the island pays for its own inner padding, where the old bar spent that space on the
home-indicator inset it sat on top of.

## Page headers

The small line moved above the title, in the letterspaced uppercase a card already uses for
its own eyebrow, and the header gained a rule under it. Where a screen has no context of its
own it shows the section its back chevron leads to, derived from the destination path, so a
machine three levels inside a gym still says `GYMS` over its name. That is the trail a lone
chevron only hints at, and it costs the twenty-odd screens that use `PageHeader` no edit.

## Progress

**Decided: a sheet, not a strip and not a native select.** Five sections as tabs wrapped
onto two rows, which is a band of chrome taller than some of the panels below it. They are
now one control naming the section you are in, with the filters beside it, and the rest
arrive in the bottom sheet the app already uses for a short decision. A `<select>` would
have been free, but iOS renders a wheel and Android a dialog — and this screen is used on
both.

## Three things that were broken on the phone and not in the browser

**A date field is as wide as the platform says.** iOS puts a native widget inside
`input[type="date"]` and sizes the field to the widget, ignoring the width the layout gave
it. Two of them in a two-column grid overlapped, and the From value vanished under the To
field. Dropping the native appearance hands the width back to the layout; the pair also
stacks until a tablet's width, so neither platform depends on that fix alone.

**A focus ring needs somewhere to go.** Opening a `<dialog>` focuses its first tappable
child, and a full-bleed row's outset ring is then clipped on three sides by the sheet's own
scroll box — leaving one bright line across the row above, on a row nobody chose. The sheet
now takes the focus itself, and every pressable row draws its ring inside its own edges.

**A scrollbar the page cannot use.** A modal dialog stops the page behind it scrolling, but
the scrollbar stays painted, over the backdrop and over the sheet. Hiding the track while a
sheet is open, rather than setting `overflow: hidden`, leaves the page exactly where it was
when the sheet closes.

The chart's "View values" had the same shape of problem: a scroll region nested inside a
scrolling page, whose bar landed on top of the right-hand column. It now grows to its full
height, and reads newest first — someone who opens it is looking for what happened
this week, not scrolling back through a year to reach it.

## Validation

- `npm run check`: lint, formatting, TypeScript and 225 tests pass. Production build passes.
- The real shared components rendered from fixture data in a throwaway local route and
  driven with Playwright: Progress, History, Today, and a gym detail header, in both
  palettes, at 320, 393 and 1280 px. Checked that all five labels fit the island at 320 px,
  that it reverts to the desktop rail at 1024 px, that the sheet opens without a stray
  highlight, that the two date fields stack rather than overlap, and that the values table
  runs latest to oldest with no scrollbar of its own.
- Still to check on a signed-in device: the blur's cost while scrolling a long History, and
  the island against the iOS home indicator in installed (standalone) mode.
