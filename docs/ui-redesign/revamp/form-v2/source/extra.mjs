// More of the app, drawn with the same parts: the More options sheet, a superset being logged, a
// fallback chosen, an exercise added, a ride and a swim logged, a programme day opened, History,
// Running, Body and Recovery under Progress, adding food to a meal, and being offline. Copy and
// values from the repository: exercise-search.ts run over the seeded library, the multisport,
// history and people seeds, program.ts, the food preview and the app's own formatters.
import { s, esc } from "./lib.mjs";
import * as K from "./kit.mjs";
import { dayPrint, paperOpen, palFor, bowlFigure } from "./art.mjs";
import * as SE from "./session.mjs";
import { todayScreen, planRow } from "./today.mjs";
import { seg, labelled } from "./more.mjs";
import {
  carry,
  pullUpSearch,
  quadSearch,
  ride,
  swim,
  upperB,
  historyDays,
  septRuns,
  weights,
  recovery,
  foodLibrary as FL,
  food as F,
  copy as C,
  EQUIP,
} from "./data.mjs";

const { txt, num, title, icon, tn } = K;
const glyphOf = (m) => EQUIP[m] || "kettlebell";
const NAMES = {
  kettlebell: "Free weights",
  bodyweight: "Bodyweight",
  cable: "Cable",
  machine: "Machine",
  smith: "Smith machine",
};
const under = (html) =>
  html.replace(/^<div[^>]*><h1 class="sr">[^<]*<\/h1>/, "").replace(/<\/div>$/, "");
const closeBtn = (t, label = "Close sheet") =>
  `<button type="button" aria-label="${label}" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "margin-right": -10, "flex-shrink": 0 })}">${icon("close", 20)}</button>`;
const sheetHead = (t, id, text) =>
  `<div style="${s({ display: "flex", "align-items": "center", gap: 10 })}"><h2 id="${id}" style="${title(28)}; flex: 1 1 auto; min-width: 0">${text}</h2>${closeBtn(t)}</div>`;
const pinned = (t, dv, html, { bottom = null } = {}) => {
  const G = K.gut(dv);
  return `<div style="${s({ position: "absolute", left: G, right: G, bottom: bottom ?? dv.bottom + 8, display: "flex", "flex-direction": "column", gap: 8, background: t.ground })}">${html}</div>`;
};

// ---------- TODAY › More options: another day, ad hoc, the coach, skip ----------
export function moreOptionsScreen(t, dv = K.D) {
  const opt = (ic, label, { last = false } = {}) =>
    `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 56, "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(`<span style="display:grid">${icon(ic, 22)}</span>`)}<span class="wrap" style="${txt(17, 600, { flex: "1 1 auto" })}">${label}</span>${K.chev(t)}</a></li>`;
  const inner = `${sheetHead(t, "mo-title", "More options")}<ul style="margin-top:4px">${opt("calendar", "Train another day")}${opt("plus", "Start an ad hoc session")}${opt("coach", "Prepare this session")}${opt("skip", "Skip this session", { last: true })}</ul>`;
  return K.root(t, `${under(todayScreen(t, dv))}${K.sheet(t, inner, { dv, id: "mo-title" })}`, {
    label: "Today, more options",
    dv,
  });
}

