// The system sheet: everything the screens are built from, drawn by the same code that draws them.
import { s, esc, ratio } from "./lib.mjs";
import * as K from "./kit.mjs";
import { ICON_ORDER, LABELS } from "./icons.mjs";
import { PIG, PAL, FAMILY, markSvg, form, dayPrint } from "./art.mjs";
import * as SE from "./session.mjs";
import { dayBowl } from "./food.mjs";
import { planRow } from "./today.mjs";
import { seg } from "./more.mjs";
import { weights, copy as C } from "./data.mjs";

export const SW = 1600;
const { txt, num, title, icon, tn } = K;
const L = K.TOKENS.light,
  Dk = K.TOKENS.dark;
const PAD = 64,
  GAP = 24;
const H2 = (text, note = "") =>
  `<div style="${s({ display: "flex", "align-items": "baseline", gap: 18, "flex-wrap": "wrap" })}"><h2 style="${title(32, { lh: 1 })}; color: ${L.ink}">${text}</h2>${note ? `<p style="${txt(15, 500, { color: L.ink2, "max-width": 1000 })}">${note}</p>` : ""}</div>`;
const small = (text, col = L.ink2) => `<p style="${txt(14, 600, { color: col })}">${text}</p>`;
const tile = (label, inner, { span = 1, bg = L.ground, pad = 20, dark = false } = {}) =>
  `<div style="${s({ "grid-column": `span ${span}`, display: "flex", "flex-direction": "column", gap: 14, padding: pad, background: dark ? Dk.ground : bg, color: dark ? Dk.ink : L.ink, border: `1px solid ${dark ? Dk.hair : L.hair}`, "border-radius": 16, "min-width": 0, overflow: "hidden", position: "relative" })}">${label ? `<p style="${txt(14, 600, { color: dark ? Dk.ink2 : L.ink2 })}">${label}</p>` : ""}${inner}</div>`;
const grid = (cols, inner) =>
  `<div style="${s({ display: "grid", "grid-template-columns": `repeat(${cols}, minmax(0, 1fr))`, gap: GAP })}">${inner}</div>`;
const section = (inner) =>
  `<section style="${s({ display: "flex", "flex-direction": "column", gap: 20 })}">${inner}</section>`;

// ---------- identity ----------
function identity() {
  const box = (t, inner, h = 260) =>
    `<div style="${s({ flex: "1 1 0", height: h, background: t.ground, border: `1px solid ${t.hair}`, "border-radius": 16, display: "grid", "place-items": "center" })}">${inner}</div>`;
  return section(`${H2("Mark and name", "The mark keeps the first alphabet’s slab and disc. It is the name’s, not a print.")}
<div style="${s({ display: "flex", gap: GAP })}">${box(L, markSvg(150, { ink: L.ink }))}${box(Dk, markSvg(150, { ink: Dk.ink }))}</div>
<div style="${s({ display: "flex", gap: GAP, "align-items": "center" })}"><div style="${s({ flex: "1 1 auto", padding: "26px 24px", background: L.ground, border: `1px solid ${L.hair}`, "border-radius": 16 })}">${K.wordmark(L, 42)}</div>${K.appIcon(L, 96)}${K.appIcon(Dk, 96)}</div>`);
}

// ---------- icons ----------
function icons() {
  const cell = (name) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 6, padding: "10px 2px", "min-width": 0 })}"><span style="${s({ position: "relative", width: 48, height: 48, display: "grid", "place-items": "center", color: L.ink })}"><svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" style="position:absolute;inset:0"><path d="${Array.from({ length: 13 }, (_, i) => `M${i * 4} 0V48M0 ${i * 4}H48`).join("")}" stroke="${L.hair}" stroke-width="0.6" fill="none"/></svg><span style="position:relative;display:grid">${K.icon(name, 36)}</span></span><span style="${txt(12, 600, { color: L.ink2, "text-align": "center", "line-height": 1.2 })}">${esc(LABELS[name] || name)}</span></div>`;
  const dest = (name) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 6, padding: "10px 2px" })}"><span style="${s({ display: "flex", gap: 10, color: L.ink })}">${K.icon(name, 30)}${K.icon(name, 30, { filled: true })}</span><span style="${txt(12, 600, { color: L.ink2 })}">${LABELS[name]}</span></div>`;
  const group = (label, names, cols = 10, fn = cell) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", gap: 2 })}">${small(label)}<div style="${s({ display: "grid", "grid-template-columns": `repeat(${cols}, minmax(0, 1fr))`, "column-gap": 4 })}">${names.map(fn).join("")}</div></div>`;
  return section(`${H2("Icons", "A 24-unit grid, a 2.0 stroke, round caps and joins, ink only. The destinations are drawn from the first forms and fill where you are. Equipment and where a run, ride or swim happened are glyphs too, so a meta line can say free weights, treadmill or open water without a word; each keeps its name for screen readers.")}
