import type { CSSProperties, ReactNode, SVGProps } from "react";

import type { ExerciseModality, GymKind } from "@/domain/types";
import { cn } from "@/lib/utils";

/**
 * Form v2's glyphs (DESIGN.md, Shapes): a 24-unit grid, a 2.0 stroke, round caps and joins, ink
 * only. Ported from the design's generator (docs/ui-redesign/revamp/form-v2/source/icons.mjs and
 * the destination icons in kit.mjs). The five destinations are drawn from the first print forms,
 * outlined, and filled where you are. Equipment and where a run, ride or swim happened are
 * glyphs too, so a meta line can say free weights, treadmill or open water without a word; each
 * keeps its name for screen readers.
 */

const dot = (x: number, y: number, r = 1.4, key?: string) => (
  <circle key={key} cx={x} cy={y} r={r} fill="currentColor" stroke="none" />
);

const GLYPHS = {
  play: <path d="M8.5 6.2v11.6a.7.7 0 0 0 1.1.6l9-5.8a.7.7 0 0 0 0-1.2l-9-5.8a.7.7 0 0 0-1.1.6z" />,
  more: [dot(5.5, 12, 1.6, "a"), dot(12, 12, 1.6, "b"), dot(18.5, 12, 1.6, "c")],
  pin: [
    <path key="a" d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z" />,
    <circle key="b" cx="12" cy="10" r="2.3" />,
  ],
  chevronRight: <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  chevronLeft: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  chevronDown: <path d="M5.5 9.5L12 16l6.5-6.5" />,
  chevronUp: <path d="M5.5 14.5L12 8l6.5 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  timer: [<circle key="a" cx="12" cy="13.5" r="7.5" />, <path key="b" d="M12 13.5V9.8M9.5 3h5" />],
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />,
  sliders: [
    <path key="a" d="M4 8h9M17 8h3M4 16h3M11 16h9" />,
    <circle key="b" cx="15" cy="8" r="2" />,
    <circle key="c" cx="9" cy="16" r="2" />,
  ],
  // Filters: a funnel, so it is never the sliders of Set options.
  filter: <path d="M4 5.5h16l-6.2 7.3v5.4l-3.6 2.3v-7.7z" />,
  info: [
    <circle key="a" cx="12" cy="12" r="8.5" />,
    <path key="b" d="M12 11v5.5" />,
    dot(12, 7.8, 1.25, "c"),
  ],
  history: [
    <path key="a" d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />,
    <path key="b" d="M4.5 4.5V8H8" />,
    <path key="c" d="M12 8.5V12l2.5 1.5" />,
  ],
  cue: [
    <rect key="a" x="4.5" y="4" width="15" height="16" rx="3" />,
    <path key="b" d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />,
  ],
  flag: [<path key="a" d="M6 21V4" />, <path key="b" d="M6 4.5h11l-2.5 4 2.5 4H6" />],
  table: [
    <rect key="a" x="3.5" y="5" width="17" height="14" rx="2.5" />,
    <path key="b" d="M3.5 10h17M3.5 14.5h17M10 5v14" />,
  ],
  calendar: [
    <rect key="a" x="4" y="5.5" width="16" height="14.5" rx="2.5" />,
    <path key="b" d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />,
  ],
  star: <path d="M12 4.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L12 16.3l-4.6 2.4.9-5.1L4.5 10l5.2-.8z" />,
  book: [
    <path key="a" d="M6 4.5h10.5a2 2 0 0 1 2 2v13H8a2 2 0 0 1-2-2z" />,
    <path key="b" d="M6 17.5a2 2 0 0 1 2-2h10.5" />,
  ],
  target: [
    <circle key="a" cx="12" cy="12" r="8.5" />,
    <circle key="b" cx="12" cy="12" r="4.5" />,
    dot(12, 12, 1.3, "c"),
  ],
  search: [<circle key="a" cx="10.5" cy="10.5" r="6" />, <path key="b" d="M15 15l5 5" />],
  bolt: <path d="M13 3.5L6 13h5.5L10.5 20.5 18 11h-5.5z" />,
  link: [
    <path key="a" d="M10 14l4-4" />,
    <path key="b" d="M8.5 11.5l-2 2a3 3 0 0 0 4.2 4.2l2-2" />,
    <path key="c" d="M15.5 12.5l2-2a3 3 0 0 0-4.2-4.2l-2 2" />,
  ],
  undo: [
    <path key="a" d="M8 8.5H15a4.5 4.5 0 0 1 0 9H9" />,
    <path key="b" d="M10.5 5.5L7.5 8.5l3 3" />,
  ],
  edit: <path d="M15.5 5.5l3 3L9 18H6v-3z" />,
  offline: [
    <path key="a" d="M7.5 18.5h9.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.3 9.4a4.6 4.6 0 0 0 1.2 9.1z" />,
    <path key="b" d="M4 4l16 16" />,
  ],
  send: [
    <path key="a" d="M4.5 12L19.5 5l-4.6 14.5-3.3-5.6z" />,
    <path key="b" d="M11.6 13.9L19.5 5" />,
  ],
  swap: [
    <path key="a" d="M6 8h12.5" />,
    <path key="b" d="M15.5 5l3 3-3 3" />,
    <path key="c" d="M18 16H5.5" />,
    <path key="d" d="M8.5 13l-3 3 3 3" />,
  ],
  skip: [<path key="a" d="M6 6.5l7.5 5.5L6 17.5z" />, <path key="b" d="M17.5 6.5v11" />],
  share: [<path key="a" d="M12 15V4.5M8 8.5l4-4 4 4" />, <path key="b" d="M5.5 12.5v7h13v-7" />],
  note: [
    <path key="a" d="M6 3.5h8.5l3.5 3.5v13.5H6z" />,
    <path key="b" d="M9 11h6M9 14.5h6M9 18h3.5" />,
  ],
  scale: [
    <rect key="a" x="3.5" y="4.5" width="17" height="15" rx="3.5" />,
    <path key="b" d="M8.2 10a4.2 4.2 0 0 1 7.6 0" />,
    <path key="c" d="M12 10l1.2-2.2" />,
  ],
  moon: <path d="M19 14.6A7.6 7.6 0 1 1 9.4 5a6.1 6.1 0 0 0 9.6 9.6z" />,
  sun: [
    <circle key="a" cx="12" cy="12" r="4" />,
    <path
      key="b"
      d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"
    />,
  ],
  ruler: [
    <rect key="a" x="3" y="8" width="18" height="8" rx="1.6" />,
    <path key="b" d="M7 8v3M10.5 8v4.2M14 8v3M17.5 8v4.2" />,
  ],
  contrast: [
    <circle key="a" cx="12" cy="12" r="8.5" />,
    <path key="b" d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />,
  ],
  globe: [
    <circle key="a" cx="12" cy="12" r="8.5" />,
    <path key="b" d="M3.5 12h17" />,
    <path
      key="c"
      d="M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5z"
    />,
  ],
  people: [
    <circle key="a" cx="9" cy="8.5" r="3.2" />,
    <path key="b" d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />,
    <circle key="c" cx="16.6" cy="9.4" r="2.5" />,
    <path key="d" d="M15.4 14.3a4.6 4.6 0 0 1 5.1 4.7" />,
  ],
  lock: [
    <rect key="a" x="5" y="10.5" width="14" height="10" rx="2.2" />,
    <path key="b" d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />,
  ],
  key: [
    <circle key="a" cx="8" cy="15.5" r="3.6" />,
    <path key="b" d="M10.6 13L19 4.5" />,
    <path key="c" d="M15.8 7.7l2.4 2.4M13.6 9.9l1.6 1.6" />,
  ],
  trash: <path d="M4.5 7h15M10 3.8h4M6.8 7l.9 13h8.6l.9-13" />,
  exit: [<path key="a" d="M10 4.5H5.5v15H10" />, <path key="b" d="M14.5 8l4 4-4 4M18.5 12H9.5" />],
  repeat: [
    <path key="a" d="M5 11V9.5a4 4 0 0 1 4-4h9.5" />,
    <path key="b" d="M15.5 2.5l3 3-3 3" />,
    <path key="c" d="M19 13v1.5a4 4 0 0 1-4 4H5.5" />,
    <path key="d" d="M8.5 21.5l-3-3 3-3" />,
  ],
  bell: [
    <path key="a" d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z" />,
    <path key="b" d="M10 20.5a2 2 0 0 0 4 0" />,
  ],
  // Free weights: a dumbbell, side on; nothing about it reads as the padlock.
  dumbbell: [
    <path key="a" d="M7.5 12h9" />,
    <rect key="b" x="4" y="7" width="3.5" height="10" rx="1" />,
    <rect key="c" x="16.5" y="7" width="3.5" height="10" rx="1" />,
    <path key="d" d="M2.5 10v4M21.5 10v4" />,
  ],
  // A password: a field of dots.
  password: [
    <rect key="a" x="3" y="7" width="18" height="10" rx="2.5" />,
    <path key="b" d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth={2.8} />,
  ],
  machine: [
    <rect key="a" x="6" y="3.5" width="10" height="17" rx="1.6" />,
    <path key="b" d="M6 8h10M6 12h10M6 16h10" />,
    <path key="c" d="M16 12h3.5" />,
  ],
  cable: [
    <path key="a" d="M4 4h16" />,
    <circle key="b" cx="12" cy="7.5" r="2.4" />,
    <path key="c" d="M12 9.9v7" />,
    <path key="d" d="M8.5 17.5h7" />,
  ],
  smith: [
    <path key="a" d="M5.5 3.5v17M18.5 3.5v17" />,
    <path key="b" d="M3 11h18" />,
    <path key="c" d="M8.2 8.5v5M15.8 8.5v5" />,
  ],
  bodyweight: [
    <path key="a" d="M4 3.5h16" />,
    <path key="b" d="M8 3.5l2.4 5.2M16 3.5l-2.4 5.2" />,
    <circle key="c" cx="12" cy="9.6" r="1.9" />,
    <path key="d" d="M12 11.5v5.5M12 17l-2.2 3.7M12 17l2.2 3.7" />,
  ],
  // Where a run, ride or swim happened.
  outdoor: [
    <path key="a" d="M3 18h18" />,
    <path key="b" d="M7.4 18a4.6 4.6 0 0 1 9.2 0" />,
    <path key="c" d="M12 9.6V7.4M7.6 12.2L6.1 10.7M16.4 12.2l1.5-1.5" />,
  ],
  treadmill: [
    <path key="a" d="M3.5 19.5h12.8a1.7 1.7 0 0 0 0-3.4H3.5a1.7 1.7 0 0 0 0 3.4z" />,
    <path key="b" d="M17.2 16.2L19.4 6.5h-4.2" />,
  ],
  // An indoor bike: a wheel held up by a stand from its hub, on the floor.
  trainer: [
    <path key="a" d="M3.5 20.5h17" />,
    <path key="b" d="M7 20.5L9.6 8.2" />,
    <path key="c" d="M6.8 7.6h5.4" />,
    <path key="d" d="M8.9 12.4h7.4" />,
    <path key="e" d="M16.3 20.5V5.2h3.2" />,
    <circle key="f" cx="16.3" cy="15.6" r="2.9" />,
  ],
  pool: [
    <path key="a" d="M3.5 6.5h17M3.5 17.5h17" />,
    <path
      key="b"
      d="M3.5 12c1.4 0 2.1-1.4 4.2-1.4s2.8 1.4 4.3 1.4 2.2-1.4 4.3-1.4 2.8 1.4 4.2 1.4"
    />,
  ],
  openwater: [
    <path
      key="a"
      d="M3.5 10c1.4 0 2.1-1.4 4.2-1.4s2.8 1.4 4.3 1.4 2.2-1.4 4.3-1.4 2.8 1.4 4.2 1.4"
    />,
    <path
      key="b"
      d="M3.5 15.5c1.4 0 2.1-1.4 4.2-1.4s2.8 1.4 4.3 1.4 2.2-1.4 4.3-1.4 2.8 1.4 4.2 1.4"
    />,
  ],
  indoor: [<path key="a" d="M4 11L12 4.5l8 6.5" />, <path key="b" d="M6 9.5v10h12v-10" />],
  distance: [
    <path key="a" d="M4.5 18.5c3.5 0 3.5-5.5 7-5.5s3.5-5.5 7-5.5" />,
    dot(4.5, 18.5, 1.6, "b"),
    dot(18.5, 7.5, 1.6, "c"),
  ],
  pace: [
    <circle key="a" cx="12" cy="13" r="7.5" />,
    <path key="b" d="M12 13l3.5-3.5" />,
    <path key="c" d="M10 3.5h4" />,
  ],
  rest: [<circle key="a" cx="12" cy="12" r="8.5" />, <path key="b" d="M12 7.5V12l3 2" />],
  // People.
  trophy: [
    <path key="a" d="M7.5 4.5h9v5a4.5 4.5 0 0 1-9 0z" />,
    <path key="b" d="M7.5 6.5H4.5a3 3 0 0 0 3 3.5M16.5 6.5h3a3 3 0 0 1-3 3.5" />,
    <path key="c" d="M12 14v3.5M8.5 20h7" />,
  ],
  scales: [
    <path key="a" d="M12 4v16M7.5 20h9M5 7.5h14" />,
    <path key="b" d="M5 7.5l-2.5 6a2.5 2.5 0 0 0 5 0z" />,
    <path key="c" d="M19 7.5l-2.5 6a2.5 2.5 0 0 0 5 0z" />,
  ],
  personPlus: [
    <circle key="a" cx="10" cy="8.5" r="3.5" />,
    <path key="b" d="M3.5 20a6.5 6.5 0 0 1 13 0" />,
    <path key="c" d="M19 8v6M16 11h6" />,
  ],
  arrowRight: <path d="M4.5 12h14.5M13.5 6.5L19 12l-5.5 5.5" />,
  // The coach's words, and the coach (or the app) still working.
  coach: <path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z" />,
  wait: <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />,
  warn: [
    <path key="a" d="M12 4l9 16H3z" />,
    <path key="b" d="M12 10v4.5" />,
    <circle key="c" cx="12" cy="17.3" r="1" fill="currentColor" stroke="none" />,
  ],
} satisfies Record<string, ReactNode>;

