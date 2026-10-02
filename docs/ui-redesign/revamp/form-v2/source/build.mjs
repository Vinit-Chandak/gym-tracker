// Writes Form v2's artboards and canvas index to ../canvas, and its tokens to ../tokens.
// Usage: node docs/ui-redesign/revamp/form-v2/source/build.mjs
// The tall boards take their heights from heights.json (measured by render.mjs --measure).
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { page } from "./lib.mjs";
import * as m from "./form.mjs";
import { PAL, PIG } from "./art.mjs";
import { systemSheet, SW } from "./sheet.mjs";
import { largeLog, LW } from "./large.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.resolve(HERE, "..", "canvas");
const TOKENS_OUT = path.resolve(HERE, "..", "tokens");
const HEIGHTS = JSON.parse(readFileSync(path.join(HERE, "heights.json"), "utf8"));
mkdirSync(OUT, { recursive: true });
mkdirSync(TOKENS_OUT, { recursive: true });

const boards = {};
const order = [];
function add(file, { title, html, x, y, w, h, interactive = false }) {
  writeFileSync(path.join(OUT, file), html);
  boards[file] = {
    x,
    y,
    w,
    h,
    title,
    page: "form",
    ...(interactive ? { is_interactive: true } : {}),
  };
  order.push(file);
}

const PH = 874,
  GAP = 80,
  ROW = 120;
const col = (i) => i * (402 + GAP);
const tl = m.TOKENS.light,
  td = m.TOKENS.dark,
  DV = m.DEVICES,
  d = DV.d402;

const screen = (file, title, body, dv, x, y, { t = tl, extraCss = "", h = null } = {}) => {
  const hh = h || dv.H;
  const css = m.css(t) + (extraCss ? "\n" + extraCss : "");
  add(file, {
    title,
    html: page({ title, fonts: m.FONTS.href, css, body, w: dv.W, h: hh }),
    x,
    y,
    w: dv.W,
    h: hh,
    interactive: true,
  });
  return hh;
};
const board = (file, title, body, w, x, y, fallback) => {
  const h = HEIGHTS[file] || fallback;
  add(file, {
    title,
    html: page({ title, fonts: m.FONTS.href, css: m.css(tl), body, w, h }),
    x,
    y,
    w,
    h,
  });
  return h;
};

// Row 1: the screens at 402 × 874.
screen("Form-Today-Light.dc.html", "Form · Today · light", m.todayScreen(tl, d), d, col(0), 0);
screen(
  "Form-Workout-Light.dc.html",
  "Form · The workout, grouped by state · light",
  m.workoutScreen(tl, d),
  d,
  col(1),
  0,
);
screen("Form-Log-Light.dc.html", "Form · Logging a set · light", m.logScreen(tl, d), d, col(2), 0);
screen(
  "Form-Why.dc.html",
  "Form · Why keep 62.5 kg: the suggestion, explained",
  m.whySheet(tl, d),
  d,
  col(3),
  0,
);
screen(
  "Form-Workout-Coach.dc.html",
  "Form · The workout the coach planned (Lower A, from the coach-plan test)",
  m.workoutScreen(tl, d, { coach: true }),
  d,
  col(4),
  0,
);
screen(
  "Form-Progress-Light.dc.html",
  "Form · Progress · light",
  m.progressScreen(tl, d),
  d,
  col(5),
  0,
);
screen("Form-Food-Light.dc.html", "Form · Food · light", m.foodScreen(tl, d), d, col(6), 0);
board(
  "Form-About.dc.html",
  "Form · How the art is made, and how it holds up",
  m.aboutBoard(),
  m.AW,
  col(7),
  0,
  1700,
);