// ---------- THE SESSION: a superset, being logged ----------
// The carry is measured in metres and rated by RPE. Its partner is named where the flow goes next:
// beside the set being entered, an arrow to the wrist curl.
export function supersetLogScreen(t, dv = K.D) {
  const X = carry;
  const cw = dv.W - 2 * K.gut(dv);
  const head = `${SE.sessionHeader(t, { left: SE.backTo(t, X.back), rest: false, more: "Complete, skip, superset, substitute" })}
<h2 style="${title(K.titleSize(X.exercise, cw, dv.W < 360 ? 28 : 32), { lh: 1.05 })}; margin-top: 2px">${X.exercise}</h2>
${K.metaLine(t, [`${K.equip(t, "kettlebell", "Free weights")}<span>${K.dashes(X.rx).replace(/<span[^>]*>–<\/span>/g, "–")}</span>`, `${icon("rest", 16)}<span>${X.rest}</span>`], { mt: 4 })}
<div style="margin-top:6px">${K.tabs(t, ["Log", "Technique", "History"], 0, { dv, id: "Exercise detail" })}</div>
<ol aria-label="Sets" style="margin-top:6px">${SE.ledgerRow(t, { n: 1, kind: "now" }, { now: true })}${SE.ledgerRow(t, { n: 2, kind: "todo" })}${SE.ledgerRow(t, { n: 3, kind: "todo" })}</ol>
<section aria-label="Its partner in the superset: ${esc(X.partner)}" style="${s({ display: "grid", "grid-template-columns": "6px minmax(0,1fr)", gap: 6, "margin-top": 14, "margin-left": -12 })}"><span role="img" aria-label="Superset" style="${s({ "border-left": `2px solid ${t.ink}`, "border-top": `2px solid ${t.ink}`, "border-bottom": `2px solid ${t.ink}`, margin: "4px 0" })}"></span><div style="min-width:0"><h3 style="${s({ display: "flex", "align-items": "baseline", "justify-content": "space-between", gap: 8 })}"><span style="${txt(15, 700)}">${X.partner}</span><span style="${txt(14, 500, { color: t.ink2 })}; ${tn}">2 × 12–20 @ 1</span></h3><ol>${SE.ledgerRow(t, { n: 1, kind: "todo" })}${SE.ledgerRow(t, { n: 2, kind: "todo" })}</ol></div></section>`;
  const three = (cw - 36) / 3 >= 100;
  const size = three ? 40 : 34;
  const load = K.stepFigure(t, {
    value: X.load,
    unit: "kg",
    size,
    state: "suggested",
    dec: "Less load, 2.5 kg",
    inc: "More load, 2.5 kg",
  });
  const dist = K.stepFigure(t, {
    value: X.metres,
    unit: "m",
    size,
    state: "suggested",
    dec: "5 metres less",
    inc: "5 metres more",
  });
  const rpe = K.stepFigure(t, {
    value: "",
    unit: "RPE",
    size,
    state: "empty",
    hint: "1–10",
    dec: "One less",
    inc: "One more",
  });
  const op = (c) =>
    `<span aria-hidden="true" style="${s({ "padding-top": Math.round(size * 0.32), color: t.ink2, "text-align": "center" })}; ${txt(Math.round(size * 0.5), 500)}">${c}</span>`;
  const figures = three
    ? `<div style="${s({ display: "grid", "grid-template-columns": "minmax(0,1fr) 18px minmax(0,1fr) 18px minmax(0,1fr)", "align-items": "start" })}">${load}${op("×")}${dist}${op("@")}${rpe}</div>`
    : `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${load}<div style="${s({ display: "grid", "grid-template-columns": "minmax(0,1fr) 18px minmax(0,1fr)", "align-items": "start" })}">${dist}${op("@")}${rpe}</div></div>`;
  const next = `<span aria-label="Superset: then ${esc(X.partner)}" style="${s({ display: "inline-flex", "align-items": "center", gap: 5, color: t.ink2 })}; ${txt(15, 600)}">${icon("arrowRight", 16)}<span class="nb">${X.partner}</span></span>`;
  const ent = `<section aria-label="Set 1" style="${s({ display: "flex", "flex-direction": "column", gap: K.short(dv) ? 8 : 12, "padding-top": 10, "border-top": `1px solid ${t.hair}`, "flex-shrink": 0, background: t.ground })}">
<div style="${s({ display: "flex", "align-items": "center", gap: 10, height: 36 })}"><h3 style="${txt(17, 700)}">Set 1</h3>${next}<span style="flex:1 1 auto"></span><button type="button" aria-haspopup="dialog" aria-label="Set options: type, notes, remove" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", color: t.ink2, "margin-right": -10 })}">${icon("sliders", 20)}</button></div>
${figures}
<div style="margin-top:2px"><button type="button" aria-disabled="true" style="${K.BTN(t, "waiting")}; width: 100%">Choose RPE to save</button></div></section>`;
  const G = K.gut(dv);
  const inner = `<div style="${s({ flex: "1 1 auto", "min-height": 0, overflow: "hidden", position: "relative", margin: `0 -${G}px`, padding: `0 ${G}px` })}">${head}${K.fadeTo(t, 18)}</div>${ent}`;
  return K.root(t, SE.sessionMain(t, inner, dv, { flex: true, fade: false }), {
    label: "Farmer’s carry in the forearms superset, entering set 1",
    dv,
  });
}

// ---------- a search result list: equipment glyph, name, muscles; the chosen one checked ----------
function results(t, sections, chosen) {
  const rowFor = ([name, modality, muscles], last) => {
    const on = name === chosen;
    const g = glyphOf(modality);
    return `<li><button type="button" aria-pressed="${on}" style="${s({ display: "flex", "align-items": "center", gap: 12, width: "100%", "min-height": 56, padding: "7px 0", "text-align": "left", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(`<span role="img" aria-label="${NAMES[g]}" style="display:grid">${icon(g, 21)}</span>`)}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span class="wrap" style="${txt(16, 700)}">${name}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}">${muscles}</span></span>${on ? `<span aria-label="Chosen" style="${s({ width: 26, height: 26, "border-radius": 9999, background: t.ink, color: t.onInk, display: "grid", "place-items": "center", "flex-shrink": 0 })}">${icon("check", 15)}</span>` : ""}</button></li>`;
  };
  return sections
    .map(
      ([label, rows]) =>
        `<section>${K.caption(t, label, { mt: 14 })}<ul>${rows.map((r, i) => rowFor(r, i === rows.length - 1)).join("")}</ul></section>`,
    )
    .join("");
}
const searchBox = (t, value, label) =>
  `<label style="${s({ display: "flex", "align-items": "center", gap: 10, height: 50, padding: "0 6px 0 14px", "border-radius": 14, border: `1.5px solid ${t.ink}`, "margin-top": 12 })}"><span style="display:grid;color:${t.ink2}">${icon("search", 20)}</span><span class="sr">${label}</span><span style="${txt(16, 600, { flex: "1 1 auto" })}">${value}</span><button type="button" aria-label="Clear the search" style="${s({ width: 40, height: 40, display: "grid", "place-items": "center", color: t.ink2 })}">${icon("close", 18)}</button></label>`;

