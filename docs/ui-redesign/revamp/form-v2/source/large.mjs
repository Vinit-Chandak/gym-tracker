// Logging a set at 200% text: the same screen as one scroll in normal flow. Text doubles, figures
// grow by half, controls grow to fit, steppers stack, RIR wraps to two rows, Save and the tab bar
// stay pinned, and tab labels are capped (the platform's large content viewer). The entry comes
// first, under the title; what is already saved follows it.
import { s, esc } from "./lib.mjs";
import { glyph } from "./icons.mjs";
import { log as L } from "./data.mjs";
import * as form from "./form.mjs";

export const LW = 402;
const RIR = ["0", "1", "2", "3", "4", "5", "6+"];
const tn = "font-variant-numeric: tabular-nums lining-nums";

export function largeLog() {
  const t = form.TOKENS.light,
    F = form.FONTS;
  const tx = (size, wt = 500, col = t.ink) =>
    s({
      "font-family": F.text,
      "font-size": size,
      "font-weight": wt,
      color: col,
      "line-height": 1.4,
    });
  const fig = (size) => form.num(size, { lh: 1.05 });
  const b = (kind) =>
    form.BTN(t, kind, { h: 64 }) +
    "; font-size: 32px; width: 100%; height: auto; min-height: 64px; padding: 8px 16px; white-space: normal";
  const navH = form.navH(form.D),
    pad = 20;
  const tag = (label) =>
    `<span style="${s({ padding: "2px 12px", "border-radius": 10, border: `2px solid ${t.ink}` })}; ${tx(26, 700)}">${label}</span>`;
  const quiet = (label, aria) =>
    `<button type="button" aria-label="${aria}" style="${b("tonal")}">${label}</button>`;
  const waiting = (label) =>
    `<button type="button" style="${b("tonal")}; color: ${t.ink2}">${label}</button>`;
  const rest = () =>
    `<li><section aria-label="Rest timer" style="${s({ display: "flex", "flex-direction": "column", gap: 10, padding: "14px 0", "border-bottom": `1px solid ${t.hair}` })}"><p style="${s({ display: "flex", "align-items": "center", gap: 12 })}"><span style="${s({ color: t.ink2, display: "grid" })}">${form.icon("timer", 32)}</span><span style="${tx(28, 500, t.ink2)}">Rest</span><span role="timer" aria-label="Rest, 2 minutes 14 seconds left" style="${fig(40)}">${L.rest.remaining}</span></p><div style="${s({ display: "grid", "grid-template-columns": "1fr 1fr", gap: 10 })}">${quiet('<span class="nb">+30 s</span>', "Add 30 seconds")}${quiet("Stop", "Stop the rest timer")}</div></section></li>`;
  const current = () =>
    `<li aria-current="step" style="${s({ display: "grid", "grid-template-columns": "minmax(0,1fr) auto", gap: 10, "align-items": "center", padding: "12px 16px", border: `3px solid ${t.ink}`, "border-radius": 4, "margin-top": 16 })}"><span style="${tx(34, 700)}">Set 3 <span style="${s({ color: t.ink2, "font-weight": 500 })}">· Working</span></span><button type="button" aria-label="Set 3 options: type, notes" style="${s({ width: 56, height: 56, display: "grid", "place-items": "center", color: t.ink2 })}">${form.icon("sliders", 28)}</button></li>`;
  const stepBtn = (ic, aria) =>
    `<button type="button" aria-label="${aria}" style="${s({ height: 64, "border-radius": 14, background: t.surface, display: "grid", "place-items": "center", color: t.ink })}">${form.icon(ic, 30)}</button>`;
  const chips = () =>
    `<div style="${s({ display: "grid", "grid-template-columns": "repeat(4, minmax(0, 1fr))", gap: 4, padding: 4, background: t.surface, "border-radius": 16 })}">${RIR.map((v, i) => `<button type="button" role="radio" aria-checked="false" tabindex="${i ? -1 : 0}" aria-label="${v === "6+" ? "6 or more" : v} ${v === "1" ? "rep" : "reps"} in reserve${v === "2" ? ", the target" : ""}" style="${s({ position: "relative", height: 64, "border-radius": 12 })}; ${fig(36)}">${v}${v === "2" ? `<span aria-hidden="true" style="${s({ position: "absolute", left: "50%", bottom: 8, width: 6, height: 6, "margin-left": -3, "border-radius": 3, background: t.ink })}"></span>` : ""}</button>`).join("")}</div>`;
  const savedLine = (x) =>
    `<li style="${s({ padding: "10px 0", "border-bottom": `1px solid ${t.hair}` })}"><button type="button" aria-label="Set ${x.n}: ${x.kg} kg, ${x.reps} reps, ${x.rir} RIR, saved. Edit" style="${s({ display: "flex", "flex-wrap": "wrap", "align-items": "baseline", gap: "2px 12px", width: "100%", "text-align": "left" })}"><span style="${tx(28, 700, t.ink2)}">Set ${x.n}</span><span class="nb"><span style="${fig(40)}">${x.kg}</span> <span style="${tx(28, 600, t.ink2)}">kg</span></span><span class="nb" style="${tx(28, 600, t.ink2)}">× ${x.reps} @ ${x.rir}</span></button></li>`;

  const label = (txt) => `<span aria-hidden="true" style="${tx(28, 650, t.ink2)}">${txt}</span>`;
  const stepper = (name, unit, value, dec, inc) =>
    `<div role="group" aria-label="${name}${unit ? " in " + unit : ""}" style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}">${label(`${name}${unit ? ` · ${unit}` : ""}`)}<output aria-label="${value}${unit ? " " + unit : ""}, suggested, not yet confirmed" style="${s({ "text-align": "center", color: t.ink2 })}; ${fig(56)}; text-decoration: underline dotted 3px; text-underline-offset: 10px">${value}</output><div style="${s({ display: "grid", "grid-template-columns": "1fr 1fr", gap: 10 })}">${stepBtn("minus", dec)}${stepBtn("plus", inc)}</div></div>`;
  const head = `
<header style="${s({ display: "flex", "flex-direction": "column", gap: 4 })}">
  <div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between" })}"><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 4, "min-height": 56 })}; ${tx(34, 750)}">${glyph("chevronLeft", { size: 32 })}${L.session}</a><button type="button" aria-label="Exercise: technique, history, add a set, complete, skip" style="${s({ width: 56, height: 56, display: "grid", "place-items": "center" })}">${glyph("more", { size: 32 })}</button></div>
  <p style="${tx(28, 500, t.ink2)}">${L.gym}</p>
</header>
<h2 style="${form.title(56, { lh: 1.05 })}; color: ${t.ink}; margin-top: 12px; text-wrap: balance">${L.exercise}</h2>
<p style="${tx(30, 500, t.ink2)}; margin-top: 8px; ${tn}">${L.equipment} · <span class="nb">2 of 4 sets</span></p>
<p style="${tx(30, 500, t.ink2)}; ${tn}"><span class="nb">4 × 3–5</span> <span class="nb">@ 2 RIR</span> · <span class="nb">rest 3–4 min</span></p>`;
  const hold = `<div style="${s({ display: "flex", "flex-wrap": "wrap", "align-items": "center", gap: "8px 12px", margin: "16px 0" })}">${tag(L.suggestion.kind)}<span style="${tx(34, 750)}; ${tn}">Keep <span class="nb">62.5 kg</span></span><a href="#" aria-label="Why keep 62.5 kg" style="${s({ display: "flex", "align-items": "center", gap: 8, "min-height": 56 })}; ${tx(30, 700, t.ink2)}">${glyph("info", { size: 28 })}Why</a></div>`;
  const entry = `<section aria-label="Set 3" style="${s({ display: "flex", "flex-direction": "column", gap: 22, "margin-top": 20 })}">
  ${stepper("Load", "kg", "62.5", "Less load, 2.5 kg", "More load, 2.5 kg")}
  ${stepper("Reps", "", "3", "One rep fewer", "One rep more")}
  <div role="radiogroup" aria-labelledby="rir-l" aria-required="true" style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}"><span id="rir-l" style="${tx(28, 650, t.ink2)}">RIR · reps in reserve · required</span>${chips()}</div>
</section>`;
  const content = `${head}
<ol aria-label="Set 3" style="margin-top:8px">${current()}</ol>
${entry}
<section aria-labelledby="saved-h"><h3 id="saved-h" style="${tx(28, 700, t.ink2)}; margin-top: 32px">Saved</h3><ol>${L.sets.map(savedLine).join("")}</ol></section>
${hold}
<ul>${rest()}</ul>`;
  const barH = 96;
  const pinned = `<div style="${s({ position: "absolute", left: 0, right: 0, bottom: 0, height: navH + barH })}">
  <div style="${s({ position: "absolute", left: 0, right: 0, bottom: navH, padding: "12px 20px", background: t.ground, "border-top": `1px solid ${t.hair}` })}">${waiting("Choose RIR to save")}</div>
  ${form.navbar(t, "today", { nested: true })}
</div>`;
  const fold = `<div aria-hidden="true" style="${s({ position: "absolute", left: 0, right: 0, top: 874 - navH - barH, "border-top": `2px dashed ${t.ink2}` })}"></div>`;
  const note = `<p style="${s({ margin: "32px 0 0", padding: "16px 0 0", "border-top": `1px solid ${t.hair}` })}; ${tx(15, 500, t.ink2)}">At 200% text: text doubles, figures grow by half, controls grow to fit; steppers stack and RIR wraps to two rows. The dashed line is where the first screen ends: Save and the tab bar stay pinned under it, drawn here at the foot of the scroll. Tab labels are capped, with the platform’s large content viewer. The entry comes first; the sets already saved follow it.</p>`;
  return `<div style="${s({ position: "relative", width: LW, background: t.ground, color: t.ink, "font-family": F.text, "color-scheme": "light", "-webkit-font-smoothing": "antialiased" })}">
<h1 class="sr">${esc(L.exercise)}, entering set 3, text at 200%</h1>
<main style="${s({ padding: `62px ${pad}px ${navH + barH + 24}px` })}">${content}${note}</main>
${pinned}${fold}
</div>`;
}
