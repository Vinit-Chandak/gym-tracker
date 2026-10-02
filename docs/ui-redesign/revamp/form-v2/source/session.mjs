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
import { upperA, armsWorkout, lowerA, bench, sept8, run2Aug, EQUIP } from "./data.mjs";

const { txt, num, title, icon, tn } = K;
const glyphFor = (m) => EQUIP[m] || "kettlebell";
const equipName = (m) =>
  ({
    kettlebell: "Free weights",
    bodyweight: "Bodyweight",
    cable: "Cable",
    machine: "Machine",
    smith: "Smith machine",
  })[glyphFor(m)];

// ---------- header pieces ----------
const minimise = () =>
  `<button type="button" aria-label="Minimise the workout" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "flex-shrink": 0, "margin-left": -10 })}">${icon("chevronDown", 24)}</button>`;
const finishBtn = (t) =>
  `<a href="#" style="${K.BTN(t, "outline", { h: 36 })}; padding: 0 14px; font-size: 15px">Finish</a>`;
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
  `<a href="${href}" style="${s({ display: "flex", "align-items": "center", gap: 2, height: 44, "margin-left": -10, "padding-right": 6, "min-width": 0 })}; ${txt(17, 700)}">${icon("chevronLeft", 22)}<span class="nb" style="overflow:hidden;text-overflow:ellipsis">${label}</span></a>`;
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
const group = (t, label, rows, id) =>
  `<section aria-labelledby="${id}">${K.caption(t, label, { id, mt: 18 })}<ul>${rows}</ul></section>`;
const addRow = (t) =>
  `<div style="${s({ display: "flex", gap: 8, "margin-top": 10 })}"><button type="button" style="${K.BTN(t, "tonal", { h: 44 })}; padding: 0 14px; font-size: 15px">${icon("plus", 18)}Add exercise</button><button type="button" style="${K.BTN(t, "tonal", { h: 44 })}; padding: 0 14px; font-size: 15px">${icon("link", 18)}Superset</button></div>`;
const superset = (t, rows, names) =>
  `<li style="position:relative"><ul aria-label="Superset: ${esc(names.join(" and "))}">${rows}</ul>${K.supersetBracket(t, "Superset")}</li>`;

