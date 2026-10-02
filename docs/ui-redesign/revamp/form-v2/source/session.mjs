// THE SESSION: a full-screen layer over the tabs, from Start to Finish.
//
// Starting a workout opens the session over the app: no tab bar, so the entry gets that height
// and Save never sits above a tab. Minimising it leaves the session strip on every screen, which
// opens it again (iOS: the tab bar's accessory zooming into a full-screen cover; Android: a
// full-screen destination that collapses into the bottom bar on back).
//
// Rest lives in one place on every screen of the session: a pill in the header, a ring that
// empties. Logging is three tabs: Log, Technique, History. Log is a ledger, one row per set, its
// mark inked when the server confirms it; the entry is docked at the foot and reads like the
// notation it records: 62.5 × 3 @ 2.
import { s, esc } from "./lib.mjs";
import * as K from "./kit.mjs";
import { dayPrint, PIG } from "./art.mjs";
import { upperA, upperA3, armsWorkout, lowerA, bench, sept8, run2Aug, EQUIP } from "./data.mjs";

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
function exRow(t, x, { open = false, done = false, skipped = false, last = false } = {}) {
  const sub =
    open && x.last
      ? `${K.equip(t, glyphFor(x.modality), equipName(x.modality))}<span>${x.last}</span>`
      : open
        ? `${K.equip(t, glyphFor(x.modality), equipName(x.modality))}<span>${x.rx}</span>`
        : done
          ? `${K.equip(t, glyphFor(x.modality), equipName(x.modality))}<span>${x.rx}</span>`
          : skipped
            ? ""
            : `${K.equip(t, glyphFor(x.modality), equipName(x.modality))}<span>${x.rx}</span>${x.instead ? `<span style="display:inline-flex;align-items:center;gap:4px">${K.equip(t, "swap", "Instead of")}${x.instead}</span>` : ""}`;
  const note = x.note
    ? `<span style="${s({ display: "flex", gap: 6, "align-items": "flex-start", "margin-top": 3 })}; ${txt(14, 500)}"><span style="${s({ display: "grid", "flex-shrink": 0, "margin-top": 2 })}">${icon("coach", 15, { label: "Coach:" })}</span><span style="${K.clamp(2)}">${x.added ? "Added. " : ""}${x.note}</span></span>`
    : "";
  const trail = open
    ? `<span aria-hidden="true" style="${K.BTN(t, "primary", { h: 44 })}; padding: 0 16px; font-size: 15px">Resume</span>`
    : "";
  return `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 58, padding: "8px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(K.colMark(t, x.sets, done ? x.sets : x.done || 0, { skipped, label: skipped ? "Skipped" : `${x.done || (done ? x.sets : 0)} of ${x.sets} sets` }))}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span class="wrap" style="${txt(16, 700, { "line-height": 1.25, color: skipped ? t.ink2 : t.ink })}">${x.name}</span>${sub ? K.metaLine(t, [sub], { size: 14, mt: 2 }) : ""}${note}</span>${trail}</a></li>`;
}
function warmRow(t, { name, sub, drills, done, last = false }) {
  return `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 56, padding: "8px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(K.stateMark(t, "mobility", 18, { state: done ? "done" : "todo", segments: drills, done: done ? drills : 0, label: done ? "Warm-up done" : "Warm-up to do" }))}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span style="${txt(16, 700)}">${name}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${sub}</span></span></a></li>`;
}
const addRow = (t) =>
  `<div style="${s({ display: "flex", gap: 8, "margin-top": 10 })}"><button type="button" style="${K.BTN(t, "tonal", { h: 44 })}; padding: 0 14px; font-size: 15px">${icon("plus", 18)}Add exercise</button><button type="button" style="${K.BTN(t, "tonal", { h: 44 })}; padding: 0 14px; font-size: 15px">${icon("link", 18)}Superset</button></div>`;
const superset = (t, rows, names) =>
  `<li style="${K.SS_GROUP}"><ul aria-label="Superset: ${esc(names.join(" and "))}">${rows}</ul>${K.supersetBracket(t, "Superset")}</li>`;