${group("Destinations, outline and where you are", ICON_ORDER.destinations, 5, dest)}
${group("Equipment", ICON_ORDER.equipment, 10)}
${group("Where", ICON_ORDER.context, 10)}
${group("Actions", ICON_ORDER.actions.slice(0, 20), 10)}
${group("", ICON_ORDER.actions.slice(20), 10)}
${group("Settings and people", ICON_ORDER.settings, 10)}`);
}

// ---------- colour ----------
function colour() {
  const row = (t, [key, name, job, fg, bg]) => {
    const r = fg ? ratio(t[fg], t[bg]) : null;
    return `<li style="${s({ display: "grid", "grid-template-columns": "60px minmax(0,1fr) auto", gap: 14, "align-items": "center", padding: "9px 0", "border-bottom": `1px solid ${t.hair}` })}"><span style="${s({ width: 60, height: 40, "border-radius": 10, background: t[key], border: `1px solid ${t.hair}`, display: "grid", "place-items": "center", color: fg ? t[fg] : t.ink })}; ${txt(14, 700)}">${fg && fg !== key ? "Aa" : ""}</span><span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${txt(15, 700, { color: t.ink })}">${name}</span><span style="${txt(13, 500, { color: t.ink2 })}">${job}</span></span><span style="${s({ display: "flex", "flex-direction": "column", "align-items": "flex-end" })}; ${txt(13, 500, { color: t.ink2 })}; ${tn}"><span style="${s({ color: t.ink, "font-weight": 700 })}">${String(t[key]).toUpperCase()}</span><span>${r ? `${r.toFixed(2)}:1` : ""}</span></span></li>`;
  };
  const ROWS = [
    ["ground", "Ground", "The page", null, null],
    ["surface", "Surface", "Steppers, tonal buttons, tiles, notes", null, null],
    ["surface2", "Surface 2", "Pressed, the switch’s off track", null, null],
    [
      "ink",
      "Ink",
      "Text, figures, the main button, whatever is chosen, selected text",
      "ink",
      "ground",
    ],
    ["ink2", "Ink 2", "Secondary text, suggested values, captions", "ink2", "ground"],
    ["control", "Control", "Field and outline borders, an empty RIR", "control", "ground"],
    ["hair", "Hairline", "Row dividers, the tab bar’s edge", null, null],
    ["onInk", "On ink", "Text on the main button and on selection", "onInk", "ink"],
    ["paper", "Paper", "What every print is made on", "printInk", "paper"],
    ["paperLabel", "Paper label", "The few figures a chart prints", "paperLabel", "paper"],
  ];
  const panel = (t, name) =>
    `<div style="${s({ flex: "1 1 0", background: t.ground, color: t.ink, border: `1px solid ${t.hair}`, "border-radius": 16, padding: "18px 22px" })}"><p style="${txt(16, 700, { color: t.ink })}">${name}</p><ul>${ROWS.map((r) => row(t, r)).join("")}</ul><p style="${s({ display: "flex", "align-items": "center", gap: 10, "margin-top": 14 })}; ${txt(15, 500, { color: t.ink })}">Selected text is ink:<span style="${s({ background: t.ink, color: t.onInk, padding: "2px 4px", "border-radius": 2 })}">62.5 kg × 3 @ 2</span></p></div>`;
  // the pigments, each family's form in its three states, on both papers
  const fam = ["strength", "run", "ride", "swim", "mobility", "food", "play"];
  const pig = (paperKey) => {
    const P = PAL[paperKey];
    const cells = fam
      .map((k) => {
        const f = (st) =>
          `<svg width="44" height="44" viewBox="-2 -2 48 48" aria-hidden="true" style="display:block;overflow:visible">${form(k, 0, 0, 44, 44, { state: st, paper: P.paper, segments: k === "strength" ? 0 : 0 })}</svg>`;
        return `<li style="${s({ display: "flex", "flex-direction": "column", gap: 10, padding: 14, background: P.paper, "border-radius": 0, "min-width": 0 })}"><span style="${s({ display: "flex", gap: 10, "align-items": "flex-end" })}">${f("todo")}${f("done")}${f("skipped")}</span><span style="${txt(14, 700, { color: P.ink })}">${FAMILY[k].family}${k === "play" ? " · reserved" : ""}</span><span style="${txt(12, 600, { color: P.label })}; ${tn}">${P.col[k].toUpperCase()} · ${ratio(P.col[k], P.paper).toFixed(2)}:1<br>to do ${P.tint[k].toUpperCase()}</span></li>`;
      })
      .join("");
    return `<ul style="${s({ display: "grid", "grid-template-columns": "repeat(7, minmax(0,1fr))", gap: 2 })}">${cells}</ul>`;
  };
  return section(`${H2("Colour", "The interface is black and white; it stays out of the way. Colour means a family of sport and only ever appears as a print or a mark made from what was logged. To do is the pigment thinned, with an edge of the full pigment; done is full; skipped is a dashed edge. Charts of things that are not sport (body weight, sleep) are ink.")}
<div style="${s({ display: "flex", gap: GAP })}">${panel(L, "Light")}${panel(Dk, "Dark")}</div>
${small("Pigments on light paper: to do, done, skipped")}${pig("light")}
${small("The same prints pulled on dark paper: lighter pigments, light ink, so a print is never the brightest thing on a dark screen")}${pig("dark")}`);
}

