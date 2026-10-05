// THE SESSION: a full-screen layer over the tabs, from Start to Finish.
//
// Starting a workout opens the session over the app: no tab bar, so the entry gets that height
// and Save never sits above a tab. Minimising it leaves the session strip on every screen, which
// opens it again (iOS: the tab bar's accessory zooming into a full-screen cover; Android: a
// full-screen destination that collapses into the bottom bar on back).
//
// Rest lives in one place on every screen of the session: a pill in the header, a ring that
// empties. Logging is three tabs: Log, Technique, History. Log is the sets so far, a line each,
// written when the server confirms them; the entry is docked at the foot, in the same columns, and
// reads like the notation it records: 62.5 × 3 @ 2.
import { s, esc } from "./lib.mjs";
import * as K from "./kit.mjs";
import { dayPrint } from "./art.mjs";
import {
  upperA,
  upperA3,
  armsWorkout,
  lowerA,
  bench,
  sept8,
  run2Aug,
  EQUIP,
  copy as C,
} from "./data.mjs";

const { txt, num, title, icon, tn } = K;
const glyphFor = (m) => EQUIP[m] || "dumbbell";
const equipName = (m) =>
  ({
    dumbbell: "Free weights",
    bodyweight: "Bodyweight",
    cable: "Cable",
    machine: "Machine",
    smith: "Smith machine",
  })[glyphFor(m)];

// ---------- header pieces ----------
const minimise = () =>
  `<button type="button" aria-label="Minimise the workout" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "flex-shrink": 0, "margin-left": -10 })}">${icon("chevronDown", 24)}</button>`;
const finishBtn = (t) =>
  `<a href="Finish.dc.html" style="${s({ display: "flex", "align-items": "center", height: 44, "flex-shrink": 0 })}"><span style="${K.BTN(t, "outline", { h: 36 })}; padding: 0 14px; font-size: 15px">Finish</span></a>`;
export function sessionHeader(
  t,
  {
    left,
    rest = true,
    finish = false,
    more = "Session details, add exercise, superset",
    restOpts = {},
  } = {},
) {
  return `<header style="${s({ display: "flex", "align-items": "center", gap: 8, height: 48, "flex-shrink": 0 })}">${left}<span style="flex:1 1 auto"></span>${rest ? K.restPill(t, { time: bench.restNow.time, frac: bench.restNow.frac, ...restOpts }) : ""}${finish ? finishBtn(t) : ""}${more ? `<span style="margin-right:-10px">${K.iconBtn(t, "more", more)}</span>` : ""}</header>`;
}
const backTo = (t, label, href = "#") =>
  `<a href="${K.backHref(t, label, href)}" style="${s({ display: "flex", "align-items": "center", gap: 2, height: 44, "margin-left": -10, "padding-right": 6, "min-width": 0 })}; ${txt(17, 700)}">${icon("chevronLeft", 22)}<span class="nb" style="overflow:hidden;text-overflow:ellipsis">${label}</span></a>`;
// a session screen has no tab bar: the body runs to the safe area
const sessionMain = (t, inner, dv, { bottom = 0, flex = false, fade = true } = {}) =>
  K.screenMain(t, inner, { dv, bottom: bottom || dv.bottom + 8, flex, fade });

// ---------- the workout ----------
// One exercise: its name, then its equipment and prescription. No mark beside it: the sets are in
// the prescription once and in the print above. Where it stands is said only when it is news: a
// check when done, Resume on the one under way, Skipped when dropped.
function exRow(t, x, { open = false, done = false, skipped = false, last = false } = {}) {
  const gl = K.equip(t, glyphFor(x.modality), equipName(x.modality));
  const sub = skipped
    ? ""
    : open && x.last
      ? `${gl}<span>${x.last}</span>`
      : `${gl}<span>${x.rx}</span>${!open && !done && x.instead ? `<span>instead of ${x.instead}</span>` : ""}`;
  const note = x.note
    ? `<span style="${s({ display: "flex", gap: 6, "align-items": "flex-start", "margin-top": 3 })}; ${txt(14, 500)}"><span style="${s({ display: "grid", "flex-shrink": 0, "margin-top": 2 })}">${icon("coach", 15, { label: "Coach:" })}</span><span style="${K.clamp(2)}">${x.added ? "Added. " : ""}${x.note}</span></span>`
    : "";
  const trail = open
    ? `<span class="sr">, in progress, ${x.done || 0} of ${x.sets} sets done. Resume</span><span aria-hidden="true" style="${K.BTN(t, "primary", { h: 44 })}; padding: 0 16px; font-size: 15px">Resume</span>`
    : done
      ? `<span role="img" aria-label="Done" style="${s({ display: "grid", "flex-shrink": 0, color: t.ink })}">${icon("check", 20)}</span>`
      : skipped
        ? `<span style="${txt(14, 600, { color: t.ink2 })}; flex-shrink: 0">Skipped</span>`
        : "";
  return `<li><a href="${open ? "Log.dc.html" : "#"}" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 58, padding: "8px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span class="wrap" style="${txt(16, 700, { "line-height": 1.25, color: skipped || done ? t.ink2 : t.ink })}">${x.name}</span>${sub ? K.metaLine(t, [sub], { size: 14, mt: 2 }) : ""}${note}</span>${trail}</a></li>`;
}
function warmRow(t, { name, sub, done, last = false }) {
  return `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 56, padding: "8px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span style="${txt(16, 700, { color: done ? t.ink2 : t.ink })}">${name}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${sub}</span></span>${done ? `<span role="img" aria-label="Done" style="${s({ display: "grid", "flex-shrink": 0, color: t.ink })}">${icon("check", 20)}</span>` : ""}</a></li>`;
}
const addRow = (t) =>
  `<div style="${s({ display: "flex", gap: 8, "margin-top": 10 })}"><button type="button" style="${K.BTN(t, "tonal", { h: 44 })}; padding: 0 14px; font-size: 15px">${icon("plus", 18)}Add exercise</button><button type="button" style="${K.BTN(t, "tonal", { h: 44 })}; padding: 0 14px; font-size: 15px">${icon("link", 18)}Superset</button></div>`;
const superset = (t, rows, names) =>
  `<li style="${K.SS_GROUP}"><ul aria-label="Superset: ${esc(names.join(" and "))}">${rows}</ul>${K.supersetBracket(t, "Superset")}</li>`;