// Choose a fallback: Lower A's leg extension has no machine at Anytime Fitness.
export function substituteScreen(t, dv = K.D) {
  const Q = quadSearch;
  const inner = `${SE.sessionHeader(t, { left: SE.backTo(t, "Exercise"), rest: false, more: null })}
<h2 style="${title(dv.W < 360 ? 30 : 34)}; margin-top: 2px">Choose a fallback</h2>
<p style="${txt(16, 500, { color: t.ink2 })}; margin-top: 4px">Instead of Leg extension at Anytime Fitness.</p>
${searchBox(t, Q.query, "Search name, muscle or equipment")}
${results(
  t,
  [
    ["Best matches", Q.best],
    ["By muscle, equipment or movement", Q.other],
  ],
  Q.chosen,
)}`;
  const foot = pinned(
    t,
    dv,
    `<label style="${s({ display: "flex", "align-items": "center", gap: 10, "min-height": 44 })}"><input type="checkbox" checked class="sr"><span aria-hidden="true" style="${s({ width: 22, height: 22, "border-radius": 6, background: t.ink, color: t.onInk, display: "grid", "place-items": "center", "flex-shrink": 0 })}">${icon("check", 15)}</span><span class="wrap" style="${txt(15, 600)}">Remember this as the fallback at this gym</span></label><button type="button" style="${K.BTN(t, "primary")}; width: 100%">Use this instead</button>`,
  );
  return K.root(
    t,
    `${SE.sessionMain(t, inner, dv, { bottom: dv.bottom + 8 + 56 + 52 + 12 })}${foot}`,
    { label: "Choose a fallback for the leg extension", dv },
  );
}
// Add exercise: one search over name, muscle and equipment; the machine question answers itself.
export function addExerciseScreen(t, dv = K.D) {
  const Q = pullUpSearch;
  const inner = `${SE.sessionHeader(t, { left: SE.backTo(t, "Upper A"), rest: false, more: null })}
<h2 style="${title(dv.W < 360 ? 30 : 34)}; margin-top: 2px">Add exercise</h2>
${searchBox(t, Q.query, "Search exercises")}
${results(
  t,
  [
    ["Best matches", Q.best],
    ["By muscle, equipment or movement", Q.other],
  ],
  Q.chosen,
)}`;
  const foot = pinned(
    t,
    dv,
    `<p style="${s({ display: "flex", "align-items": "center", gap: 8, "min-height": 40 })}; ${txt(15, 600)}"><span style="display:grid">${icon("machine", 18)}</span>On ${Q.machine}</p><button type="button" style="${K.BTN(t, "primary")}; width: 100%">Add to session</button>`,
  );
  return K.root(
    t,
    `${SE.sessionMain(t, inner, dv, { bottom: dv.bottom + 8 + 56 + 48 + 12 })}${foot}`,
    { label: "Add exercise", dv },
  );
}

// ---------- logging a ride and a swim ----------
const figRow = (t, label, value, unit, dec, inc, hint = "") =>
  `<div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 12, padding: "10px 0", "border-bottom": `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${txt(16, 700)}">${label}</span>${hint ? `<span class="wrap" style="${txt(13, 500, { color: t.ink2 })}; ${tn}">${hint}</span>` : ""}</span><span style="${s({ display: "flex", "align-items": "center", gap: 10, "flex-shrink": 0 })}">${K.roundBtn(t, "minus", dec)}<output style="${s({ display: "flex", "align-items": "baseline", gap: 3, "min-width": 84, "justify-content": "center" })}"><span style="${num(value.length > 6 ? 26 : 30)}">${value}</span>${unit ? `<span style="${txt(13, 600, { color: t.ink2 })}">${unit}</span>` : ""}</output>${K.roundBtn(t, "plus", inc)}</span></div>`;