// ---------- type ----------
function type() {
  const ROWS = [
    [
      "Title",
      "Jost 700 · 36/1 (32 under 360 pt) · a destination’s name",
      title(36, { lh: 1 }),
      "Progress",
    ],
    [
      "Display",
      "Jost 700 · 34 → 30 → 26/1.05 · a long name steps down, then wraps to two lines",
      title(34),
      "Barbell bench press",
    ],
    ["Figure XL", "Jost 600 · 40–64, sized to the room it has · tabular", num(56), "1,147.5"],
    [
      "Entry",
      "Jost 600 · 46 or 42, down to 28 to fit, never truncated; Atkinson’s en dash inside a range",
      num(42, { lh: 1.1 }),
      "62.5 × 3 @ 2",
    ],
    ["Figure", "Jost 600 · 17–30/1 · tabular lining", num(26), "6:06 /km · 77.47 kg · 2:14"],
    [
      "Heading",
      "Atkinson Hyperlegible Next 700 · 16–18",
      txt(17, 700) + "; " + tn,
      "Set 3 · Waiting for you",
    ],
    [
      "Body",
      "Atkinson Hyperlegible Next 500 · 15–16/1.45 · everything read, the coach’s words included",
      txt(16, 500) + "; " + tn,
      "Choose a load leaving three reps in reserve; record what you used.",
    ],
    [
      "Meta",
      "Atkinson 500 · 14–15 · ink 2, glyph first",
      txt(15, 500, { color: L.ink2 }) + "; " + tn,
      "4 × 3–5 @ 2 · 3–4 min",
    ],
    [
      "Caption",
      "Atkinson 700 · 13 · ink 2 · a section’s name",
      txt(13, 700, { color: L.ink2 }),
      "Waiting for you",
    ],
    [
      "Label",
      "Atkinson 600–700 · 12–13 · the tab bar and print labels, never under 12",
      txt(13, 700),
      "Today · Training · Food",
    ],
  ];
  return section(`${H2("Type", "Jost for titles and figures; Atkinson Hyperlegible Next for everything read. Figures step down to fit and never truncate; text wraps and never runs off.")}
<ul style="border-top:1px solid ${L.hair}">${ROWS.map(([n, spec, st, sample]) => `<li style="${s({ display: "grid", "grid-template-columns": "300px minmax(0,1fr)", gap: 24, "align-items": "baseline", padding: "14px 0", "border-bottom": `1px solid ${L.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", gap: 2 })}"><span style="${txt(15, 700)}">${n}</span><span style="${txt(13, 500, { color: L.ink2 })}">${spec}</span></span><span style="${st}; color: ${L.ink}; overflow-wrap: anywhere">${K.dashes(sample)}</span></li>`).join("")}</ul>`);
}