export function workoutScreen(t, dv = K.D, { kind = "upper" } = {}) {
  // The list keeps the programme's order, the warm-up first; a row says where it stands only when
  // that is news (a check when done, Resume on the one under way, Skipped). The print's parts
  // stand in the same order.
  const G = K.gut(dv),
    cw = dv.W - 2 * G,
    sm = K.short(dv);
  const ttl = (name, extra = "") =>
    `<h2 style="${title(K.titleSize(name, cw - 30, dv.W < 360 ? 30 : 34), { lh: 1.05 })}; margin-top: 2px; display: flex; align-items: center; gap: 8px">${name}${extra}</h2>`;
  const meta = (X) =>
    K.metaLine(
      t,
      [`${icon("pin", 16)}<span>${X.gym}</span>`, `${icon("rest", 16)}<span>${X.time}</span>`],
      { mt: 4 },
    );
  const print = (parts, ariaLabel) =>
    K.printFrame(dayPrint({ w: cw, h: sm ? 92 : 112, paper: t.paper, parts, ariaLabel }), {
      mt: 12,
    });
  let inner, label;
  if (kind === "upper") {
    const X = upperA;
    const rows = X.exercises.map((x, i) =>
      exRow(t, x, {
        dv,
        open: x.state === "open",
        done: x.state === "done",
        last: i === X.exercises.length - 1,
      }),
    );
    inner = `${sessionHeader(t, { left: minimise(t), finish: true })}${ttl(X.session)}
${meta(X)}
${print(
  [
    {
      kind: "mobility",
      segments: X.warmup.drills,
      segDone: X.warmup.drills,
      done: true,
      modules: 3,
    },
    { kind: "strength", columns: X.exercises.map((x) => ({ n: x.sets, done: x.done || 0 })) },
  ],
  "Upper A: the warm-up done, the bench’s first two sets inked, six exercises to do",
)}
<div style="margin-top:12px">${K.coachNote(t, { who: "Recovery check", tone: "check", title: "Sleep 5 h", text: "Hold loads today rather than adding, and keep the RIR honest.", dv, more: false, size: 15 })}</div>
<ul aria-label="Upper A" style="margin-top:8px">${warmRow(t, { name: X.warmup.name, sub: `${X.warmup.drills} drills`, drills: X.warmup.drills, done: true })}${rows.join("")}</ul>
${addRow(t)}`;
    label = "Upper A";
  } else if (kind === "arms") {
    const X = armsWorkout;
    const single = X.exercises.filter((x) => !x.superset),
      ss = X.exercises.filter((x) => x.superset);
    inner = `${sessionHeader(t, { left: minimise(t), finish: true })}${ttl(X.session)}
${meta(X)}
${print(
  [
    {
      kind: "strength",
      columns: X.exercises.map((x, i) => ({
        n: x.sets,
        done: x.done || 0,
        pair: x.superset && X.exercises[i + 1]?.superset === x.superset,
      })),
    },
  ],
  "Easy Run + Arms: barbell curl inked, two sets of the pushdown, the forearms superset to do",
)}
<ul aria-label="Easy Run + Arms" style="margin-top:8px">${single
      .map((x) => exRow(t, x, { dv, open: x.state === "open", done: x.state === "done" }))
      .join("")}${superset(
      t,
      ss.map((x, i) => exRow(t, x, { dv, last: i === ss.length - 1 })).join(""),
      ss.map((x) => x.name),
    )}</ul>
${addRow(t)}`;
    label = "Easy Run + Arms";
  } else {
    const X = lowerA;
    inner = `${sessionHeader(t, { left: minimise(t), finish: true, rest: false })}${ttl(X.session)}
${K.metaLine(t, [`${icon("pin", 16)}<span>${X.gym}</span>`, `${icon("rest", 16)}<span>${X.time}</span>`, `${icon("coach", 16)}<span>Planned by the coach</span>`], { mt: 4 })}
${print(
  [
    { kind: "mobility", segments: 2, segDone: 0, modules: 3 },
    {
      kind: "strength",
      columns: X.entries.map((x) => ({ n: x.sets, done: 0, skipped: !!x.dropped })),
    },
  ],
  "Lower A as the coach planned it: the warm-up and seven exercises to do, the cable crunch skipped",
)}
<ul aria-label="Lower A, planned by the coach" style="margin-top:8px">${warmRow(t, { name: "Warm-up", sub: X.warmup.join(" · "), drills: 2, done: false })}${X.entries
      .map((x, i) =>
        exRow(t, { ...x, done: 0 }, { dv, skipped: !!x.dropped, last: i === X.entries.length - 1 }),
      )
      .join("")}</ul>`;
    label = "Lower A, planned by the coach";
  }
  return K.root(t, sessionMain(t, inner, dv), { label, dv });
}

// ---------- logging: Log, Technique, History ----------
// Log is what has been lifted so far, written as the app writes it, and nothing else: the
// warm-ups on one quiet line, then each working set on a line of its own, "60 × 4 @ 2". A set not
// yet done is not drawn: the entry below says which set comes next, and of how many. No boxes and
// no marks: the figures are the record, and each line opens its set to edit.
const RIR_NAME = (v) => (v === "1" ? "1 rep in reserve" : `${v} reps in reserve`);
const unitNameOf = (unit) => (unit === "lb" ? "pounds" : "kilograms");
const LABEL_W = 28;
// The app's notation: load × reps @ RIR, or RPE n for a set rated by effort. The operators are
// quieter than the figures.
export function notation(t, r, { size = 22, color = null } = {}) {
  const op = (c) =>
    `<span style="${txt(K.onRamp(size * 0.62), 600, { color: t.ink2 })}">${c}</span>`;
  const eff = r.rpe
    ? ` ${op("RPE")} ${r.rpe}`
    : r.rir !== undefined && r.rir !== null && r.rir !== ""
      ? ` ${op("@")} ${r.rir}`
      : "";
  return `<span class="nb" style="${num(size)}${color ? `; color: ${color}` : ""}">${r.v} ${op("×")} ${r.reps}${eff}</span>`;
}
// One working set: its number in a column of its own at the edge, then its figures in the entry's
// three columns (load, reps, RIR), so every set done stands over the one being entered and the
// entry reads as the log's next line. The operators are quieter than the figures; a set rated by
// effort says RPE. A line is 44 pt at least, and in the log it opens its set to edit.
export const NUM_W = 18;
export const gridCols = (opW) =>
  `${NUM_W}px minmax(0,1fr) ${opW}px minmax(0,1fr) ${opW}px minmax(0,1fr)`;
