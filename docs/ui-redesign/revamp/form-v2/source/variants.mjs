// Two ways the logging screen has to bend: typing a load on the decimal pad, and text at 200%.
//
// Typing: tapping a figure types it. The pad comes up and only the figure being typed and its
// neighbours stay above it, with the keyboard's own Previous, Next and Done; a stepper is for one
// step, typing is for a jump (62.5 to 100 kg is one entry, not fifteen taps).
// 200%: text doubles, figures grow by half, controls grow to fit; the steppers stack, one to a row,
// and the entry comes first under the title, with what is already saved after it. Save stays
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
  const field = `<label style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 6, "min-width": 0 })}"><span class="sr">Load in kilograms</span>${box(`<span style="${num(42, { lh: 1.1 })}"><span style="${s({ background: t.ink, color: t.onInk, "border-radius": 2 })}">${S.next.load}</span></span>`, true)}<span style="${txt(13, 600, { color: t.ink2 })}">kg</span></label>`;
  const fig = (v, u, dim = false) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 6, "min-width": 0 })}">${box(`<span style="${num(42, { lh: 1.1 })}; color: ${dim ? t.control : t.ink2}; ${dim ? "" : "text-decoration: underline dotted 2px; text-underline-offset: 6px"}">${v}</span>`, false)}<span style="${txt(13, 600, { color: t.ink2 })}">${u}</span></div>`;
  const op = (c) =>
    `<span aria-hidden="true" style="${s({ "padding-top": 14, color: t.ink2, "text-align": "center" })}; ${txt(21, 500)}">${c}</span>`;
  const tag = `<a href="Why.dc.html" aria-haspopup="dialog" aria-label="${S.suggestion.kind}: why ${S.next.load} ${S.unit} × ${S.next.reps}" style="${s({ display: "inline-flex", "align-items": "center", height: 44 })}"><span style="${s({ display: "inline-flex", "align-items": "center", gap: 5, height: 30, padding: "0 9px 0 10px", "border-radius": 8, border: `1.5px solid ${t.ink}` })}; ${txt(14, 700)}">${S.suggestion.kind}${icon("info", 16)}</span></a>`;
  const entry = `<section aria-label="Set 3, typing the load" style="${s({ position: "absolute", left: G, right: G, bottom: padH + 10, display: "flex", "flex-direction": "column", gap: 8, background: t.ground })}"><div style="${s({ display: "flex", "align-items": "center", gap: 10, height: 44 })}"><h3 style="${txt(17, 700)}">Set 3</h3>${tag}</div><div style="${s({ display: "grid", "grid-template-columns": "minmax(0,1fr) 18px minmax(0,1fr) 18px minmax(0,1fr)", "align-items": "start" })}">${field}${op("×")}${fig(S.next.reps, "reps")}${op("@")}${fig("–", "RIR", true)}</div>${SE.saveWaiting(t)}</section>`;
  const record = `${SE.sessionHeader(t, { left: SE.backTo(t, S.back), more: "Complete, skip, superset, substitute" })}
<h2 style="${title(32, { lh: 1.05 })}; margin-top: 2px">${S.exercise}</h2>
${K.metaLine(t, [`${K.equip(t, "dumbbell", "Free weights")}<span>${S.rx}</span>`, `${icon("rest", 16)}<span>${S.rest}</span>`], { mt: 4 })}
<div style="margin-top:6px">${K.tabs(t, ["Log", "Technique", "History"], 0, { dv, id: "Exercise detail" })}</div>
${SE.panel(0, SE.ledger(t, S))}`;
  const body = `${K.screenMain(t, record, { dv, bottom: padH + 10 + 186 })}${entry}${decimalPad(t, dv)}`;
  return K.root(t, body, { label: S.exercise, dv });
}

