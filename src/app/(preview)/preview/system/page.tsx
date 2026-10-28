import type { Metadata } from "next";

export const metadata: Metadata = { title: "Preview · The system" };

/**
 * Form v2's tokens as the app draws them: the type ramp's roles, the interface's colours, the
 * prints' paper and pigments, and the radii. The samples are the System board's
 * (docs/ui-redesign/revamp/form-v2/screenshots/System.png), so the two can be laid side by side.
 */
const TYPE: { role: string; spec: string; className: string; sample: string }[] = [
  // One face, Host Grotesk, for every role (DESIGN.md, The One Voice Rule).
  {
    role: "Title",
    spec: "700 · 30/1.12 (28 under 360 pt)",
    className: "type-title",
    sample: "Progress",
  },
  {
    role: "Fact",
    spec: "600 · 20/1.3, ink 2",
    className: "type-fact text-ink-2",
    sample: "19 – 25 Oct",
  },
  {
    role: "Display",
    spec: "700 · 30/1.12",
    className: "type-display",
    sample: "Barbell bench press",
  },
  { role: "Sheet title", spec: "700 · 24/1.15", className: "type-sheet-title", sample: "Why" },
  { role: "Section", spec: "650 · 20/1.25", className: "type-section", sample: "Programmes" },
  { role: "Figure XL", spec: "600 · 56", className: "type-figure-xl", sample: "1,152.5" },
  { role: "Entry", spec: "600 · 42", className: "type-entry", sample: "62.5 × 3 @ 2" },
  { role: "Log", spec: "600 · 32", className: "type-log", sample: "60 × 4 @ 2" },
  { role: "Figure L", spec: "600 · 26", className: "type-figure-l", sample: "77.5" },
  {
    role: "Figure",
    spec: "600 · 20",
    className: "type-figure",
    sample: "6:06 /km · 77.5 kg · 2:14",
  },
  { role: "Figure S", spec: "600 · 17", className: "type-figure-s", sample: "2:14" },
  {
    role: "Heading",
    spec: "600 · 17/1.3",
    className: "type-heading",
    sample: "Set 3 · Waiting for you",
  },
  {
    role: "Body",
    spec: "450 · 16/1.45",
    className: "type-body",
    sample: "Choose a load leaving three reps in reserve; record what you used.",
  },
  {
    role: "Meta",
    spec: "450 · 15/1.4",
    className: "type-meta text-ink-2",
    sample: "4 × 3–5 @ 2 RIR · 3–4 min",
  },
  {
    role: "Meta small",
    spec: "450 · 14/1.35",
    className: "type-meta-small text-ink-2",
    sample: "Milk · Morning dry fruits",
  },
  {
    role: "Caption",
    spec: "600 · 13/1.3",
    className: "type-caption text-ink-2",
    sample: "Waiting for you",
  },
  {
    role: "Button",
    spec: "600 · 17/1",
    className: "type-button",
    sample: "Start workout",
  },
  {
    role: "Tab",
    spec: "600 · 13 (12 under 360 pt)",
    className: "type-tab",
    sample: "Today · Training · Food",
  },
  {
    role: "Print label",
    spec: "600 · 12",
    className: "type-print-label",
    sample: "Lifting",
  },
];

const INTERFACE = [
  ["Ground", "bg-ground", "The page, a pale grey; what a card holds steps back to it"],
  ["Panel", "bg-panel", "Every card, list, sheet and the tab bar"],
  ["Surface", "bg-surface", "Tiles, trays, notes, a waiting button"],
  ["Control surface", "bg-surface-control", "Steppers and tonal buttons; lifted in dark"],
  [
    "Control surface on a surface",
    "bg-surface-control-on-surface",
    "Tonal and round buttons on a card",
  ],
  ["Surface 2", "bg-surface-2", "Pressed, the switch's off track, a tray or a wait on a card"],
  ["Ink", "bg-ink", "Text, figures, the main button, whatever is chosen"],
  ["Ink 2", "bg-ink-2", "Secondary text, suggested values, captions"],
  ["Control", "bg-control", "Field and outline borders, an empty RIR"],
  ["Hair", "bg-hair", "Row dividers, the tab bar's edge"],
  ["Paper", "bg-paper", "What every print is made on"],
] as const;