export function setRow(t, r, { unit = "kg", size = 32, cls = "", opW = 18, edit = true } = {}) {
  const said = `Set ${r.n}: ${r.v} ${unitNameOf(unit)}, ${r.reps} reps, ${r.rpe ? `RPE ${r.rpe}` : RIR_NAME(String(r.rir))}`;
  const f = (v) =>
    `<span aria-hidden="true" style="${num(size)}; text-align: center; min-width: 0">${v}</span>`;
  const op = (c) =>
    `<span aria-hidden="true" style="${txt(K.onRamp(size * 0.55), 600, { color: t.ink2, "text-align": "center" })}">${c}</span>`;
  const eff = r.rpe
    ? `${op("·")}${f(`<span style="${txt(K.onRamp(size * 0.5), 600, { color: t.ink2 })}">RPE</span> ${r.rpe}`)}`
    : `${op("@")}${f(r.rir)}`;
  const style = s({
    display: "grid",
    "grid-template-columns": gridCols(opW),
    "align-items": "baseline",
    width: "100%",
    "min-height": Math.max(44, Math.round(size * 1.8)),
    padding: "10px 0 8px",
  });
  const cells = `<span aria-hidden="true" style="${txt(15, 700, { color: t.ink2, "white-space": "nowrap" })}; ${tn}">${r.n}</span>${f(r.v)}${op("×")}${f(r.reps)}${eff}`;
  const c = cls ? ` class="${cls}"` : "";
  return edit
    ? `<li${c}><button type="button" aria-label="${esc(`${said}. Edit`)}" style="${style}">${cells}</button></li>`
    : `<li${c} style="${style}"><span class="sr">${said}</span>${cells}</li>`;
}
// The warm-ups done, on one line in ink 2: done before the work and never in the volume. One not
// yet done is not drawn: the entry says which warm-up comes next, and of how many.
export function warmLine(t, warmups, { unit = "kg", current = -1 } = {}) {
  const done = current >= 0 ? warmups.slice(0, current) : warmups;
  if (!done.length) return "";
  const items = done
    .map(
      (w) =>
        `<button type="button" aria-label="${esc(`Warm-up: ${w.v} ${unitNameOf(unit)}, ${w.reps} reps. Edit`)}" style="${s({ display: "inline-flex", "align-items": "baseline", "min-height": 44, padding: "10px 0 6px" })}">${notation(t, w, { size: 20, color: t.ink2 })}</button>`,
    )
    .join("");
  return `<li style="${s({ display: "flex", "align-items": "baseline" })}"><span aria-hidden="true" style="${s({ width: LABEL_W, "flex-shrink": 0, color: t.ink2 })}; ${txt(15, 700)}">W</span><span role="group" aria-label="Warm-ups" style="${s({ display: "flex", "flex-wrap": "wrap", "column-gap": 20 })}">${items}</span></li>`;
}
// the operators' column, as wide as the entry's; a figure's column, as wide as the entry's
const opWOf = (dv) => (dv.W - 2 * K.gut(dv) < 340 ? 14 : 18);
const colOf = (dv) => (dv.W - 2 * K.gut(dv) - NUM_W - 2 * opWOf(dv)) / 3;
// the log's figures fit their column: at most 32 pt (26 in History), stepping down the ramp on a
// narrow screen until the widest load fits
const logSize = (dv, loads, max = 32) => {
  const widest = Math.max(...loads.map((v) => K.em(String(v))), 1);
  return K.onRamp(Math.max(20, Math.min(max, Math.floor((colOf(dv) - 8) / widest))));
};
export function ledger(t, S, { start = false, warm = start ? 0 : -1, rows = null, dv = K.D } = {}) {
  const items =
    rows ??
    `${warmLine(t, S.warmups, { unit: S.unit, current: warm })}${
      warm >= 0
        ? ""
        : S.sets
            .map((x) =>
              setRow(t, x, {
                unit: S.unit,
                opW: opWOf(dv),
                size: logSize(
                  dv,
                  S.sets.map((y) => y.v),
                ),
              }),
            )
            .join("")
    }`;
  // the list starts under the tabs and fills down towards the entry, which stays docked at the
  // foot with Save: nothing a thumb needs moves when a set lands, and no room opens above the sets
  return `<ol aria-label="Sets" style="margin-top:8px; padding-bottom: 8px; flex: 0 0 auto">${items}</ol>`;
}
// How many working sets this exercise has today: done, the one being entered, and those to come.
const setsOf = (S) => S.sets.length + 1 + (S.todo || []).length;
// The entry reads as the notation it records, load × reps @ RIR, in the log's columns: the set's
// number column stays empty, so each figure stands under the same figure of every set done. Each
// figure is a button (a tap types it; the empty RIR's dash takes the target) with − and + under it
// while its column holds both, 8 apart (44 pt on iOS, 48 dp on Android). Narrower than that (360
// dp, 320 pt), + stands over the figure and − under it, and the columns still hold.
export function entry(
  t,
  S,
  dv,
  {
    armed = false,
    touched = false,
    start = false,
    warm = start ? 0 : -1,
    swaps = null,
    saveHtml = null,
    rirHtml = null,
    headHtml = null,
    vals = null,
    swapTo = {},
    need = false,
    rirSwap = null,
  } = {},
) {
  const bsize = dv.android ? 48 : 44,
    bgap = 8;
  const opW = opWOf(dv),
    colW = colOf(dv);
  const vertical = colW < 2 * bsize + bgap;
  const size = K.onRamp(K.fit(S.next.load, colW - 6, 42, 28));
  const unit = S.unit;
  const loadStep = unit === "lb" ? "5 lb" : "2.5 kg";
  const st = touched ? "touched" : "suggested";
  const sw = swaps || {};
  const w = warm >= 0 ? S.warmups[warm] || {} : null;
  const sugg = st === "suggested" ? ", suggested" : "";
  const loadV = w ? w.v : (vals?.load ?? S.next.load);
  const repsV = w ? String(w.reps) : (vals?.reps ?? S.next.reps);
  const load = K.stepFigure(t, {
    value: loadV,
    swapTo: swapTo.load,
    bsize,
    unit,
    size,
    state: st,
    dec: `Less load, ${loadStep}`,
    inc: `More load, ${loadStep}`,
    swapCls: sw.load,
    bgap,
    vertical,
    room: true,
    name: `${loadV} ${unitNameOf(unit)}${sugg}. Type a load`,
  });
  const reps = K.stepFigure(t, {
    value: repsV,
    swapTo: swapTo.reps,
    bsize,
    unit: "reps",
    size,
    state: st,
    dec: "One rep fewer",
    inc: "One rep more",
    swapCls: sw.reps,
    bgap,
    vertical,
    room: true,
    name: `${repsV} reps${sugg}. Type reps`,
  });
  const target = String(S.next.target);
  const rirV = target.split("–")[0];
  const rir =
    rirHtml ||
    K.stepFigure(t, {
      value: armed || rirSwap ? rirV : "",
      unit: "RIR",
      size,
      state: armed ? "touched" : "empty",
      swapCls: rirSwap,
      swapTo: "",
      swapState: "empty",
      alert: need,
      hint: w ? "optional" : `target ${target}`,
      tag: K.infoTip(t, "What RIR means", { size: bsize }),
      dec: "One rep less in reserve",
      inc: "One rep more in reserve",
      bgap,
      bsize,
      vertical,
      name: armed
        ? `${RIR_NAME(rirV)}. Type RIR`
        : w
          ? "RIR not set, optional for a warm-up. Type RIR"
          : `RIR not set, target ${target}. Use the target`,
    });
  const opTop =
    (vertical ? bsize + 4 : 0) +
    Math.max(0, Math.round((44 - size * 1.1) / 2)) +
    Math.round(size * 0.32);
  const op = (c) =>
    `<span aria-hidden="true" style="${s({ "padding-top": opTop, color: t.ink2, "text-align": "center" })}; ${txt(K.onRamp(size * 0.5), 500)}">${c}</span>`;
  const figures = `<div style="${s({ display: "grid", "grid-template-columns": gridCols(opW), "align-items": "start" })}"><span></span>${load}${op("×")}${reps}${op("@")}${rir}</div>`;
  const tag =
    w || !S.suggestion
      ? ""
      : `<a href="Why.dc.html" aria-haspopup="dialog" aria-label="${esc(`${S.suggestion.kind}: why ${S.next.load} ${S.unit} × ${S.next.reps}`)}" style="${s({ display: "inline-flex", "align-items": "center", height: 44 })}"><span style="${s({ display: "inline-flex", "align-items": "center", gap: 5, height: 30, padding: "0 9px 0 10px", "border-radius": 8, border: `1.5px solid ${t.ink}` })}; ${txt(14, 700)}">${S.suggestion.kind}${icon("info", 16)}</span></a>`;
  const save =
    saveHtml ||
    (w || armed
      ? `<button type="button" style="${K.BTN(t, "primary")}; width: 100%">${SAVE}</button>`
      : saveWaiting(t, { shown: need }));
  const heading =
    headHtml ||
    (w
      ? `Warm-up ${warm + 1} <span style="color:${t.ink2}">of ${S.warmups.length}</span>`
      : `Set ${S.next.n} <span style="color:${t.ink2}">of ${setsOf(S)}</span>`);
  return `<section aria-label="${w ? `Warm-up ${warm + 1} of ${S.warmups.length}` : `Set ${S.next.n} of ${setsOf(S)}`}" style="${s({ display: "flex", "flex-direction": "column", gap: K.short(dv) ? 8 : 12, "padding-top": 10, "border-top": `1px solid ${t.hair}`, "flex-shrink": 0, background: t.ground })}">
<div style="${s({ display: "flex", "align-items": "center", gap: 10, height: 44 })}"><h3 style="${txt(17, 700)}; ${tn}">${heading}</h3>${tag}<span style="flex:1 1 auto"></span><button type="button" aria-haspopup="dialog" aria-label="Set options: add a set, type, notes, remove" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", color: t.ink2, "margin-right": -10 })}">${icon("sliders", 20)}</button></div>
${figures}
<div style="margin-top:2px">${save}</div>
</section>`;
}
// Save, in the app's words (set-grid.tsx). Until RIR is chosen it waits, grey, and the app's own
// sentence for a missing RIR describes it (src/domain/effort.ts).
export const SAVE = "Save";
export const RIR_NEEDED = "Enter RIR: estimate how many more good reps you could do.";
export const RPE_NEEDED = "Enter effort from 1 (very easy) to 10 (maximal).";
// After a tap on the waiting Save, the sentence shows in the one slot over Save, in ink, so Save
// never moves; the empty RIR's dash inks with it, to say what is missing.
export const saveWaiting = (
  t,
  { id = "rir-hint", need = RIR_NEEDED, style = "", shown = false } = {},
) =>
  `${
    shown
      ? `<p id="${id}" role="alert" style="${s({ display: "flex", gap: 8, "align-items": "flex-start", "margin-bottom": 10 })}; ${txt(15, 600, { "line-height": 1.4 })}"><span style="${s({ display: "grid", "flex-shrink": 0, "margin-top": 1 })}">${icon("info", 18)}</span><span>${need}</span></p>`
      : `<span id="${id}" class="sr">${need}</span>`
  }<button type="button" aria-disabled="true" aria-describedby="${id}" style="${K.BTN(t, "waiting")}; width: 100%${style}">${SAVE}</button>`;
