// FORM — the art is your training. The kit every screen is built from.
//
// The interface is black and white and stays out of the way; every colour on screen is a print made
// from what the account logged (art.mjs). Every screen takes a device — width, height, safe areas —
// and lays itself out from it, so the same code draws 320, 375, 402 and 440 points.
//
// Rules the kit enforces so nothing runs off a screen, on the web now and natively later:
// - a row's text column is `min-width: 0` and wraps; only figures are kept on one line, and they
//   step down to fit (fit()) rather than truncate;
// - titles step down for long names, then wrap to two lines (titleSize());
// - icons carry meaning only beside a figure or a word, and always have an accessible name.
import { s, esc, svg } from "./lib.mjs";
import { glyph, LABELS } from "./icons.mjs";
import { PIG, PAL, markIcon, markSvg } from "./art.mjs";

export const FONTS = {
  href: "https://fonts.googleapis.com/css2?family=Jost:wght@400..800&family=Atkinson+Hyperlegible+Next:wght@200..800&display=swap",
  display: "'Jost', system-ui, sans-serif",
  text: "'Atkinson Hyperlegible Next', system-ui, sans-serif",
};

export const TOKENS = {
  light: {
    name: "Light",
    scheme: "light",
    ground: "#ffffff",
    surface: "#f4f4f5",
    surface2: "#e9e9ec",
    ink: "#16171b",
    ink2: "#5b5d64",
    control: "#85878e",
    hair: "#e6e6e9",
    onInk: "#ffffff",
    onInk2: "#b4b6bd",
    paper: PAL.light.paper,
    paperLabel: PAL.light.label,
    printInk: PAL.light.ink,
    ultra: PIG.ultra,
    onUltra: "#ffffff",
    onUltra2: "#dde1fb",
    ultraT: PIG.ultraT,
    marks: {
      strength: PIG.ultra,
      run: PIG.verm,
      ride: PIG.violet,
      swim: PIG.viri,
      mobility: PIG.rose,
      food: PIG.cad,
      play: PIG.umber,
    },
    lift: PIG.ultra,
    run: PIG.verm,
    ride: PIG.violet,
    swim: PIG.viri,
    mob: PIG.rose,
    food: PIG.cad,
    onFood: PIG.ink,
    float: "0 10px 28px rgba(22, 23, 27, 0.2)",
    scrim: "rgba(22, 23, 27, 0.42)",
  },
  dark: {
    name: "Dark",
    scheme: "dark",
    ground: "#111214",
    surface: "#1b1c20",
    surface2: "#26272c",
    ink: "#edeef0",
    ink2: "#a3a6ae",
    control: "#73767e",
    hair: "#26272c",
    onInk: "#111214",
    onInk2: "#4c4f57",
    paper: PAL.dark.paper,
    paperLabel: PAL.dark.label,
    printInk: PAL.dark.ink,
    ultra: PIG.ultra,
    onUltra: "#ffffff",
    onUltra2: "#dde1fb",
    ultraT: "#27317a",
    marks: {
      strength: "#8796f5",
      run: "#f2704f",
      ride: "#a08cf0",
      swim: "#45b593",
      mobility: "#e07aa3",
      food: PIG.cad,
      play: "#c4925e",
    },
    lift: "#8796f5",
    run: "#f2704f",
    ride: "#a08cf0",
    swim: "#45b593",
    mob: "#e07aa3",
    food: PIG.cad,
    onFood: PIG.ink,
    float: "none",
    scrim: "rgba(0, 0, 0, 0.6)",
  },
};

// ---------- devices ----------
export const DEVICES = {
  d402: { key: "402", W: 402, H: 874, top: 62, bottom: 34 },
  d440: { key: "440", W: 440, H: 956, top: 62, bottom: 34 },
  d375: { key: "375", W: 375, H: 667, top: 20, bottom: 0 },
  d320: { key: "320", W: 320, H: 568, top: 20, bottom: 0 },
  // Android, the most common size (360 × 800 dp): status bar 28, gesture handle 16
  a360: { key: "a360", W: 360, H: 800, top: 28, bottom: 16, android: true },
};
export const D = DEVICES.d402;
export const gut = (dv) => (dv.W < 360 ? 16 : 20);
// The tab bar: 48 pt of targets on a hairline, then only what the home indicator needs: 12 pt above
// it (it is 5 pt tall, 8 pt from the edge) or 6 pt where there is none. 64 or 58 pt in all.
export const navH = (dv) => 4 + 48 + (dv.bottom ? 12 : 6);
export const short = (dv) => dv.H < 800;
export const roomy = (dv) => dv.H >= 860;

export const tn = "font-variant-numeric: tabular-nums lining-nums";
export const clamp = (n) =>
  `display: -webkit-box; -webkit-line-clamp: ${n}; -webkit-box-orient: vertical; overflow: hidden`;

// Figures never truncate: they step down until they fit. Jost 600's tabular digits are 0.614 em,
// its point and comma 0.32 em.
export const em = (str) =>
  [...String(str)].reduce(
    (a, ch) =>
      a +
      (/[0-9]/.test(ch)
        ? 0.614
        : /[.,:]/.test(ch)
          ? 0.32
          : ch === " "
            ? 0.25
            : /[–—-]/.test(ch)
              ? 0.5
              : 0.6),
    0,
  );
export const fit = (str, avail, max = 40, min = 24) =>
  Math.max(min, Math.min(max, Math.floor(avail / em(str))));
// The type ramp's sizes. A figure that has to shrink to fit steps down to the next of them, never
// to a size in between, so a narrow screen shows the same few sizes as a wide one.
export const RAMP = [12, 13, 14, 15, 16, 17, 20, 26, 28, 32, 34, 36, 42, 56];
export const onRamp = (px) => RAMP.filter((r) => r <= px).pop() ?? RAMP[0];
// Jost's en dash is as long as an em dash: ranges inside a figure take Atkinson's.
export const dashes = (str) =>
  String(str).replace(/–/g, `<span style="font-family:${FONTS.text};font-weight:500">–</span>`);