const effortRow = (t, chosen) =>
  `<div role="radiogroup" aria-labelledby="eff" style="${s({ display: "flex", "flex-direction": "column", gap: 6, padding: "12px 0 4px" })}"><p id="eff" style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline" })}"><span style="${txt(16, 700)}">Effort</span><span style="${txt(13, 500, { color: t.ink2 })}">1 very easy · 5 maximal</span></p><div style="${s({ display: "grid", "grid-template-columns": "repeat(5, minmax(0,1fr)) minmax(0,1.6fr)", gap: 2, padding: 3, background: t.surface, "border-radius": 14 })}">${[
    "1",
    "2",
    "3",
    "4",
    "5",
    "Not sure",
  ]
    .map(
      (v) =>
        `<button type="button" role="radio" aria-checked="${v === String(chosen)}" style="${s({ height: 46, "border-radius": 11, background: v === String(chosen) ? t.ink : "transparent", color: v === String(chosen) ? t.onInk : t.ink })}; ${v.length > 1 ? txt(14, 700) : num(20)}">${v}</button>`,
    )
    .join("")}</div></div>`;
function sportLog(t, dv, { titleText, where, rows, extra = "", save, label }) {
  const inner = `${SE.sessionHeader(t, { left: SE.backTo(t, "Training"), rest: false, more: null })}
<h2 style="${title(34)}; margin-top: 2px">${titleText}</h2>
<div style="margin-top:12px">${where}</div>
<div style="margin-top:6px">${rows}</div>
${extra}`;
  return K.root(
    t,
    `${SE.sessionMain(t, inner, dv, { bottom: dv.bottom + 8 + 56 + 8 })}${pinned(t, dv, `<button type="button" style="${K.BTN(t, "primary")}; width: 100%">${save}</button>`)}`,
    { label, dv },
  );
}
export function rideLogScreen(t, dv = K.D) {
  return sportLog(t, dv, {
    titleText: "Log a ride",
    where: K.iconChoice(
      t,
      [
        ["outdoor", "Outdoor"],
        ["trainer", "Indoor"],
      ],
      ride.where,
      { label: "Where" },
    ),
    rows: `${figRow(t, "Time", ride.time, "", "A minute less", "A minute more")}${figRow(t, "Distance", ride.km, "km", "Less, 0.1 km", "More, 0.1 km", `Overall average ${ride.speed} km/h`)}`,
    extra: `${effortRow(t, ride.effort)}<div style="padding:8px 0 4px">${labelled(t, "Assistance", seg(t, ["Not sure", "Unassisted", "Assisted"], ride.assist, "Assistance", { size: 15 }))}</div>`,
    save: "Save ride",
    label: "Log a ride",
  });
}
export function swimLogScreen(t, dv = K.D) {
  return sportLog(t, dv, {
    titleText: "Log a swim",
    where: K.iconChoice(
      t,
      [
        ["pool", "Pool"],
        ["openwater", "Open water"],
      ],
      swim.where,
      { label: "Where" },
    ),
    rows: `${figRow(t, "Elapsed time", swim.time, "", "A minute less", "A minute more", "Rests included")}<div style="padding:12px 0 6px">${labelled(t, "How it was measured", seg(t, ["Not known", "Count lengths", "Enter distance"], 1, "How it was measured", { size: 14 }))}</div>${figRow(t, "Pool length", swim.poolLength, "m", "Shorter", "Longer")}${figRow(t, "Lengths", swim.lengths, "", "One fewer", "One more", `${swim.total} m`)}`,
    extra: effortRow(t, swim.effort),
    save: "Save swim",
    label: "Log a swim",
  });
}

// ---------- TRAINING › a day of the programme ----------
export function programmeDayScreen(t, dv = K.D) {
  const X = upperB;
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const print = dayPrint({
    w: cw,
    h: K.short(dv) ? 96 : 120,
    paper: t.paper,
    align: "ends",
    parts: [
      { kind: "strength", columns: X.exercises.map((x) => ({ n: x.sets, done: 0 })) },
      { kind: "mobility", segments: X.warmup.drills, segDone: 0, modules: 3 },
    ],
    ariaLabel: "Upper B: seven exercises and the warm-up, all to do",
  });
  const inner = `${K.nestedHeader(t, "Training")}
${K.printFrame(print, { mt: 2 })}
<h2 style="${title(dv.W < 360 ? 30 : 34)}; margin-top: 12px">${X.name}</h2>
<p style="${txt(15, 500, { color: t.ink2 })}; margin-top: 2px">${X.focus}</p>
${K.metaLine(t, [`${icon("rest", 16)}<span>${X.time}</span>`, `<span>${X.effort}</span>`], { mt: 2 })}
<ul style="margin-top:8px">${SE.warmRow(t, { name: X.warmup.name, sub: `${X.warmup.drills} drills`, drills: X.warmup.drills, done: false })}${X.exercises.map((x, i) => planRow(t, x, { dv, last: i === X.exercises.length - 1 })).join("")}</ul>`;
  const foot = pinned(
    t,
    dv,
    `<button type="button" style="${K.BTN(t, "primary")}; width: 100%">${icon("play", 20)}Start workout</button>`,
    { bottom: K.navH(dv) + 12 },
  );
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv, bottom: K.navH(dv) + 12 + 56 + 8 })}${foot}${K.navbar(t, "training", { dv, nested: true })}`,
    { label: "Upper B, day 5 of the cycle", dv },
  );
}

// ---------- PROGRESS: History, Running, Body, Recovery ----------
const SECTIONS = ["Overview", "History", "Strength", "Running", "Recovery", "Body"];
const progressHead = (t, dv, active) =>
  `${K.topHeader(t, dv, "Progress", K.iconBtn(t, "sliders", "Filters: dates, activity, gym", { "margin-right": -10 }))}<div style="margin-top:2px">${K.tabs(
    t,
    SECTIONS.map((l) => ({ label: l, href: "#" })),
    active,
    { dv, scroll: true, id: "Progress sections" },
  )}</div>`;
// tabs scroll so the active one is in view: shift them left for the later sections
const shiftTabs = (t, html, px) =>
  html
    .replace(
      'overflow: hidden">',
      `overflow: hidden; position: relative"><div style="display:flex;gap:18px;transform:translateX(-${px}px)">`,
    )
    .replace(
      "</nav>",
      `</div><span aria-hidden="true" style="position:absolute;left:0;top:0;bottom:1px;width:40px;background:linear-gradient(to right, ${t.ground}, ${K.rgba0(t.ground)});pointer-events:none"></span></nav>`,
    );