export const panel = (active, inner, style = "") =>
  `<div role="tabpanel" id="panel" aria-labelledby="panel-tab-${active}"${style ? ` style="${style}"` : ""}>${inner}</div>`;
// On the Log tab the header gives the range a set aims at; how many sets and the RIR target are
// the entry's ("Set 3 of 4", "target 2"), so they are not said twice. Technique and History have
// no entry, so there the header gives the whole prescription.
export const perSet = (rx) => {
  const r = rx.replace(/^\d+\s*×\s*/, "").replace(/\s*@.*$/, "");
  return /^[\d–-]+$/.test(r) ? `${r} reps` : r;
};
function logHeader(t, S, dv, active = 0, { restOpts = {} } = {}) {
  const cw = dv.W - 2 * K.gut(dv);
  const glyph = glyphFor(S.modality);
  return `${sessionHeader(t, { left: backTo(t, S.back), more: "Complete, skip, superset, substitute", restOpts })}
<h2 style="${title(K.titleSize(S.exercise, cw, dv.W < 360 ? 28 : K.short(dv) ? 30 : 32), { lh: 1.05 })}; margin-top: 2px">${S.exercise}</h2>
${K.metaLine(t, [`${K.equip(t, glyph, equipName(S.modality))}<span>${active === 0 ? perSet(S.rx) : S.rx}</span>`, `${icon("rest", 16)}<span>${S.rest}</span>`], { mt: 4 })}
<div style="margin-top:6px">${K.tabs(t, ["Log", "Technique", "History"], active, { dv, id: "Exercise detail" })}</div>`;
}
export { logHeader };
export function logScreen(
  t,
  dv = K.D,
  {
    S = bench,
    armed = false,
    start = false,
    warm = start ? 0 : -1,
    need = false,
    failed = false,
    whole = false,
    restOpts = {},
    entryOpts = {},
    rows = null,
  } = {},
) {
  const head = logHeader(t, S, dv, 0, { restOpts });
  const list = ledger(t, S, { warm, rows, dv });
  // A save that failed: nothing is added to the log and rest does not start; the entries stay as
  // they were typed, in ink, and the app's sentence stands over Save, which tries again.
  const failedOpts = failed
    ? {
        armed: true,
        touched: true,
        vals: { load: "60", reps: "4" },
        saveHtml: `<p role="alert" style="${s({ display: "flex", gap: 8, "align-items": "flex-start", "margin-bottom": 10 })}; ${txt(15, 600, { "line-height": 1.4 })}"><span style="${s({ display: "grid", "flex-shrink": 0, "margin-top": 1 })}">${icon("warn", 18)}</span><span>${C.setFailed}</span></p><button type="button" aria-label="Retry saving set ${S.next.n}" style="${K.BTN(t, "primary")}; width: 100%">Retry</button>`,
      }
    : {};
  const ent = entry(t, S, dv, { armed, warm, need, ...failedOpts, ...entryOpts });
  if (whole)
    return K.root(
      t,
      K.screenMain(t, `${head}${panel(0, list)}${ent}`, {
        dv,
        whole: true,
      }),
      { label: S.exercise, dv, height: "auto" },
    );
  // When the sets need more room than the screen has, the list keeps its end in view (the latest
  // sets, just above the entry) and the earlier lines pass under the tabs, as a list scrolled to
  // its foot does. A cut that falls between two lines would read as a missing set.
  const G = K.gut(dv);
  const inner = `${head}${panel(0, list, s({ flex: "1 1 auto", "min-height": 0, display: "flex", "flex-direction": "column-reverse", "justify-content": "safe flex-end", overflow: "hidden", margin: `0 -${G}px`, padding: `0 ${G}px` }))}${ent}`;
  return K.root(t, sessionMain(t, inner, dv, { flex: true, fade: false }), {
    label: S.exercise,
    dv,
  });
}
export function techniqueScreen(t, dv = K.D, { S = bench } = {}) {
  const value = (k, v) =>
    Array.isArray(v)
      ? `<${k === "Steps" ? "ol" : "ul"} style="${s({ display: "flex", "flex-direction": "column", gap: 6, "padding-left": "1.25em", "list-style": k === "Steps" ? "decimal" : "disc" })}">${v.map((item) => `<li>${item}</li>`).join("")}</${k === "Steps" ? "ol" : "ul"}>`
      : v;
  const rows = S.technique
    .map(
      ([k, v]) =>
        `<div style="${s({ padding: "12px 0", "border-bottom": `1px solid ${t.hair}` })}"><dt style="${txt(13, 700, { color: t.ink2 })}">${k}</dt><dd style="${txt(16, 500, { "line-height": 1.45 })}; margin-top: 2px">${value(k, v)}</dd></div>`,
    )
    .join("");
  const link = (label, sub, glyph, last) =>
    `<a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 52, "border-bottom": last ? "0" : `1px solid ${t.hair}` })}; ${txt(16, 700)}"><span style="flex:1 1 auto">${label}${sub ? `<span style="display:block; ${txt(13, 500, { color: t.ink2 })}">${sub}</span>` : ""}</span>${icon(glyph, 20)}</a>`;
  const inner = `${logHeader(t, S, dv, 1)}${panel(1, `<dl style="margin-top:4px">${rows}</dl>${S.demonstration ? link("Watch demonstration", S.demonstration, "play", false) : ""}${link("Open in the exercise library", null, "chevronRight", true)}`)}`;
  return K.root(t, sessionMain(t, inner, dv), { label: S.exercise, dv });
}
// History: every session of this exercise, newest first, each set as it was logged, in the same
// lines as Log. History is read, not edited: its lines are not buttons. The sessions test that drives logging has no dates, so each session is named by
// its cycle; the reason for today's suggestion lives on the suggestion's tag, not here.
export function historyScreen(t, dv = K.D, { S = bench } = {}) {
  const sessions = S.history
    .map(
      (h, i) =>
        `<section aria-labelledby="h-${i}" style="margin-top:${i ? 14 : 8}px"><h3 id="h-${i}" style="${s({ display: "flex", "align-items": "baseline", gap: 8, height: 32 })}; ${txt(15, 700)}"><span>${h.when}</span><span style="${txt(14, 500, { color: t.ink2 })}">${h.where}</span></h3><ol>${h.sets
          .map(([v, reps, rir], k) =>
            setRow(
              t,
              { n: k + 1, v, reps, rir },
              {
                unit: S.unit,
                size: logSize(
                  dv,
                  h.sets.map(([w]) => w),
                  26,
                ),
                opW: opWOf(dv),
                edit: false,
              },
            ),
          )
          .join("")}</ol></section>`,
    )
    .join("");
  const inner = `${logHeader(t, S, dv, 2)}${panel(2, `<p style="${txt(13, 700, { color: t.ink2 })}; margin-top: 12px; ${tn}">All sessions · ${S.history.length}</p>${sessions}`)}`;
  return K.root(t, sessionMain(t, inner, dv), { label: S.exercise, dv });
}
// Why: the suggestion explained, a short sheet over logging.
export function whyScreen(t, dv = K.D, { S = bench } = {}) {
  const under = logScreen(t, dv, { S })
    .replace(/^<div[^>]*><h1 class="sr">[^<]*<\/h1>/, "")
    .replace(/<\/div>$/, "");
  const inner = `<div style="${s({ display: "flex", "align-items": "center", gap: 10 })}"><span style="${s({ padding: "2px 9px", "border-radius": 8, border: `1.5px solid ${t.ink}`, "flex-shrink": 0 })}; ${txt(14, 700)}">${S.suggestion.kind}</span><h2 id="why-title" style="${title(28)}; flex: 1 1 auto">Why this suggestion</h2><button type="button" aria-label="Close" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "margin-right": -10 })}">${icon("close", 20)}</button></div>
<p style="${num(26)}; margin-top: 12px">${S.next.load} <span style="${txt(15, 600, { color: t.ink2 })}">${S.unit} ×</span> ${S.next.reps} <span style="${txt(15, 600, { color: t.ink2 })}">@</span> ${S.next.target}</p>
<p style="${txt(17, 600, { "line-height": 1.45 })}; margin-top: 8px">${S.suggestion.reason}</p>
${S.suggestion.advice ? `<p style="${txt(16, 500, { "line-height": 1.45 })}; margin-top: 6px">${S.suggestion.advice}</p>` : ""}
<p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 6px">${S.suggestion.basis}</p>
<a href="#" style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", height: 52, "margin-top": 8, "border-top": `1px solid ${t.hair}` })}; ${txt(16, 700)}">History${icon("chevronRight", 20)}</a>`;
  return K.root(t, `${under}${K.sheet(t, inner, { dv, id: "why-title", label: "Why" })}`, {
    label: "Why this suggestion",
    dv,
  });
}