// A title steps down for a long name before it wraps: one line at its size or 4 under, else smaller
// and two lines. Measured as Jost 700 at about 0.52 em a character.
export const titleSize = (name, cw, base, min = 26) => {
  for (const sz of [base, base - 4]) if (name.length * sz * 0.52 <= cw) return sz;
  return Math.max(min, base - 8);
};

export function css(t) {
  return `*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;background:${t.ground}}
body{background:${t.ground}}
button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;-webkit-user-select:none;user-select:none}
a{color:inherit;text-decoration:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
button,a{transition:transform 120ms cubic-bezier(0.23,1,0.32,1)}
button:active,a:active{transform:scale(0.97)}
h1,h2,h3,h4,p,ol,ul,dl,dd,figure{margin:0;padding:0;font:inherit}
li{list-style:none}
input,textarea{font:inherit;color:inherit;caret-color:${t.ink}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
h1.sr{font-size:34px}
.nb{white-space:nowrap}
.wrap{min-width:0;overflow-wrap:anywhere}
::selection{background:${t.ink};color:${t.onInk}}
:focus-visible{outline:3px solid ${t.ink};outline-offset:2px;box-shadow:0 0 0 2px ${t.ground};border-radius:10px}
@media (prefers-reduced-motion: reduce){button:active,a:active{transform:none}}`;
}

export const num = (size, { wt = 600, lh = 1, ls = 0 } = {}) =>
  s({
    "font-family": FONTS.display,
    "font-size": size,
    "font-weight": wt,
    "line-height": lh,
    "letter-spacing": ls ? ls + "em" : undefined,
  }) +
  "; " +
  tn;
export const title = (size, { lh = 1.05 } = {}) =>
  s({
    "font-family": FONTS.display,
    "font-size": size,
    "font-weight": 700,
    "line-height": lh,
    "letter-spacing": "-0.012em",
  });
export const txt = (size, wt = 500, extra = {}) =>
  s({ "font-family": FONTS.text, "font-size": size, "font-weight": wt, ...extra });

// ---------- icons: the destinations are drawn from the first forms; filled is where you are ----------
const F_ = (f) => (f ? ' fill="currentColor"' : "");
const FORM_ICONS = {
  today: (f) =>
    `<circle cx="16" cy="11" r="5"${F_(f)}/><rect x="3.5" y="9" width="7" height="7" rx="0.6"${F_(f)}/><path d="M3 19.5h18"/>`,
  // the programme: three columns of two blocks, as tall as the other destinations
  training: (f) =>
    [3, 9.5, 16]
      .map(
        (x) =>
          `<rect x="${x}" y="5.5" width="5" height="5.5" rx="0.6"${F_(f)}/><rect x="${x}" y="13" width="5" height="5.5" rx="0.6"${F_(f)}/>`,
      )
      .join(""),
  // the bowl with its heap, as tall as the other destinations
  food: (f) =>
    `<path d="M2.5 10.5h19a9.5 9 0 0 1-19 0z"${F_(f)}/><path d="M7 10.5a5 4.6 0 0 1 10 0"${F_(f)}/>`,
  progress: (f) =>
    `<rect x="4" y="4" width="7" height="7" rx="0.6"${F_(f)}/><circle cx="16.5" cy="7.5" r="3.5"${F_(f)}/><circle cx="7.5" cy="16.5" r="3.5"${F_(f)}/><rect x="13" y="13" width="7" height="7" rx="0.6"${F_(f)}/>`,
  profile: (f) =>
    `<circle cx="12" cy="8" r="4"${F_(f)}/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0z"${F_(f)}/>`,
  coach: () => `<path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z"/>`,
  wait: () => `<path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5"/>`,
  warn: () =>
    `<path d="M12 4l9 16H3z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r="1" fill="currentColor" stroke="none"/>`,
};
export function icon(name, size = 22, { filled = false, ...extra } = {}) {
  if (FORM_ICONS[name]) return svg(FORM_ICONS[name](filled), { size, sw: 2, ...extra });
  return glyph(name, { size, ...extra });
}
// An icon that carries meaning: drawn with its accessible name.
export const named = (name, size = 18, label = LABELS[name]) =>
  `<span role="img" aria-label="${esc(label)}" style="display:inline-grid;flex-shrink:0">${icon(name, size)}</span>`;
export { LABELS };

// A sport as its form, in the theme's pigment for marks on the page.
const SPORT = {
  lift: "strength",
  strength: "strength",
  run: "run",
  ride: "ride",
  swim: "swim",
  mobility: "mobility",
  food: "food",
};
export function mark(t, sport, size = 18, opts = {}) {
  const k = SPORT[sport] || sport;
  return markIcon(k, size, { col: t.marks[k] || undefined, ink: t.ink, paper: t.ground, ...opts });
}