const progressScreenOf = (t, dv, active, inner, label) => {
  let head = progressHead(t, dv, active);
  if (active >= 3) head = shiftTabs(t, head, active === 5 ? 132 : 96);
  return K.root(t, `${K.screenMain(t, head + inner, { dv })}${K.navbar(t, "progress", { dv })}`, {
    label,
    dv,
  });
};
export function historyListScreen(t, dv = K.D) {
  const lead = (r) =>
    r.sport === "recovery"
      ? `<span role="img" aria-label="Recovery" style="display:grid">${icon("moon", 18)}</span>`
      : K.stateMark(t, r.sport, 16, {
          indoor: !!r.indoor,
          label: { strength: "Workout", run: "Run", ride: "Ride", swim: "Swim" }[r.sport],
        });
  const rowFor = (r, last) =>
    `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 58, padding: "7px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(lead(r))}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span style="${s({ display: "flex", "justify-content": "space-between", gap: 10, "align-items": "baseline" })}"><span class="wrap" style="${txt(16, 700)}; ${tn}">${r.sport === "recovery" ? "Recovery" : r.title}</span>${r.meta ? `<span class="nb" style="${txt(15, 600)}; ${tn}">${r.meta}</span>` : ""}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${[r.time, r.extra].filter(Boolean).join(" · ")}</span></span></a></li>`;
  const inner = historyDays
    .map(
      (d) =>
        `<section>${K.caption(t, d.day, { mt: 14 })}<ul>${d.rows.map((r, i) => rowFor(r, i === d.rows.length - 1)).join("")}</ul></section>`,
    )
    .join("");
  return progressScreenOf(
    t,
    dv,
    1,
    `<div style="margin-top:2px">${inner}</div>`,
    "Progress, history",
  );
}
// Running: the weeks as strides, as tall as the distance run; then every run, its stride its context.
export function runningScreen(t, dv = K.D) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  // weekly distance, Mon 27 Jul to Mon 28 Sept, from the runs of Aug and Sept
  const weeks = [
    ["27 Jul", 3],
    ["3 Aug", 4],
    ["10 Aug", 5],
    ["17 Aug", 0],
    ["24 Aug", 4],
    ["31 Aug", 10.1],
    ["7 Sept", 9],
    ["14 Sept", 2.7],
    ["21 Sept", 9],
    ["28 Sept", 0],
  ];
  const h = 150,
    pad = 14,
    ground = h - 24,
    top = 26,
    max = 10.1;
  const P = palFor(t.paper);
  const PO = paperOpen(cw, h, {
    paper: t.paper,
    label: "Weekly distance, 27 July to 28 September: 3, 4, 5, 0, 4, 10.1, 9, 2.7, 9 and 0 km",
  });
  const slot = (cw - 2 * pad) / weeks.length;
  const strides = weeks
    .map(([, km], i) => {
      const hh = (km / max) * (ground - top);
      const x = pad + i * slot + 4;
      if (!km)
        return `<rect x="${(x + slot / 2 - 6).toFixed(1)}" y="${ground - 2}" width="10" height="2" fill="${P.label}"/>`;
      const body = (slot - 8) * 0.62,
        lean = Math.min(hh * 0.34, slot - 8 - body);
      return `<path d="M${x.toFixed(1)} ${ground}L${(x + lean).toFixed(1)} ${(ground - hh).toFixed(1)}H${(x + lean + body).toFixed(1)}L${(x + body).toFixed(1)} ${ground}Z" fill="${P.col.run}"/>`;
    })
    .join("");
  const F = "font-family:'Atkinson Hyperlegible Next',sans-serif";
  const chart = `${PO.open}${strides}<rect x="${pad - 4}" y="${ground}" width="${cw - 2 * pad + 8}" height="3" fill="${P.ink}"/>${PO.grain}<text x="${pad}" y="18" style="${F};font-size:12px;font-weight:700;fill:${P.ink}">10.1 km</text><text x="${pad}" y="${h - 6}" style="${F};font-size:12px;font-weight:600;fill:${P.label}">27 Jul</text><text x="${cw - pad}" y="${h - 6}" text-anchor="end" style="${F};font-size:12px;font-weight:600;fill:${P.label}">28 Sept</text>${PO.end}`;
  const runs = [...septRuns].reverse();
  const rowFor = (r, last) => {
    const indoor = r.where === "Treadmill";
    const when = `${["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"][(r.d - 1) % 7]} ${r.d} Sept`;
    return `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 56, padding: "7px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(K.stateMark(t, "run", 16, { indoor, label: r.where }))}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span style="${s({ display: "flex", "justify-content": "space-between", gap: 10, "align-items": "baseline" })}"><span style="${num(20)}">${r.km} <span style="${txt(13, 600, { color: t.ink2 })}">km</span></span><span class="nb" style="${num(17)}">${r.pace} <span style="${txt(13, 600, { color: t.ink2 })}">/km</span></span></span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${when} · ${r.time}</span></span></a></li>`;
  };
  const inner = `<div style="margin-top:12px">${seg(t, ["Distance", "Duration", "Pace"], 0, "Running measurement", { h: 40, size: 15 })}</div>
<h3 style="${txt(13, 700, { color: t.ink2 })}; margin: 14px 0 6px">Weekly distance</h3>
${K.printFrame(chart)}
${K.caption(t, "Runs", { mt: 16 })}<ul>${runs.map((r, i) => rowFor(r, i === runs.length - 1)).join("")}</ul>`;
  return progressScreenOf(t, dv, 3, inner, "Progress, running");
}
// Body: the weight, the latest reading in ink and the change since the first in range.
export function bodyScreen(t, dv = K.D) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const pts = weights.filter(([d]) => d !== "1 Jul");
  const h = 170,
    padL = 14,
    padR = 26,
    top = 18,
    bottom = h - 26;
  const lo = 75.8,
    hi = 77.7;
  const x = (i) => padL + (i / (pts.length - 1)) * (cw - padL - padR);
  const y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const path = pts
    .map(([, v], i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join("");
  const dots = pts
    .map(([, v], i) =>
      i === pts.length - 1
        ? ""
        : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="${t.ground}" stroke="${t.ink}" stroke-width="1.6"/>`,
    )
    .join("");
  const [lastD, lastV] = pts[pts.length - 1];
  const F = "font-family:'Atkinson Hyperlegible Next',sans-serif";
  const grid = [76, 77]
    .map(
      (v) =>
        `<line x1="${padL}" x2="${cw - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${t.hair}" stroke-width="1"/><text x="${cw - padR + 4}" y="${(y(v) + 4).toFixed(1)}" style="${F};font-size:12px;font-weight:600;fill:${t.ink2}">${v}</text>`,
    )
    .join("");
  const chart = `<svg width="${cw}" height="${h}" viewBox="0 0 ${cw} ${h}" role="img" aria-label="Body weight, 15 readings from 8 July to 28 September, from 76.05 to 77.47 kg" style="display:block;width:100%;height:auto">${grid}<path d="${path}" fill="none" stroke="${t.ink}" stroke-width="2" stroke-linejoin="round"/>${dots}<circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(lastV).toFixed(1)}" r="5.5" fill="${t.ink}"/><text x="${padL}" y="${h - 6}" style="${F};font-size:12px;font-weight:600;fill:${t.ink2}">8 Jul</text><text x="${x(pts.length - 1).toFixed(1)}" y="${h - 6}" text-anchor="end" style="${F};font-size:12px;font-weight:600;fill:${t.ink2}">${lastD}</text></svg>`;
  const list = [...pts].reverse().slice(0, 5);
  const inner = `${K.caption(t, "Body weight", { mt: 14 })}
<p style="${s({ display: "flex", "align-items": "baseline", gap: 10, "flex-wrap": "wrap", "margin-top": 2 })}"><span style="${num(56)}">77.5 <span style="${txt(16, 600, { color: t.ink2 })}">kg</span></span><span style="${txt(15, 600, { color: t.ink2 })}; ${tn}">+1.4 since 08/07</span></p>
<div style="margin-top:8px">${chart}</div>
${K.caption(t, "Readings", { mt: 14 })}<ul>${list.map(([d, v], i) => `<li style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline", "min-height": 44, padding: "10px 0", "border-bottom": i === list.length - 1 ? 0 : `1px solid ${t.hair}` })}"><span style="${txt(15, 600)}">${d}</span><span style="${num(20)}">${v.toFixed(2).replace(/0$/, "")} <span style="${txt(13, 600, { color: t.ink2 })}">kg</span></span></li>`).join("")}</ul>`;
  return progressScreenOf(t, dv, 5, inner, "Progress, body weight");
}
// Recovery: four latest readings to choose from, then the chosen one over the fortnight.
export function recoveryScreen(t, dv = K.D) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const latest = (k) => [...recovery].reverse().find((r) => r[k] != null)?.[k];
  const tile = (label, v, unit, on) =>
    `<label style="${s({ display: "flex", "flex-direction": "column", gap: 2, padding: "10px 12px", "border-radius": 14, background: on ? t.ink : t.surface, color: on ? t.onInk : t.ink, "min-width": 0 })}"><input type="radio" name="rm" ${on ? "checked" : ""} class="sr"><span style="${txt(14, 700)}">${label}</span><span class="nb" style="${num(26)}">${v} <span style="${txt(13, 600, { color: on ? t.onInk2 : t.ink2 })}">${unit}</span></span></label>`;
  const sleeps = recovery.filter((r) => r.sleep != null);
  const h = 150,
    pad = 10,
    bottom = h - 22,
    top = 14;
  const bw = (cw - 2 * pad) / sleeps.length;
  const yv = (v) => bottom - (v / 8) * (bottom - top);
  const F = "font-family:'Atkinson Hyperlegible Next',sans-serif";
  const bars = sleeps
    .map((r, i) => {
      const last = i === sleeps.length - 1;
      const x = pad + i * bw + 5;
      return `<rect x="${x.toFixed(1)}" y="${yv(r.sleep).toFixed(1)}" width="${(bw - 10).toFixed(1)}" height="${(bottom - yv(r.sleep)).toFixed(1)}" rx="3" fill="${last ? t.ink : t.surface2}"/><text x="${(x + (bw - 10) / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle" style="${F};font-size:12px;font-weight:600;fill:${t.ink2}">${r.d}</text>`;
    })
    .join("");
  // below 6 h the check-in warns (SHORT_SLEEP_HOURS, src/domain/recovery.ts)
  const six = `<line x1="${pad}" x2="${cw - pad}" y1="${yv(6).toFixed(1)}" y2="${yv(6).toFixed(1)}" stroke="${t.ink}" stroke-width="1" stroke-dasharray="3 3"/><text x="${pad}" y="${(yv(6) + 14).toFixed(1)}" style="${F};font-size:12px;font-weight:700;fill:${t.ink}">6 h</text>`;
  const chart = `<svg width="${cw}" height="${h}" viewBox="0 0 ${cw} ${h}" role="img" aria-label="Sleep, 8 readings from 15 to 27 September, 6.5 to 7.5 hours; the latest 7 hours" style="display:block;width:100%;height:auto">${bars}${six}</svg>`;
  const avg = Math.round((sleeps.reduce((a, r) => a + r.sleep, 0) / sleeps.length) * 100) / 100;
  const inner = `<p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 12px; ${tn}">${recovery.length} check-ins</p>
<div role="radiogroup" aria-label="Recovery measurement" style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: 8, "margin-top": 8 })}">${tile("Sleep", latest("sleep"), "h", true)}${tile("Sleep quality", latest("q"), "/ 5", false)}${tile("Fatigue", latest("f"), "/ 5", false)}${tile("Soreness", latest("s"), "/ 5", false)}</div>
<div style="margin-top:16px">${chart}</div>
<dl style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: 12, "margin-top": 12 })}"><div><dt style="${txt(13, 600, { color: t.ink2 })}">Latest</dt><dd style="${num(26)}; margin-top: 2px">7 <span style="${txt(13, 600, { color: t.ink2 })}">h</span></dd><dd style="${txt(13, 500, { color: t.ink2 })}">27 Sept 2026</dd></div><div><dt style="${txt(13, 600, { color: t.ink2 })}">Range average</dt><dd style="${num(26)}; margin-top: 2px">${avg} <span style="${txt(13, 600, { color: t.ink2 })}">h</span></dd><dd style="${txt(13, 500, { color: t.ink2 })}">From recorded answers only</dd></div></dl>`;
  return progressScreenOf(t, dv, 4, inner, "Progress, recovery");
}