// ---------- the signature moment: a set is written ----------
// Save presses (120 ms) and turns to Saving… while the server answers; nothing is written before
// it has the set. On its answer the set lands as the next line of the log, rising 10 pt into
// place as it fades in (220 ms), and Save reads Saved; then the entry turns to set 4, the values go
// back to suggestions, RIR empties and rest restarts at 3:00. With reduced motion the line simply
// appears. The lifter has turned the suggested 62.5 × 3 down to 60 × 4, as the sessions test logs
// set 3.
export function momentScreen(t, dv = K.D) {
  const S = bench;
  // two layers in one place; the one not showing is hidden, so it is out of the tree too
  const sw = (a, b, ca, cb) =>
    `<span style="display:inline-grid"><span class="${ca}" style="grid-area:1/1">${a}</span><span class="${cb}" style="grid-area:1/1">${b}</span></span>`;
  const size = logSize(dv, [...S.sets.map((y) => y.v), "60"]);
  const rows = `${warmLine(t, S.warmups, { unit: S.unit })}${S.sets.map((x) => setRow(t, x, { unit: S.unit, opW: opWOf(dv), size })).join("")}${setRow(t, { n: 3, v: "60", reps: 4, rir: 2 }, { unit: S.unit, opW: opWOf(dv), size, cls: "row3" })}`;
  const head = sw(
    `Set 3 <span style="color:${t.ink2}">of 4</span>`,
    `Set 4 <span style="color:${t.ink2}">of 4</span>`,
    "h3a",
    "h4a",
  );
  const saveHtml = `<div style="display:grid">
<span class="sv-wait" aria-hidden="true" style="${K.BTN(t, "waiting")}; grid-area: 1/1">${SAVE}</span>
<span class="sv-saving" aria-hidden="true" style="${K.BTN(t, "waiting")}; grid-area: 1/1">Saving…</span>
<span class="sv-saved" aria-hidden="true" style="${K.BTN(t, "waiting")}; grid-area: 1/1; color: ${t.ink}">${icon("check", 20)}Saved</span>
<button type="button" class="sv-armed" style="${K.BTN(t, "primary")}; grid-area: 1/1">${SAVE}</button>
</div>`;
  // the pill starts again at 3:00 with its dial full, as the set lands
  const restOpts = {
    timeHtml: sw("2:14", "3:00", "t1", "t2"),
    ringHtml: sw(K.restRing(t, 0.74), K.restRing(t, 1), "t1", "t2"),
  };
  const ent = entry(t, S, dv, {
    touched: true,
    swaps: { load: ["va", "vb"], reps: ["va", "vb"] },
    vals: { load: "60", reps: "4" },
    swapTo: { load: S.next.load, reps: S.next.reps },
    rirSwap: ["r2", "r0"],
    saveHtml,
    headHtml: head,
  });
  const G = K.gut(dv);
  const list = `<ol aria-label="Sets" style="margin-top:8px; padding-bottom: 8px; flex: 0 0 auto">${rows}</ol>`;
  const inner = `${logHeader(t, S, dv, 0, { restOpts })}${panel(0, list, s({ flex: "1 1 auto", "min-height": 0, display: "flex", "flex-direction": "column-reverse", "justify-content": "safe flex-end", overflow: "hidden", margin: `0 -${G}px`, padding: `0 ${G}px` }))}${ent}<p class="sr" role="status">Set 3 saved: 60 kilograms, 4 reps, 2 in reserve. Rest 3:00.</p>`;
  return K.root(t, sessionMain(t, inner, dv, { flex: true, fade: false }), {
    label: S.exercise,
    dv,
  });
}
export function momentCss(t, { reduced = false } = {}) {
  const Lp = 8,
    pct = (sec) => ((sec / Lp) * 100).toFixed(3) + "%";
  const END = 7.2,
    RESET = 7.5;
  // a layer that is not showing is not there at all: opacity and visibility change together. A
  // word leaves in 80 ms and the next arrives in 120 ms, after it
  const show = (cls, on, off = END) =>
    `@keyframes ${cls}{0%,${pct(on - 0.001)}{opacity:0;visibility:hidden}${pct(on)}{opacity:0;visibility:visible}${pct(on + 0.12)},${pct(off)}{opacity:1;visibility:visible}${pct(off + 0.001)},100%{opacity:0;visibility:hidden}}.${cls}{opacity:0;visibility:hidden;animation:${cls} ${Lp}s linear infinite}`;
  const hide = (cls, off, on = RESET) =>
    `@keyframes ${cls}{0%,${pct(off)}{opacity:1;visibility:visible}${pct(off + 0.08)},${pct(on - 0.001)}{opacity:0;visibility:hidden}${pct(on)},100%{opacity:1;visibility:visible}}.${cls}{animation:${cls} ${Lp}s linear infinite}`;
  // timeline (s): armed 0–1.2 · press 1.2–1.32 · saving 1.32–1.95 · the line lands 1.95–2.17,
  // and on that beat the entry turns to the next set and rest starts again (2.0–2.2)
  const common = `
${hide("sv-armed", 1.32)}
${show("sv-saving", 1.32, 1.95)}
${show("sv-saved", 1.95, 2.45)}
${show("sv-wait", 2.45)}
${hide("h3a", 2.0)}
${show("h4a", 2.08)}
${hide("r2", 2.0)}
${show("r0", 2.08)}
${hide("va", 2.0)}
${show("vb", 2.08)}
${hide("t1", 2.0)}
${show("t2", 2.08)}`;
  // the new line opens its own room as it lands, so the entry moves down a line while Save stays
  // where the thumb is: the moment starts from the log at rest, exactly as Log shows it
  const H = 58;
  if (reduced)
    return `${common}
@keyframes row3{0%,${pct(1.949)}{opacity:0;visibility:hidden;max-height:0}${pct(1.95)},${pct(END)}{opacity:1;visibility:visible;max-height:${H}px}${pct(END + 0.001)},100%{opacity:0;visibility:hidden;max-height:0}}.row3{opacity:0;visibility:hidden;max-height:0;overflow:hidden;animation:row3 ${Lp}s linear infinite}`;
  return `${common}
@keyframes row3{0%,${pct(1.949)}{opacity:0;visibility:hidden;max-height:0;transform:translateY(10px)}${pct(1.95)}{opacity:0;visibility:visible;max-height:0;transform:translateY(10px)}${pct(2.17)},${pct(END)}{opacity:1;visibility:visible;max-height:${H}px;transform:none}${pct(END + 0.001)},100%{opacity:0;visibility:hidden;max-height:0;transform:translateY(10px)}}.row3{opacity:0;visibility:hidden;max-height:0;overflow:hidden;animation:row3 ${Lp}s cubic-bezier(0.23,1,0.32,1) infinite}
@keyframes press{0%,${pct(1.2)}{transform:scale(1)}${pct(1.26)}{transform:scale(0.97)}${pct(1.32)},100%{transform:scale(1)}}.sv-armed{animation:press ${Lp}s cubic-bezier(0.23,1,0.32,1) infinite, sv-armed ${Lp}s linear infinite}
@keyframes row3cut{0%,${pct(1.949)}{opacity:0;visibility:hidden;max-height:0}${pct(1.95)},${pct(END)}{opacity:1;visibility:visible;max-height:${H}px}${pct(END + 0.001)},100%{opacity:0;visibility:hidden;max-height:0}}
@media (prefers-reduced-motion: reduce){.sv-armed{animation:sv-armed ${Lp}s linear infinite}.row3{animation:row3cut ${Lp}s linear infinite;transform:none}}`;
}