// ---------- buttons: ink, tonal, outline, text. Corners 14 ----------
export function BTN(t, kind, { h = 56, w = null } = {}) {
  const base = {
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    gap: 8,
    height: h,
    padding: "0 20px",
    "border-radius": 14,
    "font-family": FONTS.text,
    "font-size": h >= 52 ? 17 : 15,
    "font-weight": 700,
    "white-space": "nowrap",
    "flex-shrink": 0,
  };
  const k = {
    primary: { background: t.ink, color: t.onInk },
    tonal: { background: t.surface, color: t.ink },
    waiting: { background: t.surface, color: t.ink2 },
    outline: { background: "transparent", color: t.ink, border: `1.5px solid ${t.control}` },
    text: { background: "transparent", color: t.ink, padding: "0 10px" },
    // destructive: an ink outline, 2 pt, its glyph leading; until confirmed, the outline is grey
    danger: { background: "transparent", color: t.ink, border: `2px solid ${t.ink}` },
    dangerWait: { background: "transparent", color: t.ink2, border: `2px solid ${t.control}` },
  }[kind];
  return s({ ...base, ...k, ...(w ? { width: w, padding: 0 } : {}) });
}
// A round control: steppers and small actions. 44 pt, surface, ink glyph.
export const roundBtn = (
  t,
  ic,
  aria,
  { size = 44, fill = t.surface, col = t.ink, glyph = 20 } = {},
) =>
  `<button type="button" aria-label="${esc(aria)}" style="${s({ width: size, height: size, "border-radius": 9999, background: fill, color: col, display: "grid", "place-items": "center", "flex-shrink": 0 })}">${icon(ic, glyph)}</button>`;

// ---------- identity ----------
export function wordmark(t, size = 24) {
  return `<span role="img" aria-label="Overload" style="${s({ display: "inline-flex", "align-items": "center", gap: Math.round(size * 0.35) })}">${markSvg(Math.round(size * 1.3), { ink: t.ink })}<span aria-hidden="true" style="${title(size, { lh: 1 })}; color: ${t.ink}">Overload</span></span>`;
}
export function appIcon(t, size = 96) {
  const light = t.scheme === "light";
  return `<div style="${s({ width: size, height: size, "border-radius": size * 0.225, overflow: "hidden", background: light ? PIG.paper : "#16171b", border: light ? `1px solid ${t.hair}` : 0, display: "grid", "place-items": "center", "flex-shrink": 0 })}">${markSvg(Math.round(size * 0.72), { ink: light ? PIG.ink : "#f2eee5" })}</div>`;
}

