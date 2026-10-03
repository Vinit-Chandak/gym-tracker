// Two ways the logging screen has to bend: typing a load on the decimal pad, and text at 200%.
//
// Typing: tapping a figure types it. The pad comes up and only the figure being typed and its
// neighbours stay above it, with the keyboard's own Previous, Next and Done; a stepper is for one
// step, typing is for a jump (62.5 to 100 kg is one entry, not fifteen taps).
// 200%: text doubles, figures grow by half, controls grow to fit; load takes a row, reps and RIR
// share the next, and the entry comes first under the title, with the log after it. Save stays
// pinned. Nothing is dropped: the equipment line, the target and the suggestion are all there.
import { s, esc } from "./lib.mjs";
import * as K from "./kit.mjs";
import * as SE from "./session.mjs";
import { bench as S } from "./data.mjs";

const { txt, num, title, icon, tn } = K;

// ---------- typing a load ----------
// The iOS decimal pad as the system draws it in light and dark, under a keyboard toolbar.
function decimalPad(t, dv) {
  const dark = t.scheme === "dark";
  const bg = dark ? "#2b2b2d" : "#d2d5db",
    key = dark ? "#68686b" : "#ffffff",
    keyInk = dark ? "#ffffff" : "#000000";
  const letters = ["", "ABC", "DEF", "GHI", "JKL", "MNO", "PQRS", "TUV", "WXYZ"];
  const k = (main, sub = "", { blank = false } = {}) =>
    `<span style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", "justify-content": "center", height: 46, "border-radius": 8, background: blank ? "transparent" : key, color: keyInk, "box-shadow": blank ? "none" : `0 1px 0 ${dark ? "#1b1b1c" : "#898a8d"}` })}"><span style="${s({ "font-family": "system-ui, sans-serif", "font-size": 26, "font-weight": 400, "line-height": 1 })}">${main}</span>${sub ? `<span style="${s({ "font-family": "system-ui, sans-serif", "font-size": 12, "font-weight": 600, "letter-spacing": "0.1em", "margin-top": 1 })}">${sub}</span>` : ""}</span>`;
  const keys =
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => k(String(n), letters[n - 1])).join("") +
    k(".", "", { blank: false }) +
    k("0") +
    k(
      `<svg width="26" height="20" viewBox="0 0 26 20" aria-hidden="true" style="display:block"><path d="M8 2h15a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 23 18H8l-6.5-8z" fill="none" stroke="${keyInk}" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 7l6 6M18 7l-6 6" stroke="${keyInk}" stroke-width="1.6" stroke-linecap="round"/></svg>`,
      "",
      { blank: true },
    );
  const bar = `<div style="${s({ display: "flex", "align-items": "center", gap: 4, height: 44, padding: "0 8px", background: bg, "border-top": `1px solid ${dark ? "#3a3a3c" : "#c3c6cc"}` })}"><button type="button" aria-label="Previous field" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", color: keyInk, opacity: 0.35 })}">${icon("chevronUp", 22)}</button><button type="button" aria-label="Next field: reps" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", color: keyInk })}">${icon("chevronDown", 22)}</button><span style="flex:1 1 auto"></span><button type="button" style="${s({ height: 44, padding: "0 12px", color: keyInk })}; ${txt(17, 700)}">Done</button></div>`;
  return `<section aria-label="Keyboard" style="${s({ position: "absolute", left: 0, right: 0, bottom: 0, background: bg, "padding-bottom": dv.bottom })}">${bar}<div aria-hidden="true" style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: "7px 6px", padding: "8px 6px 8px" })}">${keys}</div></section>`;
}
export function logTypingScreen(t, dv = K.D) {
  const G = K.gut(dv);
  const padH = 44 + 4 * 46 + 3 * 7 + 16 + dv.bottom;
  // The figure being typed is a field: its value selected in ink over a solid rule. The others stay
  // figures on the same box, so every unit lines up; the steppers' buttons step aside for the pad,
  // and Save stays above it.
  const box = (inner, on) =>
    `<span style="${s({ display: "inline-block", "padding-bottom": 3, "border-bottom": `2.5px solid ${on ? t.ink : "transparent"}` })}">${inner}</span>`;
  // the unit, and the hint under it, as in the entry
  const units = (u, hint = "") =>
    `<span style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", "min-height": 34 })}; ${txt(13, 600, { color: t.ink2, "line-height": 1.3 })}"><span class="nb">${u}</span>${hint ? `<span class="nb" style="font-weight:500">${hint}</span>` : ""}</span>`;
  const field = `<label style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 6, "min-width": 0 })}"><span class="sr">Load in kilograms</span>${box(`<span style="${num(42, { lh: 1.1 })}"><span style="${s({ background: t.ink, color: t.onInk, "border-radius": 2 })}">${S.next.load}</span></span>`, true)}${units("kg")}</label>`;
  const fig = (v, u, { dim = false, hint = "", name }) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 6, "min-width": 0 })}"><button type="button" aria-label="${esc(name)}" style="${s({ display: "flex", "justify-content": "center", width: "100%", "min-height": 44 })}">${box(`<span style="${num(42, { lh: 1.1 })}; color: ${dim ? t.control : t.ink2}; ${dim ? "" : "text-decoration: underline dotted 2px; text-underline-offset: 6px"}">${v}</span>`, false)}</button>${units(u, hint)}</div>`;
  const op = (c) =>
    `<span aria-hidden="true" style="${s({ "padding-top": 14, color: t.ink2, "text-align": "center" })}; ${txt(20, 500)}">${c}</span>`;
  const tag = `<a href="Why.dc.html" aria-haspopup="dialog" aria-label="${S.suggestion.kind}: why ${S.next.load} ${S.unit} × ${S.next.reps}" style="${s({ display: "inline-flex", "align-items": "center", height: 44 })}"><span style="${s({ display: "inline-flex", "align-items": "center", gap: 5, height: 30, padding: "0 9px 0 10px", "border-radius": 8, border: `1.5px solid ${t.ink}` })}; ${txt(14, 700)}">${S.suggestion.kind}${icon("info", 16)}</span></a>`;
  const entry = `<section aria-label="Set 3, typing the load" style="${s({ position: "absolute", left: G, right: G, bottom: padH + 10, display: "flex", "flex-direction": "column", gap: 8, "padding-top": 8, "border-top": `1px solid ${t.hair}`, background: t.ground })}"><div style="${s({ display: "flex", "align-items": "center", gap: 10, height: 44 })}"><h3 style="${txt(17, 700)}; ${tn}">Set 3 <span style="color:${t.ink2}">of 4</span></h3>${tag}</div><div style="${s({ display: "grid", "grid-template-columns": SE.gridCols(18), "align-items": "start" })}"><span></span>${field}${op("×")}${fig(S.next.reps, "reps", { name: `${S.next.reps} reps, suggested. Type reps` })}${op("@")}${fig("–", "RIR", { dim: true, hint: `target ${S.next.target}`, name: `RIR not set, target ${S.next.target}. Use the target` })}</div>${SE.saveWaiting(t)}</section>`;
  const record = `${SE.sessionHeader(t, { left: SE.backTo(t, S.back), more: "Complete, skip, superset, substitute" })}
<h2 style="${title(32, { lh: 1.05 })}; margin-top: 2px">${S.exercise}</h2>
${K.metaLine(t, [`${K.equip(t, "dumbbell", "Free weights")}<span>${SE.perSet(S.rx)}</span>`, `${icon("rest", 16)}<span>${S.rest}</span>`], { mt: 4 })}
<div style="margin-top:6px">${K.tabs(t, ["Log", "Technique", "History"], 0, { dv, id: "Exercise detail" })}</div>
${SE.panel(0, `${K.fadeFrom(t)}${SE.ledger(t, S, { dv })}`, s({ position: "relative", flex: "1 1 auto", "min-height": 0, display: "flex", "flex-direction": "column-reverse", overflow: "hidden" }))}`;
  // the log keeps its latest sets in view above the entry, as the logging screen does
  // the record stops at the entry's rule (the entry, measured: its rule, the set, the figures and
  // Save, 216 pt), so the latest set sits 8 pt over it
  const entryH = 216;
  const body = `${K.screenMain(t, record, { dv, bottom: padH + 10 + entryH, flex: true, fade: false })}${entry}${decimalPad(t, dv)}`;
  return K.root(t, body, { label: S.exercise, dv });
}

