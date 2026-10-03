// More of the app, drawn with the same parts: the More options sheet, a superset being logged, a
// fallback chosen, an exercise added, a ride and a swim logged, a programme day opened, History,
// Running, Body and Recovery under Progress, adding food to a meal, and being offline. Copy and
// values from the repository: exercise-search.ts run over the seeded library, the multisport,
// history and people seeds, program.ts, the food preview and the app's own formatters.
import { s, esc } from "./lib.mjs";
import * as K from "./kit.mjs";
import { dayPrint, bowlFigure } from "./art.mjs";
import * as SE from "./session.mjs";
import { todayScreen, planRow } from "./today.mjs";
import { seg, labelled } from "./more.mjs";
import { SECTIONS, progressHeader } from "./progress.mjs";
import {
  carry,
  pullUpSearch,
  quadSearch,
  ride,
  swim,
  upperB,
  historyDays,
  rangeRuns,
  runWeeks,
  weights,
  recovery,
  foodLibrary as FL,
  food as F,
  copy as C,
  EQUIP,
} from "./data.mjs";

const { txt, num, title, icon, tn } = K;
const glyphOf = (m) => EQUIP[m] || "dumbbell";
const NAMES = {
  dumbbell: "Free weights",
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
  // skipping stands apart from the rest, led by its own glyph
  const skip = `<li style="${s({ "margin-top": 14, "padding-top": 6, "border-top": `1px solid ${t.hair}` })}"><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 56 })}">${K.markCell(`<span style="display:grid">${icon("skip", 22)}</span>`)}<span class="wrap" style="${txt(17, 700, { flex: "1 1 auto" })}">Skip this session</span>${K.chev(t)}</a></li>`;
  const inner = `${sheetHead(t, "mo-title", "More options")}<ul style="margin-top:4px">${opt("calendar", "Train another day")}${opt("plus", "Start an ad hoc session")}${opt("coach", "Prepare this session", { last: true })}${skip}</ul>`;
  return K.root(t, `${under(todayScreen(t, dv))}${K.sheet(t, inner, { dv, id: "mo-title" })}`, {
    label: "Today",
    dv,
  });
}

