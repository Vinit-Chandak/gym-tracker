// PROGRESS: the month as a calendar, every activity of every day; Calendar for every month.
//
// One month, not a quarter: a cell is wide enough for a day's run, swim and lift side by side,
// two to a row, and past four it says +N. The totals under it name each sport, so they are its
// legend. The calendar page scrolls through the months with the same cells, larger, and a day
// opens on its own print and its entries.
import { s } from "./lib.mjs";
import * as K from "./kit.mjs";
import { dayPrint, form, palFor } from "./art.mjs";
import { september, august, septTotals, day25, benchLife } from "./data.mjs";

const { txt, num, title, icon, tn } = K;
// Progress's sections are chosen as the app chooses them: one button naming the section, which
// opens a sheet of them (section-select.tsx), with the range the section shows beside it. Nothing
// is clipped and six choices never crowd the screen.
export const SECTIONS = ["Overview", "History", "Strength", "Running", "Recovery", "Body"];
export function progressHeader(t, dv, section, range = "") {
  return `${K.topHeader(t, dv, "Progress", K.iconBtn(t, "sliders", "Filters: dates, activity, gym", { "margin-right": -10 }))}
<div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 12, "flex-wrap": "wrap", "margin-top": 4 })}"><button type="button" aria-haspopup="dialog" aria-label="Progress section: ${section}" style="${s({ display: "inline-flex", "align-items": "center", gap: 6, height: 44, padding: "0 12px 0 14px", "border-radius": 14, background: t.surface })}; ${txt(16, 700)}">${section}${icon("chevronDown", 18)}</button>${range ? `<span style="${txt(14, 600, { color: t.ink2 })}; ${tn}">${range}</span>` : ""}</div>`;
}