// ---------- spacing, radii, elevation, layout ----------
function metrics() {
  const sp = [4, 6, 8, 10, 12, 14, 16, 20, 24];
  const radii = [
    [0, "prints"],
    [6, "checkbox"],
    [8, "tag"],
    [12, "key, day"],
    [14, "button, field"],
    [16, "card"],
    [18, "rest pill"],
    [24, "sheet"],
  ];
  const spacing = `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${small("Spacing (pt)")}<div style="${s({ display: "flex", "align-items": "flex-end", gap: 14 })}">${sp.map((v) => `<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 6 })}"><span style="${s({ width: v, height: v, background: L.ink })}"></span><span style="${txt(13, 600, { color: L.ink2 })}; ${tn}">${v}</span></div>`).join("")}</div></div>`;
  const rad = `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${small("Radii (pt)")}<div style="${s({ display: "flex", "align-items": "flex-start", gap: 14 })}">${radii.map(([v, n]) => `<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 6, width: 72 })}"><span style="${s({ width: 56, height: 56, "border-top-left-radius": v, border: `2px solid ${L.ink}`, "border-right": 0, "border-bottom": 0 })}"></span><span style="${txt(12, 600, { color: L.ink2, "text-align": "center" })}">${v}<br>${n}</span></div>`).join("")}</div></div>`;
  const elev = `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${small("Elevation: one shadow")}<div style="${s({ display: "flex", gap: 22, "align-items": "center" })}"><div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 8 })}"><span style="${s({ width: 120, height: 48, background: L.ink, "border-radius": 16, "box-shadow": L.float })}"></span><span style="${txt(12, 600, { color: L.ink2 })}">The session strip, light only</span></div><div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 8 })}"><span style="${s({ position: "relative", width: 120, height: 64, background: L.scrim, "border-radius": 8, overflow: "hidden" })}"><span style="${s({ position: "absolute", left: 0, right: 0, bottom: 0, height: 36, background: L.ground, "border-radius": "14px 14px 0 0" })}"></span></span><span style="${txt(12, 600, { color: L.ink2 })}">A sheet: a scrim, no shadow</span></div></div></div>`;
  const layout = `<div style="${s({ display: "flex", "flex-direction": "column", gap: 8, "max-width": 520 })}">${small("Layout")}<ul style="${s({ display: "flex", "flex-direction": "column", gap: 6 })}; ${txt(14, 500)}">${[
    "Gutter 20 pt, 16 under 360 pt. One left edge: every list shares a 20-pt mark column, names start 12 after it.",
    "Targets 44 pt (48 dp on Android, grown by hit area, not by drawing).",
    "Tab bar 64 pt: 48 of targets on a hairline, 12 above the home indicator (6 where there is none). The session is a layer over it.",
    "Pinned actions sit 8 above the safe area or 12 above the tab bar; the content fades under them.",
  ]
    .map(
      (x) =>
        `<li style="${s({ display: "flex", gap: 8 })}"><span style="${s({ width: 6, height: 6, background: L.ink, "margin-top": 8, "flex-shrink": 0 })}"></span><span>${x}</span></li>`,
    )
    .join("")}</ul></div>`;
  return section(
    `${H2("Spacing, radii, elevation, layout")}<div style="${s({ display: "flex", gap: 48, "flex-wrap": "wrap", "align-items": "flex-start" })}">${spacing}${rad}${elev}${layout}</div>`,
  );
}