export function workoutScreen(t, dv = K.D, { kind = "upper" } = {}) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G,
    sm = K.short(dv);
  const head = sessionHeader(t, { left: minimise(t), finish: true });
  const ttl = (name, extra = "") =>
    `<h2 style="${title(K.titleSize(name, cw - 30, dv.W < 360 ? 30 : 34), { lh: 1.05 })}; margin-top: 2px; display: flex; align-items: center; gap: 8px">${name}${extra}</h2>`;
  let inner, label;
  if (kind === "upper") {
    const X = upperA;
    const open = X.exercises.filter((x) => x.state === "open"),
      todo = X.exercises.filter((x) => !x.state);
    inner = `${head}${ttl(X.session)}
${K.metaLine(t, [`${icon("pin", 16)}<span>${X.gym}</span>`, `${icon("rest", 16)}<span>${X.time}</span>`], { mt: 4 })}
${K.printFrame(
  dayPrint({
    w: cw,
    h: sm ? 92 : 112,
    paper: t.paper,
    align: "ends",
    parts: [
      { kind: "strength", columns: X.exercises.map((x) => ({ n: x.sets, done: x.done || 0 })) },
      {
        kind: "mobility",
        segments: X.warmup.drills,
        segDone: X.warmup.drills,
        done: true,
        modules: 3,
      },
    ],
    ariaLabel: "Upper A: the bench’s first two sets inked, the warm-up done",
  }),
  { mt: 12 },
)}
<div style="margin-top:12px">${K.coachNote(t, { who: "Recovery check", tone: "check", title: "Sleep 5 h", text: "Hold loads today rather than adding, and keep the RIR honest.", dv, more: false, size: 15 })}</div>
${group(t, "In progress", open.map((x) => exRow(t, x, { dv, open: true, last: true })).join(""), "g-open")}
${group(t, "To do", todo.map((x, i) => exRow(t, x, { dv, last: i === todo.length - 1 })).join(""), "g-todo")}
${group(t, "Done", warmRow(t, { name: X.warmup.name, sub: `${X.warmup.drills} drills`, drills: X.warmup.drills, done: true, last: true }), "g-done")}
${addRow(t)}`;
    label = "Upper A, the workout";
  } else if (kind === "arms") {
    const X = armsWorkout;
    const open = X.exercises.filter((x) => x.state === "open"),
      done = X.exercises.filter((x) => x.state === "done"),
      ss = X.exercises.filter((x) => x.superset);
    inner = `${head}${ttl(X.session)}
${K.metaLine(t, [`${icon("pin", 16)}<span>${X.gym}</span>`, `${icon("rest", 16)}<span>${X.time}</span>`], { mt: 4 })}
${K.printFrame(
  dayPrint({
    w: cw,
    h: sm ? 92 : 112,
    paper: t.paper,
    align: "ends",
    parts: [
      {
        kind: "strength",
        columns: X.exercises.map((x, i) => ({
          n: x.sets,
          done: x.done || 0,
          pair: x.superset && X.exercises[i + 1]?.superset === x.superset,
        })),
      },
      { kind: "mobility", segments: 5, segDone: 0, modules: 3 },
    ],
    ariaLabel:
      "Easy Run + Arms: barbell curl inked, one set of the pushdown, the forearms superset to do",
  }),
  { mt: 12 },
)}
${group(t, "In progress", open.map((x) => exRow(t, x, { dv, open: true, last: true })).join(""), "g-open")}
${group(
  t,
  "To do",
  `${warmRow(t, { name: "Run warm-up", sub: "5 drills", drills: 5, done: false })}${superset(
    t,
    ss.map((x, i) => exRow(t, x, { dv, last: i === ss.length - 1 })).join(""),
    ss.map((x) => x.name),
  )}`,
  "g-todo",
)}
${group(t, "Done", done.map((x) => exRow(t, x, { dv, done: true, last: true })).join(""), "g-done")}
${addRow(t)}`;
    label = "Easy Run + Arms, a superset among the exercises to do";
  } else {
    const X = lowerA,
      kept = X.entries.filter((x) => !x.dropped),
      dropped = X.entries.filter((x) => x.dropped);
    inner = `${head}${ttl(X.session, `<span role="img" aria-label="Planned by the coach" style="display:grid;color:${t.ink}">${icon("coach", 22)}</span>`)}
${K.metaLine(t, [`${icon("pin", 16)}<span>${X.gym}</span>`, `${icon("rest", 16)}<span>${X.time}</span>`], { mt: 4 })}
${K.printFrame(
  dayPrint({
    w: cw,
    h: sm ? 92 : 112,
    paper: t.paper,
    align: "ends",
    parts: [
      {
        kind: "strength",
        columns: X.entries.map((x) => ({ n: x.sets, done: 0, skipped: !!x.dropped })),
      },
      { kind: "mobility", segments: 2, segDone: 0, modules: 3 },
    ],
    ariaLabel: "Lower A as the coach planned it: seven exercises to do, the cable crunch skipped",
  }),
  { mt: 12 },
)}
${group(t, "To do", `${warmRow(t, { name: "Warm-up", sub: X.warmup.join(" · "), drills: 2, done: false })}${kept.map((x, i) => exRow(t, { ...x, done: 0 }, { dv, last: i === kept.length - 1 })).join("")}`, "g-todo")}
${group(t, "Skipped", dropped.map((x) => exRow(t, x, { dv, skipped: true, last: true })).join(""), "g-skip")}`;
    label = "Lower A, planned by the coach";
  }
  return K.root(t, sessionMain(t, inner, dv), { label, dv });
}