/** The destinations, drawn from the first forms; filled is where you are. */
const fill = (filled: boolean) => (filled ? "currentColor" : undefined);
const DESTINATIONS = {
  today: (filled: boolean) => [
    <circle key="a" cx="16" cy="11" r="5" fill={fill(filled)} />,
    <rect key="b" x="3.5" y="9" width="7" height="7" rx="0.6" fill={fill(filled)} />,
    <path key="c" d="M3 19.5h18" />,
  ],
  // The programme: three columns of two blocks, as tall as the other destinations.
  training: (filled: boolean) =>
    [3, 9.5, 16].flatMap((x) => [
      <rect key={`${x}a`} x={x} y="5.5" width="5" height="5.5" rx="0.6" fill={fill(filled)} />,
      <rect key={`${x}b`} x={x} y="13" width="5" height="5.5" rx="0.6" fill={fill(filled)} />,
    ]),
  // The bowl with its heap, as tall as the other destinations.
  food: (filled: boolean) => [
    <path key="a" d="M2.5 10.5h19a9.5 9 0 0 1-19 0z" fill={fill(filled)} />,
    <path key="b" d="M7 10.5a5 4.6 0 0 1 10 0" fill={fill(filled)} />,
  ],
  progress: (filled: boolean) => [
    <rect key="a" x="4" y="4" width="7" height="7" rx="0.6" fill={fill(filled)} />,
    <circle key="b" cx="16.5" cy="7.5" r="3.5" fill={fill(filled)} />,
    <circle key="c" cx="7.5" cy="16.5" r="3.5" fill={fill(filled)} />,
    <rect key="d" x="13" y="13" width="7" height="7" rx="0.6" fill={fill(filled)} />,
  ],
  profile: (filled: boolean) => [
    <circle key="a" cx="12" cy="8" r="4" fill={fill(filled)} />,
    <path key="b" d="M4.5 20.5a7.5 7.5 0 0 1 15 0z" fill={fill(filled)} />,
  ],
} satisfies Record<string, (filled: boolean) => ReactNode>;