// ---------- components ----------
function components() {
  const t = L,
    dv = K.D;
  const w = (inner, width = 362) =>
    `<div style="${s({ width, "max-width": "100%" })}">${inner}</div>`;
  const buttons = `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10, width: 362 })}"><button type="button" style="${K.BTN(t, "primary")}">${icon("play", 20)}Start workout</button><div style="${s({ display: "flex", gap: 10 })}"><button type="button" style="${K.BTN(t, "tonal")}; flex: 1 1 0">Log it</button><button type="button" aria-disabled="true" style="${K.BTN(t, "waiting")}; flex: 1.6 1 0">Choose RIR to save</button></div><div style="${s({ display: "flex", gap: 10, "align-items": "center" })}"><a href="#" style="${K.BTN(t, "outline", { h: 36 })}; padding: 0 14px; font-size: 15px">Finish</a><button type="button" style="${K.BTN(t, "text", { h: 44 })}">Skip for now</button>${K.roundBtn(t, "plus", "More")}${K.roundBtn(t, "minus", "Less")}</div></div>`;
  const steppers = `<div style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: 8, width: 362 })}">${K.stepFigure(t, { value: "62.5", unit: "kg", state: "suggested", hint: "", dec: "Less", inc: "More", size: 40 })}${K.stepFigure(t, { value: "62.5", unit: "kg", state: "touched", dec: "Less", inc: "More", size: 40 })}${K.stepFigure(t, { value: "", unit: "RIR", state: "empty", hint: "target 2", dec: "Less", inc: "More", size: 40 })}</div><p style="${txt(13, 500, { color: t.ink2 })}">Suggested (ink 2, dotted) until touched; then ink, because it is what Save records. RIR starts empty: − or + begins at the target. Tapping a figure types it.</p>`;
  const ledgerRows = `<ol style="width:362px">${SE.ledgerRow(t, { n: "W", v: "25", reps: 8, kind: "warm" })}${SE.ledgerRow(t, { n: 1, v: "60", reps: 5, rir: 2, kind: "done" })}${SE.ledgerRow(t, { n: 3, kind: "now" }, { now: true })}${SE.ledgerRow(t, { n: 4, kind: "todo" })}</ol><p style="${txt(13, 500, { color: t.ink2 })}">A warm-up is grey, done is ultramarine, the set being entered is outlined, to do is thinned with its edge.</p>`;
  const rows = `<ul style="width:362px">${SE.warmRow(t, { name: "Upper-body warm-up", sub: "4 drills", drills: 4, done: true })}${planRow(t, { name: "Barbell curl", sets: 3, done: 3, rx: "3 × 8–12 @ 1–2" })}${planRow(t, { name: "Rope triceps pushdown", sets: 3, done: 1, rx: "3 × 12–15 @ 1" })}<li style="position:relative"><ul>${planRow(t, { name: "Farmer’s carry", sets: 3, rx: "3 × 20–40 m" })}${planRow(t, { name: "Wrist curl", sets: 2, rx: "2 × 12–20 @ 1" }, { last: true })}</ul>${K.supersetBracket(t)}</li></ul><p style="${txt(13, 500, { color: t.ink2 })}">A row is led by a small copy of its part of the print. A superset is a bracket down the mark column.</p>`;
  const rest = `<div style="${s({ display: "flex", gap: 12, "align-items": "center" })}">${K.restPill(t, { time: "2:14", frac: 0.74 })}${K.restPill(t, { time: "0:30", frac: 0.17 })}${K.restPill(t, { go: true, timeHtml: "Go", aria: "Rest over" })}</div><div style="${s({ position: "relative", height: 60, width: 402, "margin-left": -20 })}">${K.strip(t, { dv, bottom: 4 })}</div><p style="${txt(13, 500, { color: t.ink2 })}">Rest lives in one place: a pill in the session’s header, a dial that empties from twelve. Minimised, the session is a strip on every screen.</p>`;
  const tabbar = `<div style="${s({ position: "relative", height: K.navH(dv), width: 402, "margin-left": -20, background: t.ground })}">${K.navbar(t, "today", { dv })}</div><p style="${txt(13, 500, { color: t.ink2 })}">64 pt: 48 of targets, 12 above the home indicator.</p>`;
  const fields = `<div style="${s({ display: "flex", "flex-direction": "column", gap: 12, width: 362 })}">${K.field(t, "Name", { value: "Anytime Fitness" })}${seg(t, ["Distance", "Duration", "Pace"], 0, "Measure", { h: 40, size: 15 })}<div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between" })}"><span style="${txt(16, 600)}">Rest timer</span>${K.toggle(t, true, "Rest timer")}</div>${K.iconChoice(
    t,
    [
      ["outdoor", "Outdoor"],
      ["treadmill", "Treadmill"],
    ],
    0,
  )}</div>`;
  const coach = `${w(K.coachNote(t, { who: "Coach", tone: "planning", text: "Coach is planning for Anytime Fitness, since 09:00. This screen updates itself.", more: false, size: 15 }))}${w(K.coachNote(t, { who: "Recovery check", tone: "check", title: "Sleep 5 h", text: "Hold loads today rather than adding, and keep the RIR honest.", more: false, size: 15 }))}<p style="${txt(13, 500, { color: t.ink2 })}">Words the coach (or the app’s advice) writes: attributed, quiet, never in colour, two lines then More.</p>`;
  const tags = `<div style="${s({ display: "flex", gap: 10, "flex-wrap": "wrap", "align-items": "center" })}"><span style="${s({ display: "inline-flex", "align-items": "center", gap: 5, height: 30, padding: "0 9px 0 10px", "border-radius": 8, border: `1.5px solid ${t.ink}` })}; ${txt(14, 700)}">Hold${icon("info", 16)}</span><span style="${s({ padding: "3px 9px", "border-radius": 10, background: t.ink, color: t.onInk })}; ${txt(13, 700)}">1 request</span><span style="${s({ padding: "3px 9px", "border-radius": 8, border: `1.5px solid ${t.ink}` })}; ${txt(13, 700)}">Default</span><span style="${s({ width: 26, height: 26, "border-radius": 9999, background: t.ink, color: t.onInk, display: "grid", "place-items": "center" })}">${icon("check", 15)}</span><span style="${txt(13, 700)}">Today</span></div><p style="${txt(13, 500, { color: t.ink2 })}">A tag explains (Hold opens Why); a badge counts; an outline names a state.</p>`;
  const bowls = `<div style="${s({ display: "flex", gap: 18, "align-items": "flex-end" })}">${[
    ["met", "Goal met"],
    ["logged", "Under"],
    ["over", "Over"],
    ["none", "Nothing"],
    ["today", "Today"],
  ]
    .map(
      ([k, l]) =>
        `<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 6 })}">${dayBowl(t, k, false, 26)}<span style="${txt(12, 600, { color: t.ink2 })}">${l}</span></div>`,
    )
    .join(
      "",
    )}</div><p style="${txt(13, 500, { color: t.ink2 })}">A day in the food strip: the bowl filled to its state. Over heaps above the rim, so it is never confused with met.</p>`;
  // the chart rule: ink line, the latest point an ink dot, never a pigment
  const pts = weights.filter(([d]) => d !== "1 Jul").map(([, v]) => v);
  const cw = 362,
    ch = 120,
    lo = 75.8,
    hi = 77.7;
  const px = (i) => 8 + (i / (pts.length - 1)) * (cw - 24);
  const py = (v) => ch - 14 - ((v - lo) / (hi - lo)) * (ch - 28);
  const chart = `<svg width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}" role="img" aria-label="Body weight, 8 July to 28 September" style="display:block"><path d="${pts.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join("")}" fill="none" stroke="${t.ink}" stroke-width="2"/>${pts.map((v, i) => (i === pts.length - 1 ? `<circle cx="${px(i).toFixed(1)}" cy="${py(v).toFixed(1)}" r="5.5" fill="${t.ink}"/>` : `<circle cx="${px(i).toFixed(1)}" cy="${py(v).toFixed(1)}" r="2.4" fill="${t.ground}" stroke="${t.ink}" stroke-width="1.5"/>`)).join("")}</svg><p style="${txt(13, 500, { color: t.ink2 })}">Charts that are not sport are ink: the latest reading is an ink dot, not a pigment.</p>`;
  const sheetDemo = `<div style="${s({ position: "relative", height: 180, width: 362, overflow: "hidden", "border-radius": 14, background: t.scrim })}"><div style="${s({ position: "absolute", left: 0, right: 0, bottom: 0, height: 150, background: t.ground, "border-radius": "24px 24px 0 0", padding: "8px 20px" })}"><span style="${s({ display: "block", width: 36, height: 5, "border-radius": 9999, background: t.surface2, margin: "0 auto 8px" })}"></span><div style="${s({ display: "flex", "align-items": "center" })}"><span style="${title(28)}; flex: 1 1 auto">More options</span>${icon("close", 20)}</div><p style="${s({ display: "flex", "align-items": "center", gap: 12, height: 52, "border-bottom": `1px solid ${t.hair}` })}; ${txt(17, 600)}">${icon("calendar", 22)}Train another day</p></div></div>`;
  const keyboard = `<p style="${txt(14, 500)}">Tap a figure to type it: the decimal pad with Previous, Next and Done; the figure being typed is selected, in ink.</p><div style="${s({ display: "flex", "align-items": "center", gap: 10 })}"><span style="${s({ display: "inline-flex", padding: "4px 12px", "border-radius": 12, border: `2.5px solid ${t.ink}` })}"><span style="${num(36, { lh: 1.1 })}; background: ${t.ink}; color: ${t.onInk}; padding: 0 3px; border-radius: 2px">62.5</span></span><span style="${txt(13, 600, { color: t.ink2 })}">kg</span></div>`;
  return section(`${H2("Components", "Drawn at their size by the code that draws the screens.")}
${grid(
  3,
  [
    tile("Buttons: ink, tonal, waiting, outline, text, round", buttons),
    tile("Steppers: suggested, touched, empty", steppers),
    tile("Typing a figure", keyboard),
    tile("The ledger: one row per set", ledgerRows),
    tile("Rows and their marks", rows),
    tile("Rest and the session strip", rest),
    tile("The tab bar", tabbar),
    tile("Fields and choices", fields),
    tile("The coach and the app’s advice", coach),
    tile("Tags and badges", tags),
    tile("Food days", bowls),
    tile("Charts in ink", chart),
    tile("A sheet: scrim, grabber, title, close", sheetDemo),
  ].join(""),
)}`);
}

