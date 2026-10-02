// PROGRESS: the month as a print, every activity of every day; tap it for the whole calendar.
//
// One month, not a quarter: a cell is wide enough for a day's run, swim and lift side by side,
// two to a row, and past four it says +N. The eighth column is each week's sessions, this week's
// "so far". The calendar page scrolls through the months with the same cells, larger, and a day
// opens on its own print and its entries.
import { s } from "./lib.mjs";
import * as K from "./kit.mjs";
import { monthPrint, dayPrint, PIG } from "./art.mjs";
import { september, august, septTotals, day25, benchLife } from "./data.mjs";

const { txt, num, title, icon, tn } = K;
const SECTIONS = ["Overview", "History", "Strength", "Running", "Recovery", "Body"];

export function progressScreen(t, dv = K.D) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G,
    narrow = dv.W < 360;
  const cal = monthPrint({
    w: cw,
    year: 2026,
    month: 8,
    days: september,
    today: 29,
    paper: t.paper,
    cellH: narrow ? 50 : K.short(dv) ? 52 : K.roomy(dv) ? 66 : 58,
    mark: narrow ? 11 : 13,
    weeks: true,
    ariaLabel:
      "September, every activity of every day: 20 strength sessions, 8 runs, 4 rides and 4 swims. Fri 25 a run, a swim and a lift; Sat 26 four. Open the calendar.",
  });
  const stat = (sport, n, extra, label) =>
    `<li style="${s({ display: "flex", "flex-direction": "column", gap: 4, "min-width": 0 })}"><span style="display:flex;align-items:center;gap:6px">${K.stateMark(t, sport, 14, { label })}<span style="${num(26)}">${n}</span></span><span class="nb" style="${txt(13, 500, { color: t.ink2 })}; ${tn}">${extra || "&nbsp;"}</span></li>`;
  const inner = `${K.topHeader(t, dv, "Progress", K.iconBtn(t, "sliders", "Filters: dates, activity, gym", { "margin-right": -10 }))}
<div style="margin-top:2px">${K.tabs(t, SECTIONS, 0, { dv, scroll: true, id: "Progress sections" })}</div>
<section aria-labelledby="month" style="margin-top:12px">
<h3 id="month" style="${s({ display: "flex", "justify-content": "space-between", "align-items": "center", height: 32 })}"><span style="${txt(17, 700)}">September</span><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 2, height: 44, color: t.ink2, "margin-right": -6 })}; ${txt(15, 700)}">Calendar${icon("chevronRight", 18)}</a></h3>
<a href="#" aria-label="Open the calendar" style="display:block;line-height:0">${cal}</a>
</section>
<section aria-labelledby="tot" style="margin-top:14px"><h3 id="tot" class="sr">Sessions in September</h3><ul style="${s({ display: "grid", "grid-template-columns": "repeat(4, minmax(0,1fr))", gap: 8 })}">${stat("strength", septTotals.strength.sessions, "", "Strength sessions")}${stat("run", septTotals.run.sessions, `${septTotals.run.km} km`, "Runs")}${stat("ride", septTotals.ride.sessions, `${septTotals.ride.km} km`, "Rides")}${stat("swim", septTotals.swim.sessions, `${septTotals.swim.km} km`, "Swims")}</ul></section>`;
  const body = `${K.screenMain(t, inner, { dv, bottom: K.navH(dv) + 8 + K.stripH + 6 })}${K.strip(t, { dv })}${K.navbar(t, "progress", { dv })}`;
  return K.root(t, body, { label: "Progress, overview", dv });
}

// The calendar: months one after another, scrolling; the cells larger, four marks before +N.
export function calendarScreen(t, dv = K.D) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const month = (name, m, days, today = null, cut = 0) => {
    const svg = monthPrint({
      w: cw,
      year: 2026,
      month: m,
      days,
      today,
      paper: t.paper,
      cellH: 66,
      mark: 15,
      weekdays: false,
      numSize: 12,
    });
    return `<section aria-label="${name} 2026"><h3 style="${s({ position: "relative", "z-index": 1, background: t.ground, padding: "10px 0 8px" })}; ${txt(17, 700)}">${name}</h3><div style="${s({ "line-height": 0, overflow: "hidden", "margin-top": cut ? -cut : 0 })}">${svg}</div></section>`;
  };
  const wk = `<div aria-hidden="true" style="${s({ display: "grid", "grid-template-columns": "repeat(7, minmax(0,1fr))", padding: "0 8px", height: 26, "align-items": "center", "border-bottom": `1px solid ${t.hair}` })}">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span style="${txt(12, 700, { color: t.ink2 })}; padding-left: 6px">${d}</span>`).join("")}</div>`;
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
  const inner = `${K.nestedHeader(t, "Progress")}
<h2 style="${title(34)}; margin-top: 2px">Calendar</h2>
${legend}
<div style="margin-top:8px">${wk}</div>
<div style="${s({ height: 150, overflow: "hidden", position: "relative" })}"><div style="position:absolute;left:0;right:0;bottom:0">${month("August", 7, august)}</div></div>
${month("September", 8, september, 29)}`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv })}${K.navbar(t, "progress", { dv, nested: true })}`,
    { label: "Calendar, August and September 2026", dv },
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
      {
        kind: "strength",
        columns: [
          { n: 3, done: 3, warm: 1 },
          { n: 3, done: 3 },
          { n: 3, done: 3 },
        ],
      },
      { kind: "run", minutes: 33, done: true },
      { kind: "swim", minutes: 30, done: true },
    ],
    ariaLabel: "Fri 25 Sept in full ink: three exercises, an outdoor run and an open-water swim",
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
${K.metaLine(t, [`${K.equip(t, "kettlebell", "Free weights")}<span>Free weights</span>`, `${icon("pin", 16)}<span>Anytime Fitness</span>`], { mt: 4 })}
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