// ---------- check-in, before the workout ----------
// A 1–5 scale: its words stand under its own 1 and 5, so which way is better is read where the
// finger goes (the app's scales do not all run the same way, and their meaning is kept).
function scale(t, label, ends, chosen, id) {
  return `<div role="radiogroup" aria-labelledby="${id}" aria-describedby="${id}-ends" style="${s({ display: "flex", "flex-direction": "column", gap: 6, padding: "12px 0", "border-bottom": `1px solid ${t.hair}` })}"><p id="${id}" style="${txt(16, 700)}">${label}</p><div style="${s({ display: "grid", "grid-template-columns": "repeat(5, minmax(0,1fr))", gap: 2, padding: 3, "border-radius": 14, background: t.surface })}">${[
    1, 2, 3, 4, 5,
  ]
    .map(
      (v) =>
        `<button type="button" role="radio" aria-checked="${v === chosen}" aria-label="${v}" style="${s({ height: 46, "border-radius": 11, background: v === chosen ? t.ink : "transparent", color: v === chosen ? t.onInk : t.ink })}; ${num(20)}">${v}</button>`,
    )
    .join(
      "",
    )}</div><p id="${id}-ends" style="${s({ display: "flex", "justify-content": "space-between", padding: "0 6px" })}; ${txt(13, 600, { color: t.ink2 })}"><span>1 ${ends[0]}</span><span>${ends[1]} 5</span></p></div>`;
}
export function checkInScreen(t, dv = K.D) {
  const sleep = K.rowStepper(t, {
    label: "Hours last night",
    value: "5",
    dec: "Half an hour less",
    inc: "Half an hour more",
  });
  const inner = `${sessionHeader(t, { left: backTo(t, "Today"), rest: false, more: null })}
<h2 style="${title(dv.W < 360 ? 30 : 34)}; margin-top: 2px">How are you today?</h2>
<p style="${txt(15, 500, { color: t.ink2 })}; margin-top: 4px">Optional</p>
<section aria-labelledby="ci-sleep">${K.caption(t, "Sleep", { id: "ci-sleep", mt: 12 })}${sleep}${scale(t, "Quality", ["poor", "great"], 3, "q")}</section>
<section aria-labelledby="ci-feel">${K.caption(t, "How you feel", { id: "ci-feel", mt: 14 })}${scale(t, "General fatigue", ["fresh", "wrecked"], 5, "f")}${scale(t, "Soreness", ["none", "severe"], 2, "so")}</section>`;
  const foot = `<div style="${s({ position: "absolute", left: K.gut(dv), right: K.gut(dv), bottom: dv.bottom + 8, display: "flex", "flex-direction": "column", gap: 4 })}"><a href="Workout.dc.html" style="${K.BTN(t, "primary")}">Save and start</a><a href="#" style="${s({ display: "grid", "place-items": "center", height: 44 })}; ${txt(15, 700)}">Skip check-in</a></div>`;
  return K.root(t, `${sessionMain(t, inner, dv, { bottom: dv.bottom + 8 + 56 + 48 + 8 })}${foot}`, {
    label: "How are you today?",
    dv,
  });
}

// ---------- finishing, and the record ----------
const sessionCols = (X) =>
  X.exercises.map((x) => ({
    n: x.sets.length + (x.warm ? 1 : 0),
    done: x.sets.length + (x.warm ? 1 : 0),
    warm: x.warm ? 1 : 0,
  }));