// ---------- states ----------
function states() {
  const t = L;
  const quiet = (label) =>
    `<button type="button" style="${K.BTN(t, "outline", { h: 44 })}; font-size: 15px; align-self: flex-start">${label}</button>`;
  const sq = 12;
  const saving = `<ol style="width:362px">${SE.ledgerRow(t, { n: 3, kind: "now" }, { swap: `<span style="${s({ position: "relative", width: sq, height: sq, background: PIG.ultraT, border: `1.5px solid ${t.marks.strength}`, display: "block" })}"><svg width="${sq}" height="${sq}" viewBox="0 0 24 24" aria-hidden="true" style="position:absolute;inset:-1.5px;display:block" fill="none" stroke="${t.ink}" stroke-width="4" stroke-linecap="round"><path d="M12 4a8 8 0 1 1-8 8"/></svg></span>` }).replace('aria-current="step"', "")}</ol><button type="button" aria-disabled="true" style="${K.BTN(t, "waiting")}; width: 362px">Saving…</button><p style="${txt(13, 500, { color: t.ink2 })}">Nothing inks before the server has it. Saving… also stops a second tap.</p>`;
  const failed = `<ol style="width:362px">${SE.ledgerRow(t, { n: 3, kind: "now" }, { swap: `<span style="display:grid;color:${t.ink}">${K.icon("warn", 16)}</span>` }).replace('aria-current="step"', "")}</ol><p role="alert" style="${txt(15, 600)}">${C.setFailed}</p>${quiet("Retry")}`;
  const warm = `<ol style="width:362px">${SE.ledgerRow(t, { n: "W", v: "40", reps: 8, kind: "warm" })}</ol><p style="${txt(14, 500, { color: t.ink2 })}">${C.warmup}</p><button type="button" style="${s({ height: 44, "text-decoration": "underline", "text-underline-offset": 3, "align-self": "flex-start" })}; ${txt(15, 700)}">Undo</button>`;
  const offline = `<div style="${s({ display: "flex", gap: 10, padding: "12px 14px", "border-radius": 14, background: t.surface })}"><span style="display:grid">${icon("offline", 20)}</span><p style="${txt(14, 600)}">You’re offline. Reconnect to load this page.</p></div>${quiet("Retry loading")}`;
  const slow = `<div aria-hidden="true" style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}"><span style="${s({ height: 72, background: t.surface, "border-radius": 0 })}"></span><span style="${s({ height: 14, width: "62%", background: t.surface, "border-radius": 2 })}"></span><span style="${s({ height: 14, width: "84%", background: t.surface, "border-radius": 2 })}"></span></div><p role="status" style="${txt(14, 600, { color: t.ink2 })}">${C.slow}</p>${quiet("Retry loading")}`;
  const noGym = `<p style="${title(26)}">${C.noGymTitle}</p><button type="button" style="${K.BTN(t, "primary")}">${icon("plus", 20)}${C.noGymAction}</button>`;
  const noTarget = `<p style="${title(26)}">${C.noTarget}</p><p style="${txt(15, 500, { color: t.ink2 })}">${C.noTargetGoal}</p><button type="button" style="${K.BTN(t, "primary", { h: 52 })}">${icon("target", 20)}Set target</button>`;
  const done = `${dayPrint({
    w: 362,
    h: 110,
    paper: t.paper,
    parts: [
      { kind: "strength", columns: [3, 3, 3, 2].map((n, i) => ({ n, done: n, pair: i === 2 })) },
      { kind: "run", minutes: 30, done: true },
    ],
    ariaLabel: "Today’s print, in full ink",
  })}<p style="${txt(15, 700)}">${C.done}</p>`;
  const nothing = `<p style="${txt(16, 500, { color: t.ink2 })}">Nothing is waiting for you.</p>`;
  return section(`${H2("States the screens take", "Every string is the app’s own.")}
${grid(3, [tile("Saving a set", saving), tile("A set not saved", failed), tile("A light set saved without RIR", warm), tile("Offline", offline), tile("Slow", slow), tile("Today, no gym yet", noGym), tile("Food, no target yet", noTarget), tile("Today, all done", done), tile("The coach, nothing waiting", nothing)].join(""))}`);
}