// ---------- shell ----------
const NAVS = [
  ["today", "Today"],
  ["training", "Training"],
  ["food", "Food"],
  ["progress", "Progress"],
  ["profile", "Profile"],
];
export const LINKS = { light: {}, dark: {} }; // filled by build.mjs: destination -> board file
export function navbar(t, active, { nested = false, dv = D, pos = "absolute" } = {}) {
  const links = LINKS[t.scheme] || {},
    NB = navH(dv),
    lab = dv.W < 360 ? 12 : 13;
  const items = NAVS.map(([key, label]) => {
    const on = key === active;
    return `<a href="${links[key] || "#"}" ${on ? `aria-current="${nested ? "true" : "page"}"` : ""} style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", "justify-content": "center", gap: 3, height: 44, "min-width": 0, color: on ? t.ink : t.ink2 })}">${icon(key, 24, { filled: on })}<span class="nb" style="${txt(lab, on ? 700 : 600, { "line-height": 1 })}">${label}</span></a>`;
  }).join("");
  return `<nav aria-label="Destinations" style="${s({ position: pos, left: 0, right: 0, bottom: 0, height: NB, padding: `2px 6px ${NB - 46}px`, display: "grid", "grid-template-columns": "repeat(5, minmax(0, 1fr))", background: t.ground, "border-top": `1px solid ${t.hair}`, "z-index": 3 })}">${items}</nav>`;
}
// The rest timer as a pill: a ring that empties and the time. One tap opens +30 s and Stop. It sits
// in the header of the workout and of logging; elsewhere the session strip carries it.
export function restRing(t, frac = 0.74, size = 18, { col = t.ink, track = t.ink } = {}) {
  // a dial: its outline, and the rest still to run as a wedge from twelve o'clock, emptying clockwise
  const r = 6.2,
    a = Math.PI * 2 * Math.min(0.999, frac),
    x = 9 + r * Math.sin(a),
    y = 9 - r * Math.cos(a);
  const wedge =
    frac >= 0.999
      ? `<circle cx="9" cy="9" r="${r}" fill="${col}"/>`
      : `<path d="M9 9V${(9 - r).toFixed(2)}A${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z" fill="${col}"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 18 18" aria-hidden="true" style="display:block;flex-shrink:0"><circle cx="9" cy="9" r="8" fill="none" stroke="${track}" stroke-width="1.6"/>${wedge}</svg>`;
}
export function restPill(
  t,
  {
    time = "2:14",
    frac = 0.74,
    aria = "Rest, 2 minutes 14 seconds left. Add 30 seconds or stop",
    go = false,
    timeHtml = null,
    ringHtml = null,
  } = {},
) {
  // the pill is 36 pt to see and 44 to touch; a pill whose time changes on screen is named by the
  // time it shows
  const live = !!ringHtml;
  return `<button type="button" aria-haspopup="dialog"${live ? "" : ` aria-label="${aria}"`} style="${s({ position: "relative", display: "flex", "align-items": "center", height: 44, "flex-shrink": 0 })}">${live ? `<span class="sr">Rest,</span>` : ""}<span style="${s({ display: "flex", "align-items": "center", gap: 7, height: 36, padding: "0 12px 0 9px", "border-radius": 18, background: go ? t.ink : t.surface, color: go ? t.onInk : t.ink })}">${go ? icon("rest", 18) : ringHtml || restRing(t, frac)}<span role="timer" style="${num(17)}">${timeHtml || time}</span></span>${live ? `<span class="sr">left. Add 30 seconds or stop</span>` : ""}</button>`;
}
export const stripH = 52;
export function strip(
  t,
  { href = "#", dv = D, bottom = null, name = "Upper A", time = "2:14" } = {},
) {
  const G = gut(dv);
  return `<aside aria-label="Workout in progress" style="${s({ position: "absolute", left: G, right: G, bottom: bottom ?? navH(dv) + 8, height: stripH, display: "flex", "align-items": "center", gap: 10, padding: "0 4px 0 14px", background: t.ink, color: t.onInk, "border-radius": 16, "box-shadow": t.float, "z-index": 2 })}">
<span style="display:grid">${markIcon("strength", 16, { col: t.scheme === "dark" ? PIG.ultra : t.marks.strength, paper: t.ink })}</span><span class="wrap" style="${txt(16, 700, { flex: "1 1 auto", ...{ "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" } })}">${name}</span>
<span style="${s({ display: "flex", "align-items": "center", gap: 6, "flex-shrink": 0 })}">${restRing(t, 0.74, 16, { col: t.onInk, track: t.onInk })}<span role="timer" aria-label="Rest, 2 minutes 14 seconds left" style="${num(17)}">${time}</span></span>
<a href="${href}" style="${s({ display: "flex", "align-items": "center", height: 44, padding: "0 14px", "border-radius": 12, background: t.onInk, color: t.ink, "flex-shrink": 0 })}; ${txt(15, 700)}">Resume</a>
</aside>`;
}
export function root(t, inner, { label, dv = D, height = null } = {}) {
  // the page is the ground (body, in css()), so the screen's own box carries no fill
  return `<div style="${s({ position: "relative", width: dv.W, height: height === "auto" ? undefined : height || dv.H, overflow: height === "auto" ? undefined : "hidden", color: t.ink, "font-family": FONTS.text, "font-size": 16, "line-height": 1.4, "color-scheme": t.scheme, "-webkit-font-smoothing": "antialiased" })}"><h1 class="sr">${esc(label)}</h1>${inner}</div>`;
}
export const rgba0 = (hex) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0)`;
// the soft edge where a list kept at its end passes under what is above it
export const fadeFrom = (t, h = 20) =>
  `<span aria-hidden="true" style="${s({ position: "absolute", left: 0, right: 0, top: 0, height: h, background: `linear-gradient(to top, ${rgba0(t.ground)}, ${t.ground})`, "pointer-events": "none", "z-index": 1 })}"></span>`;
export const fadeTo = (t, h = 24) =>
  `<div aria-hidden="true" style="${s({ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: `linear-gradient(to bottom, ${rgba0(t.ground)}, ${t.ground})`, "pointer-events": "none" })}"></div>`;
// The scrolling body of a screen. It stops above whatever is pinned below it and fades under it.
export function screenMain(
  t,
  inner,
  { dv = D, bottom = null, flex = false, whole = false, fade = true, top = null } = {},
) {
  const G = gut(dv);
  if (whole)
    return `<main style="${s({ padding: `${top ?? dv.top}px ${G}px 24px`, display: flex ? "flex" : undefined, "flex-direction": flex ? "column" : undefined })}">${inner}</main>`;
  return `<main style="${s({ position: "absolute", top: top ?? dv.top, left: 0, right: 0, bottom: bottom ?? navH(dv), overflow: "hidden", padding: `0 ${G}px`, display: flex ? "flex" : undefined, "flex-direction": flex ? "column" : undefined })}">${inner}${fade ? fadeTo(t, fade === true ? 24 : fade) : ""}</main>`;
}
// A whole-scroll board: the screen in normal flow, the tab bar at its foot, and where the first
// screen ends marked by ticks in the margins, clear of the content.
export const foldTicks = (t, dv, top) => {
  const tick = (side) =>
    `<span style="${s({ position: "absolute", [side]: 0, top: -1, width: gut(dv) - 6, "border-top": `2px dashed ${t.ink2}` })}"></span>`;
  return `<div aria-hidden="true" style="${s({ position: "absolute", left: 0, right: 0, top, "pointer-events": "none", "z-index": 4 })}">${tick("left")}${tick("right")}</div>`;
};
export function wholeBoard(t, inner, dv, active, label, { nested = false, foot = "" } = {}) {
  const NB = navH(dv);
  const body = `${screenMain(t, inner, { dv, whole: true, flex: true })}${foot}<div style="position:relative;height:${NB}px">${navbar(t, active, { nested, dv })}</div>${foldTicks(t, dv, dv.H - NB)}`;
  return root(t, body, { label, dv, height: "auto" });
}

// ---------- headers ----------
// A top-level screen: its title and at most one action, on one row. Nothing under it unless the
// screen needs one fact the title cannot say.
export function topHeader(t, dv, name, action = "", { fact = null } = {}) {
  return `<header style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 12, "min-height": 52, "padding-top": 4 })}"><div style="min-width:0"><h2 style="${title(dv.W < 360 ? 32 : 36, { lh: 1 })}">${name}</h2>${fact ? `<p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 4px; ${tn}">${fact}</p>` : ""}</div>${action}</header>`;
}
// Back links name where they go; build.mjs maps each name to its board, so flows can be walked.
export const BACKS = { light: {}, dark: {} };
export const backHref = (t, label, href = "#") =>
  href !== "#" ? href : (BACKS[t.scheme] || {})[label] || BACKS.light[label] || "#";
export const backLink = (t, label, href = "#") =>
  `<a href="${backHref(t, label, href)}" style="${s({ display: "flex", "align-items": "center", gap: 2, height: 44, padding: "0 8px 0 4px", "flex-shrink": 1, "min-width": 0 })}; ${txt(17, 700)}">${icon("chevronLeft", 22)}<span class="nb" style="overflow:hidden;text-overflow:ellipsis">${label}</span></a>`;
export const iconBtn = (t, name, aria, extra = {}) =>
  `<button type="button" aria-label="${esc(aria)}" aria-haspopup="dialog" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "flex-shrink": 0, ...extra })}">${icon(name, 24)}</button>`;
