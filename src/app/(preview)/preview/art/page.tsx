import type { Metadata } from "next";

import { Art, type CalendarEntry } from "@/components/art/art";
import {
  FAMILIES,
  FAMILY,
  trackModules,
  VARIANT,
  VARIANTS,
  type FormState,
  type PrintPart,
  type Sport,
} from "@/components/art/geometry";

export const metadata: Metadata = { title: "Preview · The alphabet" };

/**
 * The art component drawing the Alphabet board
 * (docs/ui-redesign/revamp/form-v2/screenshots/Alphabet.png): the families, one cut per sport,
 * the states, context, a day, a month and the bowl, with the board's own figures, so the two
 * can be compared section by section.
 */
const HOLDS: Record<(typeof FAMILIES)[number], string> = {
  strength: "Lifting",
  run: "Running · Walk · Hike",
  ride: "Cycling · Spin class",
  swim: "Swimming · Row · Paddle",
  mobility: "Mobility · Yoga",
  food: "Food",
  play: "Reserved: Climbing · Racket sports",
};
const CUTS = {
  open: "The lane opened at its end",
  peak: "A peak cut out",
  hub: "The wheel cut in four",
  oar: "Cut twice, as oars",
  blade: "Cut once, aslant, as a blade",
  arc: "An arc cut in",
  steps: "The side cut into steps",
  ball: "A ball punched out",
} as const;

/** September 2026 for the audit account, as the Progress board draws it. */
const S = (sport: Sport, said: string): CalendarEntry => ({ sport, said });
const SEPTEMBER: Record<number, CalendarEntry[]> = {
  1: [S("strength", "lifting 42 min")],
  2: [S("run", "run 3 km indoors")],
  4: [S("run", "run 3.1 km"), S("strength", "lifting 48 min")],
  5: [S("strength", "lifting 62 min")],
  6: [S("run", "run 4 km indoors"), S("strength", "lifting 55 min")],
  7: [S("strength", "lifting 70 min")],
  8: [S("strength", "lifting 54 min")],
  10: [S("run", "run 5 km indoors")],
  11: [S("run", "run 4 km"), S("strength", "lifting 60 min")],
  12: [S("strength", "lifting 62 min")],
  13: [S("strength", "lifting 55 min")],
  14: [S("ride", "ride 60 min indoors"), S("strength", "lifting 70 min")],
  15: [S("strength", "lifting 42 min")],
  18: [S("run", "run 2.7 km"), S("strength", "lifting 48 min")],
  19: [S("strength", "lifting 62 min")],
  20: [S("swim", "swim 800 m indoors"), S("strength", "lifting 55 min")],
  21: [S("strength", "lifting 70 min")],
  22: [S("strength", "lifting 54 min")],
  25: [S("run", "run 5 km"), S("swim", "swim 1,500 m"), S("strength", "lifting 60 min")],
  26: [
    S("swim", "swim 1,000 m indoors"),
    S("run", "run 4 km indoors"),
    S("swim", "swim 1,000 m indoors"),
    S("strength", "lifting 62 min"),
  ],
  27: [
    S("ride", "ride 30 min indoors"),
    S("ride", "ride 15 min indoors"),
    S("strength", "lifting 55 min"),
  ],
  28: [S("ride", "ride 25 km"), S("strength", "lifting 70 min")],
};

const DAYS: [PrintPart[], string][] = [
  [
    [
      { kind: "run", minutes: 30 },
      {
        kind: "strength",
        columns: [
          { sets: 3, done: 0 },
          { sets: 3, done: 0 },
          { sets: 3, done: 0, pair: true },
          { sets: 2, done: 0 },
        ],
      },
    ],
    "Today, Fri 11 Sept, to do: the run, then four arm exercises, the superset’s two closer.",
  ],
  [
    [
      { kind: "mobility", segments: 4, segmentsDone: 4, state: "done", modules: 3 },
      {
        kind: "strength",
        columns: [4, 3, 3, 2, 3, 2, 2].map((sets, i) => ({ sets, done: i === 0 ? 2 : 0 })),
      },
    ],
    "Upper A in progress: the warm-up done, the bench’s first two sets inked.",
  ],
  [
    [
      { kind: "run", minutes: 33, state: "done" },
      { kind: "swim", minutes: 30, state: "done" },
      {
        kind: "strength",
        columns: [
          { sets: 3, done: 3, warm: 1 },
          { sets: 3, done: 3 },
          { sets: 3, done: 3 },
        ],
      },
    ],
    "Fri 25 Sept, done, in the day’s order: a run, an open-water swim, and a lift with its warm-up in grey.",
  ],
];

const FORM_STATES: [Sport, string, { state?: FormState; segments?: number; done?: number }][] = [
  ["run", "A run to do", { state: "todo" }],
  ["run", "A run done", {}],
  ["ride", "A ride to do", { state: "todo" }],
  ["ride", "A ride done", {}],
  ["swim", "A swim to do", { state: "todo" }],
  ["swim", "A swim skipped", { state: "skipped" }],
  ["mobility", "Drills: 2 of 5", { segments: 5, done: 2 }],
  ["mobility", "Drills done", { segments: 5, done: 5 }],
];

const COLUMN_STATES: [PrintPart, string][] = [
  [{ kind: "strength", columns: [{ sets: 3, done: 0 }] }, "To do: thinned, with an edge"],
  [{ kind: "strength", columns: [{ sets: 3, done: 1 }] }, "In progress: from the bottom up"],
  [{ kind: "strength", columns: [{ sets: 3, done: 3 }] }, "Done: full pigment"],
  [{ kind: "strength", columns: [{ sets: 3, done: 3, warm: 1 }] }, "A warm-up: done, grey"],
  [{ kind: "strength", columns: [{ sets: 3, done: 0, skipped: true }] }, "Skipped: a dashed edge"],
];