const PIGMENTS = [
  ["Load", "bg-print-strength", "bg-print-strength-todo"],
  ["On foot", "bg-print-run", "bg-print-run-todo"],
  ["On wheels", "bg-print-ride", "bg-print-ride-todo"],
  ["In water", "bg-print-swim", "bg-print-swim-todo"],
  ["Practice", "bg-print-mobility", "bg-print-mobility-todo"],
  ["Food", "bg-print-food", "bg-print-food-todo"],
  ["Play", "bg-print-play", "bg-print-play-todo"],
] as const;

const RADII = [
  ["0", "rounded-print", "prints"],
  ["6", "rounded-checkbox", "checkbox"],
  ["8", "rounded-tag", "tag"],
  ["12", "rounded-key", "key"],
  ["14", "rounded-control", "field, tile, note"],
  ["20", "rounded-card", "card"],
  ["18", "rounded-rest-pill", "rest pill"],
  ["24", "rounded-sheet", "sheet"],
  ["Full", "rounded-full", "button, round button, avatar"],
] as const;

export default function SystemPreviewPage() {
  return (
    <main className="mx-auto w-full max-w-[40rem] px-[var(--ov-gutter)] pt-[max(20px,env(safe-area-inset-top))] pb-10">
      <h1 className="type-title">The system</h1>
      <p className="mt-1 type-meta text-ink-2">
        Black and white; every colour is printed by what you logged.
      </p>

      <h2 className="mt-6 type-caption text-ink-2">Type</h2>
      <ul>
        {TYPE.map((t) => (
          <li key={t.role} className="border-b border-hair py-3">
            <p className="type-caption text-ink-2">
              {t.role} <span className="font-medium">· {t.spec}</span>
            </p>
            <p className={`mt-1 [overflow-wrap:break-word] ${t.className}`}>{t.sample}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 type-caption text-ink-2">Colour</h2>
      <ul>
        {INTERFACE.map(([name, swatch, use]) => (
          <li key={name} className="flex items-center gap-3 border-b border-hair py-2">
            <span className={`size-10 shrink-0 rounded-key border border-hair ${swatch}`} />
            <span className="min-w-0">
              <span className="block type-heading">{name}</span>
              <span className="block type-meta-small text-ink-2">{use}</span>
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 type-caption text-ink-2">Pigments on paper: to do, done</h2>
      <ul className="mt-2 grid grid-cols-2 gap-px bg-hair">
        {PIGMENTS.map(([family, done, todo]) => (
          <li key={family} className="flex items-center gap-2 bg-paper p-3">
            <span className={`size-7 border-[1.5px] border-current ${todo}`} />
            <span className={`size-7 ${done}`} />
            <span className="type-caption text-print-ink">{family}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 type-caption text-ink-2">Radii</h2>
      <ul className="mt-2 flex flex-wrap gap-4">
        {RADII.map(([pt, radius, use]) => (
          <li key={pt} className="flex flex-col items-center gap-1">
            <span className={`size-12 border-[1.5px] border-ink ${radius}`} />
            <span className="type-caption figures">{pt}</span>
            <span className="type-print-label text-ink-2">{use}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 type-caption text-ink-2">Selection and focus</h2>
      <p className="mt-2 type-body">
        Selected text is ink: <span className="bg-ink px-1 text-on-ink">62.5 kg × 3 @ 2</span>
      </p>
      <button
        type="button"
        className="mt-3 h-[var(--ov-button)] w-full rounded-control bg-ink px-5 type-button text-on-ink"
      >
        Start workout
      </button>
    </main>
  );
}
