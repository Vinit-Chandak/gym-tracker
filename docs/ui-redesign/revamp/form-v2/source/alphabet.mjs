// The alphabet: how a print is made, and how it grows with the app. Drawn by art.mjs itself.
import { s } from "./lib.mjs";
import * as K from "./kit.mjs";
import {
  PAL,
  FAMILY,
  VARIANT,
  SLANT,
  form,
  dayPrint,
  monthPrint,
  bowlPrint,
  bowlFigure,
} from "./art.mjs";
import { september, food as F, foodOver } from "./data.mjs";

export const ABW = 1400;
const { txt, title } = K;
const L = K.TOKENS.light;
const P = PAL.light;
const PAD = 64,
  GAP = 24;
const H2 = (text, note = "") =>
  `<div style="${s({ display: "flex", "flex-direction": "column", gap: 6 })}"><h2 style="${title(32, { lh: 1 })}">${text}</h2>${note ? `<p style="${txt(16, 500, { color: L.ink2, "max-width": 980, "line-height": 1.45 })}">${note}</p>` : ""}</div>`;
const cap = (text) => `<p style="${txt(14, 700)}">${text}</p>`;
const sub = (text) =>
  `<p style="${txt(13, 500, { color: L.ink2, "line-height": 1.4 })}">${text}</p>`;
// a form alone on a square of paper
const swatch = (sport, size = 96, opts = {}, box = 140) =>
  `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" aria-hidden="true" style="display:block"><rect width="${box}" height="${box}" fill="${P.paper}"/>${form(sport, (box - size) / 2, (box - size) / 2 - 6, sport === "run" || VARIANT[sport]?.base === "run" ? size * 1.15 : size, size, { paper: P.paper, ...opts })}<rect x="${(box - size) / 2 - 6}" y="${box - (box - size) / 2 - 3}" width="${size + 12}" height="3" fill="${P.ink}"/></svg>`;
const section = (inner) =>
  `<section style="${s({ display: "flex", "flex-direction": "column", gap: 22 })}">${inner}</section>`;