// Row 2: dark, the signature moment, and the coach and 200% boards.
const y2 = PH + ROW;
screen("Form-Today-Dark.dc.html", "Form · Today · dark", m.todayScreen(td, d), d, col(0), y2, {
  t: td,
});
screen(
  "Form-Log-Dark.dc.html",
  "Form · Logging a set · dark, RIR chosen",
  m.logScreen(td, d),
  d,
  col(1),
  y2,
  { t: td },
);
screen(
  "Form-Moment.dc.html",
  "Form · Signature: a set is inked",
  m.momentScreen(tl),
  d,
  col(2),
  y2,
  { extraCss: m.momentCss(tl) },
);
screen(
  "Form-Moment-Reduced.dc.html",
  "Form · Signature, reduced motion",
  m.momentScreen(tl, { reduced: true }),
  d,
  col(3),
  y2,
  { extraCss: m.momentCss(tl, { reduced: true }) },
);
const coachH = board(
  "Form-Coach.dc.html",
  "Form · Coach notes: lengths, states and where they go",
  m.coachBoard(),
  m.CW,
  col(4),
  y2,
  2200,
);
const largeH = board(
  "Form-Log-Large.dc.html",
  "Form · Logging a set at 200% text, the whole scroll: the entry first",
  largeLog(),
  LW,
  col(5),
  y2,
  2200,
);
screen(
  "Form-Today-Coach.dc.html",
  "Form · Today with the coach’s status: the plan folds to one line",
  m.todayScreen(tl, d, { coach: m.TODAY_COACH }),
  d,
  col(6),
  y2,
);

// Row 3: every size.
const y3 = 2 * (PH + ROW);
let x = 0,
  row3H = 0;
for (const [file, title, body, dv] of [
  [
    "Form-Today-375.dc.html",
    "Form · Today at 375 × 667: no home indicator, the plan one tap away",
    m.todayScreen(tl, DV.d375),
    DV.d375,
  ],
  [
    "Form-Log-Pounds-375.dc.html",
    "Form · Logging in pounds at 375 × 667: 140 lb, from the repository’s pounds audit",
    m.logScreen(tl, DV.d375, { who: "pounds" }),
    DV.d375,
  ],
  ["Form-Today-440.dc.html", "Form · Today at 440 × 956", m.todayScreen(tl, DV.d440), DV.d440],
  [
    "Form-Workout-440.dc.html",
    "Form · The workout at 440 × 956",
    m.workoutScreen(tl, DV.d440),
    DV.d440,
  ],
]) {
  screen(file, title, body, dv, x, y3);
  x += dv.W + GAP;
  row3H = Math.max(row3H, dv.H);
}

// Row 4: 320 × 568 (Today as it is, logging and food as whole scrolls), then the alphabet.
const y4 = Math.max(y3 + row3H, y2 + Math.max(coachH, largeH)) + ROW;
screen(
  "Form-Today-320.dc.html",
  "Form · Today at 320 × 568: the print gives way, the plan folds",
  m.todayScreen(tl, DV.d320),
  DV.d320,
  0,
  y4,
);
const logH = screen(
  "Form-Log-320.dc.html",
  "Form · Logging in pounds at 320 × 568, the whole scroll: steppers stack, RIR takes two rows",
  m.logWhole(tl, DV.d320, { who: "pounds" }),
  DV.d320,
  320 + GAP,
  y4,
  { h: HEIGHTS["Form-Log-320.dc.html"] || 1100 },
);
const foodH = screen(
  "Form-Food-320.dc.html",
  "Form · Food at 320 × 568, the whole scroll: the days scroll, opened at today",
  m.foodScreen(tl, DV.d320, { whole: true }),
  DV.d320,
  2 * (320 + GAP),
  y4,
  { h: HEIGHTS["Form-Food-320.dc.html"] || 1500 },
);
const alphaH = board(
  "Form-Alphabet.dc.html",
  "Form · The alphabet: how the art grows with the app",
  m.alphabetBoard(),
  m.ABW,
  3 * (320 + GAP),
  y4,
  2600,
);

// The system sheet.
const y5 = y4 + Math.max(DV.d320.H, logH, foodH, alphaH) + ROW;
board("Form-System.dc.html", "Form · System sheet", systemSheet(m.kit()), SW, 0, y5, 6200);

const canvas = {
  v: 3,
  createdOnFiles: { v: 1, at: "2026-10-01T05:49:17Z" },
  title: "Overload revamp: Form v2",
  launch: { view: "canvas", page: "form" },
  pages: [{ id: "form", name: "Form (the art is your training)" }],
  boards,
  order,
  notes: {
    form_title: {
      x: 0,
      y: -300,
      text: "Form — the art is your training. Black and white; every colour is printed by what you did",
      kind: "title1",
      maxW: 1848,
      page: "form",
    },
  },
  designSystems: [],
};
writeFileSync(path.join(OUT, "canvas.json"), JSON.stringify(canvas, null, 2));