// A nested screen: back names where it goes; the right side holds at most the rest pill and More.
export const nestedHeader = (t, back, right = "", href = "#") =>
  `<header style="${s({ display: "flex", "align-items": "center", gap: 6, height: 48, margin: "0 -12px 0 -12px", "flex-shrink": 0 })}">${backLink(t, back, href)}<span style="flex:1 1 auto"></span>${right}</header>`;

// ---------- tabs: words on a hairline; where you are is ink, underlined ----------
// Tabs, two kinds. Sections that are pages of their own (Progress) are links in a nav, the one
// you are on marked aria-current; they scroll sideways, every label whole: the strip starts at the
// first section, or ends at the last when the one you are on would not show, and a fade says there
// is more. Panels of one screen (Log, Technique, History) are a tablist of buttons over a tabpanel.
export function tabs(
  t,
  items,
  active = 0,
  { dv = D, id = "tabs", scroll = false, panel = "panel" } = {},
) {
  const G = gut(dv);
  const bar = (on) =>
    on
      ? `<span aria-hidden="true" style="${s({ position: "absolute", left: scroll ? 0 : 10, right: scroll ? 0 : 10, bottom: -1, height: 2.5, background: t.ink, "border-radius": 2 })};"></span>`
      : "";
  if (!scroll) {
    const cells = items
      .map(
        (x, i) =>
          `<button type="button" role="tab" id="${panel}-tab-${i}" aria-selected="${i === active}" aria-controls="${panel}" style="${s({ position: "relative", display: "grid", "place-items": "center", height: 44, padding: "0 4px", color: i === active ? t.ink : t.ink2, "white-space": "nowrap", flex: "1 1 0", "min-width": 0 })}; ${txt(15, i === active ? 700 : 600)}">${x.label || x}${bar(i === active)}</button>`,
      )
      .join("");
    return `<div role="tablist" aria-label="${id}" style="${s({ display: "flex", "border-bottom": `1px solid ${t.hair}` })}">${cells}</div>`;
  }
  const IW = 88,
    view = dv.W - 2 * G,
    fit = Math.max(1, Math.floor(view / IW)),
    atEnd = active >= fit && items.length > fit,
    spacer = atEnd ? (items.length - fit) * IW + dv.W - 2 * G - items.length * IW : 0;
  const cells = items
    .map((x, i) => {
      const label = x.label || x,
        on = i === active;
      return `<li style="flex:0 0 ${IW}px"><a href="${x.href || "#"}"${on ? ' aria-current="page"' : ""} style="${s({ position: "relative", display: "inline-flex", "align-items": "center", height: 44, color: on ? t.ink : t.ink2, "white-space": "nowrap" })}; ${txt(15, on ? 700 : 600)}">${label}${bar(on)}</a></li>`;
    })
    .join("");
  // the fade is solid over the gutter and any part of a label that would be cut, then softens
  const fade = (side) => {
    // on the right it hides whatever of the next label would be cut, then softens over 16 pt;
    // on the left it softens across the gutter alone, clear of the first whole label
    const solid = side === "left" ? 0 : G + Math.max(0, view - fit * IW),
      soft = side === "left" ? G - 2 : 16;
    return `<span aria-hidden="true" style="${s({ position: "absolute", top: 0, bottom: 1, [side]: 0, width: solid + soft, background: `linear-gradient(to ${side === "left" ? "right" : "left"}, ${t.ground} ${Math.round((solid / (solid + soft)) * 100)}%, transparent)`, "pointer-events": "none" })}"></span>`;
  };
  return `<nav aria-label="${id}" style="${s({ position: "relative", margin: `0 -${G}px`, "border-bottom": `1px solid ${t.hair}` })}"><div style="${s({ "overflow-x": "auto", "scrollbar-width": "none", direction: atEnd ? "rtl" : undefined })}"><ul style="${s({ display: "flex", width: "max-content", direction: "ltr", padding: `0 ${G + Math.max(0, spacer)}px 0 ${G}px` })}">${cells}</ul></div>${atEnd ? fade("left") : fade("right")}</nav>`;
}

// ---------- rows and sections ----------
export const caption = (t, text, { mt = 16, id = null } = {}) =>
  `<h3${id ? ` id="${id}"` : ""} style="${txt(13, 700, { color: t.ink2, "letter-spacing": "0.01em" })}; margin: ${mt}px 0 2px">${text}</h3>`;
// A list row: a lead (mark or icon), a text column that wraps, and a trailing figure or action.
export function row(
  t,
  {
    lead = "",
    title: tt,
    sub = "",
    trail = "",
    href = "#",
    minH = 56,
    strike = false,
    faded = false,
    bold = 700,
    sz = 16,
    button = false,
    divider = true,
    extra = "",
  } = {},
) {
  const tag = button ? "button" : "a";
  return `<li><${tag}${button ? ' type="button"' : ` href="${href}"`} style="${s({ display: "grid", "grid-template-columns": `${lead ? "auto " : ""}minmax(0,1fr) auto`, gap: "0 12px", "align-items": "center", "min-height": minH, padding: "8px 0", width: "100%", "text-align": "left", "border-bottom": divider ? `1px solid ${t.hair}` : 0 })}">${lead ? `<span style="display:grid;align-self:center">${lead}</span>` : ""}<span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span class="wrap" style="${txt(sz, bold, { "line-height": 1.25, color: faded ? t.ink2 : t.ink, "text-decoration": strike ? "line-through" : undefined })}">${tt}</span>${sub ? `<span class="wrap" style="${txt(14, 500, { color: t.ink2, "line-height": 1.35 })}; ${tn}">${sub}</span>` : ""}${extra}</span>${trail ? `<span style="${s({ display: "flex", "align-items": "center", gap: 8, "justify-self": "end" })}">${trail}</span>` : ""}</${tag}></li>`;
}
export const chev = (t) =>
  `<span style="${s({ display: "grid", "place-items": "center", width: 24, height: 44, color: t.ink2, "margin-right": -6 })}">${icon("chevronRight", 20)}</span>`;