// ---------- motion ----------
function motion() {
  const M = [
    [
      "Press",
      "120 ms · cubic-bezier(0.23, 1, 0.32, 1) · scale 0.97",
      "Every button and row. Reduced motion: none.",
    ],
    [
      "Saving",
      "until the server answers · the mark turns, Save reads Saving…",
      "Never inks early; a failed save keeps the entries.",
    ],
    [
      "Ink",
      "420 ms · cubic-bezier(0.65, 0, 0.35, 1) · pigment rolls up the mark",
      "On the server’s answer; a success haptic on the same frame. Reduced motion: a cut.",
    ],
    [
      "Swap",
      "out 80 ms, in 120 ms · the next set takes the outline",
      "Values go back to suggestions, RIR empties, rest restarts.",
    ],
    ["Sheet", "spring 0.4 s, bounce 0.08 · scrim fades 200 ms", "Reduced motion: a fade."],
    [
      "Rest",
      "the dial empties linearly, from twelve",
      "At zero the pill reads Go for 60 s; a notification where the platform allows.",
    ],
  ];
  return section(
    `${H2("Motion")}<ul style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: GAP })}">${M.map(([n, v, note]) => `<li style="${s({ display: "flex", "flex-direction": "column", gap: 6, padding: "14px 0", "border-top": `2px solid ${L.ink}` })}"><span style="${txt(16, 700)}">${n}</span><span style="${txt(14, 600)}; ${tn}">${v}</span><span style="${txt(14, 500, { color: L.ink2 })}">${note}</span></li>`).join("")}</ul>`,
  );
}

export function systemSheet() {
  return `<div style="${s({ width: SW, padding: PAD, background: L.surface, color: L.ink, "font-family": K.FONTS.text, display: "flex", "flex-direction": "column", gap: 64, "-webkit-font-smoothing": "antialiased" })}">
<header style="${s({ display: "flex", "align-items": "flex-end", "justify-content": "space-between", gap: 24 })}"><div><h1 style="${title(68, { lh: 1 })}">The system</h1><p style="${txt(18, 500, { color: L.ink2 })}; margin-top: 10px">Black and white; every colour is printed by what you logged.</p></div>${K.wordmark(L, 26)}</header>
<div style="${s({ display: "grid", "grid-template-columns": "520px minmax(0,1fr)", gap: 48 })}">${identity()}${icons()}</div>
${colour()}
<div style="${s({ display: "grid", "grid-template-columns": "minmax(0,1.2fr) minmax(0,1fr)", gap: 48 })}">${type()}${metrics()}</div>
${components()}
${states()}
${motion()}
</div>`;
}