// ---------- logging at 200% text ----------
// Text doubles, figures grow by half, controls grow to fit. The entry stays docked, whole, above
// the home indicator, as at 100%: the set and its tag, load on a row of its own, reps and RIR side
// by side, Save. The header stays at the top; the title, tabs and log scroll between, kept at their
// end, so the latest set stands over the entry. Nothing is dropped.
export const LW = 402;
export function largeLogScreen(t) {
  const dv = K.D;
  const G = K.gut(dv);
  const tx = (size, wt = 500, col = t.ink) =>
    s({
      "font-family": K.FONTS.text,
      "font-size": size,
      "font-weight": wt,
      color: col,
      "line-height": 1.35,
    });
  const fig = (size) => K.num(size, { lh: 1.05 });
  const round = (ic, aria) =>
    `<button type="button" aria-label="${aria}" style="${s({ width: 64, height: 64, "border-radius": 9999, background: t.surface, display: "grid", "place-items": "center", color: t.ink, "flex-shrink": 0 })}">${icon(ic, 30)}</button>`;
  // a stepper at 200%: the figure (a button: a tap types it, and the empty RIR's dash takes the
  // target), its unit, its hint on a line of its own, then − and +
  const stepper = (
    unit,
    value,
    dec,
    inc,
    { state = "suggested", hint = "", wide = false, name, tag = "" } = {},
  ) =>
    `<div role="group" aria-label="${esc(unit)}" style="${s({ display: "flex", "flex-direction": wide ? "row" : "column", "justify-content": "space-between", "align-items": wide ? "center" : "flex-start", gap: "6px 12px", padding: "2px 0", "min-width": 0 })}"><div style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><button type="button" aria-label="${esc(name)}" style="${s({ display: "flex", "align-items": "center", "min-height": 64, "text-align": "left" })}"><span style="${fig(63)}; color: ${state === "empty" ? t.control : t.ink2}; ${state === "suggested" ? "text-decoration: underline dotted 3px; text-underline-offset: 10px" : ""}">${value}</span></button><span style="${s({ display: "flex", "align-items": "center", gap: 6 })}; ${tx(28, 600, t.ink2)}; line-height: 1.2">${unit}${tag}</span>${hint ? `<span style="${tx(28, 500, t.ink2)}; line-height: 1.2" class="nb">${hint}</span>` : ""}</div><span style="${s({ display: "flex", gap: 10 })}">${round("minus", dec)}${round("plus", inc)}</span></div>`;
  // the log at 200%: the warm-ups done on one line in ink 2, then a line for each set done, in
  // the app's notation; nothing for the set being entered (it is the entry) or those to come
  const notation = (x, sz, col) =>
    `<span style="${K.num(sz, { lh: 1.05 })}; color: ${col}">${x.v} <span style="${tx(Math.round(sz * 0.6), 600, t.ink2)}">×</span> ${x.reps}${x.rir !== undefined ? ` <span style="${tx(Math.round(sz * 0.6), 600, t.ink2)}">@</span> ${x.rir}` : ""}</span>`;
  const warmRowL = `<li style="${s({ display: "flex", "align-items": "baseline", gap: 12, "flex-wrap": "wrap", padding: "4px 0" })}"><span aria-hidden="true" style="${tx(28, 700, t.ink2)}; width: 36px">W</span>${S.warmups.map((w) => `<button type="button" aria-label="${esc(`Warm-up: ${w.v} kilograms, ${w.reps} reps. Edit`)}" style="${s({ "min-height": 56 })}">${notation(w, 28, t.ink2)}</button>`).join("")}</li>`;
  const row = (x) =>
    `<li><button type="button" aria-label="${esc(`Set ${x.n}: ${x.v} kilograms, ${x.reps} reps, ${x.rir} in reserve. Edit`)}" style="${s({ display: "flex", "align-items": "baseline", gap: 12, width: "100%", "min-height": 60, padding: "4px 0", "text-align": "left" })}"><span style="${tx(28, 700, t.ink2)}; width: 40px">${x.n}</span>${notation(x, 40, t.ink)}</button></li>`;
  const header = `<header style="${s({ flex: "0 0 auto", height: 64, padding: `0 ${G}px`, display: "flex", "align-items": "center", gap: 8, background: t.ground, "border-bottom": `1px solid ${t.hair}` })}"><a href="Workout.dc.html" style="${s({ display: "flex", "align-items": "center", gap: 2, "min-height": 56, "margin-left": -10, "min-width": 0 })}; ${tx(34, 700)}">${icon("chevronLeft", 32)}Upper A</a><span style="flex:1 1 auto"></span><button type="button" aria-label="Rest, 2 minutes 14 seconds left. Add 30 seconds or stop" style="${s({ display: "flex", "align-items": "center", gap: 10, "min-height": 56, padding: "0 16px 0 12px", "border-radius": 9999, background: t.surface })}">${K.restRing(t, 0.74, 28)}<span role="timer" style="${fig(34)}">2:14</span></button><button type="button" aria-label="Complete, skip, superset, substitute" aria-haspopup="dialog" style="${s({ width: 56, height: 56, display: "grid", "place-items": "center", "margin-right": -10 })}">${icon("more", 34)}</button></header>`;
  const record = `<h2 style="${K.title(56, { lh: 1.05 })}; margin-top: 10px">${S.exercise}</h2>
<p style="${s({ display: "flex", "flex-wrap": "wrap", "align-items": "center", gap: "4px 18px", "margin-top": 10 })}; ${tx(30, 500, t.ink2)}; ${tn}"><span style="display:inline-flex;align-items:center;gap:8px">${K.equip(t, "dumbbell", "Free weights", 30)}${SE.perSet(S.rx)}</span><span style="display:inline-flex;align-items:center;gap:8px">${icon("rest", 30)}${S.rest}</span></p>
<div role="tablist" aria-label="Exercise detail" style="${s({ display: "flex", gap: 22, "margin-top": 12, "border-bottom": `1px solid ${t.hair}` })}">${["Log", "Technique", "History"].map((l, i) => `<button type="button" role="tab" id="panel-tab-${i}" aria-selected="${!i}" aria-controls="panel" style="${s({ position: "relative", "min-height": 56, display: "flex", "align-items": "center", "white-space": "nowrap" })}; ${tx(30, i ? 600 : 700, i ? t.ink2 : t.ink)}">${l}${i ? "" : `<span aria-hidden="true" style="position:absolute;left:0;right:0;bottom:-1px;height:4px;background:${t.ink};border-radius:2px;"></span>`}</button>`).join("")}</div>
<div role="tabpanel" id="panel" aria-labelledby="panel-tab-0"><ol aria-label="Sets" style="padding: 8px 0">${warmRowL}${S.sets.map((x) => row(x)).join("")}</ol></div>`;
  // the entry, docked: the set and its tag (the tag wraps under the set if the line is full), load,
  // reps and RIR, and Save, which waits for RIR as at 100%
  const set3 = `<div style="${s({ display: "flex", "align-items": "center", gap: 10, "min-height": 56 })}"><div style="${s({ display: "flex", "flex-wrap": "wrap", "align-items": "center", gap: "0 12px", flex: "1 1 auto", "min-width": 0 })}"><h3 style="${tx(34, 700)}; ${tn}">Set 3 <span style="color:${t.ink2}">of 4</span></h3><a href="Why.dc.html" aria-haspopup="dialog" aria-label="Hold: why ${S.next.load} kilograms × ${S.next.reps}" style="${s({ display: "inline-flex", "align-items": "center", "min-height": 56 })}"><span style="${s({ display: "inline-flex", "align-items": "center", gap: 6, height: 48, padding: "0 10px 0 12px", "border-radius": 12, border: `2.5px solid ${t.ink}` })}; ${tx(26, 700)}">Hold${icon("info", 24)}</span></a></div><button type="button" aria-haspopup="dialog" aria-label="Set options: add a set, type, notes, remove" style="${s({ width: 56, height: 56, display: "grid", "place-items": "center", color: t.ink2, "margin-right": -10, "flex-shrink": 0 })}">${icon("sliders", 30)}</button></div>`;
  const entry = `<section aria-label="Set 3 of 4" style="${s({ flex: "0 0 auto", padding: `6px ${G}px ${dv.bottom}px`, background: t.ground, "border-top": `1px solid ${t.hair}` })}">${set3}
${stepper("kg", S.next.load, "Less load, 2.5 kg", "More load, 2.5 kg", { wide: true, name: `${S.next.load} kilograms, suggested. Type a load` })}
<div style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: 16, "padding-top": 6, "border-top": `1px solid ${t.hair}` })}">${stepper("reps", S.next.reps, "One rep fewer", "One rep more", { name: `${S.next.reps} reps, suggested, target ${SE.perSet(S.rx).replace(" reps", "")}. Type reps`, hint: `target\u00a0${SE.perSet(S.rx).replace(" reps", "")}` })}${stepper("RIR", "–", "One rep less in reserve", "One rep more in reserve", { state: "empty", hint: `target\u00a0${S.next.target}`, name: `RIR not set, target ${S.next.target}. Use the target`, tag: K.infoTip(t, "What RIR means", { glyph: 26 }) })}</div>
<div style="padding:6px 0 0"><button type="button" aria-disabled="true" aria-describedby="rir-hint" style="${s({ width: "100%", "min-height": 76, padding: "10px 16px", "border-radius": 16, background: t.surface, color: t.ink2, "white-space": "normal" })}; ${tx(32, 700, t.ink2)}">${SE.SAVE}</button><span id="rir-hint" class="sr">${SE.RIR_NEEDED}</span></div></section>`;
  const body = `<div style="${s({ position: "relative", flex: "1 1 auto", "min-height": 0, overflow: "hidden", display: "flex", "flex-direction": "column-reverse", padding: `0 ${G}px` })}">${K.fadeFrom(t)}<div>${record}</div></div>`;
  return `<div style="${s({ position: "relative", width: LW, height: dv.H, overflow: "hidden", display: "flex", "flex-direction": "column", "padding-top": dv.top, background: t.ground, color: t.ink, "font-family": K.FONTS.text, "color-scheme": t.scheme, "-webkit-font-smoothing": "antialiased" })}"><h1 class="sr">${esc(S.exercise)}</h1>${header}${body}${entry}</div>`;
}