export const figure = (t, n, unit = "", size = 22) =>
  `<span class="nb" style="${s({ display: "inline-flex", "align-items": "baseline", gap: 3 })}"><span style="${num(size)}">${dashes(n)}</span>${unit ? `<span style="${txt(13, 600, { color: t.ink2 })}">${unit}</span>` : ""}</span>`;

// The prints sit in a figure with no frame of their own.
export const printFrame = (inner, { mt = 0, label = null } = {}) =>
  `<figure style="${s({ margin: `${mt}px 0 0`, "line-height": 0 })}"${label ? ` aria-label="${esc(label)}"` : ""}>${inner}</figure>`;

// ---------- the coach's words ----------
// One block for everything the coach (an LLM) writes, and for the app's own check-in advice under
// its own name: attributed, quiet, never on the art, never in colour, at most one per screen. It
// shows at most two lines; past that, More opens the whole text in a sheet. The clamp is the
// browser's (or the platform's line limit), so it holds at any text size.
export function coachNote(
  t,
  {
    context = null,
    title: head = null,
    text,
    dv = D,
    more = null,
    tone = "note",
    action = null,
    who = "Coach",
    role = null,
    size = 16,
    lines = 2,
  } = {},
) {
  const G = gut(dv),
    cpl = Math.floor((dv.W - 2 * G - 28) / (size * 0.54));
  const long = more !== false && text.length > cpl * lines;
  const gl = { note: "coach", check: "info", planning: "wait", failed: "warn" }[tone] || "coach";
  return `<aside aria-label="${who === "Coach" ? "From the coach" : who}"${role ? ` role="${role}"` : ""} style="${s({ padding: "12px 14px", "border-radius": 14, background: t.surface })}">
<p style="${s({ display: "flex", "align-items": "center", gap: 6, "flex-wrap": "wrap" })}; ${txt(13, 700)}"><span style="${s({ display: "grid", color: t.ink })}">${icon(gl, 16)}</span>${who}${context ? `<span style="${s({ "font-weight": 500, color: t.ink2 })}">· ${context}</span>` : ""}</p>
${head ? `<p style="${txt(17, 700)}; margin-top: 6px; ${tn}">${head}</p>` : ""}
<p style="${txt(size, 500, { "line-height": 1.45 })}; margin-top: ${head ? 2 : 4}px; ${tn}${long ? `; ${clamp(lines)}` : ""}">${text}</p>
${long ? `<button type="button" aria-haspopup="dialog" style="${s({ height: 44, "min-width": 44, padding: "0 6px", margin: "-4px 0 -10px -6px" })}; ${txt(15, 700)}">More</button>` : ""}${action ? `<div style="margin-top:10px">${action}</div>` : ""}
</aside>`;
}

// ---------- sheets ----------
export function sheet(t, inner, { dv = D, top = null, id = "sheet-title", height = null } = {}) {
  const G = gut(dv);
  return `<div aria-hidden="true" style="${s({ position: "absolute", inset: 0, "z-index": 10, background: t.scrim })}"></div><div role="dialog" aria-modal="true" aria-labelledby="${id}" style="${s({ position: "absolute", left: 0, right: 0, bottom: 0, "z-index": 11, "max-height": `calc(100% - ${top ?? dv.top + 12}px)`, height: height ?? undefined, "overflow-y": "auto", "overscroll-behavior": "contain", background: t.ground, "border-radius": "24px 24px 0 0", padding: `8px ${G}px ${dv.bottom + 16}px`, "box-shadow": "none" })}"><span aria-hidden="true" style="${s({ display: "block", width: 36, height: 5, "border-radius": 9999, background: t.surface2, margin: "0 auto 8px" })}"></span>${inner}</div>`;
}

// ---------- input: the stepper ----------
// A figure with its unit under it and two round buttons. Suggested (ink 2, dotted) until touched;
// then ink, because it is what Save records. Empty shows an en dash and what the target is. The
// figure is itself a button: a tap types it, and an empty RIR's dash takes its target. Where the
// column is too narrow for − and + side by side, they stand over and under the figure (+ above,
// − below), so the three columns survive on the narrowest phone. The unit takes one line and the
// hint a second, under it, in every column, so the buttons line up whatever the hint.
// ⓘ beside a label: 44 wide and 32 tall, so its target meets no other (the figure above it, the
// buttons below it, with the gaps the stepper keeps)
export const infoTip = (t, label, { glyph = 15 } = {}) =>
  `<button type="button" aria-haspopup="dialog" aria-label="${esc(label)}" style="${s({ display: "inline-grid", "place-items": "center", width: 44, height: 32, margin: "-8px -14px -8px -12px", color: t.ink2, "flex-shrink": 0 })}">${icon("info", glyph)}</button>`;
