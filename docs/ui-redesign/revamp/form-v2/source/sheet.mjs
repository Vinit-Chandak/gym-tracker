// The system sheet: one layout, filled by Form's kit (form.mjs).
import { s, esc, contrast } from "./lib.mjs";
import { ICON_ORDER } from "./icons.mjs";

export const SW = 1846;

const LABELS = {
  today: "Today",
  training: "Training",
  food: "Food",
  progress: "Progress",
  profile: "Profile",
  play: "Start, resume",
  more: "More options",
  pin: "Gym",
  chevronLeft: "Back",
  chevronRight: "Open",
  chevronDown: "Choose",
  plus: "Add, log it",
  minus: "Less",
  check: "Save, saved",
  close: "Close",
  timer: "Rest timer",
  stop: "Stop",
  sliders: "Filters, set options",
  info: "Why, help note",
  history: "History",
  cue: "Technique",
  flag: "Complete",
  link: "Superset",
  undo: "Undo",
  edit: "Edit",
  table: "View values",
  calendar: "Calendar",
  star: "Save as meal",
  book: "My foods",
  target: "Targets",
  search: "Search",
  bolt: "Quick add",
  lift: "Strength",
  run: "Run",
  ride: "Ride",
  swim: "Swim",
  offline: "Offline",
};