// The calendar, in the first calendar's style: pulled on paper like a print, the weekdays across
// the top, a day with nothing in it a dot, and each activity its sport's mark, so a month reads as
// a pattern before it is read as dates. A day's marks stand together in its cell, one to four (two
// rows of two), and past four it says +N. Today is ringed; days to come are left blank and cannot
// be opened. Every past day is a link named with what it holds. The overview shows the pattern
// alone; the calendar page adds each date, small, in the corner of its cell.
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const sportName = {
  strength: "lifting",
  run: "run",
  ride: "ride",
  swim: "swim",
  mobility: "mobility",
};
const said = (x) => {
  const what =
    x.sport === "strength"
      ? `lifting${x.min ? ` ${x.min} min` : ""}`
      : x.sport === "run"
        ? `run${x.km ? ` ${x.km} km` : ""}`
        : x.sport === "swim"
          ? `swim${x.m ? ` ${x.m.toLocaleString("en-GB")} m` : ""}`
          : x.sport === "ride"
            ? `ride${x.km ? ` ${x.km} km` : x.min ? ` ${x.min} min` : ""}`
            : sportName[x.sport] || x.sport;
  return `${what}${x.indoor ? " indoors" : ""}`;
};
// One sport's mark on the calendar's paper, its box s tall; a run's track is longer than tall.
const markW = (x, sz) => (x.sport === "run" ? sz * 1.6 : sz);
function calMark(t, x, cx, cy, sz) {
  const w = markW(x, sz),
    h = x.sport === "run" ? sz * 0.85 : sz;
  return form(x.sport, cx - w / 2, cy - h / 2, w, h, { indoor: !!x.indoor, paper: t.paper });
}
// A day's marks as one group centred in its cell: one large, two side by side, three or four in
// two rows of two; past four, three and +N.
function dayMarks(t, list, W, H, { fit = 4 } = {}) {
  const P = palFor(t.paper);
  const n = list.length;
  const cx = W / 2,
    cy = H / 2;
  // the marks grow with the cell: one at 40% of its height, two a little smaller, four smaller still
  const one = Math.min(22, Math.round(H * 0.4));
  if (n === 1) return calMark(t, list[0], cx, cy, one);
  const shown = n > fit ? list.slice(0, fit - 1) : list;
  const more = n - shown.length;
  const sz = shown.length === 2 ? Math.round(one * 0.8) : Math.round(one * 0.64),
    gap = 4;
  const rowsOf = shown.length <= 2 ? [shown] : [shown.slice(0, 2), shown.slice(2, 4)];
  let o = "";
  rowsOf.forEach((rw, ri) => {
    const ws = rw.map((x) => markW(x, sz));
    const items = rw.length + (ri === rowsOf.length - 1 && more ? 1 : 0);
    const plusW = more && ri === rowsOf.length - 1 ? 16 : 0;
    const tot = ws.reduce((a, b) => a + b, 0) + plusW + gap * (items - 1);
    let x = cx - tot / 2;
    const y = rowsOf.length === 1 ? cy : cy + (ri ? 1 : -1) * (sz / 2 + 2.5);
    rw.forEach((a, k) => {
      o += calMark(t, a, x + ws[k] / 2, y, sz);
      x += ws[k] + gap;
    });
    if (plusW)
      o += `<text x="${(x + plusW / 2).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" style="font-family:'Atkinson Hyperlegible Next',sans-serif;font-size:12px;font-weight:700;fill:${P.ink}">+${more}</text>`;
  });
  return o;
}
export function monthGrid(
  t,
  {
    year,
    month,
    days,
    today = null,
    cellH = 46,
    fit = 4,
    weekdays = true,
    numbers = false,
    open = {},
    label = null,
  } = {},
) {
  const P = palFor(t.paper);
  const first = new Date(Date.UTC(year, month, 1));
  const nDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const rows = Math.ceil((lead + nDays) / 7);
  const SW = 48; // each day's drawing, centred in its cell
  const cell = (dom) => {
    const wd = WD[(lead + dom - 1) % 7];
    const name = `${wd} ${dom} ${MON[month]}`;
    const list = days[dom] || [];
    const future = today !== null && dom > today;
    const isToday = dom === today;
    const top = numbers ? 8 : 0;
    const art = list.length
      ? dayMarks(t, list, SW, cellH - top, { fit })
      : future
        ? ""
        : `<circle cx="${SW / 2}" cy="${(cellH - top) / 2}" r="2" fill="${P.dot}"/>`;
    const svg = art
      ? `<svg width="${SW}" height="${cellH - top}" viewBox="0 0 ${SW} ${cellH - top}" aria-hidden="true" style="display:block;overflow:visible">${art}</svg>`
      : "";
    const date = numbers
      ? `<span aria-hidden="true" style="${s({ position: "absolute", left: 6, top: 4 })}; ${txt(12, isToday ? 800 : 600, { color: isToday ? P.ink : P.label, "line-height": 1 })}; ${tn}">${dom}</span>`
      : "";
    const ring = isToday
      ? `<span aria-hidden="true" style="${s({ position: "absolute", inset: 3, border: `1.5px solid ${P.ink}`, "border-radius": 10 })}"></span>`
      : "";
    const box = `position:relative;display:flex;align-items:center;justify-content:center;height:${cellH}px;padding-top:${top}px;min-width:0`;
    if (future) return `<span aria-hidden="true" style="${box}">${date}</span>`;
    const said_ = list.length ? list.map(said).join(", ") : "nothing logged";
    return `<a href="${open[dom] || "#"}" aria-label="${name}${isToday ? ", today" : ""}: ${said_}" style="${box}">${ring}${date}${svg}</a>`;
  };
  const cells = [];
  for (let i = 0; i < rows * 7; i++) {
    const dom = i - lead + 1;
    cells.push(dom >= 1 && dom <= nDays ? cell(dom) : `<span aria-hidden="true"></span>`);
  }
  const head = weekdays
    ? `<div aria-hidden="true" style="${s({ display: "grid", "grid-template-columns": "repeat(7, minmax(0,1fr))", height: 24, "align-items": "center" })}">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span style="${txt(12, 700, { color: P.label, "text-align": "center" })}">${d}</span>`).join("")}</div>`
    : "";
  return `<div role="group" aria-label="${label || `${MONTHS[month]} ${year}`}" style="${s({ background: t.paper, padding: "6px 6px 8px" })}">${head}<div style="${s({ display: "grid", "grid-template-columns": "repeat(7, minmax(0,1fr))" })}">${cells.join("")}</div></div>`;
}

export function progressScreen(t, dv = K.D) {
  const narrow = dv.W < 360;
  const cal = monthGrid(t, {
    year: 2026,
    month: 8,
    days: september,
    today: 29,
    cellH: narrow ? 42 : K.short(dv) ? 44 : K.roomy(dv) ? 58 : 50,
    open: { 25: "Day.dc.html" },
    label: "September 2026, every activity of every day",
  });
  // the month's totals, each led by its mark: the legend and the count at once
  const stat = (sport, n, name, extra) =>
    `<li style="${s({ display: "flex", "flex-direction": "column", gap: 3, "min-width": 0 })}"><span style="display:flex;align-items:center;gap:6px">${K.stateMark(t, sport, 14)}<span style="${num(26)}">${n}</span></span><span class="wrap" style="${txt(13, 500, { color: t.ink2, "line-height": 1.3 })}; ${tn}">${name}${extra ? `<br>${extra}` : ""}</span></li>`;
  const inner = `${progressHeader(t, dv, "Overview")}