// ---------- THE SESSION: a superset, being logged ----------
// The carry is measured in metres and rated by RPE. Nothing is logged yet, so the log holds one line:
// the partner the flow goes to after each set, the wrist curl, with its prescription.
export function supersetLogScreen(t, dv = K.D) {
  const X = carry;
  const cw = dv.W - 2 * K.gut(dv);
  const head = `${SE.sessionHeader(t, { left: SE.backTo(t, X.back), rest: false, more: "Complete, skip, superset, substitute" })}
<h2 style="${title(K.titleSize(X.exercise, cw, dv.W < 360 ? 28 : 32), { lh: 1.05 })}; margin-top: 2px">${X.exercise}</h2>
${K.metaLine(t, [`${K.equip(t, "dumbbell", "Free weights")}<span>${SE.perSet(X.rx)}</span>`, `${icon("rest", 16)}<span>${X.rest}</span>`], { mt: 4 })}
<div style="margin-top:6px">${K.tabs(t, ["Log", "Technique", "History"], 0, { dv, id: "Exercise detail" })}</div>
${SE.panel(0, `<p aria-label="Superset: after each set, ${esc(X.partner)}, 2 × 12–20 @ 1 RIR" style="${s({ display: "flex", "align-items": "center", gap: 8, "min-height": 44, "margin-top": 8, "margin-bottom": 8 })}"><span style="${s({ display: "grid", color: t.ink2 })}">${icon("link", 18)}</span><span style="${txt(16, 700)}">Then ${X.partner}</span><span style="${txt(14, 500, { color: t.ink2 })}; ${tn}">2 × 12–20 @ 1 RIR</span></p>`, "margin-top:auto")}`;
  // the entry on the log's grid, as for a lift: the set's number column empty, then load, metres
  // and RPE; − and + under each figure while the column holds both, over and under it otherwise
  const bsize = dv.android ? 48 : 44;
  const opW = cw < 340 ? 14 : 18,
    colW = (cw - SE.NUM_W - 2 * opW) / 3;
  const vertical = colW < 2 * bsize + 8;
  const size = K.onRamp(K.fit(X.load, colW - 6, 42, 28));
  const common = { size, bsize, vertical };
  const load = K.stepFigure(t, {
    ...common,
    value: X.load,
    unit: "kg",
    state: "suggested",
    dec: "Less load, 2.5 kg",
    inc: "More load, 2.5 kg",
    name: `${X.load} kilograms, suggested. Type a load`,
  });
  const dist = K.stepFigure(t, {
    ...common,
    value: X.metres,
    unit: "m",
    state: "suggested",
    dec: "5 metres less",
    inc: "5 metres more",
    name: `${X.metres} metres, suggested. Type metres`,
  });
  const rpe = K.stepFigure(t, {
    ...common,
    value: "",
    unit: "RPE",
    state: "empty",
    hint: "1–10",
    tag: K.infoTip(t, "What RPE means"),
    dec: "RPE one lower",
    inc: "RPE one higher",
    name: "RPE not set, 1 very easy to 10 maximal. Type RPE",
  });
  const opTop =
    (vertical ? bsize + 4 : 0) +
    Math.max(0, Math.round((44 - size * 1.1) / 2)) +
    Math.round(size * 0.32);
  const op = (c) =>
    `<span aria-hidden="true" style="${s({ "padding-top": opTop, color: t.ink2, "text-align": "center" })}; ${txt(K.onRamp(size * 0.5), 500)}">${c}</span>`;
  const figures = `<div style="${s({ display: "grid", "grid-template-columns": SE.gridCols(opW), "align-items": "start" })}"><span></span>${load}${op("×")}${dist}${op("·")}${rpe}</div>`;
  const ent = `<section aria-label="Set 1 of 3" style="${s({ display: "flex", "flex-direction": "column", gap: K.short(dv) ? 8 : 12, "padding-top": 10, "border-top": `1px solid ${t.hair}`, "flex-shrink": 0, background: t.ground })}">
<div style="${s({ display: "flex", "align-items": "center", gap: 10, height: 44 })}"><h3 style="${txt(17, 700)}; ${tn}">Set 1 <span style="color:${t.ink2}">of 3</span></h3><span style="flex:1 1 auto"></span><button type="button" aria-haspopup="dialog" aria-label="Set options: add a set, type, notes, remove" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", color: t.ink2, "margin-right": -10 })}">${icon("sliders", 20)}</button></div>
${figures}
<div style="margin-top:2px">${SE.saveWaiting(t, { id: "rpe-hint", need: SE.RPE_NEEDED })}</div></section>`;
  const G = K.gut(dv);
  const inner = `<div style="${s({ flex: "1 1 auto", "min-height": 0, overflow: "hidden", display: "flex", "flex-direction": "column", margin: `0 -${G}px`, padding: `0 ${G}px` })}">${head}</div>${ent}`;
  return K.root(t, SE.sessionMain(t, inner, dv, { flex: true, fade: false }), {
    label: "Farmer’s carry",
    dv,
  });
}

// ---------- a search result list: equipment glyph, name, muscles; the chosen one checked ----------
function results(t, sections, chosen) {
  const rowFor = ([name, modality, muscles], last) => {
    const on = name === chosen;
    const g = glyphOf(modality);
    // the name at the gutter; its equipment's glyph leads the second line, as on the workout's rows
    return `<li><button type="button" aria-pressed="${on}" style="${s({ display: "flex", "align-items": "center", gap: 12, width: "100%", "min-height": 56, padding: "7px 0", "text-align": "left", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span class="wrap" style="${txt(16, 700)}">${name}</span><span class="wrap" style="${s({ display: "flex", "align-items": "center", gap: 6, "margin-top": 2 })}; ${txt(14, 500, { color: t.ink2 })}">${K.equip(t, g, NAMES[g])}<span>${muscles}</span></span></span>${on ? `<span aria-label="Chosen" style="${s({ width: 26, height: 26, "border-radius": 9999, background: t.ink, color: t.onInk, display: "grid", "place-items": "center", "flex-shrink": 0 })}">${icon("check", 15)}</span>` : ""}</button></li>`;
  };
  return sections
    .map(
      ([label, rows]) =>
        `<section>${K.caption(t, label, { mt: 14 })}<ul>${rows.map((r, i) => rowFor(r, i === rows.length - 1)).join("")}</ul></section>`,
    )
    .join("");
}
const searchBox = (t, value, label) =>
  `<label style="${s({ display: "flex", "align-items": "center", gap: 10, height: 50, padding: "0 6px 0 14px", "border-radius": 14, border: `1.5px solid ${t.ink}`, "margin-top": 12 })}"><span style="display:grid;color:${t.ink2}">${icon("search", 20)}</span><span class="sr">${label}</span><span style="${txt(16, 600, { flex: "1 1 auto" })}">${value}</span><button type="button" aria-label="Clear the search" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", color: t.ink2 })}">${icon("close", 18)}</button></label>`;