export function stepFigure(
  t,
  {
    value,
    unit,
    size = 42,
    state = "suggested",
    dec,
    inc,
    hint = null,
    tag = null,
    w = null,
    swapCls = null,
    swapTo = null,
    swapState = "suggested",
    bgap = 8,
    bsize = 44,
    vertical = false,
    name = null,
    lines = 2,
  } = {},
) {
  const fig = (v, st) =>
    st === "empty"
      ? `<span style="${num(size, { lh: 1.1 })}; color: ${t.control}">–</span>`
      : st === "suggested"
        ? `<span style="${num(size, { lh: 1.1 })}; color: ${t.ink2}; text-decoration: underline dotted 2px; text-underline-offset: 6px">${v}</span>`
        : `<span style="${num(size, { lh: 1.1 })}; color: ${t.ink}">${v}</span>`;
  // a figure that changes on screen (the moment a set is saved) is read from what shows: each
  // layer names itself, and the one hidden is out of the tree
  const shown = swapCls
    ? `<span style="display:inline-grid"><span class="${swapCls[0]}" style="grid-area:1/1">${fig(value, state === "empty" ? "touched" : state)}<span class="sr"> ${unit}</span></span><span class="${swapCls[1]}" style="grid-area:1/1">${fig(swapTo ?? value, swapState)}<span class="sr">${swapState === "empty" ? ` ${unit} not set` : ` ${unit}, suggested`}</span></span></span>`
    : fig(value, state);
  const label =
    name ??
    (state === "empty"
      ? `${unit} not set${hint ? `, ${hint}` : ""}. Use the target`
      : `${value} ${unit}${state === "suggested" ? ", suggested" : ""}. Type ${unit}`);
  const figure = `<button type="button"${swapCls ? "" : ` aria-label="${esc(label)}"`} style="${s({ display: "flex", "align-items": "center", "justify-content": "center", "min-height": 44, "min-width": 44, "white-space": "nowrap" })}">${shown}</button>`;
  const units = `<span style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", "min-height": lines * 17 })}; ${txt(13, 600, { color: t.ink2, "line-height": 1.3 })}"><span class="nb" style="${s({ display: "flex", "align-items": "center", gap: 4 })}">${unit}${tag || ""}</span>${hint ? `<span class="nb" style="${s({ "font-weight": 500 })}">${hint}</span>` : ""}</span>`;
  const minus = roundBtn(t, "minus", dec, { size: bsize });
  const plus = roundBtn(t, "plus", inc, { size: bsize });
  // the label's ⓘ keeps 8 clear of the figure and of the buttons
  const inner = vertical
    ? `${plus}${figure}${minus}<span style="margin-top:4px">${units}</span>`
    : `${figure}<span style="margin-top:2px">${units}</span><span style="${s({ display: "flex", gap: bgap, "margin-top": 2 })}">${minus}${plus}</span>`;
  return `<div role="group" aria-label="${esc(unit)}" style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: vertical ? 4 : 6, "min-width": 0, width: w ?? undefined })}">${inner}</div>`;
}
// A choice drawn as glyphs: two or three toggles, each an icon with a short word under it.
export function iconChoice(t, items, chosen = 0, { label = "Where", size = 26 } = {}) {
  return `<div role="radiogroup" aria-label="${esc(label)}" style="${s({ display: "grid", "grid-template-columns": `repeat(${items.length}, minmax(0, 1fr))`, gap: 8 })}">${items
    .map(
      ([ic, word], i) =>
        `<button type="button" role="radio" aria-checked="${i === chosen}" style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", "justify-content": "center", gap: 6, height: 76, "border-radius": 14, background: i === chosen ? t.ink : t.surface, color: i === chosen ? t.onInk : t.ink })}"><span style="display:grid">${icon(ic, size)}</span><span style="${txt(14, 700)}">${word}</span></button>`,
    )
    .join("")}</div>`;
}
// A switch: ink when on.
export const toggle = (t, on, label) =>
  `<button type="button" role="switch" aria-checked="${on}" aria-label="${esc(label)}" style="${s({ display: "grid", "align-items": "center", width: 51, height: 44, "flex-shrink": 0 })}"><span style="${s({ position: "relative", display: "block", width: 51, height: 31, "border-radius": 16, background: on ? t.ink : t.surface2 })}"><span style="${s({ position: "absolute", top: 3, left: on ? 23 : 3, width: 25, height: 25, "border-radius": 9999, background: on ? t.onInk : t.ground, "box-shadow": on ? "none" : `0 0 0 1px ${t.hair}` })}"></span></span></button>`;