function families() {
  const holds = {
    strength: "Lifting",
    run: "Running · Walk · Hike",
    ride: "Cycling · Spin class",
    swim: "Swimming · Row · Paddle",
    mobility: "Mobility · Yoga",
    food: "Food",
    play: "Reserved: Climbing · Racket sports",
  };
  const cells = Object.keys(FAMILY)
    .map(
      (k) =>
        `<li style="${s({ display: "flex", "flex-direction": "column", gap: 8, "min-width": 0 })}">${swatch(k, k === "food" ? 100 : 84)}${cap(`${FAMILY[k].family} · ${FAMILY[k].form}`)}${sub(`${holds[k]}<br>${P.col[k].toUpperCase()}`)}</li>`,
    )
    .join("");
  return section(
    `${H2("Families", "How the body moves gives the form and its pigment. A family holds every sport that moves that way; anything logged prints on day one as its family’s form.")}<ul style="${s({ display: "grid", "grid-template-columns": "repeat(7, minmax(0,1fr))", gap: 16 })}">${cells}</ul>`,
  );
}
function variants() {
  const cells = Object.entries(VARIANT)
    .map(
      ([k, v]) =>
        `<li style="${s({ display: "flex", "flex-direction": "column", gap: 8, "min-width": 0 })}">${swatch(k, 72, {}, 120)}${cap(v.name)}${sub({ open: "The stride, opened", peak: "A peak cut out", hub: "The wheel cut in four", oar: "Cut twice, as oars", single: "One crest", arc: "An arc cut in", steps: "The side cut into steps", ball: "A ball punched out" }[v.op])}</li>`,
    )
    .join("");
  return section(
    `${H2("One cut per sport", "A sport the app adds later is its family’s form with one cut, never an addition: the paper shows through where the cut is. A variant never touches the ground; that belongs to context.")}<ul style="${s({ display: "grid", "grid-template-columns": "repeat(8, minmax(0,1fr))", gap: 16 })}">${cells}</ul>`,
  );
}
function states() {
  const row = (k, label, opts) =>
    `<li style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}">${swatch(k, 64, opts, 104)}${sub(label)}</li>`;
  const block = (n, done, extra = {}) => {
    const box = 104,
      u = 18,
      g = 3;
    let out = "";
    for (let i = 0; i < n; i++) {
      const y = box - 22 - (i + 1) * u - i * g,
        x = (box - u) / 2;
      const st =
        extra.warm && i === 0 ? "warm" : extra.skipped ? "skipped" : i < done ? "done" : "todo";
      out +=
        st === "done"
          ? `<rect x="${x}" y="${y}" width="${u}" height="${u}" fill="${P.col.strength}"/>`
          : st === "warm"
            ? `<rect x="${x}" y="${y}" width="${u}" height="${u}" fill="${P.warm}"/>`
            : st === "skipped"
              ? `<rect x="${x + 0.9}" y="${y + 0.9}" width="${u - 1.8}" height="${u - 1.8}" fill="none" stroke="${P.col.strength}" stroke-width="1.8" stroke-dasharray="3 2.2"/>`
              : `<rect x="${x + 0.6}" y="${y + 0.6}" width="${u - 1.2}" height="${u - 1.2}" fill="${P.tint.strength}" stroke="${P.col.strength}" stroke-width="1.4"/>`;
    }
    return `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" aria-hidden="true" style="display:block"><rect width="${box}" height="${box}" fill="${P.paper}"/>${out}<rect x="22" y="${box - 22}" width="${box - 44}" height="3" fill="${P.ink}"/></svg>`;
  };
  const sets = [
    [block(3, 0), "To do: thinned, with an edge of the full pigment"],
    [block(3, 1), "In progress: done from the bottom up"],
    [block(3, 3), "Done: full pigment"],
    [block(3, 3, { warm: true }), "A warm-up: done, but not counted; grey"],
    [block(3, 0, { skipped: true }), "Skipped: a dashed edge"],
  ];
  return section(`${H2("State", "Three states, the same on every form: thinned is to do, full is done, a dashed edge is skipped. To do keeps an edge of its full pigment, so to do and done differ in more than lightness.")}
<ul style="${s({ display: "grid", "grid-template-columns": "repeat(5, minmax(0,1fr))", gap: 16 })}">${sets.map(([svg, l]) => `<li style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}">${svg}${sub(l)}</li>`).join("")}</ul>
<ul style="${s({ display: "grid", "grid-template-columns": "repeat(8, minmax(0,1fr))", gap: 16 })}">${row("run", "A run to do", { state: "todo" })}${row("run", "A run done", {})}${row("ride", "A ride to do", { state: "todo" })}${row("ride", "A ride done", {})}${row("swim", "A swim to do", { state: "todo" })}${row("swim", "A swim skipped", { state: "skipped" })}${row("mobility", "Drills: 2 of 5", { segments: 5, done: 2 })}${row("mobility", "Drills done", { segments: 5, done: 5 })}</ul>`);
}
function context() {
  const row = (k, label, opts, size = 64) =>
    `<li style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}">${swatch(k, size, opts, 104)}${sub(label)}</li>`;
  const runOf = (min) =>
    dayPrint({
      w: 220,
      h: 104,
      paper: P.paper,
      parts: [{ kind: "run", minutes: min, done: true }],
      ariaLabel: "",
    });
  return section(`${H2("Context", "Modifiers that mean the same on every form. A platform under it: indoors, on a machine, in a pool. Segments: its structure (sets, intervals, laps, drills). Size: how long, in whole modules.")}
<ul style="${s({ display: "grid", "grid-template-columns": "repeat(8, minmax(0,1fr))", gap: 16 })}">${row("run", "Outdoors", {})}${row("run", "Treadmill", { indoor: true })}${row("ride", "Outdoors", {})}${row("ride", "Indoor bike", { indoor: true })}${row("swim", "Open water", {})}${row("swim", "Pool", { indoor: true })}${row("run", "Intervals", { segments: 4 })}${row("ride", "Intervals", { segments: 4 })}</ul>
<div style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: 16, "max-width": 720 })}">${[15, 30, 45].map((m) => `<div style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}">${runOf(m)}${sub(`${m} minutes: the body grows a module for every 15`)}</div>`).join("")}</div>`);
}
// The module grid, drawn with its measures.
function grid() {
  const u = 40,
    g = 0.14 * u,
    colG = 0.34 * u,
    pairG = 0.14 * u,
    partG = u;
  const W = 820,
    H = 300,
    ground = 230,
    x0 = 60;
  let x = x0,
    art = "",
    marks = "";
  const cols = [3, 3, [3, 2]];
  const colAt = [];
  cols.forEach((c, i) => {
    const pair = Array.isArray(c);
    const list = pair ? c : [c];
    list.forEach((n, j) => {
      colAt.push(x);
      for (let k = 0; k < n; k++) {
        const y = ground - (k + 1) * u - k * g;
        art += `<rect x="${x + 0.6}" y="${y + 0.6}" width="${u - 1.2}" height="${u - 1.2}" fill="${P.tint.strength}" stroke="${P.col.strength}" stroke-width="1.6"/>`;
      }
      x += u;
      if (j < list.length - 1) x += pairG;
    });
    if (i < cols.length - 1) x += colG;
  });
  const strEnd = x;
  x += partG;
  const hm = 3,
    fh = hm * u + (hm - 1) * g,
    fw = hm * SLANT * u + 2 * u;
  art += form("run", x, ground - fh, fw, fh, { paper: P.paper, state: "todo", fill: true });
  const runX = x;
  const dim = (xa, xb, y, label, below = false) =>
    `<path d="M${xa} ${y}H${xb}M${xa} ${y - 5}V${y + 5}M${xb} ${y - 5}V${y + 5}" stroke="${L.ink}" stroke-width="1.2"/><text x="${(xa + xb) / 2}" y="${below ? y + 18 : y - 8}" text-anchor="middle" style="font-family:'Atkinson Hyperlegible Next',sans-serif;font-size:13px;font-weight:700;fill:${L.ink}">${label}</text>`;
  marks += dim(colAt[0], colAt[0] + u, ground + 26, "1 module", true);
  marks += dim(colAt[0] + u, colAt[1], 38, "0.34");
  marks += dim(colAt[2] + u, colAt[3], 38, "0.14, a pair");
  marks += dim(strEnd, runX, ground + 26, "1 module between parts", true);
  marks += `<path d="M${colAt[0] - 18} ${ground - u}V${ground - u - g}" stroke="${L.ink}" stroke-width="1.2"/><text x="${colAt[0] - 24}" y="${ground - u - 1}" text-anchor="end" style="font-family:'Atkinson Hyperlegible Next',sans-serif;font-size:13px;font-weight:700;fill:${L.ink}">0.14</text>`;
  marks += `<text x="${runX + fw + 14}" y="${ground - fh + 14}" style="font-family:'Atkinson Hyperlegible Next',sans-serif;font-size:13px;font-weight:700;fill:${L.ink}">3 modules tall: as tall as the tallest column</text>`;
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="The module grid: columns of square modules on one ground line" style="display:block"><rect width="${W}" height="${H}" fill="${P.paper}"/>${art}<rect x="${x0 - 12}" y="${ground}" width="${W - x0 - 60}" height="3" fill="${P.ink}"/>${marks}</svg>`;
  return section(
    `${H2("One grid, one ground", "Every print is laid out on one module: a set of lifting is a square module; an exercise is a column of its sets standing on the ground; a superset’s two columns stand closer than any others. Every other form stands on the same ground, as tall as a whole number of modules, so tops and rows line up. Shapes never overlap, and a print carries no words.")}${svg}`,
  );
}
function prints() {
  const w = 400;
  const items = [
    [
      dayPrint({
        w,
        h: 190,
        paper: P.paper,
        parts: [
          {
            kind: "strength",
            columns: [
              { n: 3, done: 0 },
              { n: 3, done: 0 },
              { n: 3, done: 0, pair: true },
              { n: 2, done: 0 },
            ],
          },
          { kind: "run", minutes: 30 },
        ],
        ariaLabel: "",
      }),
      "Today, Fri 11 Sept: to do. Four arm exercises (the forearms pair closer) and the run.",
    ],
    [
      dayPrint({
        w,
        h: 190,
        paper: P.paper,
        align: "ends",
        parts: [
          {
            kind: "strength",
            columns: [4, 3, 3, 2, 3, 2, 2].map((n, i) => ({ n, done: i === 0 ? 2 : 0 })),
          },
          { kind: "mobility", segments: 4, segDone: 4, done: true, modules: 3 },
        ],
        ariaLabel: "",
      }),
      "Upper A in progress: the bench’s first two sets inked, the warm-up done.",
    ],
    [
      dayPrint({
        w,
        h: 190,
        paper: P.paper,
        parts: [
          {
            kind: "strength",
            columns: [
              { n: 3, done: 3, warm: 1 },
              { n: 3, done: 3, warm: 1 },
              { n: 3, done: 3 },
            ],
          },
          { kind: "run", minutes: 33, done: true },
          { kind: "swim", minutes: 30, done: true },
        ],
        ariaLabel: "",
      }),
      "Fri 25 Sept, done: a lift with its warm-ups in grey, a run and an open-water swim.",
    ],
  ];
  return section(
    `${H2("A day", "The day’s print is Today’s hero and every record’s header: what is owed, thinned, inking as it is done.")}<div style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: GAP })}">${items.map(([svg, l]) => `<div style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}">${svg}${sub(l)}</div>`).join("")}</div>`,
  );
}
function month() {
  const m = monthPrint({
    w: 420,
    year: 2026,
    month: 8,
    days: september,
    today: 29,
    paper: P.paper,
    cellH: 58,
    mark: 13,
    weeks: true,
    ariaLabel: "September",
  });
  const rules = [
    "Every activity of a day is in its cell, two to a row, bottom up; past four, +N.",
    "Today is ringed in ink; days after today stay blank; a day with nothing has a dot.",
    "The eighth column is each week’s sessions; this week’s says so far.",
    "Tap the month for the whole calendar: the same cells, larger, one month after another.",
  ];
  return section(
    `${H2("A month")}<div style="${s({ display: "grid", "grid-template-columns": "420px minmax(0,1fr)", gap: 40, "align-items": "start" })}">${m}<ul style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${rules.map((r) => `<li style="${s({ display: "flex", gap: 10 })}; ${txt(16, 500, { "line-height": 1.45 })}"><span style="${s({ width: 8, height: 8, background: L.ink, "margin-top": 8, "flex-shrink": 0 })}"></span>${r}</li>`).join("")}</ul></div>`,
  );
}
function bowl() {
  const eaten = F.meals.filter((m) => m.kcal).map((m) => [m.name, m.kcal]);
  const over = F.meals
    .map((m) => (m.name === "Dinner" ? [m.name, foodOver.dinner.kcal] : [m.name, m.kcal]))
    .filter(([, k]) => k);
  const w = 400;
  const under = bowlPrint({ w, meals: eaten, target: F.target, paper: P.paper, ariaLabel: "" });
  const overP = bowlPrint({ w, meals: over, target: F.target, paper: P.paper, ariaLabel: "" });
  // the limit, as geometry: at twice the target the heap closes the circle
  const r = 60,
    box = 190;
  const lim = bowlFigure({
    r,
    cx: box / 2,
    rim: 110,
    meals: [
      ["", 1],
      ["", 1],
    ],
    target: 1,
    paper: P.paper,
  });
  const limit = `<svg width="${box}" height="190" viewBox="0 0 ${box} 190" aria-hidden="true" style="display:block"><rect width="${box}" height="190" fill="${P.paper}"/>${lim.svg}</svg>`;
  return section(`${H2("The bowl", "The bowl is the day’s target. Each meal is a layer, by area. Past the target the food heaps over the rim as one symmetric mound, so over reads at a glance without a second colour or a broken shape.")}
<div style="${s({ display: "grid", "grid-template-columns": "400px 400px 190px", gap: GAP, "align-items": "start" })}"><div style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}">${under}${sub("Fri 25 Sept, under: three meals, 1,152.5 of 2,300 kcal.")}</div><div style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}">${overP}${sub("The same day with dinner (the preview’s over state): 2,536 kcal, the heap above the rim.")}</div><div style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}">${limit}${sub("The limit: at twice the target the heap closes the circle.")}</div></div>`);
}
function rules() {
  const R = [
    [
      "Drawn from records",
      "A print is made only from what the account logged; nothing decorative, nothing guessed.",
    ],
    [
      "No words on a print",
      "The rows under it are its legend, each led by a small copy of its part.",
    ],
    [
      "One ground",
      "Every form stands on one ground line; tops and rows line up on the module grid.",
    ],
    ["Colour is sport", "The interface is black and white; pigment means a family, nowhere else."],
    ["One cut", "A new sport is its family’s form with one cut."],
    [
      "Never the brightest",
      "On dark paper the pigments lift and the ink lightens; a print never outshines the screen.",
    ],
  ];
  return section(
    `${H2("Rules")}<ul style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: GAP })}">${R.map(([n, d]) => `<li style="${s({ display: "flex", "flex-direction": "column", gap: 6, padding: "14px 0", "border-top": `2px solid ${L.ink}` })}"><span style="${txt(17, 700)}">${n}</span><span style="${txt(15, 500, { color: L.ink2, "line-height": 1.45 })}">${d}</span></li>`).join("")}</ul>`,
  );
}

export function alphabetBoard() {
  return `<div style="${s({ width: ABW, padding: PAD, background: L.ground, color: L.ink, "font-family": K.FONTS.text, display: "flex", "flex-direction": "column", gap: 56, "-webkit-font-smoothing": "antialiased" })}">
<header><h1 style="${title(68, { lh: 1 })}">The alphabet</h1><p style="${txt(18, 500, { color: L.ink2 })}; margin-top: 10px">How a print is made from what you logged, and how it grows with the app.</p></header>
${families()}${variants()}${states()}${context()}${grid()}${prints()}${month()}${bowl()}${rules()}
</div>`;
}