export function workoutScreen(t, dv = K.D, { kind = "upper" } = {}) {
  // The list keeps the programme's order, the warm-up first; each row's mark says where it
  // stands (done, under way, to do, skipped), so no heading repeats it. The print's parts stand
  // in the same order.
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
      exRow(t, x, { dv, open: x.state === "open", last: i === X.exercises.length - 1 }),
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
    { kind: "mobility", segments: 5, segDone: 0, modules: 3 },
    {
      kind: "strength",
      columns: X.exercises.map((x, i) => ({
        n: x.sets,
        done: x.done || 0,
        pair: x.superset && X.exercises[i + 1]?.superset === x.superset,
      })),
    },
  ],
  "Easy Run + Arms: the run warm-up to do, barbell curl inked, two sets of the pushdown, the forearms superset to do",
)}
<ul aria-label="Easy Run + Arms" style="margin-top:8px">${warmRow(t, { name: "Run warm-up", sub: "5 drills", drills: 5, done: false })}${single
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
    inner = `${sessionHeader(t, { left: minimise(t), finish: true, rest: false })}${ttl(X.session, `<span role="img" aria-label="Planned by the coach" style="display:grid;color:${t.ink}">${icon("coach", 22)}</span>`)}
${meta(X)}
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
const RIR_NAME = (v) => (v === "1" ? "1 rep in reserve" : `${v} reps in reserve`);
function ledgerRow(t, r, { now = false, swap = null, unit = "kg" } = {}) {
  // r: { n, v, reps, rir | rpe, kind: 'warm' | 'warmTodo' | 'done' | 'todo' | 'now' }. "@" is RIR
  // alone; a set rated by RPE says so.
  const unitName = unit === "lb" ? "pounds" : "kilograms";
  const markSz = 12;
  const mk =
    r.kind === "done"
      ? `<span style="${s({ width: markSz, height: markSz, background: t.marks.strength, display: "block" })}"></span>`
      : r.kind === "warm"
        ? `<span style="${s({ width: markSz, height: markSz, background: t.scheme === "dark" ? "#4a463e" : "#c9c4b8", display: "block" })}"></span>`
        : r.kind === "warmTodo"
          ? `<span style="${s({ width: markSz, height: markSz, border: `1.5px solid ${t.control}`, display: "block" })}"></span>`
          : r.kind === "now"
            ? `<span style="${s({ width: markSz + 2, height: markSz + 2, border: `2.5px solid ${t.ink}`, display: "block" })}"></span>`
            : `<span style="${s({ width: markSz, height: markSz, border: `1.5px solid ${t.marks.strength}`, background: t.scheme === "dark" ? "#27317a" : PIG.ultraT, display: "block" })}"></span>`;
  const text =
    r.kind === "done"
      ? `<span style="${num(20)}">${r.v} <span style="${txt(14, 600, { color: t.ink2 })}">×</span> ${r.reps} ${r.rpe ? `<span style="${txt(14, 600, { color: t.ink2 })}">RPE</span> ${r.rpe}` : `<span style="${txt(14, 600, { color: t.ink2 })}">@</span> ${r.rir}`}</span>`
      : r.kind === "warm" || r.kind === "warmTodo"
        ? `<span style="${num(17)}; color: ${t.ink2}">${r.v} <span style="${txt(13, 600)}">×</span> ${r.reps}</span>`
        : "";
  const aria =
    r.kind === "done"
      ? `Set ${r.n}: ${r.v} ${unitName}, ${r.reps} reps, ${r.rpe ? `RPE ${r.rpe}` : RIR_NAME(String(r.rir))}. Saved. Edit`
      : r.kind === "warm"
        ? `Warm-up: ${r.v} ${unitName}, ${r.reps} reps. Saved. Edit`
        : r.kind === "warmTodo"
          ? `Warm-up to do: ${r.v} ${unitName}, ${r.reps} reps`
          : r.kind === "now"
            ? `Set ${r.n}, being entered below`
            : `Set ${r.n}, to do`;
  return `<li><button type="button" aria-label="${esc(aria)}"${now ? ' aria-current="step"' : ""} style="${s({ display: "flex", "align-items": "center", gap: 0, width: "100%", height: 44, "border-bottom": `1px solid ${t.hair}`, "text-align": "left", background: now ? t.surface : "transparent", margin: now ? "0 -8px" : 0, padding: now ? "0 8px" : 0, "border-radius": now ? 10 : 0, "box-sizing": "content-box" })}"><span style="${s({ width: 26, "flex-shrink": 0, color: r.kind.startsWith("warm") ? t.ink2 : t.ink })}; ${txt(15, 700)}; ${tn}">${r.n}</span>${K.markCell(swap ? swap : mk)}<span style="${s({ "margin-left": 12, flex: "1 1 auto", "min-width": 0 })}">${swap && r.kind === "now" ? r.text || "" : text}</span>${r.trail || ""}</button></li>`;
}
export function ledger(t, S, { start = false, rows = null } = {}) {
  const items = rows ||
    (start
      ? [
          { ...S.warmups[0], kind: "now", n: "W" },
          ...S.warmups.slice(1).map((w) => ({ ...w, kind: "warmTodo" })),
          ...[1, 2, 3, 4].map((n) => ({ n, kind: "todo" })),
        ]
      : null) || [
      ...S.warmups.map((w) => ({ ...w, kind: start ? "warmTodo" : "warm" })),
      ...S.sets.map((x) => ({ ...x, kind: "done" })),
      { n: S.next.n, kind: "now" },
      ...S.todo.map((x) => ({ ...x, kind: "todo" })),
    ];
  return `<ol aria-label="Sets" style="margin-top:6px; flex: 1 0 auto">${items.map((r) => (typeof r === "string" ? r : ledgerRow(t, r, { now: r.kind === "now", unit: S.unit }))).join("")}<li><button type="button" style="${s({ display: "flex", "align-items": "center", gap: 8, height: 44, color: t.ink2, "padding-left": 26 })}; ${txt(15, 700)}">${icon("plus", 18)}Add set</button></li></ol>`;
}
// The entry reads as the notation it records: load × reps @ RIR. Three steppers in one row while
// each column holds its figure and two 44 pt buttons (at least 100 pt); otherwise load takes the
// first row and reps and RIR share the second.
export function entry(
  t,
  S,
  dv,
  {
    armed = false,
    start = false,
    swaps = null,
    saveHtml = null,
    rirHtml = null,
    headHtml = null,
    vals = null,
    swapTo = {},
  } = {},
) {
  const cw = dv.W - 2 * K.gut(dv);
  // three steppers side by side while each column holds its figure and two buttons 8 apart (44 pt
  // on iOS, 48 dp on Android); the operators narrow first. 375 pt keeps one row; 360 dp Android
  // and 320 pt stack: load first, then reps and RIR.
  const bsize = dv.android ? 48 : 44,
    bgap = 8;
  const opW = cw < 340 ? 14 : 18,
    colW = (cw - 2 * opW) / 3;
  const three = colW >= 2 * bsize + bgap;
  const max = K.roomy(dv) ? 46 : 42;
  const size = Math.min(max, K.fit(S.next.load, (three ? colW : cw * 0.6) - 18, max, 28));
  const unit = S.unit;
  const loadStep = unit === "lb" ? "5 lb" : "2.5 kg";
  const st = armed ? "touched" : "suggested";
  const sw = swaps || {};
  const load = K.stepFigure(t, {
    value: start ? "25" : (vals?.load ?? S.next.load),
    swapTo: swapTo.load,
    bsize,
    unit,
    size,
    state: st,
    dec: `Less load, ${loadStep}`,
    inc: `More load, ${loadStep}`,
    swapCls: sw.load,
    bgap,
  });
  const reps = K.stepFigure(t, {
    value: start ? "8" : (vals?.reps ?? S.next.reps),
    swapTo: swapTo.reps,
    bsize,
    unit: "reps",
    size,
    state: st,
    dec: "One rep fewer",
    inc: "One rep more",
    swapCls: sw.reps,
    bgap,
  });
  const rir =
    rirHtml ||
    K.stepFigure(t, {
      value: armed ? String(S.next.target).split("–")[0] : "",
      unit: "RIR",
      size,
      state: armed ? "touched" : "empty",
      hint: start ? "optional" : `target\u00a0${S.next.target}`,
      dec: "One rep less in reserve",
      inc: "One rep more in reserve",
      bgap,
      bsize,
    });
  const op = (c) =>
    `<span aria-hidden="true" style="${s({ "padding-top": Math.round(size * 0.32), color: t.ink2, "text-align": "center" })}; ${txt(Math.round(size * 0.5), 500)}">${c}</span>`;
  const figures = three
    ? `<div style="${s({ display: "grid", "grid-template-columns": `minmax(0,1fr) ${opW}px minmax(0,1fr) ${opW}px minmax(0,1fr)`, "align-items": "start" })}">${load}${op("×")}${reps}${op("@")}${rir}</div>`
    : `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${load}<div style="${s({ display: "grid", "grid-template-columns": "minmax(0,1fr) 18px minmax(0,1fr)", "align-items": "start" })}">${reps}${op("@")}${rir}</div></div>`;
  const tag =
    start || !S.suggestion
      ? ""
      : `<a href="Why.dc.html" aria-haspopup="dialog" aria-label="${esc(`${S.suggestion.kind}: why ${S.next.load} ${S.unit} × ${S.next.reps}`)}" style="${s({ display: "inline-flex", "align-items": "center", height: 44 })}"><span style="${s({ display: "inline-flex", "align-items": "center", gap: 5, height: 30, padding: "0 9px 0 10px", "border-radius": 8, border: `1.5px solid ${t.ink}` })}; ${txt(14, 700)}">${S.suggestion.kind}${icon("info", 16)}</span></a>`;
  const save =
    saveHtml ||
    (start
      ? `<button type="button" style="${K.BTN(t, "primary")}; width: 100%">${SAVE}</button>`
      : armed
        ? `<button type="button" style="${K.BTN(t, "primary")}; width: 100%">${SAVE}</button>`
        : saveWaiting(t));
  return `<section aria-label="${start ? "Warm-up 1" : `Set ${S.next.n}`}" style="${s({ display: "flex", "flex-direction": "column", gap: K.short(dv) ? 8 : 12, "padding-top": 10, "border-top": `1px solid ${t.hair}`, "flex-shrink": 0, background: t.ground })}">
<div style="${s({ display: "flex", "align-items": "center", gap: 10, height: 44 })}"><h3 style="${txt(17, 700)}">${headHtml || (start ? "Warm-up 1" : `Set ${S.next.n}`)}</h3>${tag}<span style="flex:1 1 auto"></span><button type="button" aria-haspopup="dialog" aria-label="Set options: type, notes, remove" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", color: t.ink2, "margin-right": -10 })}">${icon("sliders", 20)}</button></div>
${figures}
<div style="margin-top:2px">${save}</div>
</section>`;
}
// Save, in the app's words (set-grid.tsx). Until RIR is chosen it waits, grey, and the app's own
// sentence for a missing RIR describes it (src/domain/effort.ts).
export const SAVE = "Save";
export const RIR_NEEDED = "Enter RIR: estimate how many more good reps you could do.";
export const RPE_NEEDED = "Enter effort from 1 (very easy) to 10 (maximal).";
export const saveWaiting = (t, { id = "rir-hint", need = RIR_NEEDED, style = "" } = {}) =>
  `<button type="button" aria-disabled="true" aria-describedby="${id}" style="${K.BTN(t, "waiting")}; width: 100%${style}">${SAVE}</button><span id="${id}" class="sr">${need}</span>`;