export type GlyphName = keyof typeof GLYPHS | keyof typeof DESTINATIONS;
export type Destination = keyof typeof DESTINATIONS;

/** A gym is a place, so its pin, as on Today; outdoors and home keep their own glyphs. */
export function gymKindGlyph(kind: GymKind): GlyphName {
  return kind === "outdoor" ? "outdoor" : kind === "home" ? "indoor" : "pin";
}

/** Equipment as its glyph, from what the movement is done with (DESIGN.md, Shapes). */
export function modalityGlyph(modality: ExerciseModality | null | undefined): GlyphName | null {
  switch (modality) {
    case "barbell":
    case "dumbbell":
      return "dumbbell";
    case "cable":
      return "cable";
    case "machine":
    case "cardio":
      return "machine";
    case "smith_machine":
      return "smith";
    case "bodyweight":
    case "mobility":
      return "bodyweight";
    default:
      return null;
  }
}

/** What each glyph means, for a glyph that carries meaning on its own (DESIGN.md, Shapes). */
export const GLYPH_LABELS: Readonly<Record<GlyphName, string>> = {
  today: "Today",
  training: "Training",
  food: "Food",
  progress: "Progress",
  profile: "Profile",
  coach: "Coach",
  wait: "Working",
  warn: "Warning",
  play: "Start, resume",
  more: "More options",
  pin: "Gym",
  chevronLeft: "Back",
  chevronRight: "Open",
  chevronDown: "Choose",
  chevronUp: "Close up",
  plus: "Add, more",
  minus: "Less",
  check: "Saved, done",
  close: "Close",
  timer: "Timer",
  rest: "Rest",
  stop: "Stop",
  sliders: "Set options",
  filter: "Filters",
  info: "Why, help",
  history: "History",
  cue: "Technique",
  flag: "Finish",
  link: "Superset",
  undo: "Undo",
  edit: "Edit",
  table: "View values",
  calendar: "Calendar",
  star: "Save as meal",
  book: "My foods",
  target: "Targets",
  search: "Search",
  bolt: "Quick add",
  offline: "Offline",
  send: "Send",
  swap: "Substitute",
  skip: "Skip",
  share: "Share",
  note: "Notes",
  scale: "Body weight",
  moon: "Sleep, dark",
  sun: "Light",
  ruler: "Units",
  contrast: "Appearance",
  globe: "Time zone",
  people: "Friends",
  lock: "Privacy",
  key: "Coach access",
  trash: "Delete",
  exit: "Sign out",
  repeat: "Routines",
  bell: "Reminders",
  dumbbell: "Free weights",
  password: "Password",
  machine: "Machine",
  cable: "Cable",
  smith: "Smith machine",
  bodyweight: "Bodyweight",
  outdoor: "Outdoors",
  treadmill: "Treadmill",
  trainer: "Indoor bike",
  pool: "Pool",
  openwater: "Open water",
  indoor: "Indoors",
  distance: "Distance",
  pace: "Pace",
  trophy: "Leaderboard",
  scales: "Compare",
  personPlus: "Find people",
  arrowRight: "Moved",
};

export type GlyphProps = Omit<SVGProps<SVGSVGElement>, "children" | "ref"> & {
  name: GlyphName;
  /** In points. Without it the glyph takes its size from the surrounding CSS (1em by default). */
  size?: number;
  /** A destination's icon filled, where you are. */
  filled?: boolean;
  /** Names the glyph for screen readers when it carries meaning on its own. */
  label?: string;
};

/** One glyph. Unnamed glyphs are decoration and stay out of the accessibility tree. */
export function Glyph({
  name,
  size,
  filled = false,
  label,
  className,
  style,
  ...props
}: GlyphProps) {
  const inner =
    name in DESTINATIONS
      ? DESTINATIONS[name as Destination](filled)
      : GLYPHS[name as keyof typeof GLYPHS];
  const sized: CSSProperties | undefined =
    size === undefined ? undefined : { width: size, height: size };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={cn("block shrink-0", size === undefined && "size-[1em]", className)}
      style={{ ...sized, ...style }}
      {...props}
    >
      {inner}
    </svg>
  );
}
