# Less said per screen

A review of the Form interface on a phone found every screen explaining itself: a sentence
under each Settings row saying what was behind it, a paragraph under the set grid saying
what the grey numbers meant, a caption repeating a chart's own headline, a warm-up printed
in full above the exercises it precedes, and Today folding a run's instructions into the
card whose button started the lifting session. This record covers what changed and the
rules that now apply.

## Rules

1. **A screen says what it is, not what it means.** Rows carry a title; details are found
   by opening the row. Charts carry a value and a unit; the control above them says which
   measure it is. Forms carry labels and, at most, one short hint such as "Optional" or the
   ends of a scale.
2. **An explanation, when one is needed, lives behind a tip.** `InfoTip` is a circled "i"
   that opens a short note beside itself: no portal, no dialog, no measurement while closed,
   and its document listeners exist only while it is open. A second tap, a tap anywhere else
   or Escape closes it. `Section` and `Field` take an `info` prop so a heading or a label can
   carry one; the tip replaces the description that used to sit under them.
3. **Colour marks a group; a caption does not.** Supersets are drawn with a rule and a faint
   wash in one of eight hues, assigned in order of first appearance in the workout, so the
   first superset in any workout is always hue 1. The rows carry no group name and no Edit
   control; the Superset button lists the workout's groups by colour for editing.
4. **One card per thing to do.** Today gives the lifting session and the run their own
   cards, each with its plan folded inside and its own action. "Start workout" cannot be
   mistaken for starting the run, and the run's pace, progression and shin notes are a
   disclosure rather than three lines above the button.
5. **A suggestion looks like one.** Ghost numbers in the set grid use a dedicated
   `--ov-ink-ghost` token, fainter than any other text, and a typed value is bold ink. The
   column headings are the strongest text in the grid, since they are the only labels the
   numbers have.
6. **State is shown, not described.** The rest timer is a switch; nothing says "currently
   on". The warm-up is a closed row with its own Mark done beside the toggle; the drills are
   name and dose only.

## What moved behind a tip

Chart notes (weeks, warm-up exclusion, comparability across machines), the body map's
counting rule, the rest timer's purpose, what deleting an account removes and the sign-in
provider caveat, the load-jump field's meaning, why history is kept per machine, what
archiving a gym or machine does, the coach endpoints' conventions, the run workload flag's
threshold, and a day's time and effort notes.

## What was removed outright

Subtitles under the Settings rows and the Appearance description; the set grid's
explanatory paragraph and the set options sheet's footnote; the superset scope footnote and
group captions in the workout list; the strength chart's machine line and duplicate
caption; onboarding, sign-up and profile hints that restated the field; and the
"Logged from the Runs tab, not here" line, which the run's own card makes unnecessary.

## Tokens

`form.css` gains `--ov-light-ink-ghost` / `--ov-dark-ink-ghost` and eight group hues per
mode; `foundation.css` maps them to `--ov-ink-ghost` and `--ov-group-1` to `--ov-group-8`
in every mode block, including forced colours. Each group hue is at least 4.5:1 on its
mode's canvas and surface and is distinct from the copper accent; the ghost ink sits near
3:1, deliberately below body text, because being fainter is its meaning. The
`superset-row` utility reads the hue from `--superset-color`, which the row sets inline, so
one rule serves all eight colours.

## Not changed

No feature was removed. Every tip, disclosure and switch reaches the same action or
information as before; the set logging model, drafts, progression and analytics are
untouched. Field measurements on real devices remain open, as recorded in decision 0013.