export const panel = (active, inner, style = "") =>
  `<div role="tabpanel" id="panel" aria-labelledby="panel-tab-${active}"${style ? ` style="${style}"` : ""}>${inner}</div>`;
function logHeader(t, S, dv, active = 0, { restOpts = {} } = {}) {
  const cw = dv.W - 2 * K.gut(dv);
  const glyph = glyphFor(S.modality);
  return `${sessionHeader(t, { left: backTo(t, S.back), more: "Complete, skip, superset, substitute", restOpts })}
<h2 style="${title(K.titleSize(S.exercise, cw, dv.W < 360 ? 28 : K.short(dv) ? 30 : 32), { lh: 1.05 })}; margin-top: 2px">${S.exercise}</h2>
${K.metaLine(t, [`${K.equip(t, glyph, equipName(S.modality))}<span>${S.rx}</span>`, `${icon("rest", 16)}<span>${S.rest}</span>`], { mt: 4 })}
<div style="margin-top:6px">${K.tabs(t, ["Log", "Technique", "History"], active, { dv, id: "Exercise detail" })}</div>`;
}
export function logScreen(
  t,
  dv = K.D,
  {
    S = bench,
    armed = false,
    start = false,
    whole = false,
    restOpts = {},
    entryOpts = {},
    rows = null,
  } = {},
) {
  const head = logHeader(t, S, dv, 0, { restOpts });
  const list = ledger(t, S, { start, rows });
  const ent = entry(t, S, dv, { armed, start, ...entryOpts });
  if (whole)
    return K.root(
      t,
      K.screenMain(t, `${head}${panel(0, list)}<div style="margin-top:10px">${ent}</div>`, {
        dv,
        whole: true,
      }),
      { label: S.exercise, dv, height: "auto" },
    );
  // When the sets need more room than the screen has, the list keeps its end in view (the set being
  // entered, what is left and Add set) and the earlier rows pass under the tabs, as a list scrolled
  // to its foot does. A cut that falls between two rows would read as a missing set.
  const G = K.gut(dv);
  const inner = `${head}${panel(0, list, s({ flex: "1 1 auto", "min-height": 0, display: "flex", "flex-direction": "column-reverse", overflow: "hidden", margin: `0 -${G}px`, padding: `0 ${G}px` }))}${ent}`;
  return K.root(t, sessionMain(t, inner, dv, { flex: true, fade: false }), {
    label: S.exercise,
    dv,
  });
}
export function techniqueScreen(t, dv = K.D, { S = bench } = {}) {
  const rows = S.technique
    .map(
      ([k, v]) =>
        `<div style="${s({ padding: "12px 0", "border-bottom": `1px solid ${t.hair}` })}"><dt style="${txt(13, 700, { color: t.ink2 })}">${k}</dt><dd style="${txt(17, 500, { "line-height": 1.4 })}; margin-top: 2px; ${tn}">${v}</dd></div>`,
    )
    .join("");
  const inner = `${logHeader(t, S, dv, 1)}${panel(1, `<dl style="margin-top:4px">${rows}</dl><a href="#" style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", height: 52 })}; ${txt(16, 700)}">Open in the exercise library${icon("chevronRight", 20)}</a>`)}`;
  return K.root(t, sessionMain(t, inner, dv), { label: S.exercise, dv });
}
// History: every session of this exercise, newest first, each set as it was logged. The sessions
// test that drives logging has no dates, so each session is named by its cycle; the reason for
// today's suggestion lives on the suggestion's tag, not here.
export function historyScreen(t, dv = K.D, { S = bench } = {}) {
  const setRows = (sets) =>
    sets
      .map(([v, reps, rir], i) =>
        ledgerRow(t, { n: i + 1, v, reps, rir, kind: "done" }, { unit: S.unit }),
      )
      .join("");
  const sessions = S.history
    .map(
      (h, i) =>
        `<section aria-labelledby="h-${i}" style="margin-top:${i ? 18 : 10}px"><h3 id="h-${i}" style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline", gap: 12 })}; ${txt(15, 700)}"><span>${h.when}</span></h3><ol>${setRows(h.sets)}</ol></section>`,
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

// ---------- the signature moment: a set is inked ----------
// Save presses (120 ms) and turns to Saving…; the row's mark turns, a thinned square with an arc,
// while the server answers; on confirmation ink rolls up the mark (420 ms) and the row takes its
// figures; then set 4 takes the outline, the values go back to suggestions, RIR empties and rest
// restarts at 3:00. Nothing is inked before the server has it. The lifter has turned the
// suggested 62.5 × 3 down to 60 × 4, as the sessions test logs set 3.
export function momentScreen(t, dv = K.D) {
  const S = bench;
  const sw = (a, b, ca, cb) =>
    `<span style="display:inline-grid"><span class="${ca}" style="grid-area:1/1">${a}</span><span class="${cb}" aria-hidden="true" style="grid-area:1/1">${b}</span></span>`;
  const sq = 12;
  const nowMark = `<span style="${s({ width: sq + 2, height: sq + 2, border: `2.5px solid ${t.ink}`, display: "block" })}"></span>`;
  const savingMark = `<span style="${s({ position: "relative", width: sq, height: sq, background: PIG.ultraT, border: `1.5px solid ${t.marks.strength}`, display: "block" })}"><svg class="spin" width="${sq}" height="${sq}" viewBox="0 0 24 24" aria-hidden="true" style="position:absolute;inset:-1.5px;display:block" fill="none" stroke="${t.ink}" stroke-width="4" stroke-linecap="round"><path d="M12 4a8 8 0 1 1-8 8"/></svg></span>`;
  const inkMark = `<span class="ink3" style="${s({ width: sq, height: sq, background: t.marks.strength, display: "block" })}"></span>`;
  const mark3 = `<span style="display:inline-grid;place-items:center"><span class="m-now" style="grid-area:1/1;display:grid">${nowMark}</span><span class="m-saving" style="grid-area:1/1;display:grid">${savingMark}</span><span class="m-ink" style="grid-area:1/1;display:grid">${inkMark}</span></span>`;
  const text3 = `<span class="t3" style="${num(20)}">60 <span style="${txt(14, 600, { color: t.ink2 })}">×</span> 4 <span style="${txt(14, 600, { color: t.ink2 })}">@</span> 2</span>`;
  const mark4 = `<span style="display:inline-grid;place-items:center"><span class="m4-todo" style="grid-area:1/1;display:grid"><span style="${s({ width: sq, height: sq, border: `1.5px solid ${t.marks.strength}`, background: PIG.ultraT, display: "block" })}"></span></span><span class="m4-now" style="grid-area:1/1;display:grid">${nowMark}</span></span>`;
  const rows = [
    ...S.warmups.map((w) => ({ ...w, kind: "warm" })),
    ...S.sets.map((x) => ({ ...x, kind: "done" })),
  ].map((r) => ledgerRow(t, r));
  rows.push(
    ledgerRow(t, { n: 3, kind: "now", text: text3 }, { swap: mark3 })
      .replace('aria-current="step" ', "")
      .replace(
        /background: [^;]+; margin: 0 -8px; padding: 0 8px; border-radius: 10px/,
        "background: transparent; margin: 0; padding: 0",
      ),
  );
  rows.push(ledgerRow(t, { n: 4, kind: "todo" }, { swap: mark4 }));
  const head = (a, b) => sw(a, b, "h3a", "h4a");
  const rirSel = `<div role="group" aria-label="RIR" style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 6 })}"><output style="display:block;text-align:center">${sw(`<span style="${num(42, { lh: 1.1 })}">2</span>`, `<span style="${num(42, { lh: 1.1 })}; color: ${t.control}">–</span>`, "r2", "r0")}</output><span style="${txt(13, 600, { color: t.ink2 })}">RIR · target 2</span><span style="${s({ display: "flex", gap: 8, "margin-top": 2 })}">${K.roundBtn(t, "minus", "One rep less in reserve")}${K.roundBtn(t, "plus", "One rep more in reserve")}</span></div>`;
  const saveHtml = `<div style="display:grid">
<span class="sv-wait" aria-hidden="true" style="${K.BTN(t, "waiting")}; grid-area: 1/1">${SAVE}</span>
<span class="sv-saving" aria-hidden="true" style="${K.BTN(t, "waiting")}; grid-area: 1/1">Saving…</span>
<span class="sv-saved" aria-hidden="true" style="${K.BTN(t, "waiting")}; grid-area: 1/1; color: ${t.ink}">${icon("check", 20)}Saved</span>
<button type="button" class="sv-armed" style="${K.BTN(t, "primary")}; grid-area: 1/1">${SAVE}</button>
</div>`;
  const record = `${logHeader(t, S, dv, 0, { restOpts: { timeHtml: sw("2:14", "3:00", "t1", "t2") } })}${panel(0, `<ol aria-label="Sets" style="margin-top:6px">${rows.join("")}</ol>`)}`;
  const ent = entry(t, S, dv, {
    armed: true,
    swaps: { load: ["va", "vb"], reps: ["va", "vb"] },
    vals: { load: "60", reps: "4" },
    swapTo: { load: S.next.load, reps: S.next.reps },
    saveHtml,
    rirHtml: rirSel,
    headHtml: head("Set 3", "Set 4"),
  });
  const G = K.gut(dv);
  const inner = `<div style="${s({ flex: "1 1 auto", "min-height": 0, overflow: "hidden", position: "relative", margin: `0 -${G}px`, padding: `0 ${G}px` })}">${record}</div>${ent}<p class="sr" role="status">Set 3 saved: 60 kilograms, 4 reps, 2 in reserve. Rest 3:00.</p>`;
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
  // a layer that is not showing is not there at all: opacity and visibility swap together
  const show = (cls, on, off = END) =>
    `@keyframes ${cls}{0%,${pct(on - 0.001)}{opacity:0;visibility:hidden}${pct(on)},${pct(off)}{opacity:1;visibility:visible}${pct(off + 0.001)},100%{opacity:0;visibility:hidden}}.${cls}{opacity:0;visibility:hidden;animation:${cls} ${Lp}s linear infinite}`;
  const hide = (cls, off, on = RESET) =>
    `@keyframes ${cls}{0%,${pct(off - 0.001)}{opacity:1;visibility:visible}${pct(off)},${pct(on - 0.001)}{opacity:0;visibility:hidden}${pct(on)},100%{opacity:1;visibility:visible}}.${cls}{animation:${cls} ${Lp}s linear infinite}`;
  // timeline (s): armed 0–1.2 · press 1.2–1.32 · saving 1.32–1.95 · ink 1.95–2.37 · swaps 2.45–2.65
  const common = `
${hide("sv-armed", 1.32)}
${show("sv-saving", 1.32, 1.95)}
${show("sv-saved", 1.95, 2.45)}
${show("sv-wait", 2.45)}
${hide("sv-wait-pre", 0)}
${hide("m-now", 1.32)}
${show("m-saving", 1.32, 1.95)}
${show("m-ink", 1.95)}
${show("t3", 2.05)}
${hide("m4-todo", 2.45)}
${show("m4-now", 2.45)}
${hide("h3a", 2.45)}
${show("h4a", 2.53)}
${hide("r2", 2.45)}
${show("r0", 2.53)}
${hide("va", 2.45)}
${show("vb", 2.53)}
${hide("t1", 2.0)}
${show("t2", 2.08)}
@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 700ms linear infinite;transform-origin:50% 50%}`;
  if (reduced)
    return common.replace(/@keyframes spin[^}]*}}\.spin\{[^}]*\}/, ".spin{animation:none}");
  return `${common}
@keyframes press{0%,${pct(1.2)}{transform:scale(1)}${pct(1.26)}{transform:scale(0.97)}${pct(1.32)},100%{transform:scale(1)}}.sv-armed{animation:press ${Lp}s cubic-bezier(0.23,1,0.32,1) infinite, sv-armed ${Lp}s linear infinite}
@keyframes ink3{0%,${pct(1.95)}{clip-path:inset(100% 0 0 0)}${pct(2.37)},${pct(END)}{clip-path:inset(0 0 0 0)}${pct(RESET)},100%{clip-path:inset(100% 0 0 0)}}.ink3{animation:ink3 ${Lp}s cubic-bezier(0.65,0,0.35,1) infinite}
@media (prefers-reduced-motion: reduce){.sv-armed{animation:sv-armed ${Lp}s linear infinite}.ink3{animation:none;clip-path:none}.spin{animation:none}}`;
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
  const foot = `<div style="${s({ position: "absolute", left: K.gut(dv), right: K.gut(dv), bottom: dv.bottom + 8, display: "flex", "flex-direction": "column", gap: 4 })}"><button type="button" style="${K.BTN(t, "primary")}">Save and start</button><a href="#" style="${s({ display: "grid", "place-items": "center", height: 44 })}; ${txt(15, 700)}">Skip check-in</a></div>`;
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
function recordedRows(t, X) {
  return X.exercises
    .map((x) => {
      const sets = x.timed
        ? `${x.sets[0][0]} × ${x.sets.length}`
        : [
            x.warm ? `<span style="color:${t.ink2}">W ${x.warm[0]} × ${x.warm[1]}</span>` : "",
            ...x.sets.map(([v, r]) => `${v} × ${r}`),
          ]
            .filter(Boolean)
            .join(" · ");
      return `<li style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 52, padding: "6px 0", "border-bottom": `1px solid ${t.hair}` })}">${K.markCell(K.colMark(t, x.sets.length + (x.warm ? 1 : 0), x.sets.length + (x.warm ? 1 : 0), { warm: x.warm ? 1 : 0 }))}<span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0, flex: "1 1 auto" })}"><span class="wrap" style="${txt(16, 700)}">${x.name}</span><span class="wrap" style="${txt(14, 500)}; ${tn}">${sets}</span></span></li>`;
    })
    .join("");
}
// Finish: what the session recorded and what it did not, then the notes and the day's body weight
// (the app's finish page, src/app/(app)/workouts/[sessionId]/finish/). Upper A, cycle 3: the bench
// alone was logged, so the other six are not done; a dashed mark says so once for each.
const upperCols = () => [
  { n: 7, done: 7, warm: 3 },
  ...upperA.exercises.slice(1).map((x) => ({ n: x.sets, done: 0, skipped: true })),
];
function finishedRows(t, X) {
  return X.done
    .map((x) => {
      const n = x.sets.length + (x.warm ? x.warm.length : 0);
      return `<li style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 52, padding: "6px 0", "border-bottom": `1px solid ${t.hair}` })}">${K.markCell(K.colMark(t, n, n, { warm: x.warm ? x.warm.length : 0 }))}<span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0, flex: "1 1 auto" })}"><span class="wrap" style="${txt(16, 700)}">${x.name}</span><span class="wrap" style="${txt(14, 500)}; ${tn}">${x.sets.map(([v, r]) => `${v} kg × ${r}`).join(", ")}</span></span></li>`;
    })
    .join("");
}
const notDone = (t) => {
  const names = upperA.exercises.slice(1).map((x) => x.name);
  return `<div style="${s({ display: "flex", gap: 12, "align-items": "flex-start", padding: "10px 0", "border-bottom": `1px solid ${t.hair}` })}">${K.markCell(K.colMark(t, 3, 0, { skipped: true, label: "Not done" }))}<p class="wrap" style="${txt(14, 500, { color: t.ink2, "line-height": 1.4 })}">${names.join(", ")}</p></div>`;
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
<div style="${s({ display: "flex", "flex-direction": "column", gap: 14, "margin-top": 14 })}">${K.field(t, "Notes", { rows: 2, placeholder: "How it went, anything the coach should know…", help: "Your coach reads these" })}${K.field(t, "Body weight (kg)", { help: "Optional — recorded as today’s reading" })}</div>
<button type="button" style="${K.BTN(t, "primary")}; width: 100%; margin-top: 16px">Finish session</button>`;
  return K.root(
    t,
    `${sessionMain(t, under, dv)}${K.sheet(t, inner, { dv, id: "fin-title", top: 64 })}`,
    { label: "Finish session", dv },
  );
}
// The record, the moment the session ends: the print as it stands, what it recorded, and the
// routine to save or repeat. Upper A set no records, so none are shown; a past workout that set
// four (Tue 8 Sept) lists them in ink, each led by its mark.
function records(t, list) {
  return `<h3 style="${txt(13, 700, { color: t.ink2 })}; margin: 18px 0 2px">${list.length} records</h3><ul>${list
    .map(
      ([ex, metric, v, unit, was]) =>
        `<li style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 52, padding: "6px 0", "border-bottom": `1px solid ${t.hair}` })}">${K.markCell(K.stateMark(t, "strength", 14))}<span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0, flex: "1 1 auto" })}"><span class="wrap" style="${txt(16, 700)}">${ex}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${metric} · was ${was}</span></span><span class="nb" style="${s({ display: "flex", "align-items": "baseline", gap: 3 })}"><span style="${num(20)}">${v}</span><span style="${txt(13, 600, { color: t.ink2 })}">${unit}</span></span></li>`,
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
  const plan = `<aside aria-label="The plan asked for" style="${s({ display: "flex", gap: 12, "align-items": "center", padding: "12px 14px", "border-radius": 14, background: t.surface, "margin-top": 12 })}">${K.stateMark(t, "run", 22, { state: "todo" })}<span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${num(20)}">25<span style="font-family:${K.FONTS.text};font-weight:500">–</span>30 <span style="${txt(14, 600, { color: t.ink2 })}">min</span></span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}">Talk-test; slower than push pace</span></span></aside>`;
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
export { sessionCols, backTo, sessionMain, ledgerRow, exRow, warmRow, glyphFor, equipName };
