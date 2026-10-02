// The read-me board: what changed after the notes on the last canvas, how to read this one, where
// its figures come from, and what the critiques found. The critique figures live in critique.json,
// written from the reviews (scratch reports, summarised in the form-v2 README).
import { readFileSync } from "node:fs";
import path from "node:path";
import { s } from "./lib.mjs";
import * as K from "./kit.mjs";
import { dayPrint } from "./art.mjs";

export const RW = 1400;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const CR = JSON.parse(readFileSync(path.join(HERE, "critique.json"), "utf8"));
const { txt, title } = K;
const L = K.TOKENS.light;
const PAD = 64,
  GAP = 24;
const H2 = (text, note = "") =>
  `<div style="${s({ display: "flex", "flex-direction": "column", gap: 6 })}"><h2 style="${title(32, { lh: 1 })}">${text}</h2>${note ? `<p style="${txt(16, 500, { color: L.ink2, "max-width": 1000, "line-height": 1.45 })}">${note}</p>` : ""}</div>`;
const section = (inner) =>
  `<section style="${s({ display: "flex", "flex-direction": "column", gap: 18 })}">${inner}</section>`;

// Each note on the last canvas, in its own words, and what this one does about it.
const NOTES = [
  [
    "Better art for runs, cycling and the other sports, and fix the alignment",
    "A new alphabet: block, stride, wheel, wave and fan on one module grid and one ground line, sized in whole modules, never overlapping. Every list row is led by a small copy of its part, in one mark column.",
    "Alphabet · Today · Progress",
  ],
  [
    "Keep the cycle and the workout timer minimal",
    "The cycle is seven squares. Rest is one pill: a dial that empties from twelve, in the session’s header and on the strip.",
    "Today · Workout · Log",
  ],
  [
    "Minimal text, nothing said twice",
    "Prints carry no words; the rows under them are their legend. State is ink, not words: no “To do”, “Done” or “2 of 4 sets” where the mark says it.",
    "Every screen",
  ],
  [
    "Revamp logging: not boxy, tabs for Log, Technique and History, the whole history, warm-ups faded",
    "A ledger, one row per set, inked when the server has it; the entry docked below it reads as its notation. History lists every session; warm-ups are grey. “Previous on this machine” is gone.",
    "Log · Technique · History · Exercise",
  ],
  [
    "The RIR grid is horrible: minus, a figure, plus",
    "RIR is a stepper like load and reps. It starts empty, with the target beside it, so nothing is pre-filled.",
    "Log · System",
  ],
  [
    "Equipment and outdoor or treadmill as icons",
    "Glyphs for free weights (a dumbbell), machine, cable, Smith machine and bodyweight; and for outdoors, treadmill, indoor bike, pool and open water. They lead meta lines and choices.",
    "Log · runs, rides, swims · Gyms · Add exercise",
  ],
  [
    "Start everything at the left edge",
    "One left edge on every screen: a 20-pt mark column, names 12 after it, no indents.",
    "Every list",
  ],
  [
    "Progress is congested: one month, several activities a day, tap for a scrolling calendar",
    "One month as a calendar: each day a link, its marks right under its date, +N past four; the totals under it name each sport; the calendar scrolls month after month; a day opens on its print.",
    "Progress · Calendar · Day",
  ],
  [
    "Less padding under the tab bar",
    "64 pt: 44-pt targets ending 4 clear of the home indicator.",
    "Every tab",
  ],
  [
    "Show an over-full cup without breaking its symmetry",
    "Past the target the food heaps above the rim as one symmetric mound; at twice the target it closes the circle.",
    "Food · Alphabet",
  ],
  [
    "More pages: the coach and the rest",
    "Thirty-odd new screens, from the AI coach and the programme it proposes to Friends, Gyms, the first run and every Progress section.",
    "Every page",
  ],
  [
    "Plan for the iOS and Android apps; text never runs off",
    "A board for both platforms, Android-size boards, typed entry beside the steppers, and the wrap and fit rules every screen follows.",
    "iOS and Android · Sizes",
  ],
  [
    "The weight chart’s vermilion point and the blue text selection",
    "Both are ink now: colour is only ever a print.",
    "System · Body",
  ],
];

