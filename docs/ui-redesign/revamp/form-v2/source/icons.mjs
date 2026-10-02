// Form's action glyphs: a 24-unit grid, a 2.0 stroke, round caps and joins. The destination icons
// (drawn from the print forms) live in form.mjs; the sports are the print marks themselves.
import { svg } from "./lib.mjs";

const dot = (x, y, r = 1.4) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;

const GLYPHS = {
  play: `<path d="M8.5 6.2v11.6a.7.7 0 0 0 1.1.6l9-5.8a.7.7 0 0 0 0-1.2l-9-5.8a.7.7 0 0 0-1.1.6z"/>`,
  more: `${dot(5.5, 12, 1.6)}${dot(12, 12, 1.6)}${dot(18.5, 12, 1.6)}`,
  pin: `<path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>`,
  chevronRight: `<path d="M9.5 5.5L16 12l-6.5 6.5"/>`,
  chevronLeft: `<path d="M14.5 5.5L8 12l6.5 6.5"/>`,
  chevronDown: `<path d="M5.5 9.5L12 16l6.5-6.5"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  minus: `<path d="M5 12h14"/>`,
  check: `<path d="M5 12.5l4.5 4.5L19 7.5"/>`,
  close: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
  timer: `<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.8M9.5 3h5"/>`,
  stop: `<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>`,
  sliders: `<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>`,
  info: `<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/>${dot(12, 7.8, 1.25)}`,
  history: `<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5V8H8"/><path d="M12 8.5V12l2.5 1.5"/>`,
  cue: `<rect x="4.5" y="4" width="15" height="16" rx="3"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>`,
  flag: `<path d="M6 21V4"/><path d="M6 4.5h11l-2.5 4 2.5 4H6"/>`,
  table: `<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 10h17M3.5 14.5h17M10 5v14"/>`,
  calendar: `<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>`,
  star: `<path d="M12 4.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L12 16.3l-4.6 2.4.9-5.1L4.5 10l5.2-.8z"/>`,
  book: `<path d="M6 4.5h10.5a2 2 0 0 1 2 2v13H8a2 2 0 0 1-2-2z"/><path d="M6 17.5a2 2 0 0 1 2-2h10.5"/>`,
  target: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>${dot(12, 12, 1.3)}`,
  search: `<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>`,
  bolt: `<path d="M13 3.5L6 13h5.5L10.5 20.5 18 11h-5.5z"/>`,
  link: `<path d="M10 14l4-4"/><path d="M8.5 11.5l-2 2a3 3 0 0 0 4.2 4.2l2-2"/><path d="M15.5 12.5l2-2a3 3 0 0 0-4.2-4.2l-2 2"/>`,
  undo: `<path d="M8 8.5H15a4.5 4.5 0 0 1 0 9H9"/><path d="M10.5 5.5L7.5 8.5l3 3"/>`,
  edit: `<path d="M15.5 5.5l3 3L9 18H6v-3z"/>`,
  offline: `<path d="M7.5 18.5h9.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.3 9.4a4.6 4.6 0 0 0 1.2 9.1z"/><path d="M4 4l16 16"/>`,
};

export const STROKE = { sw: 2, cap: "round", join: "round" };

export function glyph(name, opts = {}) {
  const g = GLYPHS[name];
  if (!g) throw new Error(`no glyph ${name}`);
  return svg(g, { ...STROKE, ...opts });
}

// The order the system sheet shows them in.
export const ICON_ORDER = {
  destinations: ["today", "training", "food", "progress", "profile"],
  actions: [
    "play",
    "more",
    "pin",
    "chevronLeft",
    "chevronRight",
    "chevronDown",
    "plus",
    "minus",
    "check",
    "close",
    "timer",
    "stop",
    "sliders",
    "info",
    "history",
    "cue",
    "flag",
    "link",
    "undo",
    "edit",
    "table",
    "calendar",
    "star",
    "book",
    "target",
    "search",
    "bolt",
    "offline",
  ],
  sports: ["lift", "run", "ride", "swim"],
};