// Add a fallback: Lower A's leg extension at Samsung Gym, where no machine is registered yet. The
// search runs over every other exercise; the chosen one is named under the box, then the machine,
// then Save fallback (src/app/(app)/gyms/[gymId]/programme/[exerciseId]/fallback/).
export function substituteScreen(t, dv = K.D) {
  const Q = quadSearch;
  const inner = `${SE.sessionHeader(t, { left: SE.backTo(t, "Gyms"), rest: false, more: null })}
<h2 style="${title(dv.W < 360 ? 30 : 34)}; margin-top: 2px">Add fallback</h2>
<p style="${txt(16, 500, { color: t.ink2 })}; margin-top: 4px">Instead of <b style="font-weight:700;color:${t.ink}">Leg extension</b> at ${Q.gym}</p>
${searchBox(t, Q.query, "Search exercises")}
<p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 8px">Selected: <span style="${txt(14, 700, { color: t.ink })}">${Q.chosen}</span></p>
${results(
  t,
  [
    ["Best matches", Q.best],
    [`By muscle, equipment or movement · ${Q.otherCount}`, Q.other],
  ],
  Q.chosen,
)}`;
  const foot = pinned(
    t,
    dv,
    `<button type="button" aria-haspopup="listbox" aria-label="Machine: Any" style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 10, width: "100%", "min-height": 48 })}"><span style="${txt(16, 700)}">Machine</span><span style="${s({ display: "flex", "align-items": "center", gap: 6 })}; ${txt(16, 600)}">Any${icon("chevronDown", 18)}</span></button><button type="button" style="${K.BTN(t, "primary")}; width: 100%">Save fallback</button>`,
  );
  return K.root(
    t,
    `${SE.sessionMain(t, inner, dv, { bottom: dv.bottom + 8 + 56 + 52 + 12 })}${foot}`,
    { label: "Add fallback", dv },
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
  K.rowStepper(t, { label, value, unit, dec, inc, hint });
const effortRow = (t, chosen) =>
  `<div role="radiogroup" aria-labelledby="eff" style="${s({ display: "flex", "flex-direction": "column", gap: 6, padding: "12px 0 4px" })}"><p id="eff" style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline" })}"><span style="${txt(16, 700)}">Effort</span><span style="${txt(13, 500, { color: t.ink2 })}">1 very easy to 5 maximal</span></p><div style="${s({ display: "grid", "grid-template-columns": "repeat(5, minmax(0,1fr)) minmax(0,1.6fr)", gap: 2, padding: 3, background: t.surface, "border-radius": 14 })}">${[
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
    rows: `${figRow(t, "Duration", ride.time, "", "A minute less", "A minute more")}${figRow(t, "Distance", ride.km, "km", "Less, 0.1 km", "More, 0.1 km", `Optional · overall average ${ride.speed}\u00a0km/h`)}`,
    extra: `${effortRow(t, ride.effort)}<div style="padding:8px 0 4px">${labelled(t, "Assistance", seg(t, ["Not sure", "Unassisted", "Assisted"], ride.assist, "Assistance", { size: 15 }))}</div>`,
    save: "Save activity",
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
    save: "Save activity",
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

    parts: [
      { kind: "mobility", segments: X.warmup.drills, segDone: 0, modules: 3 },
      { kind: "strength", columns: X.exercises.map((x) => ({ n: x.sets, done: 0 })) },
    ],
    ariaLabel: "Upper B: the warm-up and seven exercises, all to do",
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
    { label: "Upper B", dv },
  );
}

// ---------- PROGRESS: History, Running, Body, Recovery ----------

const progressScreenOf = (t, dv, active, inner, label, range = "") => {
  const head = progressHeader(t, dv, SECTIONS[active], range);
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
    `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 58, padding: "7px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(lead(r))}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span style="${s({ display: "flex", "justify-content": "space-between", gap: 10, "align-items": "baseline" })}"><span class="wrap" style="${txt(16, 700)}; ${tn}">${r.sport === "recovery" ? "Recovery" : r.title}</span>${r.meta ? `<span class="nb" style="${txt(15, 600)}; ${tn}">${r.meta}</span>` : ""}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${[r.time, r.sport === "strength" ? "Anytime Fitness" : null, r.extra].filter(Boolean).join(" · ")}</span></span></a></li>`;
  const inner = `<p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 12px; ${tn}">80 entries</p>${historyDays
    .map(
      (d) =>
        `<section>${K.caption(t, d.day, { mt: 14 })}<ul>${d.rows.map((r, i) => rowFor(r, i === d.rows.length - 1)).join("")}</ul></section>`,
    )
    .join("")}`;
  return progressScreenOf(
    t,
    dv,
    1,
    `<div style="margin-top:2px">${inner}</div>`,
    "Progress",
    "8 Jul – 29 Sept 2026",
  );
}
// Running: the weeks as bars in ink, then every run. Progress charts are interface, drawn in ink on
// the ground like Body and Recovery; the art stays in the calendar and on each day's record.
export function runningScreen(t, dv = K.D) {
  // the weeks of the range (analytics.ts's Monday weeks), each a bar as tall as the distance run,
  // in control grey; this week, still running, in ink. Scale lines at 5 and 10 km, their labels in
  // a margin column so no bar runs under them.
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const weeks = runWeeks;
  const h = 132,
    padL = 26,
    bottom = h - 2,
    top = 10,
    max = 11;
  const yv = (km) => bottom - (km / max) * (bottom - top);
  const slot = (cw - padL) / weeks.length;
  const F = "font-family:'Atkinson Hyperlegible Next',sans-serif";
  const bars = weeks
    .map(([, km, now], i) => {
      const bw = Math.min(14, slot * 0.56),
        x = padL + i * slot + (slot - bw) / 2;
      const hh = Math.max(now ? 3 : 0, bottom - yv(km));
      return hh
        ? `<rect x="${x.toFixed(1)}" y="${(bottom - hh).toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" rx="${Math.min(3, hh / 2).toFixed(1)}" fill="${now ? t.ink : t.control}"/>`
        : "";
    })
    .join("");
  const scale = [5, 10]
    .map(
      (v) =>
        `<line x1="${padL - 4}" x2="${cw}" y1="${yv(v).toFixed(1)}" y2="${yv(v).toFixed(1)}" stroke="${t.hair}" stroke-width="1"/><text x="0" y="${(yv(v) + 4).toFixed(1)}" style="${F};font-size:12px;font-weight:600;fill:${t.ink2}">${v}</text>`,
    )
    .join("");
  const chart = `<svg width="${cw}" height="${h}" viewBox="0 0 ${cw} ${h}" role="img" aria-label="Weekly distance, 13 weeks from 6 July: ${weeks.map(([, km]) => km).join(", ")} km, this week so far" style="display:block;width:100%;height:auto">${scale}<line x1="${padL - 4}" x2="${cw}" y1="${bottom}" y2="${bottom}" stroke="${t.hair}" stroke-width="1"/>${bars}</svg>`;
  const rowFor = (r, last) => {
    const indoor = r.where === "Treadmill";
    return `<li><a href="#" style="${s({ display: "flex", "flex-direction": "column", "justify-content": "center", "min-height": 56, padding: "7px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "justify-content": "space-between", gap: 10, "align-items": "baseline" })}"><span style="${num(20)}">${r.km} <span style="${txt(13, 600, { color: t.ink2 })}">km</span></span><span class="nb" style="${num(17)}">${r.pace} <span style="${txt(13, 600, { color: t.ink2 })}">/km</span></span></span>${K.metaLine(t, [`${K.equip(t, indoor ? "treadmill" : "outdoor", r.where)}<span>${r.when} · ${r.time}</span>`], { size: 14, mt: 1 })}</a></li>`;
  };
  const inner = `<div style="margin-top:12px">${seg(t, ["Distance", "Duration", "Pace"], 0, "Running measurement", { h: 44, size: 15 })}</div>
<h3 style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline", gap: 8, margin: "14px 0 8px" })}"><span style="${txt(13, 700, { color: t.ink2 })}">Weekly distance (km)</span><span style="${txt(13, 500, { color: t.ink2 })}; ${tn}">13 weeks · this week so far</span></h3>
${chart}
<p aria-hidden="true" style="${s({ display: "flex", "justify-content": "space-between", "margin-top": 4, "padding-left": 26 })}; ${txt(12, 600, { color: t.ink2 })}"><span>6 Jul</span><span>28 Sept</span></p>
${K.caption(t, "Runs", { mt: 16 })}<ul>${rangeRuns.map((r, i) => rowFor(r, i === rangeRuns.length - 1)).join("")}</ul>`;
  return progressScreenOf(t, dv, 3, inner, "Progress", "6 Jul – 29 Sept 2026");
}
// Body: the weight, the latest reading in ink and the change since the first in range.
export function bodyScreen(t, dv = K.D) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const pts = weights.filter(([d]) => d !== "1 Jul");
  // the scale in the left margin, as on every Progress chart
  const h = 170,
    padL = 26,
    padR = 14,
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
        `<line x1="${padL}" x2="${cw - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${t.hair}" stroke-width="1"/><text x="0" y="${(y(v) + 4).toFixed(1)}" style="${F};font-size:12px;font-weight:600;fill:${t.ink2}">${v}</text>`,
    )
    .join("");
  const chart = `<svg width="${cw}" height="${h}" viewBox="0 0 ${cw} ${h}" role="img" aria-label="Body weight, 15 readings from 8 July to 28 September, from 76.1 to 77.5 kg" style="display:block;width:100%;height:auto">${grid}<path d="${path}" fill="none" stroke="${t.ink}" stroke-width="2" stroke-linejoin="round"/>${dots}<circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(lastV).toFixed(1)}" r="5.5" fill="${t.ink}"/><text x="${padL}" y="${h - 6}" style="${F};font-size:12px;font-weight:600;fill:${t.ink2}">8 Jul</text><text x="${x(pts.length - 1).toFixed(1)}" y="${h - 6}" text-anchor="end" style="${F};font-size:12px;font-weight:600;fill:${t.ink2}">${lastD}</text></svg>`;
  // the latest reading and the change since the first in range, to 0.1 as the app shows them; the
  // readings themselves wait behind View values, so the latest is not said twice
  const inner = `${K.caption(t, "Body weight", { mt: 14 })}
<p style="${s({ display: "flex", "align-items": "baseline", gap: 10, "flex-wrap": "wrap", "margin-top": 2 })}"><span style="${num(56)}">77.5 <span style="${txt(16, 600, { color: t.ink2 })}">kg</span></span><span style="${txt(15, 600, { color: t.ink2 })}; ${tn}">+1.4 since 8 Jul</span></p>
<div style="margin-top:8px">${chart}</div>
<button type="button" aria-expanded="false" style="${s({ display: "flex", "align-items": "center", gap: 12, width: "100%", "min-height": 52, "margin-top": 6, "border-top": `1px solid ${t.hair}`, "border-bottom": `1px solid ${t.hair}` })}">${K.markCell(`<span style="display:grid">${icon("table", 20)}</span>`)}<span style="${txt(16, 700, { flex: "1 1 auto", "text-align": "left" })}">View values</span><span style="${txt(14, 600, { color: t.ink2 })}; ${tn}">${pts.length}</span>${icon("chevronDown", 18)}</button>`;
  return progressScreenOf(t, dv, 5, inner, "Progress", "6 Jul – 29 Sept 2026");
}
// Recovery: four latest readings to choose from, then the chosen one over the fortnight.
export function recoveryScreen(t, dv = K.D) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const latest = (k) => [...recovery].reverse().find((r) => r[k] != null)?.[k];
  const tile = (label, v, unit, on) =>
    `<label style="${s({ display: "flex", "flex-direction": "column", gap: 2, padding: "10px 12px", "border-radius": 14, background: on ? t.ink : t.surface, color: on ? t.onInk : t.ink, "min-width": 0 })}"><input type="radio" name="rm" ${on ? "checked" : ""} class="sr"><span style="${txt(14, 700)}">${label}</span><span class="nb" style="${num(26)}">${v} <span style="${txt(13, 600, { color: on ? t.onInk2 : t.ink2 })}">${unit}</span></span></label>`;
  const sleeps = recovery.filter((r) => r.sleep != null);
  // the 6 h rule's label stands in its own margin column, so no bar runs under it
  const h = 150,
    pad = 34,
    bottom = h - 22,
    top = 14;
  const bw = (cw - pad - 2) / sleeps.length;
  const yv = (v) => bottom - (v / 8) * (bottom - top);
  const F = "font-family:'Atkinson Hyperlegible Next',sans-serif";
  const bars = sleeps
    .map((r, i) => {
      // every reading its own bar, in control grey (3:1 on the ground), the latest in ink; each
      // month named under its first reading
      const last = i === sleeps.length - 1;
      const gap = Math.max(2, bw * 0.28);
      const x = pad + i * bw + gap / 2;
      const month = r.date.split(" ")[1];
      const firstOfMonth = i === 0 || sleeps[i - 1].date.split(" ")[1] !== month;
      return `<rect x="${x.toFixed(1)}" y="${yv(r.sleep).toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${(bottom - yv(r.sleep)).toFixed(1)}" rx="1.5" fill="${last ? t.ink : t.control}"/>${firstOfMonth ? `<text x="${x.toFixed(1)}" y="${h - 6}" style="${F};font-size:12px;font-weight:600;fill:${t.ink2}">${month}</text>` : ""}`;
    })
    .join("");
  // below 6 h the check-in warns (SHORT_SLEEP_HOURS, src/domain/recovery.ts)
  const six = `<line x1="${pad - 4}" x2="${cw}" y1="${yv(6).toFixed(1)}" y2="${yv(6).toFixed(1)}" stroke="${t.ink}" stroke-width="1"/><text x="0" y="${(yv(6) + 4).toFixed(1)}" style="${F};font-size:12px;font-weight:700;fill:${t.ink}">6 h</text>`;
  const chart = `<svg width="${cw}" height="${h}" viewBox="0 0 ${cw} ${h}" role="img" aria-label="Sleep, 31 readings from 8 July to 27 September, 6.5 to 7.5 hours; the latest 7 hours" style="display:block;width:100%;height:auto">${bars}${six}</svg>`;
  const avg = Math.round((sleeps.reduce((a, r) => a + r.sleep, 0) / sleeps.length) * 100) / 100;
  const inner = `<p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 12px; ${tn}">${recovery.length} check-ins in this range</p>
<div role="radiogroup" aria-label="Recovery measurement" style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: 8, "margin-top": 8 })}">${tile("Sleep", latest("sleep"), "h", true)}${tile("Sleep quality", latest("q"), "/ 5", false)}${tile("Fatigue", latest("f"), "/ 5", false)}${tile("Soreness", latest("s"), "/ 5", false)}</div>
<p style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline", gap: 8, "margin-top": 16 })}"><span style="${txt(15, 700)}">Sleep</span><span style="${txt(13, 500, { color: t.ink2 })}; ${tn}">${sleeps.length} readings</span></p>
<div style="margin-top:8px">${chart}</div>
<dl style="${s({ "margin-top": 12 })}"><div><dt style="${txt(13, 600, { color: t.ink2 })}">Range average</dt><dd style="${num(26)}; margin-top: 2px">${avg} <span style="${txt(13, 600, { color: t.ink2 })}">h</span></dd><dd style="${txt(13, 500, { color: t.ink2 })}">From recorded answers only</dd></div></dl>`;
  return progressScreenOf(t, dv, 4, inner, "Progress", "6 Jul – 29 Sept 2026");
}