<section aria-labelledby="month" style="margin-top:8px">
<h3 id="month" style="${s({ display: "flex", "justify-content": "space-between", "align-items": "center", height: 36 })}"><span style="${txt(17, 700)}">September</span><a href="Calendar.dc.html" style="${s({ display: "flex", "align-items": "center", gap: 2, height: 44, color: t.ink2, "margin-right": -6 })}; ${txt(15, 700)}">Calendar${icon("chevronRight", 18)}</a></h3>
${cal}
</section>
<section aria-labelledby="tot" style="margin-top:12px;border-top:1px solid ${t.hair};padding-top:12px"><h3 id="tot" class="sr">Sessions in September</h3><ul style="${s({ display: "grid", "grid-template-columns": "repeat(4, minmax(0,1fr))", gap: 8 })}">${stat("strength", septTotals.strength.sessions, "Lifting")}${stat("run", septTotals.run.sessions, "Runs", `${septTotals.run.km} km`)}${stat("ride", septTotals.ride.sessions, "Rides", `${septTotals.ride.km} km`)}${stat("swim", septTotals.swim.sessions, "Swims", `${septTotals.swim.km} km`)}</ul></section>`;
  const body = `${K.screenMain(t, inner, { dv, bottom: K.navH(dv) + 8 + K.stripH + 6 })}${K.strip(t, { dv })}${K.navbar(t, "progress", { dv })}`;
  return K.root(t, body, { label: "Progress", dv });
}

// The calendar: months one after another, scrolling, each on its paper with its dates; it opens on
// this month.
export function calendarScreen(t, dv = K.D) {
  const month = (name, m, days, today = null) =>
    `<section aria-labelledby="m-${m}"><h3 id="m-${m}" style="${s({ padding: "14px 0 6px" })}; ${txt(17, 700)}">${name}</h3>${monthGrid(t, { year: 2026, month: m, days, today, cellH: 56, numbers: true, open: { 25: "Day.dc.html" } })}</section>`;
  const legend = `<p aria-hidden="true" style="${s({ display: "flex", gap: 14, "align-items": "center", "flex-wrap": "wrap", "margin-top": 6 })}; ${txt(13, 600, { color: t.ink2 })}">${[
    ["strength", "Lifting"],
    ["run", "Run"],
    ["ride", "Ride"],
    ["swim", "Swim"],
  ]
    .map(
      ([k, l]) =>
        `<span style="display:inline-flex;align-items:center;gap:5px">${K.stateMark(t, k, 14)}${l}</span>`,
    )
    .join(
      "",
    )}<span style="display:inline-flex;align-items:center;gap:5px">${K.stateMark(t, "run", 14, { indoor: true })}Indoors</span></p>`;
  // August scrolled most of the way off the top, September below it
  const inner = `${K.nestedHeader(t, "Progress")}
<h2 style="${title(34)}; margin-top: 2px">Calendar</h2>
${legend}
<div style="${s({ height: 150, overflow: "hidden", position: "relative", "margin-top": 4 })}"><div style="position:absolute;left:0;right:0;bottom:0">${month("August", 7, august)}</div></div>
${month("September", 8, september, 29)}`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv })}${K.navbar(t, "progress", { dv, nested: true })}`,
    { label: "Calendar", dv },
  );
}

