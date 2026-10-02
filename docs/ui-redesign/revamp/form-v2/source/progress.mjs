// PROGRESS: the month as a calendar, every activity of every day; Calendar for every month.
//
// One month, not a quarter: a cell is wide enough for a day's run, swim and lift side by side,
// two to a row, and past four it says +N. The totals under it name each sport, so they are its
// legend. The calendar page scrolls through the months with the same cells, larger, and a day
// opens on its own print and its entries.
import { s } from "./lib.mjs";
import * as K from "./kit.mjs";
import { dayPrint, PIG } from "./art.mjs";
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

// The calendar: interface, not a print. Dates in ink on the ground, a hairline between weeks; each
// day a link named with what it holds, its marks right under its date, two to a row, and past
// `fit` a +N. Today is ringed; days to come are quieter and cannot be opened.
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
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
export function monthGrid(
  t,
  {
    year,
    month,
    days,
    today = null,
    cellH = 56,
    mark = 13,
    fit = 4,
    weekdays = true,
    open = {},
    label = null,
  } = {},
) {
  const first = new Date(Date.UTC(year, month, 1));
  const nDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const rows = Math.ceil((lead + nDays) / 7);
  const gap = Math.max(3, Math.round(mark * 0.24));
  const cell = (dom) => {
    const wd = WD[(lead + dom - 1) % 7];
    const name = `${wd} ${dom} ${MON[month]}`;
    const list = days[dom] || [];
    const future = today !== null && dom > today;
    const isToday = dom === today;
    const shown = list.length > fit ? list.slice(0, fit - 1) : list;
    const more = list.length - shown.length;
    const marks = shown.map((x) => K.stateMark(t, x.sport, mark, { indoor: x.indoor })).join("");
    const plus = more
      ? `<span style="${txt(12, 700)}; line-height: ${mark}px">+${more}</span>`
      : "";
    const date = `<span style="${txt(13, isToday ? 800 : future ? 500 : 600, { color: future ? t.ink2 : t.ink, "line-height": 1 })}; ${tn}">${dom}</span>`;
    const inner = `${date}${list.length ? `<span aria-hidden="true" style="${s({ display: "grid", "grid-template-columns": `repeat(2, max-content)`, gap, "margin-top": 5, "align-items": "end" })}">${marks}${plus}</span>` : !future ? `<span aria-hidden="true" style="${s({ width: 3, height: 3, "border-radius": 9999, background: t.control, "margin-top": 8, "margin-left": 1 })}"></span>` : ""}`;
    const box = `display:flex;flex-direction:column;align-items:flex-start;min-height:${cellH}px;padding:6px 5px 4px;min-width:0${isToday ? `;box-shadow:inset 0 0 0 1.5px ${t.ink};border-radius:10px` : ""}`;
    if (future) return `<span style="${box}">${inner}</span>`;
    const said_ = list.length ? list.map(said).join(", ") : "nothing logged";
    return `<a href="${open[dom] || "#"}" aria-label="${name}${isToday ? ", today" : ""}: ${said_}" style="${box}">${inner}</a>`;
  };
  const cells = [];
  for (let i = 0; i < rows * 7; i++) {
    const dom = i - lead + 1;
    cells.push(dom >= 1 && dom <= nDays ? cell(dom) : `<span aria-hidden="true"></span>`);
  }
  const weeks = Array.from(
    { length: rows },
    (_, r) =>
      `<div style="${s({ display: "grid", "grid-template-columns": "repeat(7, minmax(0,1fr))", "border-top": `1px solid ${t.hair}` })}">${cells.slice(r * 7, r * 7 + 7).join("")}</div>`,
  ).join("");
  const head = weekdays
    ? `<div aria-hidden="true" style="${s({ display: "grid", "grid-template-columns": "repeat(7, minmax(0,1fr))", height: 22, "align-items": "center" })}">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span style="${txt(12, 700, { color: t.ink2 })}; padding-left: 5px">${d}</span>`).join("")}</div>`
    : "";
  return `<div role="group" aria-label="${label || `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month]} ${year}`}">${head}${weeks}</div>`;
}

export function progressScreen(t, dv = K.D) {
  const narrow = dv.W < 360;
  const cal = monthGrid(t, {
    year: 2026,
    month: 8,
    days: september,
    today: 29,
    cellH: narrow ? 50 : K.short(dv) ? 52 : K.roomy(dv) ? 62 : 56,
    mark: narrow ? 11 : 13,
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

// The calendar: months one after another, scrolling, the cells larger; it opens on this month.
export function calendarScreen(t, dv = K.D) {
  const month = (name, m, days, today = null) =>
    `<section aria-labelledby="m-${m}"><h3 id="m-${m}" style="${s({ padding: "14px 0 6px" })}; ${txt(17, 700)}">${name}</h3>${monthGrid(t, { year: 2026, month: m, days, today, cellH: 62, mark: 15, weekdays: false, open: { 25: "Day.dc.html" } })}</section>`;
  const wk = `<div aria-hidden="true" style="${s({ display: "grid", "grid-template-columns": "repeat(7, minmax(0,1fr))", height: 26, "align-items": "center", "border-bottom": `1px solid ${t.hair}` })}">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span style="${txt(12, 700, { color: t.ink2 })}; padding-left: 5px">${d}</span>`).join("")}</div>`;
  const legend = `<p aria-hidden="true" style="${s({ display: "flex", gap: 14, "align-items": "center", "flex-wrap": "wrap", "margin-top": 6 })}; ${txt(13, 600, { color: t.ink2 })}">${[
    ["strength", "Lifting"],
    ["run", "Run"],
    ["ride", "Ride"],
    ["swim", "Swim"],
  ]
    .map(
      ([k, l]) =>
        `<span style="display:inline-flex;align-items:center;gap:5px">${K.stateMark(t, k, 12)}${l}</span>`,
    )
    .join("")}</p>`;
  // August scrolled most of the way off the top, September below it
  const inner = `${K.nestedHeader(t, "Progress")}
<h2 style="${title(34)}; margin-top: 2px">Calendar</h2>
${legend}
<div style="margin-top:8px">${wk}</div>
<div style="${s({ height: 170, overflow: "hidden", position: "relative" })}"><div style="position:absolute;left:0;right:0;bottom:0">${month("August", 7, august)}</div></div>
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
    `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 60, padding: "8px 0", "border-bottom": `1px solid ${t.hair}` })}">${K.markCell(sport === "strength" ? K.colMark(t, 3, 3) : K.stateMark(t, sport, 18, opts))}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span class="wrap" style="${txt(16, 700)}; ${tn}">${ttl}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${meta}</span></span><span style="${txt(14, 600, { color: t.ink2 })}; ${tn}">${time}</span></a></li>`;
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
  const w = cw,
    h = 150,
    pad = 14,
    ground = h - 22,
    top = 26;
  const lo = 0,
    hi = Math.max(...m);
  const bw = (w - 2 * pad) / m.length;
  const bars = m
    .map((v, i) => {
      const bh = ((v - lo) / (hi - lo)) * (ground - top);
      return `<rect x="${(pad + i * bw + 0.6).toFixed(1)}" y="${(ground - bh).toFixed(1)}" width="${(bw - 1.2).toFixed(1)}" height="${bh.toFixed(1)}" fill="${t.scheme === "dark" ? t.marks.strength : PIG.ultra}"/>`;
    })
    .join("");
  const P =
    t.scheme === "dark" ? { ink: "#ece7dc", label: "#b4ad9f" } : { ink: PIG.ink, label: PIG.label };
  const F = "font-family:'Atkinson Hyperlegible Next',sans-serif";
  const chart = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="The heaviest working set each month, from 30 kg in February 2022 to 72.5 kg in September 2026" style="display:block;width:100%;height:auto"><rect width="${w}" height="${h}" fill="${t.paper}"/>${bars}<rect x="${pad - 4}" y="${ground}" width="${w - 2 * pad + 8}" height="3" fill="${P.ink}"/><text x="${pad}" y="${h - 6}" style="${F};font-size:12px;font-weight:600;fill:${P.label}">Feb 2022</text><text x="${w - pad}" y="${h - 6}" text-anchor="end" style="${F};font-size:12px;font-weight:600;fill:${P.label}">Sept 2026</text><text x="${pad}" y="18" style="${F};font-size:12px;font-weight:700;fill:${P.ink}">30 → 72.5 kg</text></svg>`;
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
${K.printFrame(chart, { mt: 12 })}
<div style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: 10, "margin-top": 12 })}">${stat(benchLife.sessions, "", "Sessions")}${stat("87", "kg", "Best est. 1RM")}${stat("72.5", "kg", "Top weight")}</div>
<h3 style="${txt(13, 700, { color: t.ink2 })}; margin: 16px 0 2px">Latest</h3>
<ul>${recent}</ul>`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv })}${K.navbar(t, "progress", { dv, nested: true })}`,
    { label: "Barbell bench press, every session", dv },
  );
}