// ---------- FOOD: adding to a meal, and a portion ----------
export function mealScreen(t, dv = K.D) {
  // every name at the gutter; a row's glyph (a saved meal's star, Quick add's bolt) follows its name
  const rowFor = (glyph, name, sub, trail, last = false) =>
    `<li><button type="button" style="${s({ display: "flex", "align-items": "center", gap: 12, width: "100%", "min-height": 58, padding: "7px 0", "text-align": "left", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span class="wrap" style="${s({ display: "flex", "align-items": "center", gap: 6 })}; ${txt(16, 700)}">${name}${glyph ? `<span style="${s({ display: "grid", color: t.ink2, "flex-shrink": 0 })}">${glyph}</span>` : ""}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${sub}</span></span>${trail}</button></li>`;
  const plus = `<span aria-hidden="true" style="${s({ width: 36, height: 36, "border-radius": 18, background: t.surface, display: "grid", "place-items": "center", "flex-shrink": 0 })}">${icon("plus", 18)}</span>`;
  const kcal = (k) =>
    `<span class="nb" style="${num(20)}">${k} <span style="${txt(13, 600, { color: t.ink2 })}">kcal</span></span>`;
  const inner = `${K.nestedHeader(t, "Food")}
<h2 style="${title(34)}; margin-top: 2px">Dinner</h2>
<label style="${s({ display: "flex", "align-items": "center", gap: 10, height: 50, padding: "0 14px", "border-radius": 14, border: `1.5px solid ${t.control}`, "margin-top": 12 })}"><span style="display:grid;color:${t.ink2}">${icon("search", 20)}</span><span class="sr">Search your foods and saved meals</span><span aria-hidden="true" style="${txt(16, 500, { color: t.ink2 })}">Search your foods</span></label>
<ul style="margin-top:6px">
${rowFor(icon("bolt", 16), "Quick add", "Calories and macros, just this once", "")}
${FL.saved.map((m) => rowFor(K.named("star", 16, "Saved meal"), m.name, m.items.join(", "), kcal(m.kcal))).join("")}
${FL.foods.map(([n, p, k], i) => rowFor("", n, `${p} · ${k} kcal`, plus, i === FL.foods.length - 1)).join("")}
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
  const bowl = `<svg width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}" role="img" aria-label="Today’s bowl with the oats in: 1,736 of 2,300 kcal" style="display:block;flex-shrink:0;background:${t.paper}">${fig.svg}</svg>`;
  const amount = `<div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 12, padding: "6px 0" })}">${K.roundBtn(t, "minus", "Less oats")}<output style="${s({ display: "flex", "align-items": "baseline", gap: 4 })}"><span style="${num(42)}">${O.amount}</span><span style="${txt(16, 600, { color: t.ink2 })}">${O.unit}</span></output>${K.roundBtn(t, "plus", "More oats")}</div>`;
  const inner = `${sheetHead(t, "po-title", "Oats")}
<p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 2px; ${tn}">Per ${O.per} · ${O.perKcal} kcal · ${O.perMacros}</p>
<p style="${txt(14, 700)}; margin-top: 16px">Amount eaten</p>
${amount}
<div style="${s({ display: "flex", "align-items": "center", gap: 14, "margin-top": 10, padding: "12px 0", "border-top": `1px solid ${t.hair}` })}">${bowl}<div style="${s({ display: "flex", "flex-direction": "column", gap: 2, "min-width": 0 })}"><span class="nb" style="${num(26)}">${O.kcal} <span style="${txt(14, 600, { color: t.ink2 })}">kcal</span></span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${O.macros.map(([k, v]) => `${k} ${v} g`).join(" · ")}</span></div></div>
<button type="button" style="${K.BTN(t, "primary")}; width: 100%; margin-top: 8px">Add to Dinner</button>`;
  return K.root(t, `${under(mealScreen(t, dv))}${K.sheet(t, inner, { dv, id: "po-title" })}`, {
    label: "Dinner",
    dv,
  });
}

// ---------- OFFLINE: the one error a workout can meet ----------
export function offlineScreen(t, dv = K.D) {
  // the app's error page in a workout (error.tsx): one way back, and Try again waits for the
  // connection, as the app's does
  const inner = `<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "flex-start", gap: 12, "margin-top": 128 })}"><span style="${s({ width: 64, height: 64, "border-radius": 9999, background: t.surface, display: "grid", "place-items": "center" })}">${icon("offline", 30)}</span><h2 style="${title(26)}">Something went wrong</h2><p style="${txt(17, 500, { "line-height": 1.45 })}">${C.offline}</p></div>`;
  const foot = pinned(
    t,
    dv,
    `<button type="button" aria-disabled="true" style="${K.BTN(t, "waiting")}; width: 100%">Try again</button><a href="Today.dc.html" style="${s({ display: "grid", "place-items": "center", height: 44 })}; ${txt(15, 700)}">Back to Today</a>`,
  );
  return K.root(
    t,
    `${SE.sessionMain(t, inner, dv, { bottom: dv.bottom + 8 + 56 + 52 + 10 })}${foot}`,
    { label: "Something went wrong", dv },
  );
}