// ---------- logging at 200% text ----------
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
    `<button type="button" aria-label="${aria}" style="${s({ height: 64, "border-radius": 16, background: t.surface, display: "grid", "place-items": "center", color: t.ink })}">${icon(ic, 30)}</button>`;
  // a stepper at 200%: its figure and unit, then two 64-pt buttons; load takes a row, reps and RIR
  // share the next, so RIR is on the first screen with what it needs
  const stepper = (unit, value, dec, inc, { state = "suggested", hint = "", wide = false } = {}) =>
    `<div role="group" aria-label="${esc(unit)}" style="${s({ display: "flex", "flex-direction": wide ? "row" : "column", "justify-content": "space-between", "align-items": wide ? "center" : "flex-start", gap: "8px 12px", padding: "12px 0", "min-width": 0 })}"><output aria-label="${esc(state === "empty" ? `${unit} not set, target ${hint.replace(/^target\s/, "")}` : `${value} ${unit}, suggested, not yet confirmed`)}" style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${fig(63)}; color: ${state === "empty" ? t.control : t.ink2}; ${state === "suggested" ? "text-decoration: underline dotted 3px; text-underline-offset: 10px" : ""}">${value}</span><span style="${tx(28, 600, t.ink2)}">${unit}${hint ? ` · ${hint}` : ""}</span></output><span style="${s({ display: "grid", "grid-template-columns": "64px 64px", gap: 10 })}">${round("minus", dec)}${round("plus", inc)}</span></div>`;
  const row = (x, kind) =>
    `<li><button type="button" aria-label="${esc(kind === "todo" ? `Set ${x.n}, to do` : kind === "now" ? `Set ${x.n}, being entered above` : kind === "warm" ? `Warm-up: ${x.v} kilograms, ${x.reps} reps. Saved. Edit` : `Set ${x.n}: ${x.v} kilograms, ${x.reps} reps, ${x.rir} in reserve. Saved. Edit`)}" style="${s({ display: "flex", "align-items": "center", gap: 14, width: "100%", "min-height": 64, padding: kind === "now" ? "8px 10px" : "8px 0", margin: kind === "now" ? "0 -10px" : 0, "box-sizing": "content-box", background: kind === "now" ? t.surface : "transparent", "border-radius": kind === "now" ? 12 : 0, "border-bottom": `1px solid ${t.hair}`, "text-align": "left" })}"${kind === "now" ? ' aria-current="step"' : ""}><span style="${tx(28, 700, kind === "warm" ? t.ink2 : t.ink)}; width: 40px">${kind === "warm" ? "W" : x.n}</span><span style="${s({ width: 16, height: 16, "flex-shrink": 0, ...(kind === "now" ? { border: `2.5px solid ${t.ink}`, "box-sizing": "border-box" } : kind === "todo" ? { border: `2px solid ${t.marks.strength}`, background: "#9aaaf0" } : { background: kind === "warm" ? "#c9c4b8" : t.marks.strength }) })}"></span>${kind === "todo" || kind === "now" ? "" : `<span style="${fig(kind === "warm" ? 34 : 38)}; color: ${kind === "warm" ? t.ink2 : t.ink}">${x.v} <span style="${tx(26, 600, t.ink2)}">×</span> ${x.reps}${kind === "warm" ? "" : ` <span style="${tx(26, 600, t.ink2)}">@</span> ${x.rir}`}</span>`}</button></li>`;
  const head = `<header style="${s({ display: "flex", "align-items": "center", gap: 8, "min-height": 64 })}"><a href="Workout.dc.html" style="${s({ display: "flex", "align-items": "center", gap: 2, "min-height": 56, "margin-left": -10, "min-width": 0 })}; ${tx(34, 700)}">${icon("chevronLeft", 32)}Upper A</a><span style="flex:1 1 auto"></span><button type="button" aria-label="Rest, 2 minutes 14 seconds left. Add 30 seconds or stop" style="${s({ display: "flex", "align-items": "center", gap: 10, "min-height": 56, padding: "0 16px 0 12px", "border-radius": 9999, background: t.surface })}">${K.restRing(t, 0.74, 28)}<span role="timer" style="${fig(34)}">2:14</span></button><button type="button" aria-label="Complete, skip, superset, substitute" aria-haspopup="dialog" style="${s({ width: 56, height: 56, display: "grid", "place-items": "center", "margin-right": -10 })}">${icon("more", 34)}</button></header>
<h2 style="${K.title(56, { lh: 1.05 })}; margin-top: 10px">${S.exercise}</h2>
<p style="${s({ display: "flex", "flex-wrap": "wrap", "align-items": "center", gap: "4px 18px", "margin-top": 10 })}; ${tx(30, 500, t.ink2)}; ${tn}"><span style="display:inline-flex;align-items:center;gap:8px">${K.equip(t, "dumbbell", "Free weights", 30)}${S.rx}</span><span style="display:inline-flex;align-items:center;gap:8px">${icon("rest", 30)}${S.rest}</span></p>
<div role="tablist" aria-label="Exercise detail" style="${s({ display: "flex", gap: 22, "margin-top": 12, "border-bottom": `1px solid ${t.hair}` })}">${["Log", "Technique", "History"].map((l, i) => `<button type="button" role="tab" id="panel-tab-${i}" aria-selected="${!i}" aria-controls="panel" style="${s({ position: "relative", "min-height": 56, display: "flex", "align-items": "center", "white-space": "nowrap" })}; ${tx(30, i ? 600 : 700, i ? t.ink2 : t.ink)}">${l}${i ? "" : `<span aria-hidden="true" style="position:absolute;left:0;right:0;bottom:-1px;height:4px;background:${t.ink};border-radius:2px"></span>`}</button>`).join("")}</div>`;
  const set3 = `<div style="${s({ display: "flex", "flex-wrap": "wrap", "align-items": "center", gap: "8px 14px", "margin-top": 14 })}"><h3 style="${tx(36, 700)}">Set 3</h3><a href="Why.dc.html" aria-haspopup="dialog" style="${s({ display: "inline-flex", "align-items": "center", gap: 8, "min-height": 56, padding: "0 14px", "border-radius": 12, border: `2.5px solid ${t.ink}` })}; ${tx(28, 700)}">Hold${icon("info", 26)}</a><span style="flex:1 1 auto"></span><button type="button" aria-haspopup="dialog" aria-label="Set options: type, notes, remove" style="${s({ width: 56, height: 56, display: "grid", "place-items": "center", color: t.ink2, "margin-right": -10 })}">${icon("sliders", 30)}</button></div>`;
  const entry = `<section aria-label="Set 3">${set3}
${stepper("kg", S.next.load, "Less load, 2.5 kg", "More load, 2.5 kg", { wide: true })}
<div style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: 16, "border-top": `1px solid ${t.hair}`, "border-bottom": `1px solid ${t.hair}` })}">${stepper("reps", S.next.reps, "One rep fewer", "One rep more")}${stepper("RIR", "–", "One rep less in reserve", "One rep more in reserve", { state: "empty", hint: `target\u00a0${S.next.target}` })}</div></section>`;
  const saved = `<div role="tabpanel" id="panel" aria-labelledby="panel-tab-0" style="margin-top:24px"><ol aria-label="Sets">${S.warmups.map((w) => row(w, "warm")).join("")}${S.sets.map((x) => row(x, "done")).join("")}${row({ n: S.next.n }, "now")}${S.todo.map((x) => row(x, "todo")).join("")}<li><button type="button" style="${s({ display: "flex", "align-items": "center", gap: 10, "min-height": 64, color: t.ink2, "padding-left": 54 })}; ${tx(28, 700, t.ink2)}">${icon("plus", 28)}Add set</button></li></ol></div>`;
  const barH = 12 + 76 + dv.bottom;
  const content = `${head}${entry}${saved}`;
  // Save stays pinned; until RIR is chosen it says so, and a tap takes the focus to RIR
  const pinned = `<div style="${s({ position: "absolute", left: 0, right: 0, bottom: 0, padding: `12px ${G}px ${dv.bottom}px`, background: t.ground, "border-top": `1px solid ${t.hair}` })}"><button type="button" aria-disabled="true" aria-describedby="rir-hint" style="${s({ width: "100%", "min-height": 76, padding: "10px 16px", "border-radius": 16, background: t.surface, color: t.ink2, "white-space": "normal" })}; ${tx(32, 700, t.ink2)}">${SE.SAVE}</button><span id="rir-hint" class="sr">${SE.RIR_NEEDED}</span></div>`;
  // where the first screen ends: ticks in the margins, clear of the content
  const tick = (side) =>
    `<span style="${s({ position: "absolute", [side]: 0, top: -1, width: G - 6, "border-top": `2px dashed ${t.ink2}` })}"></span>`;
  const fold = `<div aria-hidden="true" style="${s({ position: "absolute", left: 0, right: 0, top: dv.H - barH, "z-index": 2 })}">${tick("left")}${tick("right")}</div>`;
  return `<div style="${s({ position: "relative", width: LW, background: t.ground, color: t.ink, "font-family": K.FONTS.text, "color-scheme": t.scheme, "-webkit-font-smoothing": "antialiased" })}"><h1 class="sr">${esc(S.exercise)}</h1><main style="${s({ padding: `${dv.top}px ${G}px ${barH + 24}px` })}">${content}</main>${pinned}${fold}</div>`;
}