// A day: its print, then each entry. Fri 25 Sept: a run, an open-water swim and a lift.
export function dayScreen(t, dv = K.D) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const print = dayPrint({
    w: cw,
    h: 168,
    paper: t.paper,
    parts: [
      { kind: "run", minutes: 33, done: true },
      { kind: "swim", minutes: 30, done: true },
      {
        kind: "strength",
        columns: [
          { n: 3, done: 3, warm: 1 },
          { n: 3, done: 3 },
          { n: 3, done: 3 },
        ],
      },
    ],
    ariaLabel:
      "Fri 25 Sept in full ink, in the day’s order: an outdoor run, an open-water swim, three exercises",
  });
  const row = (sport, ttl, meta, time, opts = {}) =>
    `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 60, padding: "8px 0", "border-bottom": `1px solid ${t.hair}` })}">${K.markCell(K.stateMark(t, sport, 18, opts))}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span class="wrap" style="${txt(16, 700)}; ${tn}">${ttl}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${meta}</span></span><span style="${txt(14, 600, { color: t.ink2 })}; ${tn}">${time}</span></a></li>`;
  const inner = `${K.nestedHeader(t, "Calendar")}
<h2 style="${title(34)}; margin-top: 2px">${day25.date}</h2>
${K.printFrame(print, { mt: 12 })}
<ul style="margin-top:6px">${row("run", "Outdoor · 5 km", "33:00 · 6:36/km", "06:00")}${row("swim", "Open water · 1,500 m", "30:00 · Mixed", "13:30")}${row("strength", "Ad hoc session", "Anytime Fitness · 60 min · 9 sets", "19:00")}</ul>`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv })}${K.navbar(t, "progress", { dv, nested: true })}`,
    { label: "Fri 25 Sept", dv },
  );
}

// An exercise across its whole life: 454 sessions of the bench at Anytime Fitness, Feb 2022 to Sept 2026.
export function exerciseScreen(t, dv = K.D) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const m = benchLife.months;
  // the heaviest working set of each month, as bars in ink on the ground like every Progress
  // chart: control grey, the latest month in ink; its first and latest figures said once, above
  const w = cw,
    h = 132,
    top = 8,
    bottom = h - 2;
  const hi = Math.max(...m);
  const bw = w / m.length;
  const bars = m
    .map((v, i) => {
      const bh = (v / hi) * (bottom - top);
      const last = i === m.length - 1;
      return `<rect x="${(i * bw + 0.7).toFixed(1)}" y="${(bottom - bh).toFixed(1)}" width="${(bw - 1.4).toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${last ? t.ink : t.control}"/>`;
    })
    .join("");
  const chart = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="The heaviest working set each month, from 30 kg in February 2022 to 72.5 kg in September 2026" style="display:block;width:100%;height:auto"><line x1="0" x2="${w}" y1="${bottom}" y2="${bottom}" stroke="${t.hair}" stroke-width="1"/>${bars}</svg>`;
  const recent = benchLife.recent
    .map(
      (r) =>
        `<li style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 56, padding: "7px 0", "border-bottom": `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span style="${s({ display: "flex", "justify-content": "space-between", gap: 8 })}"><span style="${txt(15, 700)}">${r.date}</span><span class="nb" style="${num(17)}">${r.top}</span></span><span class="wrap" style="${txt(13, 500, { color: t.ink2 })}; ${tn}">${r.sets}</span></span></li>`,
    )
    .join("");
  const stat = (n, u, l) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span class="nb" style="${s({ display: "flex", "align-items": "baseline", gap: 3 })}"><span style="${num(26)}">${n}</span><span style="${txt(13, 600, { color: t.ink2 })}">${u}</span></span><span style="${txt(13, 500, { color: t.ink2 })}">${l}</span></div>`;
  const inner = `${K.nestedHeader(t, "History")}
<h2 style="${title(34)}; margin-top: 2px">Barbell bench press</h2>
${K.metaLine(t, [`${K.equip(t, "dumbbell", "Free weights")}<span>Barbell</span>`, `${icon("pin", 16)}<span>Anytime Fitness</span>`], { mt: 4 })}
<p style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline", gap: 8, "margin-top": 14 })}"><span style="${txt(13, 700, { color: t.ink2 })}">Heaviest set each month</span><span style="${txt(13, 500, { color: t.ink2 })}; ${tn}">30 → 72.5 kg</span></p>
<div style="margin-top:8px">${chart}</div>
<p aria-hidden="true" style="${s({ display: "flex", "justify-content": "space-between", "margin-top": 4 })}; ${txt(12, 600, { color: t.ink2 })}"><span>Feb 2022</span><span>Sept 2026</span></p>
<div style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: 10, "margin-top": 12 })}">${stat(benchLife.sessions, "", "Sessions")}${stat("87", "kg", "Best est. 1RM")}${stat("72.5", "kg", "Top weight")}</div>
<h3 style="${txt(13, 700, { color: t.ink2 })}; margin: 16px 0 2px">Latest</h3>
<ul>${recent}</ul>`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv })}${K.navbar(t, "progress", { dv, nested: true })}`,
    { label: "Barbell bench press, every session", dv },
  );
}