export function systemSheet(kit) {
  const t = kit.light,
    d = kit.dark;
  const H2 = (txt) => `<h2 style="${kit.h2(t)}">${txt}</h2>`;
  const small = (txt, col = t.ink2) =>
    `<span style="${s({ "font-family": kit.textFont, "font-size": 14, "font-weight": 500, color: col })}">${txt}</span>`;

  // --- identity
  const identity = `<section style="${s({ display: "flex", "flex-direction": "column", gap: 24 })}">
${H2("Mark and wordmark")}
<div style="${s({ display: "flex", gap: 24, "align-items": "stretch" })}">
  <div style="${s({ flex: "1 1 0", "min-height": 300, background: t.ground, border: `1px solid ${t.hair}`, "border-radius": kit.tileRadius, display: "grid", "place-items": "center", padding: 24 })}">${kit.mark(t, 150)}</div>
  <div style="${s({ flex: "1 1 0", "min-height": 300, background: d.ground, "border-radius": kit.tileRadius, display: "grid", "place-items": "center", padding: 24 })}">${kit.mark(d, 150)}</div>
</div>
<div style="${s({ padding: "28px 24px", background: t.ground, border: `1px solid ${t.hair}`, "border-radius": kit.tileRadius })}">${kit.wordmark(t, 46)}</div>
<div style="${s({ display: "flex", gap: 20, "align-items": "center" })}">${kit.appIcon(t, 88)}${kit.appIcon(d, 88)}${small("App icon, light and dark")}</div>
</section>`;

  // --- icons
  const cell = (
    name,
  ) => `<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 8, padding: "14px 4px", "min-width": 0 })}">
<span style="${s({ position: "relative", width: 56, height: 56, display: "grid", "place-items": "center", color: t.ink, "border-radius": 4 })}"><svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" style="position:absolute;inset:0"><path d="${Array.from({ length: 9 }, (_, i) => `M${i * 7} 0V56M0 ${i * 7}H56`).join("")}" stroke="${t.hair}" stroke-width="1" fill="none"/></svg><span style="position:relative;display:grid">${kit.icon(name, 42)}</span></span>
<span style="${s({ "font-family": kit.textFont, "font-size": 13, "font-weight": 550, color: t.ink2, "text-align": "center", "line-height": 1.2 })}">${LABELS[name] || name}</span></div>`;
  const group = (title, names) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", gap: 4 })}">${small(title)}<div style="${s({ display: "grid", "grid-template-columns": "repeat(11, minmax(0, 1fr))", "column-gap": 6 })}">${names.map(cell).join("")}</div></div>`;
  const icons = `<section style="${s({ display: "flex", "flex-direction": "column", gap: 18 })}">
<div style="${s({ display: "flex", "align-items": "baseline", gap: 16 })}">${H2("Icons")}${small(kit.iconRule)}</div>
${group("Destinations", ICON_ORDER.destinations)}
${group("Actions the screens use", ICON_ORDER.actions)}
${group("Sports", ICON_ORDER.sports)}
</section>`;

  // --- colour
  const swatch = (th, tok) => {
    const fg = th[tok.on || "ink"];
    const bg = th[tok.key];
    const vsGround = contrast(bg, th.ground);
    const nm = (k) =>
      ({
        ink: "Ink",
        ink2: "Ink 2",
        faint: "Faint",
        onField: "Text",
        onSignal: "Text",
        signalText: "Signal text",
        lumeText: "Lume text",
        ground: "ground",
        surface: "surface",
        field: "field",
        signal: "signal",
      })[k] || k;
    const label = tok.pair ? tok.pairLabel || `${nm(tok.pair[0])} on ${nm(tok.pair[1])}` : null;
    const pairRatio = tok.pair ? contrast(th[tok.pair[0]], th[tok.pair[1]]) : null;
    return `<li style="${s({ display: "grid", "grid-template-columns": "64px minmax(0,1fr) auto", gap: 14, "align-items": "center", padding: "10px 0", "border-bottom": `1px solid ${th.hair}` })}">
<span style="${s({ width: 64, height: 44, "border-radius": kit.chipRadius, background: bg, border: `1px solid ${th.hair}`, display: "grid", "place-items": "center", color: fg, "font-family": kit.textFont, "font-size": 14, "font-weight": 700 })}">${tok.on ? "Aa" : ""}</span>
<span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${s({ "font-family": kit.textFont, "font-size": 15, "font-weight": 700, color: th.ink })}">${tok.name}</span><span style="${s({ "font-family": kit.textFont, "font-size": 13, "font-weight": 500, color: th.ink2 })}">${tok.job}</span></span>
<span style="${s({ display: "flex", "flex-direction": "column", "align-items": "flex-end", "font-family": kit.textFont, "font-size": 13, color: th.ink2, "font-variant-numeric": "tabular-nums" })}"><span style="${s({ color: th.ink, "font-weight": 650 })}">${bg.toUpperCase()}</span><span>${label ? `${label} ${pairRatio.toFixed(2)}:1` : tok.key === "ground" ? "ground" : `${vsGround.toFixed(2)}:1 on ground`}</span></span>
</li>`;
  };
  const colourPanel = (
    th,
    title,
  ) => `<div style="${s({ flex: "1 1 0", background: th.ground, color: th.ink, border: `1px solid ${th.hair}`, "border-radius": kit.tileRadius, padding: "20px 24px" })}">
<p style="${s({ "font-family": kit.textFont, "font-size": 16, "font-weight": 700, "margin-bottom": 6 })}">${title}</p>
<ul style="${s({ margin: 0, padding: 0, "list-style": "none" })}">${kit.colourTokens.map((tok) => swatch(th, tok)).join("")}</ul></div>`;
  const colour = `<section style="${s({ display: "flex", "flex-direction": "column", gap: 18 })}">
<div style="${s({ display: "flex", "align-items": "baseline", gap: 16 })}">${H2("Colour")}${small(kit.colourRule)}</div>
<div style="${s({ display: "flex", gap: 24 })}">${colourPanel(t, "Light")}${colourPanel(d, "Dark")}</div>
</section>`;

  // --- type
  const typeRows = kit.typeScale
    .map(
      (
        st,
      ) => `<li style="${s({ display: "grid", "grid-template-columns": "260px minmax(0,1fr)", gap: 24, "align-items": "baseline", padding: "14px 0", "border-bottom": `1px solid ${t.hair}` })}">
<span style="${s({ display: "flex", "flex-direction": "column", gap: 2 })}"><span style="${s({ "font-family": kit.textFont, "font-size": 15, "font-weight": 700, color: t.ink })}">${st.name}</span><span style="${s({ "font-family": kit.textFont, "font-size": 13, "font-weight": 500, color: t.ink2 })}">${st.spec}</span></span>
<span style="${st.style}; color: ${t.ink}; white-space: nowrap; overflow: hidden">${st.sample}</span>
</li>`,
    )
    .join("");
  const type = `<section style="${s({ display: "flex", "flex-direction": "column", gap: 12 })}">
<div style="${s({ display: "flex", "align-items": "baseline", gap: 16 })}">${H2("Type")}${small(kit.typeRule)}</div>
<ul style="${s({ margin: 0, padding: 0, "list-style": "none", "border-top": `1px solid ${t.hair}` })}">${typeRows}</ul>
</section>`;

  // --- spacing, radii, elevation
  const spacing = `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${small("Spacing (px)")}
<div style="${s({ display: "flex", "align-items": "flex-end", gap: 14 })}">${kit.spacing.map((v) => `<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 6 })}"><span style="${s({ width: v, height: v, background: kit.spaceFill(t), "border-radius": 2 })}"></span><span style="${s({ "font-family": kit.textFont, "font-size": 13, color: t.ink2, "font-variant-numeric": "tabular-nums" })}">${v}</span></div>`).join("")}</div></div>`;
  const radii = `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${small("Radii (px)")}
<div style="${s({ display: "flex", "align-items": "flex-end", gap: 14 })}">${kit.radii.map(([v, n]) => `<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 6 })}"><span style="${s({ width: 64, height: 64, "border-top-left-radius": v, border: `2px solid ${t.ink}`, "border-right": 0, "border-bottom": 0 })}"></span><span style="${s({ "font-family": kit.textFont, "font-size": 13, color: t.ink2, "text-align": "center" })}">${v === 999 ? "capsule" : v}<br>${n}</span></div>`).join("")}</div></div>`;
  const elevation = `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${small("Elevation")}
<div style="${s({ display: "flex", gap: 18 })}">${kit.elevation.map(([n, sh, bd]) => `<div style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 8 })}"><span style="${s({ width: 96, height: 64, background: t.raised || t.ground, "border-radius": kit.chipRadius + 4, "box-shadow": sh, border: bd || "none" })}"></span><span style="${s({ "font-family": kit.textFont, "font-size": 13, color: t.ink2, "text-align": "center", "max-width": 120 })}">${n}</span></div>`).join("")}</div></div>`;
  const metrics = `<section style="${s({ display: "flex", "flex-direction": "column", gap: 18 })}">
${H2("Spacing, radii, elevation")}
<div style="${s({ display: "flex", gap: 56, "flex-wrap": "wrap", "align-items": "flex-start" })}">${spacing}${radii}${elevation}</div>
</section>`;

  // --- primitives
  const tile = (title, inner, { span = 1, pad = 20, bg = t.ground } = {}) =>
    `<div style="${s({ "grid-column": `span ${span}`, display: "flex", "flex-direction": "column", gap: 12, padding: pad, background: bg, border: `1px solid ${t.hair}`, "border-radius": kit.tileRadius, "min-width": 0, overflow: "hidden" })}"><span style="${s({ padding: pad === 0 ? "16px 20px 0" : 0 })}">${small(title)}</span>${inner}</div>`;
  const prim = kit.primitives;
  const primitives = `<section style="${s({ display: "flex", "flex-direction": "column", gap: 18 })}">
${H2("Primitives")}
<div style="${s({ display: "grid", "grid-template-columns": "repeat(4, minmax(0, 1fr))", gap: 24 })}">
${tile("Button: primary, quiet, pressed", prim.button(t))}
${tile("Field", prim.field(t))}
${tile("Stepper", prim.stepper(t))}
${tile("List row", prim.listRow(t))}
${tile(kit.sheetTitle || "Sheet: the plan, one tap from Today", prim.sheet(t), { span: 2, pad: 0, bg: t.surface })}
${tile("Stat", prim.stat(t))}
${tile("Chart: body weight, 6 Jul – 30 Sept", prim.chart(t))}
${tile(kit.navTitle || "Tab bar", prim.tabbar(t), { span: 2, bg: t.surface })}
${tile(kit.stripTitle || "Session strip, every screen but Today and the workout", prim.strip(t), { span: 2, bg: t.surface })}
${(kit.extraPrimitives || []).map(([title, fn, opts]) => tile(title, fn(t), opts)).join("")}
</div>
</section>`;

  const states = kit.states
    ? `<section style="${s({ display: "flex", "flex-direction": "column", gap: 18 })}">
${H2("States the screens take")}
<div style="${s({ display: "grid", "grid-template-columns": "repeat(4, minmax(0, 1fr))", gap: 24 })}">${kit
        .states(t)
        .map(([title, inner]) => tile(title, inner))
        .join("")}</div>
</section>`
    : "";

  const motion = kit.motionSpec
    ? `<section style="${s({ display: "flex", "flex-direction": "column", gap: 12 })}">${H2("Motion tokens")}
<ul style="${s({ margin: 0, padding: 0, "list-style": "none", display: "grid", "grid-template-columns": "repeat(4, minmax(0, 1fr))", gap: 24 })}">${kit.motionSpec.map(([n, v, note]) => `<li style="${s({ display: "flex", "flex-direction": "column", gap: 4, padding: "14px 0", "border-top": `2px solid ${t.ink}` })}"><span style="${s({ "font-family": kit.textFont, "font-size": 15, "font-weight": 700, color: t.ink })}">${n}</span><span style="${s({ "font-family": kit.textFont, "font-size": 14, "font-weight": 600, color: t.ink, "font-variant-numeric": "tabular-nums" })}">${v}</span><span style="${s({ "font-family": kit.textFont, "font-size": 13, "font-weight": 500, color: t.ink2 })}">${note}</span></li>`).join("")}</ul></section>`
    : "";

  const momentsBlock = kit.moments
    ? `<section style="${s({ display: "flex", "flex-direction": "column", gap: 12 })}">${H2("Four moments, and what reduced motion shows")}
<ul style="${s({ margin: 0, padding: 0, "list-style": "none", display: "grid", "grid-template-columns": "repeat(4, minmax(0, 1fr))", gap: 24 })}">${kit.moments.map(([n, what, timing, reduced]) => `<li style="${s({ display: "flex", "flex-direction": "column", gap: 8, padding: "14px 0", "border-top": `2px solid ${t.ink}` })}"><span style="${s({ "font-family": kit.textFont, "font-size": 16, "font-weight": 700, color: t.ink })}">${n}</span><span style="${s({ "font-family": kit.textFont, "font-size": 14, "font-weight": 500, color: t.ink, "line-height": 1.45 })}">${what}</span><span style="${s({ "font-family": kit.textFont, "font-size": 14, "font-weight": 650, color: t.ink, "line-height": 1.45, "font-variant-numeric": "tabular-nums" })}">${timing}</span><span style="${s({ "font-family": kit.textFont, "font-size": 14, "font-weight": 500, color: t.ink2, "line-height": 1.45 })}">Reduced motion: ${reduced}</span></li>`).join("")}</ul></section>`
    : "";

  return `<div style="${s({ width: SW, "box-sizing": "border-box", padding: 64, background: t.surface, color: t.ink, "font-family": kit.textFont, display: "flex", "flex-direction": "column", gap: 64 })}">
<header style="${s({ display: "flex", "align-items": "flex-end", "justify-content": "space-between", gap: 24 })}"><h1 style="${kit.h1(t)}">${esc(kit.title)}</h1>${kit.wordmark(t, 24)}</header>
<div style="${s({ display: "grid", "grid-template-columns": "560px minmax(0, 1fr)", gap: 48 })}">${identity}${icons}</div>
${colour}
<div style="${s({ display: "grid", "grid-template-columns": "minmax(0, 1.25fr) minmax(0, 1fr)", gap: 48 })}">${type}${metrics}</div>
${primitives}
${states}
${motion}
${momentsBlock}
</div>`;
}