// ---------- FOOD: adding to a meal, and a portion ----------
export function mealScreen(t, dv = K.D) {
  const rowFor = (name, sub, trail, last = false) =>
    `<li><button type="button" style="${s({ display: "flex", "align-items": "center", gap: 12, width: "100%", "min-height": 58, padding: "7px 0", "text-align": "left", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span class="wrap" style="${txt(16, 700)}">${name}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${sub}</span></span>${trail}</button></li>`;
  const plus = `<span aria-hidden="true" style="${s({ width: 36, height: 36, "border-radius": 18, background: t.surface, display: "grid", "place-items": "center", "flex-shrink": 0 })}">${icon("plus", 18)}</span>`;
  const kcal = (k) =>
    `<span class="nb" style="${num(20)}">${k} <span style="${txt(13, 600, { color: t.ink2 })}">kcal</span></span>`;
  const inner = `${K.nestedHeader(t, "Food")}
<h2 style="${title(34)}; margin-top: 2px">Dinner</h2>
<label style="${s({ display: "flex", "align-items": "center", gap: 10, height: 50, padding: "0 14px", "border-radius": 14, border: `1.5px solid ${t.control}`, "margin-top": 12 })}"><span style="display:grid;color:${t.ink2}">${icon("search", 20)}</span><span class="sr">Search your foods and saved meals</span><span aria-hidden="true" style="${txt(16, 500, { color: t.ink2 })}">Search your foods</span></label>
<ul style="margin-top:6px">
${rowFor("Quick add", "Calories and macros, just this once", `<span style="display:grid">${icon("bolt", 20)}</span>`)}
${FL.saved.map((m) => rowFor(`<span style="display:inline-flex;align-items:center;gap:6px">${icon("star", 16, { filled: true })}${m.name}</span>`, m.items.join(", "), kcal(m.kcal))).join("")}
${FL.foods.map(([n, p, k], i) => rowFor(n, `${p} · ${k} kcal`, plus, i === FL.foods.length - 1)).join("")}
</ul>`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv })}${K.navbar(t, "food", { dv, nested: true })}`,
    { label: "Dinner, Fri 25 Sept", dv },
  );
}
// The portion: how much, what it comes to, and the day's bowl with it in, still thinned.
export function portionScreen(t, dv = K.D) {
  const O = FL.oats;
  const eaten = F.meals.filter((m) => m.kcal).map((m) => [m.name, m.kcal]);
  const r = 40,
    w = 108,
    hh = 64;
  const fig = bowlFigure({
    r,
    cx: w / 2,
    rim: 16,
    meals: [...eaten, ["Dinner", 583.5, true]],
    target: F.target,
    paper: t.paper,
    rimW: 2.5,
  });
  const bowl = `<svg width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}" role="img" aria-label="Today’s bowl with the oats in: 1,736 of 2,300 kcal" style="display:block;flex-shrink:0;border-radius:10px;background:${t.paper}">${fig.svg}</svg>`;
  const amount = `<div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 12, padding: "6px 0" })}">${K.roundBtn(t, "minus", "Less", { size: 52, glyph: 22 })}<output style="${s({ display: "flex", "align-items": "baseline", gap: 4 })}"><span style="${num(42)}">${O.amount}</span><span style="${txt(16, 600, { color: t.ink2 })}">${O.unit}</span></output>${K.roundBtn(t, "plus", "More", { size: 52, glyph: 22 })}</div>`;
  const inner = `${sheetHead(t, "po-title", "Oats")}
<p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 2px; ${tn}">Per ${O.per} · ${O.perKcal} kcal · ${O.perMacros}</p>
<p style="${txt(14, 700)}; margin-top: 16px">Amount eaten</p>
${amount}
<div style="${s({ display: "flex", "align-items": "center", gap: 14, "margin-top": 10, padding: "12px 0", "border-top": `1px solid ${t.hair}` })}">${bowl}<div style="${s({ display: "flex", "flex-direction": "column", gap: 2, "min-width": 0 })}"><span class="nb" style="${num(26)}">${O.kcal} <span style="${txt(14, 600, { color: t.ink2 })}">kcal</span></span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${O.macros.map(([k, v]) => `${k} ${v} g`).join(" · ")}</span></div></div>
<button type="button" style="${K.BTN(t, "primary")}; width: 100%; margin-top: 8px">Add to Dinner</button>`;
  return K.root(t, `${under(mealScreen(t, dv))}${K.sheet(t, inner, { dv, id: "po-title" })}`, {
    label: "Oats, adding to dinner",
    dv,
  });
}

// ---------- OFFLINE: the one error a workout can meet ----------
export function offlineScreen(t, dv = K.D) {
  const inner = `${SE.sessionHeader(t, { left: SE.backTo(t, "Today"), rest: false, more: null })}
<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "flex-start", gap: 12, "margin-top": 80 })}"><span style="${s({ width: 64, height: 64, "border-radius": 9999, background: t.surface, display: "grid", "place-items": "center" })}">${icon("offline", 30)}</span><h2 style="${title(26)}">Something went wrong</h2><p style="${txt(17, 500, { "line-height": 1.45 })}">${C.offline}</p></div>`;
  const foot = pinned(
    t,
    dv,
    `<button type="button" style="${K.BTN(t, "primary")}; width: 100%">Try again</button><a href="#" style="${s({ display: "grid", "place-items": "center", height: 44 })}; ${txt(15, 700)}">Back to Today</a>`,
  );
  return K.root(
    t,
    `${SE.sessionMain(t, inner, dv, { bottom: dv.bottom + 8 + 56 + 52 + 10 })}${foot}`,
    { label: "Offline", dv },
  );
}