// ---------- tokens ----------
// The same values the boards are drawn with, as JSON and as CSS custom properties.
const kit = m.kit();
const COLOUR_KEYS = [
  "ground",
  "surface",
  "surface2",
  "ink",
  "ink2",
  "control",
  "hair",
  "onInk",
  "onInk2",
  "paper",
  "paperLabel",
  "printInk",
  "ultra",
  "onUltra",
  "onUltra2",
  "ultraT",
  "lift",
  "run",
  "ride",
  "swim",
  "mob",
  "food",
  "onFood",
  "scrim",
];
const pick = (t) => Object.fromEntries(COLOUR_KEYS.map((k) => [k, t[k]]));
const plain = (str) => String(str).replace(/<[^>]+>/g, "");
const tokens = {
  name: "Form v2",
  source: "Generated by source/build.mjs from source/form.mjs and source/art.mjs",
  fonts: {
    href: m.FONTS.href,
    display: m.FONTS.display,
    text: m.FONTS.text,
    figures: "font-variant-numeric: tabular-nums lining-nums",
  },
  colour: { light: pick(tl), dark: pick(td) },
  print: {
    light: PAL.light,
    dark: PAL.dark,
    pigments: PIG,
    families: {
      load: "slab",
      onFoot: "disc",
      onWheels: "dome",
      inWater: "wave",
      practice: "quarter disc",
      food: "bowl",
      play: "triangle (reserved)",
    },
  },
  type: kit.typeScale.map(({ name, spec, sample }) => ({ name, spec, sample: plain(sample) })),
  spacing: kit.spacing,
  radii: Object.fromEntries(kit.radii.map(([px, use]) => [use, px])),
  elevation: { strip: tl.float, sheetScrim: { light: tl.scrim, dark: td.scrim } },
  motion: kit.motionSpec.map(([name, timing, use]) => ({ name, timing, use })),
  layout: {
    devices: DV,
    gutter: "16 pt under 360 pt wide, else 20",
    tabBar: "4 + 50 pt of targets + 20 pt above a home indicator, 8 without one",
    targetsMin: 44,
    entryTextMin: 16,
    setTileMin: 74,
  },
};
writeFileSync(path.join(TOKENS_OUT, "tokens.json"), JSON.stringify(tokens, null, 2) + "\n");

const cssName = (k) => k.replace(/[A-Z0-9]/g, (c) => "-" + c.toLowerCase());
const vars = (obj, prefix, indent = "  ") =>
  Object.entries(obj)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => `${indent}--${prefix}${cssName(k)}: ${v};`)
    .join("\n");
const printVars = (P) =>
  [
    `  --print-paper: ${P.paper};`,
    `  --print-ink: ${P.ink};`,
    `  --print-label: ${P.label};`,
    `  --print-dot: ${P.dot};`,
    vars(P.col, "print-"),
    vars(Object.fromEntries(Object.entries(P.tint).map(([k, v]) => [k + "Todo", v])), "print-"),
  ].join("\n");
const css = `/* Form v2 tokens. Generated by source/build.mjs from source/form.mjs and source/art.mjs:
   edit those and rebuild rather than this file. Fonts: ${m.FONTS.href} */
:root {
  color-scheme: light dark;
  --font-display: ${m.FONTS.display};
  --font-text: ${m.FONTS.text};
${vars(pick(tl), "form-")}
${printVars(PAL.light)}
${kit.radii.map(([px, use]) => `  --radius-${cssName(use.split(",")[0].trim().replace(/\s+/g, "-"))}: ${px}px;`).join("\n")}
${kit.spacing.map((v) => `  --space-${v}: ${v}px;`).join("\n")}
  --shadow-strip: ${tl.float};
  --duration-press: 120ms;
  --duration-ink: 420ms;
  --duration-swap-out: 80ms;
  --duration-swap-in: 120ms;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-ink: cubic-bezier(0.65, 0, 0.35, 1);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${vars(pick(td), "form-", "    ")}
${printVars(PAL.dark)
  .split("\n")
  .map((l) => "  " + l)
  .join("\n")}
  }
}
:root[data-theme="dark"] {
${vars(pick(td), "form-")}
${printVars(PAL.dark)}
}
`;
writeFileSync(path.join(TOKENS_OUT, "tokens.css"), css);

console.log("wrote", order.length, "artboards, canvas.json and tokens");