function Swatch({
  sport,
  size,
  label,
  ...state
}: { sport: Sport; size: number; label: string } & {
  state?: FormState;
  segments?: number;
  done?: number;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <span className="grid aspect-square place-items-center bg-paper">
        <Art kind="mark" sport={sport} size={size} surface="paper" {...state} />
      </span>
      <span className="type-meta-small text-ink-2">{label}</span>
    </li>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12 flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="type-display">{title}</h2>
        {note && <p className="max-w-[61rem] type-body text-ink-2">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default function ArtPreviewPage() {
  return (
    <main className="mx-auto w-full max-w-[87.5rem] px-[var(--ov-gutter)] pt-[max(24px,env(safe-area-inset-top))] pb-16 lg:px-16">
      <h1 className="type-title">The alphabet</h1>
      <p className="mt-2 type-meta text-ink-2">
        How a print is made from what you logged, and how it grows with the app.
      </p>

      <Section
        title="Families"
        note="How the body moves gives the form and its pigment. A family holds every sport that moves that way."
      >
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4">
          {FAMILIES.map((family) => (
            <Swatch
              key={family}
              sport={family}
              size={family === "food" ? 64 : 56}
              label={`${FAMILY[family].family} · ${FAMILY[family].form} — ${HOLDS[family]}`}
            />
          ))}
        </ul>
      </Section>

      <Section
        title="One cut per sport"
        note="A sport the app adds later is its family’s form with one cut, never an addition: the paper shows through where the cut is."
      >
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-4">
          {VARIANTS.map((variant) => (
            <Swatch
              key={variant}
              sport={variant}
              size={48}
              label={`${VARIANT[variant].name} — ${CUTS[VARIANT[variant].cut]}`}
            />
          ))}
        </ul>
      </Section>

      <Section
        title="State"
        note="Thinned is to do, full is done, a dashed edge is skipped. To do keeps an edge of its full pigment."
      >
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-4">
          {COLUMN_STATES.map(([part, label]) => (
            <li key={label} className="flex flex-col gap-2">
              <Art
                kind="print"
                parts={[part]}
                module={18}
                className="aspect-square"
                fallback={{ width: 104, height: 104 }}
              />
              <span className="type-meta-small text-ink-2">{label}</span>
            </li>
          ))}
        </ul>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-4">
          {FORM_STATES.map(([sport, label, state]) => (
            <Swatch key={label} sport={sport} size={44} label={label} {...state} />
          ))}
        </ul>
      </Section>

      <Section
        title="Context"
        note="Segments are its structure (sets, intervals, laps, drills); size is how long, in modules: a run’s track grows a module for every 20 minutes."
      >
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-4">
          <Swatch sport="run" size={44} label="Intervals" segments={4} />
          <Swatch sport="ride" size={44} label="Intervals" segments={4} />
          <Swatch sport="swim" size={44} label="Laps" segments={4} />
        </ul>
        <ul className="grid max-w-[45rem] grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4">
          {[20, 40, 60].map((minutes) => (
            <li key={minutes} className="flex flex-col gap-2">
              <Art
                kind="print"
                parts={[{ kind: "run", minutes, state: "done" }]}
                className="h-[104px]"
                fallback={{ width: 220, height: 104 }}
              />
              <span className="type-meta-small text-ink-2">
                {minutes} minutes: a track {trackModules(minutes)} modules long
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="A day"
        note="Its parts stand in the order of the rows under it, the whole centred on its paper; what is owed is thinned and inks as it is done."
      >
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-6">
          {DAYS.map(([parts, label]) => (
            <li key={label} className="flex flex-col gap-2">
              <Art
                kind="print"
                parts={parts}
                label={label}
                className="h-[190px]"
                fallback={{ width: 400, height: 190 }}
              />
              <span className="type-meta-small text-ink-2">{label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="A month">
        <div className="grid max-w-[60rem] grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] items-start gap-10">
          <Art kind="month" month="2026-09" days={SEPTEMBER} today={29} cellHeight={54} />
          <Art kind="month" month="2026-09" days={SEPTEMBER} today={29} cellHeight={56} dates />
        </div>
      </Section>

      <Section
        title="The bowl"
        note="The bowl is the day’s target. Each meal is a layer, by area. Past the target the food heaps over the rim as one symmetric mound."
      >
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] items-start gap-6">
          <li className="flex flex-col gap-2">
            <Art kind="bowl" meals={[{ kcal: 445 }, { kcal: 647.5 }, { kcal: 60 }]} target={2300} />
            <span className="type-meta-small text-ink-2">
              Under: 1,152.5 kcal of a 2,300 target.
            </span>
          </li>
          <li className="flex flex-col gap-2">
            <Art
              kind="bowl"
              meals={[{ kcal: 445 }, { kcal: 647.5 }, { kcal: 60 }, { kcal: 1383.5 }]}
              target={2300}
            />
            <span className="type-meta-small text-ink-2">
              Over: 2,536 kcal, the heap above the rim.
            </span>
          </li>
          <li className="flex flex-col gap-2">
            <Art kind="bowl" meals={[{ kcal: 1 }, { kcal: 1 }]} target={1} maxRadius={60} />
            <span className="type-meta-small text-ink-2">
              The limit: at twice the target the heap closes the circle.
            </span>
          </li>
          <li className="flex flex-col gap-2">
            <Art
              kind="bowl"
              meals={[{ kcal: 445 }, { kcal: 647.5 }, { kcal: 300, pending: true }]}
              target={2300}
            />
            <span className="type-meta-small text-ink-2">
              A portion being added: thinned, its top edge full.
            </span>
          </li>
        </ul>
      </Section>
    </main>
  );
}