// A row's stepper: the label (and its hint) left; −, the value in a fixed 120-pt column, + right,
// so the buttons line up row under row whatever the figure.
export const rowStepper = (t, { label, value, unit = "", dec, inc, hint = "", size = 26 }) =>
  `<div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 12, padding: "10px 0", "border-bottom": `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span class="wrap" style="${txt(16, 700)}">${label}</span>${hint ? `<span class="wrap" style="${txt(13, 500, { color: t.ink2 })}; ${tn}">${hint}</span>` : ""}</span><span style="${s({ display: "flex", "align-items": "center", "flex-shrink": 0 })}">${roundBtn(t, "minus", dec)}<output style="${s({ display: "flex", "align-items": "baseline", "justify-content": "center", gap: 3, width: 120 })}"><span style="${num(size)}">${value}</span>${unit ? `<span style="${txt(13, 600, { color: t.ink2 })}">${unit}</span>` : ""}</output>${roundBtn(t, "plus", inc)}</span></div>`;
// A field: label above, 52 pt, a control-grey border.
export const field = (
  t,
  label,
  {
    value = "",
    placeholder = "",
    optional = false,
    help = null,
    type = "text",
    rows = 0,
    suffix = null,
    mode = null,
  } = {},
) =>
  `<label style="${s({ display: "flex", "flex-direction": "column", gap: 6 })}"><span style="${s({ display: "flex", "justify-content": "space-between" })}"><span style="${txt(14, 700)}">${label}</span>${optional ? `<span style="${txt(13, 500, { color: t.ink2 })}">Optional</span>` : ""}</span>${
    rows
      ? `<textarea rows="${rows}" placeholder="${esc(placeholder)}" style="${s({ "min-height": 24 * rows + 26, padding: "12px 14px", "border-radius": 14, border: `1.5px solid ${t.control}`, background: t.ground, color: t.ink, "font-family": FONTS.text, "font-size": 16, resize: "none" })}">${esc(value)}</textarea>`
      : `<span style="${s({ position: "relative", display: "block" })}"><input type="${type}"${mode ? ` inputmode="${mode}"` : ""} value="${esc(value)}" placeholder="${esc(placeholder)}" style="${s({ width: "100%", height: 52, padding: `0 ${suffix ? 44 : 16}px 0 16px`, "border-radius": 14, border: `1.5px solid ${t.control}`, background: t.ground, color: t.ink, "font-family": FONTS.text, "font-size": 16 })}">${suffix ? `<span style="${s({ position: "absolute", right: 16, top: 0, bottom: 0, display: "flex", "align-items": "center", color: t.ink2 })}; ${txt(15, 600)}">${suffix}</span>` : ""}</span>`
  }${help ? `<span style="${txt(13, 500, { color: t.ink2 })}">${help}</span>` : ""}</label>`;

// ---------- row marks: a sport's form, where a list mixes sports ----------
// A row is led by a mark only where the mark says something the words do not: which sport, in a list
// that mixes them (History, a day, Friends, a calendar's legend). An exercise row carries none: its
// sets are in its prescription and in the print. Marks carry their item's state (thinned with an
// edge, full, dashed). A list with marks gives them one column, and its names one edge.
export const MARK_COL = 20; // the mark column; names start 12 after it
import { form as artForm } from "./art.mjs";
const tintOf = (t, k) =>
  t.scheme === "dark"
    ? PAL.dark.tint[k]
    : {
        strength: PIG.ultraT,
        run: PIG.vermT,
        ride: PIG.violetT,
        swim: PIG.viriT,
        mobility: PIG.roseT,
        food: PIG.cadT,
        play: PIG.umberT,
      }[k];
export function colMark(
  t,
  n,
  done = 0,
  { skipped = false, warm = 0, unit = 7, gap = 2, label = null } = {},
) {
  const k = "strength",
    C = t.marks[k],
    T = tintOf(t, k);
  const h = n * unit + (n - 1) * gap;
  let out = "";
  for (let i = 0; i < n; i++) {
    const y = h - (i + 1) * unit - i * gap;
    const state = skipped ? "skipped" : i < warm ? "warm" : i < done ? "done" : "todo";
    out +=
      state === "done"
        ? `<rect x="0" y="${y}" width="${unit}" height="${unit}" fill="${C}"/>`
        : state === "warm"
          ? `<rect x="0" y="${y}" width="${unit}" height="${unit}" fill="${t.scheme === "dark" ? "#4a463e" : "#c9c4b8"}"/>`
          : state === "skipped"
            ? `<rect x="0.6" y="${y + 0.6}" width="${unit - 1.2}" height="${unit - 1.2}" fill="none" stroke="${C}" stroke-width="1.2" stroke-dasharray="2 1.4"/>`
            : `<rect x="0.6" y="${y + 0.6}" width="${unit - 1.2}" height="${unit - 1.2}" fill="${T}" stroke="${C}" stroke-width="1.2"/>`;
  }
  return `<svg width="${unit}" height="${h}" viewBox="0 0 ${unit} ${h}" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'} style="display:block;flex-shrink:0">${out}</svg>`;
}
// A sport's form as a row mark, in its state.
export function stateMark(
  t,
  sport,
  size = 16,
  { state = "done", segments = 0, done = 0, label = null } = {},
) {
  const k = sport === "lift" ? "strength" : sport;
  const pad = 1;
  const svgInner = artForm(k, 0, 0, size, size, {
    state,
    segments,
    done,
    col: t.marks[k],
    tint: tintOf(t, k),
    ink: t.ink,
    paper: t.ground,
  });
  return `<svg width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${size + 2 * pad} ${size + 2 * pad}" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'} style="display:block;flex-shrink:0;overflow:visible">${svgInner}</svg>`;
}
// The mark column: the mark centred in it, so every name in a marked list starts at one edge.
export const markCell = (inner) =>
  `<span style="${s({ width: MARK_COL, display: "flex", "justify-content": "center", "align-items": "center", "flex-shrink": 0 })}">${inner}</span>`;
// Equipment as a glyph in a meta line, with its name for screen readers.
export const equip = (t, glyphName, label, size = 16) =>
  `<span role="img" aria-label="${esc(label)}" style="${s({ display: "inline-grid", color: t.ink2, "vertical-align": "-3px" })}">${icon(glyphName, size)}</span>`;
// A meta line of facts, each a glyph and a figure: "[dumbbell] 4 × 3–5 @ 2 RIR · [rest] 3–4 min".
export const metaLine = (t, parts, { size = 15, mt = 4 } = {}) =>
  `<p style="${s({ display: "flex", "align-items": "center", "flex-wrap": "wrap", gap: "2px 12px", "margin-top": mt, color: t.ink2 })}; ${txt(size, 500)}; ${tn}">${parts
    .filter(Boolean)
    .map(
      (p) =>
        `<span style="${s({ display: "inline-flex", "align-items": "center", gap: 5, "white-space": "nowrap" })}">${p}</span>`,
    )
    .join("")}</p>`;
// The superset bracket: a hairline in ink joining the pair, in the left gutter, 8 pt from the edge,
// wherever the pair is listed.
// A superset's group reaches 12 pt into the gutter and pads it back, so its bracket stands in the
// gutter while staying inside the group's own box.
export const SS_GROUP = "position:relative; margin-left:-12px; padding-left:12px";
export const supersetBracket = (t, label = "Superset") =>
  `<span role="img" aria-label="${esc(label)}" style="${s({ position: "absolute", left: 0, top: 14, bottom: 14, width: 6, "border-left": `2px solid ${t.ink}`, "border-top": `2px solid ${t.ink}`, "border-bottom": `2px solid ${t.ink}` })}"></span>`;