// each exercise's sets as the app lists a past session's (formatSets): its working sets, each
// with its unit, after a comma; the warm-ups are the grey blocks in the print above
function recordedRows(t, X) {
  return X.exercises
    .map((x) => {
      const sets = x.timed
        ? x.sets.map(([v]) => v).join(", ")
        : x.sets.map(([v, r]) => `${v} kg × ${r}`).join(", ");
      return `<li style="${s({ display: "flex", "flex-direction": "column", "justify-content": "center", "min-height": 52, padding: "6px 0", "border-bottom": `1px solid ${t.hair}` })}"><span class="wrap" style="${txt(16, 700)}">${x.name}</span><span class="wrap" style="${txt(14, 500)}; ${tn}">${sets}</span></li>`;
    })
    .join("");
}
// Finish: what the session recorded and what it did not, then the notes and the day's body weight
// (the app's finish page, src/app/(app)/workouts/[sessionId]/finish/). Upper A, cycle 3: the bench
// alone was logged, so the other six are not done, named once under that heading.
const upperCols = () => [
  { n: 7, done: 7, warm: 3 },
  ...upperA.exercises.slice(1).map((x) => ({ n: x.sets, done: 0, skipped: true })),
];
function finishedRows(t, X) {
  return X.done
    .map((x) => {
      const n = x.sets.length + (x.warm ? x.warm.length : 0);
      return `<li aria-label="${esc(`${x.name}: ${n} sets`)}" style="${s({ display: "flex", "flex-direction": "column", "justify-content": "center", "min-height": 52, padding: "6px 0", "border-bottom": `1px solid ${t.hair}` })}"><span class="wrap" style="${txt(16, 700)}">${x.name}</span><span class="wrap" style="${txt(14, 500)}; ${tn}">${x.sets.map(([v, r]) => `${v} kg × ${r}`).join(", ")}</span></li>`;
    })
    .join("");
}
const notDone = (t) => {
  const names = upperA.exercises.slice(1).map((x) => x.name);
  return `<p class="wrap" style="${s({ padding: "6px 0 10px", "border-bottom": `1px solid ${t.hair}` })}; ${txt(15, 500, { color: t.ink2, "line-height": 1.45 })}">${names.join(", ")}</p>`;
};
export function finishScreen(t, dv = K.D) {
  const X = upperA3;
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const under = `${sessionHeader(t, { left: minimise(t), finish: true, rest: false })}<h2 style="${title(34)}">${X.title}</h2>${K.printFrame(
    dayPrint({
      w: cw,
      h: 112,
      paper: t.paper,
      parts: [
        { kind: "mobility", segments: 4, segDone: 4, done: true, modules: 3 },
        { kind: "strength", columns: upperCols() },
      ],
    }),
    { mt: 12 },
  )}`;
  const inner = `<div style="${s({ display: "flex", "align-items": "center", gap: 10 })}"><h2 id="fin-title" style="${title(28)}; flex: 1 1 auto">${X.title}</h2><button type="button" aria-label="Close" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "margin-right": -10 })}">${icon("close", 20)}</button></div>
${K.metaLine(t, [`${icon("pin", 16)}<span>${X.gym}</span>`], { mt: 0 })}
<h3 style="${s({ display: "flex", "justify-content": "space-between" })}; ${txt(13, 700, { color: t.ink2 })}; margin-top: 12px"><span>Recorded</span><span style="${tn}">${X.sets} sets</span></h3>
<ul>${finishedRows(t, X)}</ul>
<h3 style="${txt(13, 700, { color: t.ink2 })}; margin-top: 12px">Not done</h3>
${notDone(t)}
<div style="${s({ display: "flex", "flex-direction": "column", gap: 14, "margin-top": 14 })}">${K.field(t, "Notes", { rows: 2, placeholder: "How it went, anything the coach should know…", help: "Your coach reads these" })}${K.field(t, "Body weight (kg)", { help: "Optional — recorded as today’s reading", mode: "decimal" })}</div>
<a href="Summary.dc.html" style="${K.BTN(t, "primary")}; width: 100%; margin-top: 16px">Finish session</a>`;
  return K.root(
    t,
    `${sessionMain(t, under, dv)}${K.sheet(t, inner, { dv, id: "fin-title", top: 64 })}`,
    { label: "Finish session", dv },
  );
}
// The record, the moment the session ends: the print as it stands, what it recorded, and the
// routine to save or repeat. Upper A set no records, so none are shown; a past workout that set
// four (Tue 8 Sept) lists them in ink.
function records(t, list) {
  return `<h3 style="${txt(13, 700, { color: t.ink2 })}; margin: 18px 0 2px">${list.length} records</h3><ul>${list
    .map(
      ([ex, metric, v, unit, was]) =>
        `<li style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 52, padding: "6px 0", "border-bottom": `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0, flex: "1 1 auto" })}"><span class="wrap" style="${txt(16, 700)}">${ex}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${metric} · was ${was}</span></span><span class="nb" style="${s({ display: "flex", "align-items": "baseline", gap: 3 })}"><span style="${num(20)}">${v}</span><span style="${txt(13, 600, { color: t.ink2 })}">${unit}</span></span></li>`,
    )
    .join("")}</ul>`;
}
export function summaryScreen(t, dv = K.D, { past = false } = {}) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const stat = (n, u, l) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span class="nb" style="${s({ display: "flex", "align-items": "baseline", gap: 3 })}"><span style="${num(26)}">${n}</span><span style="${txt(13, 600, { color: t.ink2 })}">${u}</span></span><span style="${txt(13, 500, { color: t.ink2 })}">${l}</span></div>`;
  if (past) {
    const X = sept8;
    const inner = `${K.nestedHeader(t, "Calendar")}
${K.printFrame(dayPrint({ w: cw, h: 120, paper: t.paper, parts: [{ kind: "strength", columns: sessionCols(X) }], ariaLabel: "Tue 8 Sept in full ink: three exercises of three sets, the warm-ups in grey" }), { mt: 4 })}
<h2 style="${title(K.titleSize(X.title, cw, 34))}; margin-top: 12px">${X.title}</h2>
${K.metaLine(t, [`${icon("calendar", 16)}<span>${X.date}</span>`, `${icon("pin", 16)}<span>${X.gym}</span>`], { mt: 4 })}
<div style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: 10, "margin-top": 14 })}">${stat(X.minutes, "min", "Time")}${stat(9, "", "Sets")}${stat(X.volume, "kg", "Volume")}</div>
${records(t, X.records)}
<h3 style="${txt(13, 700, { color: t.ink2 })}; margin: 18px 0 2px">Sets</h3><ul>${recordedRows(t, X)}</ul>
<h3 style="${txt(13, 700, { color: t.ink2 })}; margin: 18px 0 2px">Check-in</h3><dl style="${s({ display: "grid", "grid-template-columns": "repeat(4, minmax(0,1fr))", gap: 8 })}">${X.checkin
      .map(
        ([k, v]) =>
          `<div><dt style="${txt(13, 500, { color: t.ink2 })}">${k}</dt><dd style="${num(20)}; margin-top: 2px">${v}</dd></div>`,
      )
      .join("")}</dl>`;
    return K.root(
      t,
      `${K.screenMain(t, inner, { dv })}${K.navbar(t, "progress", { dv, nested: true })}`,
      { label: "Ad hoc session, Tue 8 Sept", dv },
    );
  }
  const X = upperA3;
  const inner = `<header style="${s({ display: "flex", "align-items": "center", height: 48 })}"><span style="flex:1 1 auto"></span><button type="button" aria-label="Close" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "margin-right": -10 })}">${icon("close", 22)}</button></header>
${K.printFrame(
  dayPrint({
    w: cw,
    h: 168,
    paper: t.paper,
    parts: [
      { kind: "mobility", segments: 4, segDone: 4, done: true, modules: 3 },
      { kind: "strength", columns: upperCols() },
    ],
    ariaLabel:
      "Upper A as it ended: the warm-up and the bench in full ink, its warm-up sets grey; six exercises not done, dashed",
  }),
  { mt: 4 },
)}
<h2 style="${title(34)}; margin-top: 12px">${X.title}</h2>
${K.metaLine(t, [`${icon("pin", 16)}<span>${X.gym}</span>`], { mt: 4 })}
<div style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: 10, "margin-top": 14 })}">${stat(X.sets, "", "Sets")}${stat(X.volume, "kg", "Volume")}</div>
<h3 style="${txt(13, 700, { color: t.ink2 })}; margin: 18px 0 2px">Recorded</h3><ul>${finishedRows(t, X)}</ul>
<h3 style="${txt(13, 700, { color: t.ink2 })}; margin: 14px 0 0">Not done</h3>${notDone(t)}
<button type="button" aria-expanded="false" style="${s({ display: "flex", "align-items": "center", gap: 12, width: "100%", "min-height": 56, "border-bottom": `1px solid ${t.hair}` })}">${K.markCell(`<span style="display:grid">${icon("repeat", 20)}</span>`)}<span style="${txt(16, 700, { flex: "1 1 auto", "text-align": "left" })}">Save or repeat this workout</span>${icon("chevronDown", 18)}</button>`;
  const foot = `<div style="${s({ position: "absolute", left: G, right: G, bottom: dv.bottom + 8 })}"><a href="Today.dc.html" style="${K.BTN(t, "primary")}; width: 100%">Done</a></div>`;
  return K.root(t, `${sessionMain(t, inner, dv, { bottom: dv.bottom + 8 + 56 + 8 })}${foot}`, {
    label: "Upper A, finished",
    dv,
  });
}