export function readmeBoard({ pages: PAGES = [], boardCount = 0 } = {}) {
  const hero = dayPrint({
    w: RW - 2 * PAD,
    h: 220,
    paper: K.TOKENS.light.paper,
    parts: [
      {
        kind: "strength",
        columns: [
          { n: 3, done: 3 },
          { n: 3, done: 3 },
          { n: 3, done: 3, pair: true },
          { n: 2, done: 2 },
        ],
      },
      { kind: "run", minutes: 30, done: true },
      { kind: "ride", done: true },
      { kind: "swim", minutes: 30, done: true },
      { kind: "mobility", segments: 5, segDone: 5, done: true },
    ],
    ariaLabel: "A day in full ink: lifting, a run, a ride, a swim and the drills",
  });
  const notes = `<ul style="border-top:2px solid ${L.ink}">${NOTES.map(([n, d, w]) => `<li style="${s({ display: "grid", "grid-template-columns": "360px minmax(0,1fr) 240px", gap: 28, padding: "16px 0", "border-bottom": `1px solid ${L.hair}` })}"><span style="${txt(16, 700, { "line-height": 1.4 })}">${n}</span><span style="${txt(16, 500, { "line-height": 1.45 })}">${d}</span><span style="${txt(14, 600, { color: L.ink2 })}">${w}</span></li>`).join("")}</ul>`;
  const pages = PAGES.map(
    ([n, d]) =>
      `<li style="${s({ display: "flex", "flex-direction": "column", gap: 4, padding: "14px 0", "border-top": `2px solid ${L.ink}` })}"><span style="${txt(17, 700)}">${n}</span><span style="${txt(15, 500, { color: L.ink2, "line-height": 1.45 })}">${d}</span></li>`,
  ).join("");
  const sources = CR.sources
    .map(
      (x) =>
        `<li style="${s({ display: "flex", gap: 10 })}; ${txt(15, 500, { "line-height": 1.45 })}"><span style="${s({ width: 7, height: 7, background: L.ink, "margin-top": 8, "flex-shrink": 0 })}"></span><span>${x}</span></li>`,
    )
    .join("");
  const score = (label, v, note) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", gap: 4, padding: "16px 0", "border-top": `2px solid ${L.ink}` })}"><span style="${txt(14, 700, { color: L.ink2 })}">${label}</span><span style="${K.num(44)}">${v}</span><span style="${txt(14, 500, { color: L.ink2, "line-height": 1.4 })}">${note}</span></div>`;
  const critique = `<div style="${s({ display: "grid", "grid-template-columns": "repeat(4, minmax(0,1fr))", gap: GAP })}">${CR.scores.map(([l, v, n]) => score(l, v, n)).join("")}</div>
<div style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: 40, "margin-top": 8 })}"><div>${`<p style="${txt(15, 700)}">What the reviews found on the last canvas, and what changed</p>`}<ul style="${s({ display: "flex", "flex-direction": "column", gap: 8, "margin-top": 10 })}">${CR.fixed.map((x) => `<li style="${s({ display: "flex", gap: 10 })}; ${txt(15, 500, { "line-height": 1.45 })}"><span style="${s({ width: 7, height: 7, background: L.ink, "margin-top": 8, "flex-shrink": 0 })}"></span><span>${x}</span></li>`).join("")}</ul></div><div>${`<p style="${txt(15, 700)}">What the fresh review and the audit found on this canvas, and what changed</p>`}<ul style="${s({ display: "flex", "flex-direction": "column", gap: 8, "margin-top": 10 })}">${CR.fresh.map((x) => `<li style="${s({ display: "flex", gap: 10 })}; ${txt(15, 500, { "line-height": 1.45 })}"><span style="${s({ width: 7, height: 7, background: L.ink, "margin-top": 8, "flex-shrink": 0 })}"></span><span>${x}</span></li>`).join("")}</ul></div></div>`;
  return `<div style="${s({ width: RW, padding: PAD, background: L.ground, color: L.ink, "font-family": K.FONTS.text, display: "flex", "flex-direction": "column", gap: 56, "-webkit-font-smoothing": "antialiased" })}">
<header style="${s({ display: "flex", "flex-direction": "column", gap: 24 })}"><div style="${s({ display: "flex", "justify-content": "space-between", "align-items": "flex-end", gap: 24 })}"><div><h1 style="${title(72, { lh: 1 })}">Form v2, refined</h1><p style="${txt(19, 500, { color: L.ink2, "line-height": 1.45, "max-width": 900 })}; margin-top: 12px">The art is your training. The interface is black and white and stays out of the way; every colour is a print made from what was logged. This canvas redraws Form from scratch after your notes: a new alphabet, logging as a ledger, and the rest of the app in the same language.</p></div>${K.wordmark(L, 28)}</div>${K.printFrame(hero)}</header>
${section(`${H2("Your notes, and what changed")}${notes}`)}
${section(`${H2("Reading the canvas", `${boardCount} boards on ${PAGES.length} pages. Phone boards are 402 × 874 unless their name says otherwise, drawn at the size they will ship; each is a working page, with real buttons, links and labels.`)}<ul style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: GAP })}">${pages}</ul>`)}
${section(`${H2("Where the figures come from", "Every name and figure is the repository’s, and so is every interface string the app already has. Where a figure is worked out (a warm-up ramp, a pace, a total), it is worked out with the app’s own rule. Today follows the preview’s Friday; the session pages follow Upper A’s third cycle, by cycle because its test has no dates.")}<ul style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}">${sources}</ul>`)}
${section(`${H2("Critiques", CR.method)}${critique}`)}
</div>`;
}