// ---------- logging: Log, Technique, History ----------
const RIR_NAME = (v) => (v === "1" ? "1 rep in reserve" : `${v} reps in reserve`);
function ledgerRow(t, r, { now = false, swap = null } = {}) {
  // r: { n, v, reps, rir, kind: 'warm' | 'warmTodo' | 'done' | 'todo' | 'now' }
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
      ? `<span style="${num(20)}">${r.v} <span style="${txt(14, 600, { color: t.ink2 })}">×</span> ${r.reps} <span style="${txt(14, 600, { color: t.ink2 })}">@</span> ${r.rir}</span>`
      : r.kind === "warm" || r.kind === "warmTodo"
        ? `<span style="${num(17)}; color: ${t.ink2}">${r.v} <span style="${txt(13, 600)}">×</span> ${r.reps}</span>`
        : "";
  const aria =
    r.kind === "done"
      ? `Set ${r.n}: ${r.v} kilograms, ${r.reps} reps, ${RIR_NAME(String(r.rir))}. Saved. Edit`
      : r.kind === "warm"
        ? `Warm-up: ${r.v} kilograms, ${r.reps} reps. Saved. Edit`
        : r.kind === "warmTodo"
          ? `Warm-up to do: ${r.v} kilograms, ${r.reps} reps`
          : r.kind === "now"
            ? `Set ${r.n}, being entered below`
            : `Set ${r.n}, to do`;
  return `<li><button type="button" aria-label="${esc(aria)}"${now ? ' aria-current="step"' : ""} style="${s({ display: "flex", "align-items": "center", gap: 0, width: "100%", height: 40, "border-bottom": `1px solid ${t.hair}`, "text-align": "left", background: now ? t.surface : "transparent", margin: now ? "0 -8px" : 0, padding: now ? "0 8px" : 0, "border-radius": now ? 10 : 0, "box-sizing": "content-box" })}"><span style="${s({ width: 26, "flex-shrink": 0, color: r.kind.startsWith("warm") ? t.ink2 : t.ink })}; ${txt(15, 700)}; ${tn}">${r.n}</span>${K.markCell(swap ? swap : mk)}<span style="${s({ "margin-left": 12, flex: "1 1 auto", "min-width": 0 })}">${swap && r.kind === "now" ? r.text || "" : text}</span>${r.trail || ""}</button></li>`;
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
  return `<ol aria-label="Sets" style="margin-top:6px">${items.map((r) => (typeof r === "string" ? r : ledgerRow(t, r, { now: r.kind === "now" }))).join("")}<li><button type="button" style="${s({ display: "flex", "align-items": "center", gap: 8, height: 44, color: t.ink2, "padding-left": 26 })}; ${txt(15, 700)}">${icon("plus", 18)}Add set</button></li></ol>`;
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
  } = {},
) {
  const cw = dv.W - 2 * K.gut(dv);
  // three steppers side by side while each column holds its figure and two 44 pt buttons 6 apart;
  // the operators narrow first (360 dp Android and 375 pt phones keep one row, 320 stacks)
  const opW = cw < 340 ? 14 : 18,
    colW = (cw - 2 * opW) / 3;
  const three = colW >= 94;
  const bgap = colW < 100 ? 6 : 8;
  const max = K.roomy(dv) ? 46 : 42;
  const size = Math.min(max, K.fit(S.next.load, (three ? colW : cw * 0.6) - 18, max, 28));
  const unit = S.unit;
  const loadStep = unit === "lb" ? "5 lb" : "2.5 kg";
  const st = armed ? "touched" : "suggested";
  const sw = swaps || {};
  const load = K.stepFigure(t, {
    value: start ? "25" : S.next.load,
    unit,
    size,
    state: st,
    dec: `Less load, ${loadStep}`,
    inc: `More load, ${loadStep}`,
    swapCls: sw.load,
    bgap,
  });
  const reps = K.stepFigure(t, {
    value: start ? "8" : S.next.reps,
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
      hint: start ? "optional" : `target ${S.next.target}`,
      dec: "One rep less in reserve",
      inc: "One rep more in reserve",
      bgap,
    });
  const op = (c) =>
    `<span aria-hidden="true" style="${s({ "padding-top": Math.round(size * 0.32), color: t.ink2, "text-align": "center" })}; ${txt(Math.round(size * 0.5), 500)}">${c}</span>`;
  const figures = three
    ? `<div style="${s({ display: "grid", "grid-template-columns": `minmax(0,1fr) ${opW}px minmax(0,1fr) ${opW}px minmax(0,1fr)`, "align-items": "start" })}">${load}${op("×")}${reps}${op("@")}${rir}</div>`
    : `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${load}<div style="${s({ display: "grid", "grid-template-columns": "minmax(0,1fr) 18px minmax(0,1fr)", "align-items": "start" })}">${reps}${op("@")}${rir}</div></div>`;
  const tag =
    start || !S.suggestion
      ? ""
      : `<button type="button" aria-haspopup="dialog" aria-label="${esc(`${S.suggestion.kind}: why ${S.next.load} ${S.unit} × ${S.next.reps}`)}" style="${s({ display: "inline-flex", "align-items": "center", gap: 5, height: 30, padding: "0 9px 0 10px", "border-radius": 8, border: `1.5px solid ${t.ink}` })}; ${txt(14, 700)}">${S.suggestion.kind}${icon("info", 16)}</button>`;
  const save =
    saveHtml ||
    (start
      ? `<button type="button" style="${K.BTN(t, "primary")}; width: 100%">Save warm-up</button>`
      : armed
        ? `<button type="button" style="${K.BTN(t, "primary")}; width: 100%">Save set ${S.next.n}</button>`
        : `<button type="button" aria-disabled="true" aria-describedby="rir-hint" style="${K.BTN(t, "waiting")}; width: 100%"><span id="rir-hint">Choose RIR to save</span></button>`);
  return `<section aria-label="${start ? "Warm-up 1" : `Set ${S.next.n}`}" style="${s({ display: "flex", "flex-direction": "column", gap: K.short(dv) ? 8 : 12, "padding-top": 10, "border-top": `1px solid ${t.hair}`, "flex-shrink": 0, background: t.ground })}">
<div style="${s({ display: "flex", "align-items": "center", gap: 10, height: 36 })}"><h3 style="${txt(17, 700)}">${headHtml || (start ? "Warm-up 1" : `Set ${S.next.n}`)}</h3>${tag}<span style="flex:1 1 auto"></span><button type="button" aria-haspopup="dialog" aria-label="Set options: type, notes, remove" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", color: t.ink2, "margin-right": -10 })}">${icon("sliders", 20)}</button></div>
${figures}
<div style="margin-top:2px">${save}</div>
</section>`;
}
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
  const record = `${logHeader(t, S, dv, 0, { restOpts })}${ledger(t, S, { start, rows })}`;
  const ent = entry(t, S, dv, { armed, start, ...entryOpts });
  if (whole)
    return K.root(
      t,
      K.screenMain(t, `${record}<div style="margin-top:10px">${ent}</div>`, { dv, whole: true }),
      { label: `${S.exercise}, the whole scroll`, dv, height: "auto" },
    );
  const G = K.gut(dv);
  const inner = `<div style="${s({ flex: "1 1 auto", "min-height": 0, overflow: "hidden", position: "relative", margin: `0 -${G}px`, padding: `0 ${G}px` })}">${record}${K.fadeTo(t, 18)}</div>${ent}`;
  return K.root(t, sessionMain(t, inner, dv, { flex: true, fade: false }), {
    label: armed
      ? `${S.exercise}, set ${S.next.n}, RIR chosen`
      : start
        ? `${S.exercise}, starting with the warm-ups`
        : `${S.exercise}, entering set ${S.next.n}`,
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
  const inner = `${logHeader(t, S, dv, 1)}<dl style="margin-top:4px">${rows}</dl><a href="#" style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", height: 52 })}; ${txt(16, 700)}">Open in the exercise library${icon("chevronRight", 20)}</a>`;
  return K.root(t, sessionMain(t, inner, dv), { label: `${S.exercise}, technique`, dv });
}
export function historyScreen(t, dv = K.D, { S = bench } = {}) {
  const setRows = (sets) =>
    sets
      .map(([v, reps, rir], i) => ledgerRow(t, { n: i + 1, v, reps, rir, kind: "done" }))
      .join("");
  const sessions = S.history
    .map(
      (h, i) =>
        `<section aria-label="${h.when}" style="margin-top:${i ? 16 : 10}px"><h3 style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline" })}; ${txt(15, 700)}"><span>${h.when}</span>${h.note ? `<span style="${txt(13, 600, { color: t.ink2 })}">${h.note}</span>` : ""}</h3><ol>${setRows(h.sets)}</ol></section>`,
    )
    .join("");
  const why = `<section aria-labelledby="why-h" style="${s({ "margin-top": 12, padding: "12px 14px", "border-radius": 14, background: t.surface })}"><h3 id="why-h" style="${s({ display: "flex", "align-items": "center", gap: 8 })}; ${txt(13, 700)}"><span style="${s({ padding: "1px 8px", "border-radius": 8, border: `1.5px solid ${t.ink}` })}">${S.suggestion.kind}</span><span style="${num(17)}">62.5 <span style="${txt(13, 600, { color: t.ink2 })}">kg ×</span> 3</span></h3><p style="${txt(16, 500, { "line-height": 1.4 })}; margin-top: 6px">${S.suggestion.reason}</p><p style="${txt(13, 500, { color: t.ink2 })}; margin-top: 2px">${S.suggestion.basis}</p></section>`;
  const inner = `${logHeader(t, S, dv, 2)}${why}${sessions}<a href="#" style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", height: 52, "margin-top": 6 })}; ${txt(16, 700)}">Every session of this exercise${icon("chevronRight", 20)}</a>`;
  return K.root(t, sessionMain(t, inner, dv), { label: `${S.exercise}, history`, dv });
}
// Why: the suggestion explained, a short sheet over logging.
export function whyScreen(t, dv = K.D, { S = bench } = {}) {
  const under = logScreen(t, dv, { S })
    .replace(/^<div[^>]*><h1 class="sr">[^<]*<\/h1>/, "")
    .replace(/<\/div>$/, "");
  const inner = `<div style="${s({ display: "flex", "align-items": "center", gap: 10 })}"><span style="${s({ padding: "2px 9px", "border-radius": 8, border: `1.5px solid ${t.ink}`, "flex-shrink": 0 })}; ${txt(14, 700)}">${S.suggestion.kind}</span><h2 id="why-title" style="${title(28)}; flex: 1 1 auto; ${tn}">Keep 62.5 kg × 3</h2><button type="button" aria-label="Close" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "margin-right": -10 })}">${icon("close", 20)}</button></div>
<p style="${txt(17, 500, { "line-height": 1.45 })}; margin-top: 10px">${S.suggestion.reason}</p>
<p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 4px">${S.suggestion.basis} Last time: 62.5 kg × 2, 3, 3, 3 @ 1.</p>
<a href="#" style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", height: 52, "margin-top": 8, "border-top": `1px solid ${t.hair}` })}; ${txt(16, 700)}">History${icon("chevronRight", 20)}</a>`;
  return K.root(t, `${under}${K.sheet(t, inner, { dv, id: "why-title", label: "Why" })}`, {
    label: "Why keep 62.5 kg × 3",
    dv,
  });
}

// ---------- the signature moment: a set is inked ----------
// Save presses (120 ms) and turns to Saving…; the row's mark turns, a thinned square with an arc,
// while the server answers; on confirmation ink rolls up the mark (420 ms) and the row takes its
// figures; then set 4 takes the outline, the values go back to suggestions, RIR empties and rest
// restarts at 3:00. Nothing is inked before the server has it.
export function momentScreen(t, dv = K.D, { reduced = false } = {}) {
  const S = bench;
  const sw = (a, b, ca, cb) =>
    `<span style="display:inline-grid"><span class="${ca}" style="grid-area:1/1">${a}</span><span class="${cb}" aria-hidden="true" style="grid-area:1/1">${b}</span></span>`;
  const sq = 12;
  const nowMark = `<span style="${s({ width: sq + 2, height: sq + 2, border: `2.5px solid ${t.ink}`, display: "block" })}"></span>`;
  const savingMark = `<span style="${s({ position: "relative", width: sq, height: sq, background: PIG.ultraT, border: `1.5px solid ${t.marks.strength}`, display: "block" })}"><svg class="spin" width="${sq}" height="${sq}" viewBox="0 0 24 24" aria-hidden="true" style="position:absolute;inset:-1.5px;display:block" fill="none" stroke="${t.ink}" stroke-width="4" stroke-linecap="round"><path d="M12 4a8 8 0 1 1-8 8"/></svg></span>`;
  const inkMark = `<span class="ink3" style="${s({ width: sq, height: sq, background: t.marks.strength, display: "block" })}"></span>`;
  const mark3 = `<span style="display:inline-grid;place-items:center"><span class="m-now" style="grid-area:1/1;display:grid">${nowMark}</span><span class="m-saving" style="grid-area:1/1;display:grid">${savingMark}</span><span class="m-ink" style="grid-area:1/1;display:grid">${inkMark}</span></span>`;
  const text3 = `<span class="t3" style="${num(20)}">62.5 <span style="${txt(14, 600, { color: t.ink2 })}">×</span> 3 <span style="${txt(14, 600, { color: t.ink2 })}">@</span> 2</span>`;
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
<span class="sv-wait" aria-hidden="true" style="${K.BTN(t, "waiting")}; grid-area: 1/1">Choose RIR to save</span>
<span class="sv-saving" aria-hidden="true" style="${K.BTN(t, "waiting")}; grid-area: 1/1">Saving…</span>
<span class="sv-saved" aria-hidden="true" style="${K.BTN(t, "waiting")}; grid-area: 1/1; color: ${t.ink}">${icon("check", 20)}Saved</span>
<button type="button" class="sv-armed" style="${K.BTN(t, "primary")}; grid-area: 1/1">Save set 3</button>
</div>`;
  const record = `${logHeader(t, S, dv, 0, { restOpts: { timeHtml: sw("2:14", "3:00", "t1", "t2") } })}<ol aria-label="Sets" style="margin-top:6px">${rows.join("")}</ol>`;
  const ent = entry(t, S, dv, {
    armed: true,
    swaps: { load: ["va", "vb"], reps: ["va", "vb"] },
    saveHtml,
    rirHtml: rirSel,
    headHtml: head("Set 3", "Set 4"),
  });
  const G = K.gut(dv);
  const inner = `<div style="${s({ flex: "1 1 auto", "min-height": 0, overflow: "hidden", position: "relative", margin: `0 -${G}px`, padding: `0 ${G}px` })}">${record}</div>${ent}<p class="sr" role="status">Set 3 saved: 62.5 kg, 3 reps, 2 in reserve. Rest 3:00.</p>`;
  return K.root(t, sessionMain(t, inner, dv, { flex: true, fade: false }), {
    label: reduced ? "A set is inked, reduced motion" : "A set is inked",
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
function scale(t, label, ends, chosen, id) {
  return `<div role="radiogroup" aria-labelledby="${id}" style="${s({ display: "flex", "flex-direction": "column", gap: 6, padding: "12px 0", "border-bottom": `1px solid ${t.hair}` })}"><p id="${id}" style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline", gap: 8 })}"><span style="${txt(16, 700)}">${label}</span><span style="${txt(13, 500, { color: t.ink2 })}">1 ${ends[0]} · 5 ${ends[1]}</span></p><div style="${s({ display: "grid", "grid-template-columns": "repeat(5, minmax(0,1fr))", gap: 2, padding: 3, background: t.surface, "border-radius": 14 })}">${[
    1, 2, 3, 4, 5,
  ]
    .map(
      (v) =>
        `<button type="button" role="radio" aria-checked="${v === chosen}" aria-label="${v}" style="${s({ height: 46, "border-radius": 11, background: v === chosen ? t.ink : "transparent", color: v === chosen ? t.onInk : t.ink })}; ${num(20)}">${v}</button>`,
    )
    .join("")}</div></div>`;
}
export function checkInScreen(t, dv = K.D) {
  const sleep = `<div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 12, padding: "10px 0 12px", "border-bottom": `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column" })}"><span style="${txt(16, 700)}">Sleep</span><span style="${txt(13, 500, { color: t.ink2 })}">Hours last night</span></span><span style="${s({ display: "flex", "align-items": "center", gap: 10 })}">${K.roundBtn(t, "minus", "Half an hour less")}<output aria-label="5 hours" style="${num(26)}; min-width: 48px; text-align: center">5</output>${K.roundBtn(t, "plus", "Half an hour more")}</span></div>`;
  const inner = `${sessionHeader(t, { left: backTo(t, "Today"), rest: false, more: null })}
<h2 style="${title(dv.W < 360 ? 30 : 34)}; margin-top: 2px">How are you today?</h2>
<p style="${txt(15, 500, { color: t.ink2 })}; margin-top: 4px">Optional. Upper A · Anytime Fitness</p>
<div style="margin-top:10px">${sleep}${scale(t, "Sleep quality", ["poor", "great"], 3, "q")}${scale(t, "Fatigue", ["fresh", "wrecked"], 5, "f")}${scale(t, "Soreness", ["none", "severe"], 2, "so")}</div>`;
  const foot = `<div style="${s({ position: "absolute", left: K.gut(dv), right: K.gut(dv), bottom: dv.bottom + 8, display: "flex", "flex-direction": "column", gap: 4 })}"><button type="button" style="${K.BTN(t, "primary")}">Save and start</button><a href="#" style="${s({ display: "grid", "place-items": "center", height: 44 })}; ${txt(15, 700)}">Skip check-in</a></div>`;
  return K.root(t, `${sessionMain(t, inner, dv, { bottom: dv.bottom + 8 + 56 + 48 + 8 })}${foot}`, {
    label: "Check-in before Upper A",
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
export function finishScreen(t, dv = K.D) {
  const X = sept8;
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const under = `${sessionHeader(t, { left: minimise(t), finish: true, rest: false })}<h2 style="${title(34)}">${X.title}</h2>${K.printFrame(dayPrint({ w: cw, h: 112, paper: t.paper, align: "ends", parts: [{ kind: "strength", columns: sessionCols(X) }] }), { mt: 12 })}`;
  const inner = `<div style="${s({ display: "flex", "align-items": "center", gap: 10 })}"><h2 id="fin-title" style="${title(28)}; flex: 1 1 auto">Finish</h2><button type="button" aria-label="Close" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "margin-right": -10 })}">${icon("close", 20)}</button></div>
<p style="${s({ display: "flex", "justify-content": "space-between" })}; ${txt(13, 700, { color: t.ink2 })}; margin-top: 8px"><span>Recorded</span><span style="${tn}">9 sets</span></p>
<ul>${recordedRows(t, X)}</ul>
<div style="${s({ display: "flex", "flex-direction": "column", gap: 14, "margin-top": 14 })}">${K.field(t, "Notes", { rows: 2, placeholder: "How it went, anything the coach should know…", help: "Your coach reads these", optional: true })}<div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 12 })}"><span style="${s({ display: "flex", "flex-direction": "column" })}"><span style="${txt(16, 700)}">Body weight</span><span style="${txt(13, 500, { color: t.ink2 })}">Today’s reading · optional</span></span><span style="${s({ display: "flex", "align-items": "center", gap: 10 })}">${K.roundBtn(t, "minus", "Less, 0.1 kg")}<output aria-label="76.83 kilograms" style="${num(26)}; min-width: 76px; text-align: center">76.83</output>${K.roundBtn(t, "plus", "More, 0.1 kg")}</span></div></div>
<button type="button" style="${K.BTN(t, "primary")}; width: 100%; margin-top: 16px">Finish session</button>`;
  return K.root(
    t,
    `${sessionMain(t, under, dv)}${K.sheet(t, inner, { dv, id: "fin-title", top: 96 })}`,
    { label: "Finish the session", dv },
  );
}
// The record, the moment the session ends: the print in full ink, what it set, what it was.
export function summaryScreen(t, dv = K.D, { past = false } = {}) {
  const X = sept8;
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const rec = X.records
    .map(
      ([ex, metric, v, unit, was]) =>
        `<li style="${s({ display: "flex", "flex-direction": "column", gap: 2, padding: "10px 12px 11px", background: t.ultra, color: t.onUltra, "border-radius": 0, "min-width": 0 })}"><span class="wrap" style="${txt(12, 700, { color: t.onUltra2 })}">${ex}</span><span style="${txt(13, 700)}">${metric}</span><span class="nb" style="${s({ display: "flex", "align-items": "baseline", gap: 4 })}"><span style="${num(26)}">${v}</span><span style="${txt(13, 700)}">${unit}</span></span><span style="${txt(12, 600, { color: t.onUltra2 })}; ${tn}">was ${was}</span></li>`,
    )
    .join("");
  const stat = (n, u, l) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span class="nb" style="${s({ display: "flex", "align-items": "baseline", gap: 3 })}"><span style="${num(26)}">${n}</span><span style="${txt(13, 600, { color: t.ink2 })}">${u}</span></span><span style="${txt(13, 500, { color: t.ink2 })}">${l}</span></div>`;
  const head = past
    ? `${K.nestedHeader(t, "Calendar")}`
    : `<header style="${s({ display: "flex", "align-items": "center", height: 48 })}"><span style="flex:1 1 auto"></span><button type="button" aria-label="Close" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "margin-right": -10 })}">${icon("close", 22)}</button></header>`;
  const inner = `${head}
${K.printFrame(dayPrint({ w: cw, h: past ? 120 : 168, paper: t.paper, align: "center", parts: [{ kind: "strength", columns: sessionCols(X) }], ariaLabel: "The session in full ink: three exercises of three sets, the warm-ups in grey" }), { mt: 4 })}
<h2 style="${title(K.titleSize(X.title, cw, 34))}; margin-top: 12px">${X.title}</h2>
${K.metaLine(t, [`${icon("calendar", 16)}<span>${X.date}</span>`, `${icon("pin", 16)}<span>${X.gym}</span>`], { mt: 4 })}
<div style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: 10, "margin-top": 14 })}">${stat(X.minutes, "min", "Time")}${stat(9, "", "Sets")}${stat(X.volume, "kg", "Volume")}</div>
<h3 style="${txt(13, 700, { color: t.ink2 })}; margin: 18px 0 8px">${X.records.length} records</h3>
<ul style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: 6 })}">${rec}</ul>
${past ? `<h3 style="${txt(13, 700, { color: t.ink2 })}; margin: 18px 0 2px">Sets</h3><ul>${recordedRows(t, X)}</ul><p style="${s({ display: "flex", gap: 8, "align-items": "center", "margin-top": 12 })}; ${txt(14, 500, { color: t.ink2 })}">${icon("moon", 16)}Check-in: ${X.checkin}</p>` : ""}`;
  const foot = past
    ? ""
    : `<div style="${s({ position: "absolute", left: G, right: G, bottom: dv.bottom + 8, display: "flex", gap: 10 })}"><button type="button" style="${K.BTN(t, "tonal")}; flex: 1 1 0">${icon("repeat", 20)}Save as routine</button><button type="button" style="${K.BTN(t, "primary")}; flex: 1 1 0">Done</button></div>`;
  if (past)
    return K.root(
      t,
      `${K.screenMain(t, inner, { dv })}${K.navbar(t, "progress", { dv, nested: true })}`,
      { label: "Tue 8 Sept, a finished workout", dv },
    );
  return K.root(t, `${sessionMain(t, inner, dv, { bottom: dv.bottom + 8 + 56 + 8 })}${foot}`, {
    label: "The session, finished",
    dv,
  });
}

// ---------- logging a run ----------
export function runLogScreen(t, dv = K.D) {
  const G = K.gut(dv);
  const plan = `<aside aria-label="The plan asked for" style="${s({ display: "flex", gap: 12, "align-items": "center", padding: "12px 14px", "border-radius": 14, background: t.surface, "margin-top": 12 })}">${K.stateMark(t, "run", 22, { state: "todo" })}<span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${num(20)}">25<span style="font-family:${K.FONTS.text};font-weight:500">–</span>30 <span style="${txt(14, 600, { color: t.ink2 })}">min</span></span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}">Talk-test; slower than push pace</span></span></aside>`;
  const figRow = (label, value, unit, dec, inc, hint = "") =>
    `<div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 12, padding: "10px 0", "border-bottom": `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${txt(16, 700)}">${label}</span>${hint ? `<span style="${txt(13, 500, { color: t.ink2 })}; ${tn}">${hint}</span>` : ""}</span><span style="${s({ display: "flex", "align-items": "center", gap: 10 })}">${K.roundBtn(t, "minus", dec)}<output style="${s({ display: "flex", "align-items": "baseline", gap: 3, "min-width": 84, "justify-content": "center" })}"><span style="${num(26)}">${value}</span><span style="${txt(13, 600, { color: t.ink2 })}">${unit}</span></output>${K.roundBtn(t, "plus", inc)}</span></div>`;
  const effort = `<div role="radiogroup" aria-labelledby="eff" style="${s({ display: "flex", "flex-direction": "column", gap: 6, padding: "12px 0" })}"><p id="eff" style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline" })}"><span style="${txt(16, 700)}">Effort</span><span style="${txt(13, 500, { color: t.ink2 })}">1 very easy · 5 maximal</span></p><div style="${s({ display: "grid", "grid-template-columns": "repeat(5, minmax(0,1fr)) minmax(0,1.6fr)", gap: 2, padding: 3, background: t.surface, "border-radius": 14 })}">${[
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
<div style="margin-top:6px">${figRow("Distance", "4.0", "km", "Less, 0.1 km", "More, 0.1 km")}${figRow("Time", "26:30", "", "A minute less", "A minute more", "Pace 6:38 /km")}</div>
${effort}
<button type="button" style="${s({ display: "flex", "align-items": "center", gap: 8, height: 44, color: t.ink2 })}; ${txt(15, 700)}">${icon("plus", 18)}Notes, heart rate, more</button>`;
  const foot = `<div style="${s({ position: "absolute", left: G, right: G, bottom: dv.bottom + 8 })}"><button type="button" style="${K.BTN(t, "primary")}; width: 100%">Save run</button></div>`;
  return K.root(t, `${sessionMain(t, inner, dv, { bottom: dv.bottom + 8 + 56 + 8 })}${foot}`, {
    label: "Log a run, Fri 11 Sept",
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
${K.printFrame(dayPrint({ w: cw, h: 128, paper: t.paper, align: "center", parts: [{ kind: "run", minutes: 17, done: true }], ariaLabel: "The run, in full ink" }), { mt: 4 })}
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