// ---------- logging a run ----------
export function runLogScreen(t, dv = K.D) {
  const G = K.gut(dv);
  const plan = `<aside aria-label="The plan asked for" style="${s({ display: "flex", gap: 12, "align-items": "center", padding: "12px 14px", "border-radius": 14, background: t.surface, "margin-top": 12 })}"><span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${num(20)}">25<span style="font-family:${K.FONTS.text};font-weight:500">–</span>30 <span style="${txt(14, 600, { color: t.ink2 })}">min</span></span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}">Talk-test; slower than push pace</span></span></aside>`;
  const figRow = (label, value, unit, dec, inc, hint = "") =>
    K.rowStepper(t, { label, value, unit, dec, inc, hint });
  const effort = `<div role="radiogroup" aria-labelledby="eff" style="${s({ display: "flex", "flex-direction": "column", gap: 6, padding: "12px 0" })}"><p id="eff" style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline" })}"><span style="${txt(16, 700)}">Effort</span><span style="${txt(13, 500, { color: t.ink2 })}">1 very easy to 5 maximal</span></p><div style="${s({ display: "grid", "grid-template-columns": "repeat(5, minmax(0,1fr)) minmax(0,1.6fr)", gap: 2, padding: 3, background: t.surface, "border-radius": 14 })}">${[
    "1",
    "2",
    "3",
    "4",
    "5",
    "Not sure",
  ]
    .map(
      (v) =>
        `<button type="button" role="radio" aria-checked="${v === "Not sure"}" style="${s({ height: 46, "border-radius": 11, background: v === "Not sure" ? t.ink : "transparent", color: v === "Not sure" ? t.onInk : t.ink })}; ${v.length > 1 ? txt(14, 700) : num(20)}">${v}</button>`,
    )
    .join("")}</div></div>`;
  const inner = `${sessionHeader(t, { left: backTo(t, "Today"), rest: false, more: null })}
<h2 style="${title(34)}; margin-top: 2px">Log a run</h2>
${plan}
<div style="margin-top:14px">${K.iconChoice(
    t,
    [
      ["outdoor", "Outdoor"],
      ["treadmill", "Treadmill"],
    ],
    0,
    { label: "Where" },
  )}</div>
<div style="margin-top:6px">${figRow("Distance", "4.0", "km", "Less, 0.1 km", "More, 0.1 km")}${figRow("Duration", "26:30", "", "A minute less", "A minute more", "Pace 6:38 /km")}</div>
${effort}
<button type="button" style="${s({ display: "flex", "align-items": "center", gap: 8, height: 44, color: t.ink2 })}; ${txt(15, 700)}">${icon("plus", 18)}Notes, heart rate, more</button>`;
  const foot = `<div style="${s({ position: "absolute", left: G, right: G, bottom: dv.bottom + 8 })}"><button type="button" style="${K.BTN(t, "primary")}; width: 100%">Save activity</button></div>`;
  return K.root(t, `${sessionMain(t, inner, dv, { bottom: dv.bottom + 8 + 56 + 8 })}${foot}`, {
    label: "Log a run",
    dv,
  });
}
// A run, read back from History.
export function runDetailScreen(t, dv = K.D) {
  const X = run2Aug;
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const stat = (n, u, l) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", "min-width": 0, padding: "10px 0", "border-bottom": `1px solid ${t.hair}` })}"><span class="nb" style="${s({ display: "flex", "align-items": "baseline", gap: 3 })}"><span style="${num(26)}">${n}</span><span style="${txt(13, 600, { color: t.ink2 })}">${u}</span></span><span style="${txt(13, 500, { color: t.ink2 })}">${l}</span></div>`;
  const inner = `${K.nestedHeader(t, "Calendar", `<span style="margin-right:-10px">${K.iconBtn(t, "more", "Correct or delete this run")}</span>`)}
${K.printFrame(dayPrint({ w: cw, h: 128, paper: t.paper, parts: [{ kind: "run", minutes: 17, done: true }], ariaLabel: "The run, in full ink" }), { mt: 4 })}
<h2 style="${title(K.titleSize(X.title, cw, 30))}; margin-top: 12px">${X.title}</h2>
${K.metaLine(t, [`${icon("calendar", 16)}<span>${X.date}</span>`, `${K.equip(t, "outdoor", "Outdoor")}<span>Outdoor</span>`], { mt: 4 })}
<div style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", "column-gap": 16, "margin-top": 10 })}">${stat(X.km, "km", "Distance")}${stat(X.time, "", "Time")}${stat(X.pace, "/km", "Pace")}${stat(X.effort, "", "Effort")}</div>
<p style="${txt(16, 500, { "line-height": 1.45 })}; margin-top: 14px">${X.note}</p>`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv })}${K.navbar(t, "progress", { dv, nested: true })}`,
    { label: "A run, Sun 2 Aug", dv },
  );
}
export { sessionCols, backTo, sessionMain, exRow, warmRow, glyphFor, equipName };
