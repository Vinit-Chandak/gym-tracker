// FORM — the art is your training. The interface is black and white and stays out of the way;
// every colour on screen is a print made from what the account has logged (see art.mjs for the
// grammar). Nothing is drawn as a sequence: the parts of a day, the exercises of a workout and the
// meals are separate rows, in any order. Rest is one quiet row.
//
// Every screen takes a device: width, height and safe areas. Layout follows from it — gutters,
// print heights, whether steppers sit side by side, whether RIR takes one row or two, whether
// detail folds behind a tap — so the same code lays itself out at 320, 375, 402 and 440 points.
// Logging docks the entry above the tab bar and lets the record above it scroll, so no amount of
// history, no long name and no wide figure can push Save or RIR off the screen.
import { s, esc, svg } from "./lib.mjs";
import { glyph } from "./icons.mjs";
import {
  today as T,
  log as L,
  progress as P,
  food as F,
  workout as WK,
  copy as C,
} from "./data.mjs";
import {
  PIG,
  PAL,
  dayPrint,
  sessionPrint,
  quarterPrint,
  bowlPrint,
  markSvg,
  markIcon,
  CYCLE,
  cyclePrint,
} from "./art.mjs";

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
};
export const D = DEVICES.d402;
export const gut = (dv) => (dv.W < 360 ? 16 : 20);
// The tab bar: 50 pt of targets, then only as much as the home indicator needs.
export const navH = (dv) => 4 + 50 + (dv.bottom ? 20 : 8);
const short = (dv) => dv.H < 800; // short screens fold detail behind a tap
const roomy = (dv) => dv.H >= 860; // tall screens give the spare height to the figures and controls
export const largeReady = true;

const tn = "font-variant-numeric: tabular-nums lining-nums";
const ell = { "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" };
const clamp2 =
  "display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden";

// Figures never truncate: they step down until they fit. Measured in the browser, Jost 600's
// tabular digits are 0.614 em and its point and comma 0.32 em.
const em = (str) =>
  [...String(str)].reduce(
    (a, ch) => a + (/[0-9]/.test(ch) ? 0.614 : /[.,:]/.test(ch) ? 0.32 : ch === " " ? 0.25 : 0.6),
    0,
  );
export const fit = (str, avail, max = 40, min = 24) =>
  Math.max(min, Math.min(max, Math.floor(avail / em(str))));
// Jost's en dash is as long as an em dash: ranges inside a figure take Atkinson's.
const dashes = (str) =>
  String(str).replace(/–/g, `<span style="font-family:${FONTS.text};font-weight:500">–</span>`);

export function css(t) {
  return `*{box-sizing:border-box}
button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;-webkit-user-select:none;user-select:none}
a{color:inherit;text-decoration:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
button,a{transition:transform 120ms cubic-bezier(0.23,1,0.32,1)}
button:active,a:active{transform:scale(0.97)}
h1,h2,h3,h4,p,ol,ul,dl,dd,figure{margin:0;padding:0;font:inherit}
li{list-style:none}
input,textarea{font:inherit;color:inherit;caret-color:${t.ink}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.nb{white-space:nowrap}
::selection{background:${t.ultraT};color:${t.ink}}
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
// A title steps down for a long name before it wraps: one line at the base size or 4 under, else two lines.
const titleSize = (name, cw, base) => {
  for (const sz of [base, base - 4]) if (name.length * sz * 0.52 <= cw) return sz;
  return Math.max(26, base - 6);
};

// ---------- icons: the destinations are drawn from the forms; filled is where you are ----------
const F_ = (f) => (f ? ' fill="currentColor"' : "");
const FORM_ICONS = {
  today: (f) =>
    `<circle cx="16" cy="11" r="5"${F_(f)}/><rect x="3.5" y="9" width="7" height="7" rx="0.6"${F_(f)}/><path d="M3 19.5h18"/>`,
  training: (f) =>
    [3, 9.5, 16]
      .map((x) => `<rect x="${x}" y="8.5" width="5" height="7" rx="0.6"${F_(f)}/>`)
      .join(""),
  food: (f) => `<path d="M3.5 9.5h17a8.5 8.5 0 0 1-17 0z"${F_(f)}/>`,
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
// A sport as its form, in the theme's pigment for marks on the page.
const SPORT = {
  lift: "strength",
  strength: "strength",
  run: "run",
  ride: "ride",
  swim: "swim",
  mobility: "mobility",
};
export function mark(t, sport, size = 22, opts = {}) {
  const k = SPORT[sport] || sport;
  return markIcon(k, size, { col: t.marks[k], ink: t.ink, paper: t.ground, ...opts });
}

// Buttons: ink, tonal, outline, text. Corners 14.
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
    outline: { background: "transparent", color: t.ink, border: `1.5px solid ${t.control}` },
    text: { background: "transparent", color: t.ink, padding: "0 10px" },
  }[kind];
  return s({ ...base, ...k, ...(w ? { width: w, padding: 0 } : {}) });
}

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
const LINKS = {
  light: {
    today: "Form-Today-Light.dc.html",
    food: "Form-Food-Light.dc.html",
    progress: "Form-Progress-Light.dc.html",
  },
  dark: { today: "Form-Today-Dark.dc.html" },
};
export function navbar(t, active, { nested = false, dv = D, pos = "absolute" } = {}) {
  const links = LINKS[t.scheme],
    NB = navH(dv),
    lab = dv.W < 360 ? 12 : 13;
  const items = NAVS.map(([key, label]) => {
    const on = key === active;
    return `<a href="${links[key] || "#"}" ${on ? `aria-current="${nested ? "true" : "page"}"` : ""} style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", "justify-content": "center", gap: 2, height: 50, "min-width": 0, color: on ? t.ink : t.ink2 })}">${icon(key, 24, { filled: on })}<span style="${txt(lab, on ? 700 : 600)}">${label}</span></a>`;
  }).join("");
  return `<nav aria-label="Destinations" style="${s({ position: pos, left: 0, right: 0, bottom: 0, height: NB, padding: `4px 6px ${NB - 54}px`, display: "grid", "grid-template-columns": "repeat(5, minmax(0, 1fr))", background: t.ground, "border-top": `1px solid ${t.hair}` })}">${items}</nav>`;
}
export const stripH = 56;
export function strip(t, { href = "Form-Log-Light.dc.html", dv = D, bottom = null } = {}) {
  const G = gut(dv);
  return `<aside aria-label="Workout in progress" style="${s({ position: "absolute", left: G, right: G, bottom: bottom ?? navH(dv) + 10, height: stripH, display: "flex", "align-items": "center", gap: 12, padding: "0 6px 0 16px", background: t.ink, color: t.onInk, "border-radius": 16, "box-shadow": t.float })}">
<div style="${s({ display: "flex", "flex-direction": "column", "min-width": 0, flex: "1 1 auto" })}"><span style="${txt(16, 700, ell)}">${L.session}</span><span style="${txt(13, 500, { color: t.onInk2, ...ell })}">${L.gym}</span></div>
<p style="${s({ display: "flex", "align-items": "baseline", gap: 6, "flex-shrink": 0 })}">${dv.W < 360 ? "" : `<span style="${txt(13, 600, { color: t.onInk2 })}">Rest</span>`}<span role="timer" aria-label="Rest, 2 minutes 14 seconds left" style="${num(20)}">${L.rest.remaining}</span></p>
<a href="${href}" style="${s({ display: "flex", "align-items": "center", height: 44, padding: "0 16px", "border-radius": 12, background: t.onInk, color: t.ink, "flex-shrink": 0 })}; ${txt(15, 700)}">Resume</a>
</aside>`;
}
export function root(t, inner, { label, dv = D, height = null } = {}) {
  return `<div style="${s({ position: "relative", width: dv.W, height: height === "auto" ? undefined : height || dv.H, overflow: height === "auto" ? undefined : "hidden", background: t.ground, color: t.ink, "font-family": FONTS.text, "font-size": 16, "line-height": 1.4, "color-scheme": t.scheme, "-webkit-font-smoothing": "antialiased" })}"><h1 class="sr">${esc(label)}</h1>${inner}</div>`;
}
const rgba0 = (hex) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0)`;
const fadeTo = (t, h = 24) =>
  `<div aria-hidden="true" style="${s({ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: `linear-gradient(to bottom, ${rgba0(t.ground)}, ${t.ground})`, "pointer-events": "none" })}"></div>`;
// The scrolling body of a screen. It stops above whatever is pinned below it and fades under it.
export function screenMain(
  t,
  inner,
  { dv = D, bottom = null, flex = false, whole = false, fade = true } = {},
) {
  const G = gut(dv);
  if (whole)
    return `<main style="${s({ padding: `${dv.top}px ${G}px 24px`, display: flex ? "flex" : undefined, "flex-direction": flex ? "column" : undefined })}">${inner}</main>`;
  return `<main style="${s({ position: "absolute", top: dv.top, left: 0, right: 0, bottom: bottom ?? navH(dv), overflow: "hidden", padding: `0 ${G}px`, display: flex ? "flex" : undefined, "flex-direction": flex ? "column" : undefined })}">${inner}${fade ? fadeTo(t, fade === true ? 24 : fade) : ""}</main>`;
}
// A whole-scroll board: the screen in normal flow, the tab bar at its foot, and a dashed line
// where the first screen ends.
function wholeBoard(t, inner, dv, active, label) {
  const NB = navH(dv);
  const body = `${screenMain(t, inner, { dv, whole: true, flex: true })}<div style="position:relative;height:${NB}px">${navbar(t, active, { nested: active === "today", dv })}</div><div aria-hidden="true" style="${s({ position: "absolute", left: 0, right: 0, top: dv.H - NB, "border-top": `2px dashed ${t.ink2}`, "pointer-events": "none" })}"></div>`;
  return root(t, body, { label, dv, height: "auto" });
}
const titleHeader = (t, dv, name, sub, action) =>
  `<header style="${s({ display: "flex", "align-items": "flex-end", "justify-content": "space-between", gap: 12, "padding-top": 8 })}"><div style="min-width:0"><h2 style="${title(dv.W < 360 ? 34 : 40, { lh: 1 })}">${name}</h2><p style="${txt(15, 500, { color: t.ink2 })}; margin-top: 6px; ${tn}">${sub}</p></div>${action}</header>`;
const printFrame = (inner, { mt = 0 } = {}) =>
  `<figure style="${s({ margin: `${mt}px 0 0`, "line-height": 0 })}">${inner}</figure>`;
const backLink = (t, label, href) =>
  `<a href="${href}" style="${s({ display: "flex", "align-items": "center", gap: 2, height: 44, padding: "0 8px 0 4px", "flex-shrink": 0, "min-width": 0 })}; ${txt(17, 700)}">${icon("chevronLeft", 22)}<span>${label}</span></a>`;
const iconBtn = (t, name, aria, extra = {}) =>
  `<button type="button" aria-label="${aria}" aria-haspopup="dialog" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "flex-shrink": 0, ...extra })}">${icon(name, 24)}</button>`;

// ---------- the coach's words ----------
// One block for everything the coach (an LLM) writes, and for the app's own check-in advice under
// its own name: attributed, quiet, never on the art, never in colour, at most one per screen.
// Whatever its length, it shows at most two lines; past that, More opens the whole text in a sheet.
// The clamp is the browser's, so it holds at any text size. Statuses carry their own glyph: the
// coach's speech mark, a turning arc while it works, a warning when it could not finish.
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
  } = {},
) {
  const G = gut(dv),
    cpl = Math.floor((dv.W - 2 * G - 28) / (size * 0.54));
  const long = more !== false && text.length > cpl * 2;
  const glyph = { note: "coach", check: "info", planning: "wait", failed: "warn" }[tone] || "coach";
  const lead = `<span style="${s({ display: "grid", color: t.ink })}">${icon(glyph, 16)}</span>`;
  return `<aside aria-label="${who === "Coach" ? "From the coach" : who}"${role ? ` role="${role}"` : ""} style="${s({ padding: "12px 14px", "border-radius": 14, background: t.surface })}">
<p style="${s({ display: "flex", "align-items": "center", gap: 6, "flex-wrap": "wrap" })}; ${txt(13, 700)}">${lead}${who}${context ? `<span style="${s({ "font-weight": 500, color: t.ink2 })}">· ${context}</span>` : ""}</p>
${head ? `<p style="${txt(17, 700)}; margin-top: 6px; ${tn}">${head}</p>` : ""}
<p style="${txt(size, 500, { "line-height": 1.45 })}; margin-top: ${head ? 2 : 4}px; ${tn}${long ? `; ${clamp2}` : ""}">${text}</p>
${long ? `<button type="button" aria-haspopup="dialog" style="${s({ height: 44, "min-width": 44, padding: "0 6px", margin: "-4px 0 -10px -6px" })}; ${txt(15, 700)}">More</button>` : ""}${action ? `<div style="margin-top:10px">${action}</div>` : ""}
</aside>`;
}

// ---------- TODAY ----------
// With a coach status on the day, the plan folds to one line and the print gives up a little height.
export function todayScreen(t, dv = D, { coach = null } = {}) {
  const G = gut(dv),
    cw = dv.W - 2 * G,
    sm = short(dv),
    tiny = dv.H < 600,
    fold = sm || !!coach;
  const ph = coach
    ? Math.round(dv.H * 0.2)
    : tiny
      ? 88
      : dv.H >= 900
        ? Math.round(Math.min(320, dv.H * 0.31))
        : Math.round(Math.max(170, Math.min(262, dv.H * 0.25)));
  const print = dayPrint({
    w: cw,
    h: ph,
    paper: t.paper,
    parts: [
      {
        kind: "strength",
        name: "Arms",
        rows: [
          [{ n: 3, done: 0 }],
          [{ n: 3, done: 0 }],
          [
            { n: 3, done: 0 },
            { n: 2, done: 0 },
          ],
        ],
      },
      { kind: "run", name: "Run", figure: "25–30 min", minutes: 30 },
    ],
    ariaLabel:
      "Today’s print: the run as a disc, the four arm exercises as slabs of their sets, nothing logged yet",
  });
  // The plan, as the app groups it: single exercises, then the superset drawn once, as a block.
  const one = (x) =>
    `<li style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline", "flex-wrap": "wrap", gap: "0 10px", padding: "4px 0" })}"><span style="${txt(15, 600)}">${x.name}</span><span class="nb" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${x.rx}</span></li>`;
  const ss = T.plan.filter((x) => x.superset);
  const planRows = `${T.plan
    .filter((x) => !x.superset)
    .map(one)
    .join(
      "",
    )}${ss.length ? `<li style="${s({ "border-left": `2px solid ${t.ink}`, "padding-left": 10, margin: "6px 0 2px" })}"><p style="${txt(13, 700, { color: t.ink2 })}">Superset: ${ss[0].superset}</p><ul>${ss.map(one).join("")}</ul></li>` : ""}`;
  const part = ({
    id,
    markEl,
    name,
    figure,
    unit,
    sub,
    action,
    extra = "",
  }) => `<li style="${s({ padding: tiny ? "8px 0" : sm ? "10px 0" : "12px 0", "border-bottom": `1px solid ${t.hair}` })}">
  <div style="${s({ display: "grid", "grid-template-columns": "26px minmax(0,1fr) auto", gap: "2px 12px", "align-items": "center" })}">
    <span style="display:grid">${markEl}</span>
    <h3 id="${id}" style="${s({ display: "flex", "align-items": "baseline", gap: "0 8px", "flex-wrap": "wrap", "min-width": 0 })}"><span style="${txt(17, 700)}">${name}</span>${figure ? `<span class="nb"><span style="${num(26)}">${dashes(figure)}</span> <span style="${txt(15, 500, { color: t.ink2 })}">${unit}</span></span>` : `<span style="${txt(15, 500, { color: t.ink2 })}; ${tn}">${unit}</span>`}</h3>
    ${action}
    ${sub ? `<p style="${txt(14, 500, { color: t.ink2 })}; grid-column: 2 / -1; ${tn}">${sub}</p>` : ""}
  </div>${extra}</li>`;
  const pinned = navH(dv) + (tiny ? 10 : 14);
  const body = `
${screenMain(
  t,
  `<header style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 8, height: 48 })}"><p style="${txt(17, 700)}; ${tn}">${T.date}</p><button type="button" aria-haspopup="dialog" aria-label="Gym: ${T.gym.name}. Change gym" style="${BTN(t, "text", { h: 44 })}; gap: 4px; margin-right: -10px; color: ${t.ink2}; font-weight: 600; min-width: 0">${T.gym.name}${icon("chevronDown", 18)}</button></header>
  ${printFrame(print, { mt: 2 })}
  <section aria-labelledby="day" style="margin-top:${tiny ? 8 : sm ? 10 : 14}px">
    <h2 id="day" style="${title(dv.W < 360 ? 30 : sm ? 34 : 38)}">${T.day}</h2>
    <p style="${s({ display: "flex", "align-items": "center", "column-gap": 10, "row-gap": 2, "flex-wrap": "wrap", "margin-top": 6 })}; ${txt(15, 500, { color: t.ink2 })}; ${tn}"><span>${T.where} · <span class="nb">${T.time}</span></span><span style="${s({ display: "inline-flex", "align-items": "center", gap: 4, color: t.ink, "font-weight": 700 })}">${icon("check", 16)}${T.status}</span></p>
  </section>
  ${coach ? `<div style="margin-top:12px">${coachNote(t, { ...coach, dv, more: false, size: 15 })}</div>` : ""}
  <ul aria-label="Today’s parts, in any order" style="margin-top:4px">
    ${part({ id: "p-run", markEl: mark(t, "run", 22), name: "Run", figure: "25–30", unit: "min", sub: T.run.note, action: `<button type="button" aria-labelledby="lg-run p-run" style="${BTN(t, "tonal", { h: 44 })}; padding: 0 16px"><span id="lg-run">Log it</span></button>` })}
    ${part({ id: "p-arms", markEl: mark(t, "lift", 22), name: "Arms", figure: null, unit: T.planSummary, sub: fold ? "Barbell curl · Rope triceps pushdown · Superset: Farmer’s carry, Wrist curl" : null, action: `<button type="button" aria-haspopup="dialog" aria-label="The plan for arms" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "margin-right": -12, color: t.ink2 })}">${icon("chevronRight", 20)}</button>`, extra: fold ? "" : `<ul aria-label="The plan" style="${s({ margin: "6px 0 0 38px" })}">${planRows}</ul>` })}
  </ul>`,
  { dv, bottom: pinned + 56 + (tiny ? 4 : 8), fade: tiny ? 12 : true },
)}
<div style="${s({ position: "absolute", left: G, right: G, bottom: pinned, display: "flex", gap: 10 })}">
  <button type="button" style="${BTN(t, "primary")}; flex: 1 1 auto; min-width: 0">${icon("play", 20)}Start workout</button>
  <button type="button" aria-label="More options" aria-haspopup="dialog" style="${BTN(t, "tonal", { w: 56 })}">${icon("more", 24)}</button>
</div>
${navbar(t, "today", { dv })}`;
  return root(t, body, { label: coach ? "Today, the coach has not planned it yet" : "Today", dv });
}
// The coach's own status for a day it has not planned yet (src/app/(app)/today/coach-actions.tsx).
export const TODAY_COACH = {
  tone: "note",
  text: "The coach has not planned this session yet. Your programme’s own targets apply until it does. It tries again at its next nightly run.",
};

// ---------- LOGGING A SET ----------
// Two sessions drawn the same way: the programme's bench press in kilograms, and the repository's
// own pounds audit (scripts/dev/audit-workout.mjs): an account set to pounds starts its planned
// Lower A and saves High-bar barbell squat 135 lb × 5 @ 2, then 140 lb × 6 @ 2. Its targets come
// from program.ts; its rest starts at the slot's minimum, 3:00, as the app's timer does.
export const SESSIONS = {
  vinit: {
    back: "Upper A",
    backHref: "Form-Workout-Light.dc.html",
    exercise: L.exercise,
    unit: "kg",
    meta: [L.equipment, "4 × 3–5 @ 2 RIR", "rest 3–4 min"],
    progress: "2 of 4",
    tiles: [
      { kind: "saved", n: 1, v: "60", reps: 5, rir: 2 },
      { kind: "saved", n: 2, v: "62.5", reps: 4, rir: 1 },
      { kind: "now", n: 3, target: "3–5 @ 2" },
      { kind: "next", n: 4, target: "3–5 @ 2" },
    ],
    hold: true,
    previous: L.previous,
    rest: { time: "2:14", aria: "Rest, 2 minutes 14 seconds left" },
    load: "62.5",
    reps: "3",
    n: 3,
    target: "2",
    save: "62.5 kg × 3 @ 2",
  },
  pounds: {
    back: "Lower A",
    backHref: "#",
    exercise: "High-bar barbell squat",
    unit: "lb",
    meta: ["Free weights", "3 × 4–6 @ 2–3 RIR", "rest 3–4 min"],
    progress: "2 of 3",
    tiles: [
      { kind: "saved", n: 1, v: "135", reps: 5, rir: 2 },
      { kind: "saved", n: 2, v: "140", reps: 6, rir: 2 },
      { kind: "now", n: 3, target: "4–6 @ 2–3" },
    ],
    hold: false,
    previous: null,
    rest: { time: "3:00", aria: "Rest, 3 minutes left" },
    load: "140",
    reps: "6",
    n: 3,
    target: "2–3",
    save: "140 lb × 6 @ 2",
  },
};
// A set is a tile: saved sets are inked and show "× reps @ RIR", the notation the targets use.
export function setTile(
  t,
  x,
  unit,
  { cls = "", tileW = 80, txtCls = "", h = 78, vSize = null } = {},
) {
  const base = {
    display: "flex",
    "flex-direction": "column",
    "justify-content": "space-between",
    "min-width": 0,
    height: h,
    padding: "8px 10px 9px",
    "border-radius": 4,
    "text-align": "left",
  };
  const size = vSize || fit(x.v || "0", tileW - 20, h > 80 ? 28 : 24, 18);
  const c = cls ? ` class="${cls}"` : "",
    k = txtCls ? ` class="${txtCls}"` : "";
  if (x.kind === "saved")
    return `<button type="button"${c} aria-label="Set ${x.n}: ${x.v} ${unit}, ${x.reps} reps, ${x.rir} RIR, saved. Edit" style="${s({ ...base, background: t.ultra, color: t.onUltra })}"><span style="${txt(12, 700, { color: t.onUltra2 })}">Set ${x.n}</span><span style="${num(size)}">${x.v}</span><span class="nb" style="${txt(13, 600, { color: t.onUltra2 })}; ${tn}">× ${x.reps} @ ${x.rir}</span></button>`;
  if (x.kind === "warm")
    return `<button type="button"${c} aria-label="Set ${x.n}, a warm-up: ${x.v} ${unit}, ${x.reps} reps, saved. Edit" style="${s({ ...base, background: t.surface2, color: t.ink })}"><span style="${txt(12, 700)}">Warm-up</span><span style="${num(size)}">${x.v}</span><span class="nb" style="${txt(13, 600)}; ${tn}">× ${x.reps}</span></button>`;
  if (x.kind === "now")
    return `<div${c} aria-current="step" style="${s({ ...base, background: t.ground, border: `2.5px solid ${t.ink}`, padding: "6px 8px 7px" })}"><span${k} style="${txt(12, 700)}">Set ${x.n}</span><span${k} style="${txt(15, 700)}">Now</span><span${k} style="${txt(13, 500, { color: t.ink2, "white-space": "nowrap" })}; ${tn}">${x.target || "Working"}</span></div>`;
  return `<div${c} style="${s({ ...base, background: t.ultraT, color: t.ink })}"><span style="${txt(12, 700)}">Set ${x.n}</span><span style="${txt(15, 600)}">To do</span><span class="nb" style="${txt(13, 500)}; ${tn}">${x.target}</span></div>`;
}
// The sets are one row. Up to as many as fit at 74 pt share the width; past that the row scrolls
// sideways, bleeding to the screen's edge, opened at the set you are on. Every figure in the row
// takes one size: the largest at which the longest one fits.
const MIN_TILE = 74;
export function setStrip(t, S, dv, { tiles = null, progressHtml = null } = {}) {
  const G = gut(dv),
    cw = dv.W - 2 * G,
    cols = Math.max(3, Math.floor((cw + 6) / (MIN_TILE + 6)));
  const n = (tiles || S.tiles).length,
    over = n > cols,
    h = roomy(dv) ? 86 : 78;
  const tileW = over ? (cw - 6 * (cols - 1)) / cols : (cw - 6 * (n - 1)) / n;
  const max = h > 80 ? 28 : 24,
    vSize = Math.min(max, ...S.tiles.filter((x) => x.v).map((x) => fit(x.v, tileW - 20, max, 18)));
  const items = tiles || S.tiles.map((x) => setTile(t, x, S.unit, { tileW, h, vSize }));
  const cols_ = over
    ? `grid-auto-flow: column; grid-auto-columns: ${tileW.toFixed(1)}px; overflow-x: auto; scroll-snap-type: x mandatory; margin: 0 -${G}px; padding: 0 ${G}px`
    : `grid-template-columns: repeat(${n}, minmax(0, 1fr))`;
  return `<div><p style="${s({ display: "flex", "justify-content": "space-between", "margin-bottom": 6 })}; ${txt(13, 700, { color: t.ink2 })}"><span>Sets · ${S.unit}</span><span style="${tn}">${progressHtml || S.progress}</span></p><ol aria-label="Sets, ${S.progress} saved" style="display: grid; gap: 6px; ${cols_}">${items.map((x) => `<li style="display:grid">${x}</li>`).join("")}</ol></div>`;
}
export function restRow(
  t,
  { time = L.rest.remaining, aria = "Rest, 2 minutes 14 seconds left", timeHtml = null } = {},
) {
  return `<div style="${s({ display: "flex", "align-items": "center", gap: 8, height: 44 })}"><span style="${s({ color: t.ink2, display: "grid" })}">${icon("timer", 18)}</span><span style="${txt(15, 500, { color: t.ink2 })}">Rest</span><span role="timer" aria-label="${aria}" style="${num(20)}">${timeHtml || time}</span><span style="flex:1 1 auto"></span><button type="button" aria-label="Add 30 seconds" style="${BTN(t, "text", { h: 44 })}; font-weight: 600"><span class="nb">+30 s</span></button><button type="button" aria-label="Stop the rest timer" style="${BTN(t, "text", { h: 44 })}; font-weight: 600; margin-right: -10px">Stop</button></div>`;
}
// Load and reps sit side by side only where both figures fit at 30 px or more — the load as it is
// and reps at two digits. Otherwise each gets the full width. Both always share one size.
const STEP_OVER = 108; // padding, two 44 pt buttons, their gaps and a little air
export function stepperLayout(S, dv) {
  const cw = dv.W - 2 * gut(dv),
    lw = (cw - 10) * 0.55,
    rw = (cw - 10) * 0.45,
    max = roomy(dv) ? 46 : 40;
  const sideSize = Math.min(
    fit(S.load, lw - STEP_OVER, max, 20),
    fit("20", rw - STEP_OVER, max, 20),
  );
  return sideSize >= 30
    ? { side: true, size: sideSize }
    : { side: false, size: fit(S.load, cw - STEP_OVER, max, 26) };
}
// A value is suggested (ink 2, dotted) until it is touched or RIR is chosen; then it is what Save
// records, in ink. `swap` stacks both for the signature moment.
export function steppers(t, S, dv, { touched = false, swap = null } = {}) {
  const { side, size } = stepperLayout(S, dv);
  const b = s({
    width: 44,
    height: 44,
    "border-radius": 12,
    background: t.ground,
    display: "grid",
    "place-items": "center",
    color: t.ink,
    "flex-shrink": 0,
  });
  const ink = (v) => `<span style="${num(size, { lh: 1.15 })}; color: ${t.ink}">${v}</span>`;
  const sug = (v) =>
    `<span style="${num(size, { lh: 1.15 })}; color: ${t.ink2}; text-decoration: underline dotted 2px; text-underline-offset: 7px">${v}</span>`;
  const val = (v) =>
    swap
      ? `<span style="display:inline-grid"><span class="${swap[0]}" style="grid-area:1/1">${ink(v)}</span><span class="${swap[1]}" aria-hidden="true" style="grid-area:1/1">${sug(v)}</span></span>`
      : touched
        ? ink(v)
        : sug(v);
  const box = (
    label,
    unit,
    value,
    dec,
    inc,
    grow,
  ) => `<div role="group" aria-label="${label}${unit ? " in " + unit : ""}" style="${s({ flex: `${grow} 1 0`, "min-width": 0, background: t.surface, "border-radius": 18, padding: "9px 6px 8px" })}">
<span aria-hidden="true" style="${txt(13, 700, { color: t.ink2 })}; padding-left: 8px">${label}${unit ? ` · ${unit}` : ""}</span>
<div style="${s({ display: "flex", "align-items": "center", gap: 2, "margin-top": 2 })}"><button type="button" aria-label="${dec}" style="${b}">${icon("minus", 20)}</button><output aria-label="${label} ${value}${unit ? " " + unit : ""}${touched || swap ? "" : ", suggested, not yet confirmed"}" style="${s({ flex: "1 1 auto", "text-align": "center", "min-width": 0 })}">${val(value)}</output><button type="button" aria-label="${inc}" style="${b}">${icon("plus", 20)}</button></div></div>`;
  const step = S.unit === "lb" ? "5 lb" : "2.5 kg";
  const load = box(
    "Load",
    S.unit,
    S.load,
    `Less load, ${step}`,
    `More load, ${step}`,
    side ? 11 : 1,
  );
  const reps = box("Reps", "", S.reps, "One rep fewer", "One rep more", side ? 9 : 1);
  return side
    ? `<div style="${s({ display: "flex", gap: 10 })}">${load}${reps}</div>`
    : `<div style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}">${load}${reps}</div>`;
}
const RIR = ["0", "1", "2", "3", "4", "5", "6+"];
// Seven choices in one row while each is 44 pt wide; on narrower screens, four and three. A target
// may be a range (2–3): every choice in it carries the dot. 6+ opens 6 to 10, the rest of the
// app's range.
export function rirControl(
  t,
  chosen = null,
  { target = "2", id = "rir-label", selHtml = null, dv = D } = {},
) {
  const cw = dv.W - 2 * gut(dv),
    cols = (cw - 8 - 12) / 7 >= 44 ? 7 : 4,
    segH = roomy(dv) ? 52 : 48;
  const tg = target ? String(target).split("–") : [];
  const inT = (v) => (tg.length === 2 ? +v >= +tg[0] && +v <= +tg[1] : v === target);
  const segs = RIR.map((v, i) => {
    const on = v === chosen,
      isT = inT(v),
      first = tg.length ? v === tg[0] : false;
    const name =
      v === "6+"
        ? "6 or more reps in reserve, then 6 to 10"
        : v === "1"
          ? "1 rep in reserve"
          : `${v} reps in reserve`;
    return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on || (chosen === null && i === 0) ? 0 : -1}" aria-label="${name}${isT ? ", in the target" : ""}" style="${s({ position: "relative", height: segH, "border-radius": 10, background: on ? t.ink : "transparent", color: on ? t.onInk : t.ink, display: "grid", "place-items": "center", "min-width": 0 })}; ${num(22)}">${v}${isT ? `<span aria-hidden="true" style="${s({ position: "absolute", left: "50%", bottom: 6, width: 4, height: 4, "margin-left": -2, "border-radius": 2, background: on ? t.onInk : t.ink })}"></span>` : ""}${first && selHtml ? selHtml : ""}</button>`;
  }).join("");
  return `<div role="radiogroup" aria-labelledby="${id}" aria-required="true" style="${s({ display: "flex", "flex-direction": "column", gap: 6 })}">
<p id="${id}" style="${s({ display: "flex", "justify-content": "space-between", "padding-left": 4 })}; ${txt(14, 700, { color: t.ink2 })}"><span>RIR · reps in reserve</span>${target ? `<span style="${s({ color: t.ink })}; ${tn}">Target ${target}</span>` : ""}</p>
<div style="${s({ display: "grid", "grid-template-columns": `repeat(${cols}, minmax(0, 1fr))`, gap: 2, padding: 4, background: t.surface, "border-radius": 14 })}">${segs}</div></div>`;
}
export const saveBtn = (t, S, armed) =>
  armed
    ? `<button type="button" style="${BTN(t, "primary")}; width: 100%">Save set ${S.n} · <span class="nb">${S.save}</span></button>`
    : `<button type="button" aria-describedby="rir-label" style="${BTN(t, "tonal")}; width: 100%; color: ${t.ink2}">Choose RIR to save</button>`;
const holdRow = (t) =>
  `<div style="${s({ display: "flex", "align-items": "center", gap: 10, "min-height": 44 })}"><span style="${s({ padding: "2px 9px", "border-radius": 8, border: `1.5px solid ${t.ink}`, "flex-shrink": 0 })}; ${txt(13, 700)}">${L.suggestion.kind}</span><span style="${txt(16, 700, { flex: "1 1 auto", "min-width": 0 })}; ${tn}">${L.suggestion.line}</span><button type="button" aria-haspopup="dialog" aria-label="Why keep 62.5 kg" style="${s({ display: "flex", "align-items": "center", gap: 6, height: 44, padding: "0 2px 0 8px", color: t.ink2, "margin-right": -2, "flex-shrink": 0 })}; ${txt(15, 600)}">${icon("info", 20)}Why</button></div>`;
const prevLine = (t, S) => {
  const [lab, val] = S.previous.split(": "),
    [sets, date] = val.split(" · ");
  return `<p style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${lab}:<br><span style="${s({ color: t.ink })}">${sets}</span> · <span class="nb">${date.replace(/ Sep$/, " Sept")}</span></p>`;
};

// Logging: the record on top, the entry docked at the foot. The record scrolls inside what the entry
// leaves it; on a whole-scroll board (320 pt) everything flows and Save stays pinned instead.
export function logBody(
  t,
  S,
  dv,
  {
    armed = false,
    progressHtml = null,
    tiles = null,
    restHtml = null,
    headHtml = null,
    rirHtml = null,
    saveHtml = null,
    swap = null,
    whole = false,
  } = {},
) {
  const sm = short(dv),
    G = gut(dv),
    cw = dv.W - 2 * G;
  const meta = S.meta
    .slice(sm ? 1 : 0)
    .map((x) => `<span class="nb">${x}</span>`)
    .join(" · ");
  const tsize = titleSize(S.exercise, cw, dv.W < 360 ? 28 : sm ? 32 : 36);
  const record = `<header style="${s({ display: "flex", "align-items": "center", gap: 2, height: 48, margin: "0 -12px", "flex-shrink": 0 })}">${backLink(t, S.back, S.backHref)}<span style="flex:1 1 auto"></span>${iconBtn(t, "more", "Exercise: technique, history, add a set, complete, skip")}</header>
<h2 style="${title(tsize)}; margin-top: ${sm ? 2 : 6}px">${S.exercise}</h2>
<p style="${txt(15, 500, { color: t.ink2 })}; margin-top: 4px; ${tn}">${meta}</p>
<div style="margin-top:12px">${setStrip(t, S, dv, { tiles, progressHtml })}</div>
${S.hold ? `<div style="margin-top:6px">${holdRow(t)}</div>` : ""}
${S.previous && !sm ? prevLine(t, S) : ""}
${restHtml || restRow(t, S.rest)}`;
  const entry = `<section aria-label="Set ${S.n}" style="${s({ display: "flex", "flex-direction": "column", gap: sm ? 10 : roomy(dv) ? 16 : 12, "padding-top": 10, "padding-bottom": whole ? 0 : 12, flex: whole ? undefined : "0 0 auto" })}">
  <div style="${s({ display: "flex", "align-items": "center", gap: 8, height: 40 })}"><h3 style="${txt(17, 700, { flex: "1 1 auto" })}">${headHtml || `Set ${S.n}`} <span style="${s({ color: t.ink2, "font-weight": 500 })}">· Working</span></h3><button type="button" aria-label="Set ${S.n} options: type, notes" aria-haspopup="dialog" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", color: t.ink2, "margin-right": -10 })}">${icon("sliders", 20)}</button></div>
  ${steppers(t, S, dv, { touched: armed, swap })}
  ${rirHtml || rirControl(t, armed ? "2" : null, { target: S.target, dv })}
  <div style="${s({ position: whole ? "sticky" : undefined, bottom: whole ? 0 : undefined, "z-index": whole ? 1 : undefined, background: t.ground, "padding-top": 2 })}">${saveHtml || saveBtn(t, S, armed)}</div>
</section>`;
  if (whole) return `${record}<div style="margin-top:14px">${entry}</div>`;
  return `<div style="${s({ flex: "1 1 auto", "min-height": 0, overflow: "hidden", position: "relative", margin: `0 -${G}px`, padding: `0 ${G}px` })}">${record}${fadeTo(t, 20)}</div>${entry}`;
}
export function logScreen(t, dv = D, { who = "vinit" } = {}) {
  const S = SESSIONS[who],
    armed = t.scheme === "dark";
  const body = `${screenMain(t, logBody(t, S, dv, { armed }), { dv, flex: true, fade: false })}${navbar(t, "today", { nested: true, dv })}`;
  return root(t, body, {
    label: armed ? `${S.exercise}, set ${S.n}, RIR chosen` : `${S.exercise}, entering set ${S.n}`,
    dv,
  });
}
// The whole scroll at a small width: everything, in order, with the tab bar at the foot.
export function logWhole(t, dv, { who = "pounds" } = {}) {
  const S = SESSIONS[who];
  return wholeBoard(
    t,
    logBody(t, S, dv, { whole: true }),
    dv,
    "today",
    `${S.exercise} at ${dv.W} points wide, the whole scroll`,
  );
}

// ---------- THE WORKOUT ----------
// Grouped by state, not by order: what is open first, then what is left, then what is done.
const UPPER_A = [
  {
    name: "Barbell bench press",
    sets: 4,
    done: 2,
    rx: "4 × 3–5 @ 2 RIR",
    so: "60 × 5, 62.5 × 4 kg",
    state: "open",
  },
  { name: "Pull-up", sets: 3, done: 0, rx: "3 × 6–10 @ 1–2 RIR" },
  { name: "Seated cable row", sets: 3, done: 0, rx: "3 × 6–10 @ 1–2 RIR" },
  { name: "Incline dumbbell press", sets: 2, done: 0, rx: "2 × 8–12 @ 1–2 RIR" },
  { name: "Cable lateral raise", sets: 3, done: 0, rx: "3 × 12–20 @ 1 RIR" },
  { name: "Reverse pec deck", sets: 2, done: 0, rx: "2 × 12–20 @ 1 RIR" },
  { name: "Overhead cable triceps extension", sets: 2, done: 0, rx: "2 × 10–15 @ 1 RIR" },
];
// The coach's plan for Lower A at Anytime Fitness, exactly as the repository's coach-plan test
// stores it (src/server/repositories/coach-plans.test.ts): a kept exercise with the coach's sets,
// a substitution, three left to the programme, a drop and an addition. Target lines follow the
// app's planLine and prescription; the count is coachPlanSummary. The plan wrote no summary of its
// own, so none is shown.
const LOWER_A = {
  session: "Lower A",
  focus: "Squat + quads",
  time: "70–90 min",
  notes: "Hard lower",
  gym: "Anytime Fitness",
  summary: "6 exercises · 13 sets",
  warmup: ["Bike 4 min", "Squat ramp 40×6, 50×3"],
  entries: [
    {
      name: "High-bar barbell squat",
      sets: 3,
      rx: "3 × 5 @ 60 kg · RIR 2/2/1",
      note: "Add 2.5 kg after clean sets.",
    },
    {
      name: "Horizontal leg press",
      sets: 1,
      rx: "1 × 10 @ 100 kg · RIR 2",
      instead: "45° leg press",
      note: "Horizontal press today.",
    },
    { name: "Seated leg curl", sets: 3, rx: "3 × 8–12 @ 1–2 RIR" },
    { name: "Leg extension", sets: 2, rx: "2 × 10–15 @ 1–2 RIR" },
    { name: "Smith machine calf raise", sets: 3, rx: "3 × 8–15 @ 1–2 RIR" },
    { name: "Cable crunch", sets: 2, dropped: true, note: "Back is sore today." },
    {
      name: "Face pull",
      machine: "Cable station",
      sets: 1,
      rx: "1 × 15 @ 15 kg · RIR 2",
      note: "Light, for the shoulders.",
    },
  ],
};
// One exercise on the workout: its name, its targets, and the coach's note under them, at most two
// lines (a note may run to 200 characters); the whole note is on the exercise.
const coachLine = (t, x) =>
  x.note
    ? `<span style="${s({ display: "flex", gap: 6, "align-items": "flex-start", "margin-top": 3 })}; ${txt(14, 500, { color: t.ink })}"><span style="${s({ display: "grid", "flex-shrink": 0, "margin-top": 2 })}">${icon("coach", 15, { label: "Coach:" })}</span><span style="${clamp2}">${x.note}</span></span>`
    : "";
export function exRow(t, x) {
  const open = x.state === "open",
    dropped = !!x.dropped;
  const sub = open
    ? `${x.done} of ${x.sets} sets · ${x.so}`
    : dropped
      ? "Skipped today"
      : `${x.rx}${x.instead ? ` · instead of ${x.instead}` : ""}`;
  const right = open
    ? `<span style="${s({ display: "flex", "align-items": "center", height: 44, padding: "0 16px", "border-radius": 12, background: t.ink, color: t.onInk })}; ${txt(15, 700)}">Resume</span>`
    : `<span style="${s({ display: "grid", "place-items": "center", width: 32, height: 44, color: t.ink2, "margin-right": -8 })}">${icon("chevronRight", 20)}</span>`;
  return `<li><a href="${open ? "Form-Log-Light.dc.html" : "#"}" style="${s({ display: "grid", "grid-template-columns": "minmax(0,1fr) auto", gap: "0 12px", "align-items": "center", "min-height": 60, padding: "8px 0", "border-bottom": `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${txt(16, 700, { "line-height": 1.25, "text-decoration": dropped ? "line-through" : undefined, color: dropped ? t.ink2 : t.ink })}">${x.name}${x.machine ? `<span style="${s({ "font-weight": 500, color: t.ink2 })}"> · ${x.machine}</span>` : ""}</span><span style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${sub}</span>${coachLine(t, x)}</span>${right}</a></li>`;
}
export function workoutScreen(t, dv = D, { coach = false } = {}) {
  const G = gut(dv),
    cw = dv.W - 2 * G,
    sm = short(dv);
  const capt = (x, id) =>
    `<h3 id="${id}" style="${txt(13, 700, { color: t.ink2 })}; margin: 16px 0 2px">${x}</h3>`;
  const row = (x) => exRow(t, x);
  const warmRow = (name, sub, done) =>
    `<li><a href="#" style="${s({ display: "grid", "grid-template-columns": "minmax(0,1fr) auto", gap: 12, "align-items": "center", "min-height": 56, padding: "8px 0", "border-bottom": `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${txt(16, 700)}">${name}</span><span style="${txt(14, 500, { color: t.ink2 })}; ${tn}; ${clamp2}">${sub}</span></span><span style="${s({ display: "grid", "place-items": "center", width: 32, height: 44, color: done ? t.ink : t.ink2, "margin-right": -8 })}">${done ? icon("check", 20, { label: "Done" }) : icon("chevronRight", 20)}</span></a></li>`;
  const header = `<header style="${s({ display: "flex", "align-items": "center", gap: 4, height: 48, margin: "0 -12px" })}">${backLink(t, "Today", "Form-Today-Light.dc.html")}<span style="flex:1 1 auto"></span><button type="button" aria-haspopup="dialog" style="${BTN(t, "text", { h: 44 })}">Finish</button>${iconBtn(t, "more", "Session details, add exercise, superset")}</header>`;
  const addBtn = `<button type="button" style="${s({ display: "flex", "align-items": "center", gap: 8, height: 52, width: "100%" })}; ${txt(16, 700)}">${icon("plus", 20)}Add exercise</button>`;
  let inner;
  if (coach) {
    const X = LOWER_A,
      kept = X.entries.filter((x) => !x.dropped);
    const total = kept.reduce((a, x) => a + x.sets, 0);
    inner = `${header}
  <h2 style="${title(dv.W < 360 ? 34 : 40, { lh: 1 })}; margin-top: 8px">${X.session}</h2>
  <p style="${txt(15, 500, { color: t.ink2 })}; margin-top: 6px; ${tn}">${X.focus} · ${X.notes}<br><span class="nb">0 of ${total} sets</span> · <span class="nb">${X.time}</span></p>
  <p style="${s({ display: "flex", "align-items": "center", gap: 6, "margin-top": 8 })}; ${txt(15, 700)}"><span aria-hidden="true" style="display:grid">${icon("coach", 16)}</span>The coach planned this for ${X.gym}</p>
  ${printFrame(sessionPrint({ w: cw, h: sm ? 104 : 136, name: "Lifting", count: false, exercises: X.entries.map((x) => ({ sets: x.sets, done: 0, skipped: !!x.dropped })), warmup: { drills: X.warmup.length, done: false, what: "to do" }, paper: t.paper }), { mt: 12 })}
  <section aria-labelledby="g-todo">${capt("To do, in any order", "g-todo")}<ul>${warmRow("Warm-up", X.warmup.join(" · "), false)}${kept.map(row).join("")}</ul></section>
  <section aria-labelledby="g-skip">${capt("Skipped today", "g-skip")}<ul>${X.entries
    .filter((x) => x.dropped)
    .map(row)
    .join("")}</ul></section>
  ${addBtn}`;
  } else {
    const total = UPPER_A.reduce((a, x) => a + x.sets, 0),
      doneSets = UPPER_A.reduce((a, x) => a + x.done, 0);
    const open = UPPER_A.filter((x) => x.state === "open"),
      todo = UPPER_A.filter((x) => x.state !== "open");
    inner = `${header}
  <h2 style="${title(dv.W < 360 ? 34 : 40, { lh: 1 })}; margin-top: 8px">${WK.session}</h2>
  <p style="${txt(15, 500, { color: t.ink2 })}; margin-top: 6px; ${tn}">Bench + back · ${WK.gym}<br><span class="nb">${doneSets} of ${total} sets</span> · <span class="nb">70–90 min</span> · Bench priority</p>
  ${printFrame(sessionPrint({ w: cw, h: sm ? 104 : 136, name: "Lifting", count: false, exercises: UPPER_A.map((x) => ({ sets: x.sets, done: x.done })), warmup: { drills: WK.warmup.drills, done: true }, paper: t.paper }), { mt: 14 })}
  <div style="margin-top:6px">${restRow(t)}</div>
  <section aria-labelledby="g-open">${capt("In progress", "g-open")}<ul>${open.map(row).join("")}</ul></section>
  <section aria-labelledby="g-todo">${capt("To do, in any order", "g-todo")}<ul>${todo.map(row).join("")}</ul></section>
  <section aria-labelledby="g-done">${capt("Done", "g-done")}<ul>${warmRow("Warm-up", `${WK.warmup.name} · ${WK.warmup.drills} drills`, true)}</ul></section>
  ${addBtn}`;
  }
  const body = `${screenMain(t, inner, { dv })}${navbar(t, "today", { nested: true, dv })}`;
  return root(t, body, {
    label: coach ? "Lower A, planned by the coach" : "Upper A, the workout",
    dv,
  });
}

// ---------- FOOD ----------
export function dayBowl(t, state, on = false, size = 22) {
  const c = on ? t.onInk : t.ink,
    w = size,
    h = size * 0.62,
    r = w / 2 - 1.5,
    top = 3;
  const bowl = `M${w / 2 - r} ${top}h${2 * r}a${r} ${r} 0 0 1 ${-2 * r} 0z`;
  const id = `cb${state}${on ? 1 : 0}${size}${t.scheme}`;
  const f = { met: 1, over: 1, logged: 0.5, today: 0.5, none: 0 }[state];
  const fill =
    f > 0
      ? `<clipPath id="${id}"><path d="${bowl}"/></clipPath><rect x="0" y="${(top + r * (1 - f)).toFixed(1)}" width="${w}" height="${(r * f + 1).toFixed(1)}" fill="${c}" clip-path="url(#${id})"/>`
      : "";
  return `<svg width="${w}" height="${h + top}" viewBox="0 0 ${w} ${h + top}" aria-hidden="true" style="display:block;overflow:visible">${fill}<path d="${bowl}" fill="none" stroke="${c}" stroke-width="1.75" stroke-linejoin="round"/>${state === "over" ? `<circle cx="${w / 2}" cy="${top - 3.5}" r="2.2" fill="${c}"/>` : ""}</svg>`;
}
function dayStrip(t, dv) {
  const words = {
    met: "goal met",
    logged: "logged, under the goal band",
    over: "over the goal band",
    none: "nothing logged",
    today: "today, logged so far, on screen",
  };
  const G = gut(dv),
    cw = dv.W - 2 * G,
    fits = (cw - 6 * 4) / 7 >= 44;
  const cells = F.week
    .map((d) => {
      const on = d.state === "today";
      return `<a href="#" aria-label="${d.n} September, ${words[d.state]}" ${on ? 'aria-current="date"' : ""} style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 4, padding: "7px 0 9px", "border-radius": 14, background: on ? t.ink : "transparent", color: on ? t.onInk : t.ink, "min-width": 44 })}"><span style="${txt(13, 600, { color: on ? t.onInk2 : t.ink2 })}">${d.d}</span><span style="${num(21)}">${d.n}</span>${dayBowl(t, d.state, on)}</a>`;
    })
    .join("");
  if (fits)
    return `<div style="${s({ display: "grid", "grid-template-columns": "repeat(7, minmax(0, 1fr))", gap: 4 })}">${cells}</div>`;
  // Too narrow for seven 44 pt days: the strip scrolls, opened at today, and the oldest day shows
  // half of itself at the edge so the scroll is plain.
  const gap = 3,
    inner = 7 * 44 + 6 * gap,
    shift = inner - cw;
  return `<div style="${s({ position: "relative", overflow: "hidden", margin: `0 -${G}px`, padding: `0 ${G}px` })}"><div style="${s({ display: "grid", "grid-template-columns": "repeat(7, 44px)", gap, transform: `translateX(-${shift}px)` })}">${cells}</div><span aria-hidden="true" style="${s({ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, background: `linear-gradient(to right, ${t.ground}, ${rgba0(t.ground)})`, "pointer-events": "none" })}"></span></div>`;
}
export function foodScreen(t, dv = D, { whole = false } = {}) {
  const G = gut(dv),
    cw = dv.W - 2 * G,
    narrow = dv.W < 360;
  // A thin rail in control grey carries the whole target; the ink bar on it is what was eaten.
  const macro = (m) => {
    const isMin = m.kind === "minimum",
      f = Math.min(1, m.eaten / m.target);
    return `<li style="min-width:0"><a href="#" aria-label="${m.name}: ${m.eaten} of ${m.target} grams, ${isMin ? "at least" : "up to"}. Open the breakdown." style="${s({ display: "flex", "flex-direction": "column", gap: 2, "min-height": 44 })}"><span style="${txt(14, 700)}">${m.name}</span><span class="nb" style="${s({ display: "flex", "align-items": "baseline", gap: 3 })}"><span style="${num(28)}">${m.eaten}</span><span style="${txt(13, 600, { color: t.ink2 })}">g</span></span><span class="nb" style="${txt(13, 500, { color: t.ink2 })}; ${tn}">${isMin ? "at least" : "up to"} ${m.target} g</span><span aria-hidden="true" style="${s({ position: "relative", height: 4, "margin-top": 4 })}"><span style="${s({ position: "absolute", left: 0, right: 0, top: 1, height: 2, background: t.control })}"></span><span style="${s({ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(f * 100).toFixed(1)}%`, background: t.ink })}"></span></span></a></li>`;
  };
  const meal = (m) =>
    `<li><a href="#" style="${s({ display: "grid", "grid-template-columns": "minmax(0,1fr) auto", gap: "0 12px", "align-items": "center", "min-height": 58, padding: "8px 0", "border-bottom": `1px solid ${t.hair}` })}"><span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${txt(16, 700)}">${m.name}</span>${m.kcal ? `<span style="${txt(13, 500, { color: t.ink2 })}">${m.items.map((x) => x[0]).join(" · ")}</span>` : ""}</span>${m.kcal ? `<span class="nb" style="${s({ display: "flex", "align-items": "baseline", gap: 4 })}"><span style="${num(24)}">${m.kcal}</span><span style="${txt(13, 600, { color: t.ink2 })}">kcal</span></span>` : `<span style="${s({ display: "flex", "align-items": "center", gap: 6, height: 44 })}; ${txt(15, 700)}">${icon("plus", 18)}Add</span>`}</a></li>`;
  const inner = `${titleHeader(t, dv, "Food", `${F.date} · today`, `<button type="button" aria-haspopup="dialog" aria-label="September, open the calendar" style="${BTN(t, "tonal", { h: 44 })}; padding: 0 ${narrow ? 12 : 14}px">${icon("calendar", 20)}${narrow ? "Sept" : "September"}</button>`)}
  <nav aria-label="Days" style="margin-top:14px">${dayStrip(t, dv)}</nav>
  ${printFrame(bowlPrint({ w: cw, h: narrow ? 226 : 252, paper: t.paper }), { mt: 12 })}
  <ul aria-label="Macros" style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0, 1fr))", gap: narrow ? 12 : 18, "margin-top": 16 })}">${F.macros.map(macro).join("")}</ul>
  <ul aria-label="Meals, in any order" style="margin-top:10px">${F.meals.map(meal).join("")}</ul>
  <div style="${s({ display: "flex", gap: 10, "margin-top": 14 })}">${[
    ["target", "Targets", F.targets],
    ["book", "My foods", F.myFoods],
  ]
    .map(
      ([i, l, f]) =>
        `<a href="#" style="${s({ flex: "1 1 0", display: "flex", "align-items": "center", gap: 10, "min-height": 52, padding: "6px 12px", "border-radius": 14, background: t.surface, "min-width": 0 })}">${icon(i, 20)}<span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${txt(14, 700)}">${l}</span><span style="${txt(13, 600, { color: t.ink2 })}; ${tn}">${f
          .split(" · ")
          .map((x) => `<span class="nb">${x}</span>`)
          .join(" · ")}</span></span></a>`,
    )
    .join("")}</div>`;
  if (whole)
    return wholeBoard(t, inner, dv, "food", `Food at ${dv.W} points wide, the whole scroll`);
  return root(t, `${screenMain(t, inner, { dv })}${navbar(t, "food", { dv })}`, {
    label: "Food, Friday 25 September",
    dv,
  });
}

// ---------- PROGRESS ----------
export function progressScreen(t, dv = D) {
  const G = gut(dv),
    cw = dv.W - 2 * G;
  // One row of sections that scrolls; the chosen one is ink, as everywhere.
  const tabs = P.sections
    .map(
      (x, i) =>
        `<a href="#" ${i === 0 ? 'aria-current="page"' : ""} style="${s({ display: "grid", "place-items": "center", height: 44, padding: "0 16px", "border-radius": 12, background: i === 0 ? t.ink : "transparent", color: i === 0 ? t.onInk : t.ink2, "white-space": "nowrap", "flex-shrink": 0 })}; ${txt(15, i === 0 ? 700 : 600)}">${x}</a>`,
    )
    .join("");
  const rows = [
    [P.totals[0], "lift"],
    [P.totals[1], "run"],
    [P.totals[2], "ride"],
    [P.totals[3], "swim"],
  ]
    .map(
      ([x, sp]) =>
        `<li style="${s({ display: "grid", "grid-template-columns": "24px minmax(0,1fr) auto", gap: "0 12px", "align-items": "center", padding: "10px 0", "border-bottom": `1px solid ${t.hair}` })}"><span style="display:grid">${mark(t, sp, 20)}</span><span style="${txt(16, 700)}">${x.sport}</span><span class="nb" style="${s({ display: "flex", "align-items": "baseline", gap: 5 })}"><span style="${num(30)}">${x.sessions}</span><span style="${txt(13, 600, { color: t.ink2 })}">sessions</span></span><span style="${txt(13, 500, { color: t.ink2 })}; grid-column: 2 / -1; ${tn}">${x.line.split(" · ").slice(1).join(" · ")}</span></li>`,
    )
    .join("");
  const inner = `${titleHeader(t, dv, "Progress", P.range, `<button type="button" aria-haspopup="dialog" style="${BTN(t, "tonal", { h: 44 })}; padding: 0 14px">${icon("sliders", 20)}Filters</button>`)}
  <nav aria-label="Progress sections" style="${s({ position: "relative", margin: `14px -${G}px 0`, overflow: "hidden" })}"><div style="${s({ display: "flex", gap: 4, padding: `0 ${G}px` })}">${tabs}</div><span aria-hidden="true" style="${s({ position: "absolute", right: 0, top: 0, bottom: 0, width: 40, background: `linear-gradient(to left, ${t.ground}, ${rgba0(t.ground)})`, "pointer-events": "none" })}"></span></nav>
  <section aria-label="Every session in the range" style="margin-top:12px">${printFrame(quarterPrint({ w: cw, h: Math.round(Math.min(214, cw * 0.6)), paper: t.paper }))}<p style="${txt(13, 500, { color: t.ink2 })}; margin-top: 6px">A bar under a mark means indoors. The marks are the same as the totals below.</p></section>
  <section aria-labelledby="totals" style="margin-top:2px">
    <div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", height: 44 })}"><h3 id="totals" style="${txt(17, 700)}">Training totals</h3><button type="button" style="${BTN(t, "text", { h: 44 })}; margin-right: -10px; font-weight: 600">${icon("table", 20)}View values</button></div>
    <ul>${rows}</ul>
  </section>`;
  const body = `${screenMain(t, inner, { dv, bottom: navH(dv) + 10 + stripH + 8 })}${strip(t, { dv })}${navbar(t, "progress", { dv })}`;
  return root(t, body, { label: "Progress, overview", dv });
}

// ---------- WHY: the suggestion, explained (a sheet over logging) ----------
// The sheet and its scrim sit above everything on the page, and the sheet scrolls inside itself.
export function whySheet(t, dv = D) {
  const S = SESSIONS.vinit,
    G = gut(dv);
  const sec = (h, inner) =>
    `<section style="${s({ padding: "12px 0", "border-top": `1px solid ${t.hair}` })}"><h3 style="${txt(13, 700, { color: t.ink2 })}">${h}</h3>${inner}</section>`;
  const sheet = `<div role="dialog" aria-modal="true" aria-labelledby="why-title" style="${s({ position: "absolute", left: 0, right: 0, bottom: 0, "z-index": 11, "max-height": `calc(100% - ${dv.top + 12}px)`, "overflow-y": "auto", "overscroll-behavior": "contain", background: t.ground, "border-radius": "24px 24px 0 0", padding: `10px ${G}px ${dv.bottom + 16}px`, "box-shadow": "0 -6px 30px rgba(0,0,0,0.12)" })}">
<span aria-hidden="true" style="${s({ display: "block", width: 40, height: 5, "border-radius": 3, background: t.surface2, margin: "0 auto 10px" })}"></span>
<div style="${s({ display: "flex", "align-items": "center", gap: 10 })}"><span style="${s({ padding: "2px 9px", "border-radius": 8, border: `1.5px solid ${t.ink}` })}; ${txt(13, 700)}">${L.suggestion.kind}</span><h2 id="why-title" style="${title(28)}; flex: 1 1 auto">${L.suggestion.line}</h2><button type="button" aria-label="Close" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "margin-right": -10 })}">${icon("close", 20)}</button></div>
<p style="${txt(16, 500)}; margin: 6px 0 12px; ${tn}">Today: ${L.suggestion.detail}</p>
${sec("Why", `<p style="${txt(16, 500, { "line-height": 1.45 })}; margin-top: 4px; ${tn}">Only 2 of 4 sets logged last time</p>`)}
${sec("Last time", `<p style="${txt(16, 500)}; margin-top: 4px; ${tn}">${S.previous.replace("Previous on this machine: ", "").replace(/ Sep$/, " Sept")}</p>`)}
${sec("Technique", `<ul style="margin-top:4px">${[L.cue, L.targetLoad, `Progression: ${L.progression}`].map((x) => `<li style="${txt(16, 500, { "line-height": 1.45 })}; ${tn}">${x}</li>`).join("")}</ul>`)}
</div>`;
  const body = `${screenMain(t, logBody(t, S, dv), { dv, flex: true, fade: false })}${navbar(t, "today", { nested: true, dv })}<div aria-hidden="true" style="${s({ position: "absolute", inset: 0, "z-index": 10, background: t.scrim })}"></div>${sheet}`;
  return root(t, body, { label: "Why keep 62.5 kg", dv });
}

// ---------- COACH NOTES: lengths and states (a board, not a screen) ----------
export const CW = 402;
export function coachBoard(t = TOKENS.light) {
  const dv = D,
    G = 20;
  const sec = (h, sub, inner) =>
    `<section style="${s({ padding: "20px 0", "border-top": `1px solid ${t.hair}` })}"><h3 style="${txt(17, 700)}">${h}</h3>${sub ? `<p style="${txt(14, 500, { color: t.ink2 })}; margin: 2px 0 10px">${sub}</p>` : '<div style="height:10px"></div>'}${inner}</section>`;
  const status = (text, tone = "note", extra = "") =>
    coachNote(t, { text, tone, dv, more: false, size: 15, role: "status", action: extra || null });
  const ask = `<button type="button" style="${BTN(t, "outline", { h: 44 })}">Ask the coach to plan it now</button>`;
  const longText =
    "Swaps your barbell curl for a cable curl and adds a cable crunch. Bayesian cable curls go in on your upper day. Core work needs one answer before I can place it.";
  const slot = (x) =>
    `<span style="${s({ padding: "0 4px", "border-radius": 4, background: t.surface2 })}">${x}</span>`;
  const sheet = `<div style="${s({ position: "relative", "border-radius": 20, overflow: "hidden", background: t.scrim, padding: "40px 0 0" })}"><div role="dialog" aria-modal="true" aria-labelledby="cs-title" style="${s({ background: t.ground, "border-radius": "20px 20px 0 0", padding: "10px 18px 20px" })}"><span aria-hidden="true" style="${s({ display: "block", width: 40, height: 5, "border-radius": 3, background: t.surface2, margin: "0 auto 10px" })}"></span><p style="${s({ display: "flex", "align-items": "center", gap: 6 })}; ${txt(13, 700)}">${icon("coach", 16)}Coach <span style="${s({ "font-weight": 500, color: t.ink2 })}">· a change to your programme</span></p><h4 id="cs-title" style="${title(24)}; margin-top: 8px">Swaps your barbell curl for a cable curl and adds a cable crunch.</h4><p style="${txt(16, 500, { "line-height": 1.5 })}; margin-top: 10px">Bayesian cable curls go in on your upper day. Core work needs one answer before I can place it.</p><p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 12px">You asked: “Can I have Bayesian cable curls?”</p></div></div>`;
  // A request the coach needs answered (scripts/dev/seed-audit.ts; the controls are request-list.tsx's).
  const answer = `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10, padding: "14px", "border-radius": 14, background: t.surface })}">
<p style="${s({ display: "flex", "align-items": "center", gap: 6 })}; ${txt(13, 700)}">${icon("coach", 16)}Coach <span style="${s({ "font-weight": 500, color: t.ink2 })}">· needs your answer</span></p>
<p style="${txt(16, 700, { "line-height": 1.4 })}">“Add squat practice. Can we move core work to another day?”</p>
<p style="${txt(16, 500, { "line-height": 1.45 })}">Which day works best for your core work?</p>
<label style="${s({ display: "flex", "flex-direction": "column", gap: 6 })}"><span class="sr">Your answer to the coach</span><textarea rows="3" placeholder="Your answer" style="${s({ "min-height": 88, padding: "12px 14px", "border-radius": 12, border: `1.5px solid ${t.control}`, background: t.ground, color: t.ink, "font-family": FONTS.text, "font-size": 16, resize: "none" })}"></textarea></label>
<button type="button" aria-disabled="true" style="${BTN(t, "tonal", { h: 52 })}; background: ${t.surface2}; color: ${t.ink2}">Send answer</button>
<button type="button" style="${BTN(t, "text", { h: 44 })}; align-self: center">I no longer want this</button></div>`;
  return `<div style="${s({ width: CW, "box-sizing": "border-box", padding: `40px ${G}px 40px`, background: t.ground, color: t.ink, "font-family": FONTS.text, "font-size": 16, "line-height": 1.4, "-webkit-font-smoothing": "antialiased" })}">
<h2 style="${title(34)}">Coach notes</h2>
<p style="${txt(16, 500, { "line-height": 1.5 })}; margin-top: 8px">Everything the coach writes uses one quiet block: attributed, black on grey, never on the art and never in colour. At most one per screen; a note on an exercise sits under its targets, marked with the same glyph. Every line below is the repository’s own copy or test data.</p>
${sec("On an exercise", "Under its targets, at most two lines: the Lower A plan the coach-plan test stores", `<ul style="${s({ "border-top": `1px solid ${t.hair}` })}">${exRow(t, LOWER_A.entries[0])}${exRow(t, LOWER_A.entries[5])}</ul>`)}
${sec("One line", "A plan’s own summary, under the workout’s title. A plan without one shows none", coachNote(t, { context: "today’s plan", text: "Find a comfortable starting load.", dv }))}
${sec("Two lines", "A new programme’s headline", coachNote(t, { context: "your new programme", text: "A six-day block built around your confirmed training time.", dv }))}
${sec("Longer than two lines", "Two lines, then More. The browser clamps it, so it holds at 200% text too", coachNote(t, { context: "a change to your programme", text: longText, dv }))}
${sec("More opens a sheet", "The whole text and what you asked. The sheet scrolls: a rationale may run to 3,000 characters", sheet)}
${sec("When the coach needs an answer", "Its question, a field for your answer, and a way out", answer)}
${sec("While it works, and when it cannot", `The status takes the note’s place and says whose targets apply. ${slot("time")} is filled in by the app.`, `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${status(`Coach is planning for Anytime Fitness, since ${slot("time")}. This screen updates itself.`, "planning")}${status("The coach has not planned this session yet. Your programme’s own targets apply until it does. It tries again at its next nightly run.", "note", ask)}${status("The coach could not finish planning this session. Its earlier plan stands until it does. It tries again at its next nightly run.", "failed", ask)}${status("The coach planned this for Samsung Gym, not Anytime Fitness. Re-plan from More options, or start by the rule.")}${status("The coach could not prepare this session, so your programme’s own targets apply.", "failed")}</div>`)}
${sec("Not the coach: the recovery check", "The app’s own rule, from the day’s check-in, on the workout. Same block, its own name", coachNote(t, { who: "Recovery check", tone: "check", title: "Sleep 5.5 h", text: "Hold loads today rather than adding, and keep the RIR honest.", more: false, dv }))}
${sec("Where it goes, and how long it can be", null, `<ul style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}">${["Today: under the day’s title, the coach’s status or who planned it; the plan folds to one line to make room.", "The workout: who planned it, under the title; each exercise’s note under its targets; the recovery check in the same place when there is one.", "Logging: the suggestion is the headline; Why opens the full reason.", "Never between the steppers and Save, and never on a print.", "The app’s own limits: a note 200 characters, a summary 400, a warm-up 8 lines of 160. Inline, nothing passes two lines, so no length can push a screen apart."].map((x) => `<li style="${s({ display: "grid", "grid-template-columns": "14px minmax(0,1fr)", gap: 8 })}; ${txt(15, 500, { "line-height": 1.45 })}"><span aria-hidden="true" style="${s({ width: 6, height: 6, background: t.ink, "margin-top": 8 })}"></span><span>${x}</span></li>`).join("")}</ul>`)}
</div>`;
}

// ---------- THE ALPHABET: how the art grows with the app (a board) ----------
export const ABW = 1400;
export function alphabetBoard(t = TOKENS.light) {
  const cap = (a, b) =>
    `<p style="${txt(15, 700)}; margin-top: 10px">${a}</p>${b ? `<p style="${txt(13, 500, { color: t.ink2, "line-height": 1.4 })}">${b}</p>` : ""}`;
  const tile = (inner, a, b) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><div style="${s({ background: PIG.paper, height: 112, display: "grid", "place-items": "center" })}">${inner}</div>${cap(a, b)}</div>`;
  const sec = (h, sub, inner) =>
    `<section style="${s({ "margin-top": 48 })}"><h3 style="${title(28)}">${h}</h3>${sub ? `<p style="${txt(16, 500, { color: t.ink2, "max-width": 580 })}; margin-top: 6px">${sub}</p>` : ""}<div style="margin-top:20px">${inner}</div></section>`;
  const grid = (cols, inner) =>
    `<div style="${s({ display: "grid", "grid-template-columns": `repeat(${cols}, minmax(0, 1fr))`, gap: "28px 20px" })}">${inner}</div>`;
  const fam = [
    ["strength", "Load", "A slab, cut into its sets. Ultramarine. Lifting, machines, bodyweight."],
    ["run", "On foot", "A disc. Vermilion. Running, and walking and hiking later."],
    ["ride", "On wheels", "A dome. Violet. Cycling, and any wheeled or crank machine."],
    ["swim", "In water", "A wave. Viridian. Swimming, and rowing and paddling later."],
    [
      "mobility",
      "Practice",
      "A quarter disc, cut into drills. Rose. Mobility, warm-ups, yoga later.",
    ],
    ["food", "Food", "The bowl. Cadmium. Never a sport, always on paper."],
    ["play", "Play, reserved", "A triangle. Umber. Court, wall and field sports, when they come."],
  ]
    .map(([k, a, b]) =>
      tile(
        markIcon(k, 64, {
          state: "done",
          segments: k === "strength" ? 3 : k === "mobility" ? 4 : 0,
          done: k === "strength" ? 3 : k === "mobility" ? 4 : 0,
        }),
        a,
        b,
      ),
    )
    .join("");
  const now = [
    ["strength", { segments: 4, done: 2 }, "Strength, 2 of 4 sets", "Segments are its sets"],
    ["run", {}, "A run outdoors", "Size follows its distance or time"],
    ["run", { indoor: true }, "A run on a treadmill", "The platform: indoors, on a machine"],
    ["ride", {}, "A ride outdoors", ""],
    ["ride", { indoor: true }, "A ride indoors", "The rides in the seeded history"],
    ["swim", { indoor: true }, "A swim in a pool", "The platform is the pool"],
    ["swim", {}, "A swim in open water", ""],
    [
      "mobility",
      { segments: 7, done: 3 },
      "Daily mobility, 3 of 7 drills",
      "The rest day’s protocol",
    ],
    ["food", {}, "The day’s bowl", "Filled meal by meal, by area"],
    [
      "strength",
      { segments: 2, done: 0, state: "skipped" },
      "An exercise skipped today",
      "The coach dropped it; its row stays",
    ],
  ]
    .map(([k, o, a, b]) => tile(markIcon(k, 64, o), a, b))
    .join("");
  const states = [
    ["run", { state: "todo" }, "To do", "The pigment thinned into the paper"],
    ["run", { state: "done" }, "Done", "Full ink"],
    ["strength", { segments: 4, done: 2 }, "Partly done", "Ink fills segment by segment"],
    [
      "run",
      { state: "skipped" },
      "Skipped",
      "A dashed edge, nothing inside. Dashed means skipped and nothing else",
    ],
  ]
    .map(([k, o, a, b]) => tile(markIcon(k, 64, o), a, b))
    .join("");
  const later = [
    ["walk", "Walk", "On foot: a ring, lighter than a run"],
    ["hike", "Hike", "On foot: a disc with a peak cut deep into it"],
    ["row", "Row", "In water: one crest, crossed by an oar"],
    ["paddle", "Paddle", "In water: one crest, filled"],
    ["spin", "Spin class", "On wheels: the dome with its hub cut out"],
    ["yoga", "Yoga", "Practice: the quarter disc with an arc drawn in"],
    ["climb", "Climbing", "Play: a stepped triangle"],
    ["racket", "Racket sports", "Play: a triangle and its ball, both umber"],
  ]
    .map(([k, a, b]) => tile(markIcon(k, 64), a, b))
    .join("");
  const sizes = [12, 16, 20, 28, 40]
    .map(
      (sz) =>
        `<div style="${s({ display: "flex", "align-items": "flex-end", gap: Math.max(8, sz * 0.6) })}"><span style="${txt(13, 600, { color: t.ink2, width: 46 })}">${sz} px</span>${["strength", "run", "ride", "swim", "mobility", "food", "walk", "hike", "row", "spin", "yoga", "climb", "racket"].map((k) => markIcon(k, sz)).join("")}</div>`,
    )
    .join("");
  const rules = [
    "Pick the family by how the body moves; the family gives the shape and the pigment.",
    "Give the sport one change to that shape that no other sport in the family has: a ring, a notch, a hub, an arc. A variant changes the shape, never the ground under it.",
    "Context is never a new shape: indoors is a platform, structure is segments, size is time or distance.",
    "It must read at 12 px, next to its name. Colour never carries it alone.",
    "A sport the app does not know yet gets its family’s plain shape and its own name, so anything logged can be printed on day one.",
  ];
  // Layout examples: shapes and names only, no figures and no account data.
  const arms = {
    kind: "strength",
    name: "Lifting",
    count: false,
    rows: [
      [{ n: 3, done: 0 }],
      [{ n: 3, done: 0 }],
      [
        { n: 3, done: 0 },
        { n: 2, done: 0 },
      ],
    ],
  };
  const busy = dayPrint({
    w: 400,
    h: 220,
    ariaLabel: "Layout example: lifting, a run, an indoor ride and mobility on one print",
    parts: [
      arms,
      { kind: "run", name: "Run" },
      { kind: "ride", name: "Ride", indoor: true },
      { kind: "mobility", name: "Mobility", segments: 7, segDone: 0 },
    ],
  });
  const eight = dayPrint({
    w: 400,
    h: 220,
    ariaLabel: "Layout example: eight endurance sessions on one print, five drawn and three more",
    parts: ["run", "ride", "swim", "run", "mobility", "ride", "swim", "run"].map((k) => ({
      kind: k,
      name: { run: "Run", ride: "Ride", swim: "Swim", mobility: "Mobility" }[k],
    })),
  });
  const fig = (inner, a, b) =>
    `<figure style="margin:0"><div style="line-height:0">${inner}</div><figcaption>${cap(a, b)}</figcaption></figure>`;
  return `<div style="${s({ width: ABW, "box-sizing": "border-box", padding: "56px 64px 64px", background: t.ground, color: t.ink, "font-family": FONTS.text, "font-size": 16, "line-height": 1.4, "-webkit-font-smoothing": "antialiased" })}">
<h2 style="${title(56, { lh: 1 })}">The alphabet</h2>
<p style="${txt(18, 500, { "line-height": 1.5, "max-width": 700 })}; margin-top: 12px">The prints are a grammar, not a fixed set of pictures, so they grow with the app. A family says how the body moves and gives a shape and a pigment; a sport is one change to its family’s shape; context and state are modifiers that mean the same on every shape. Colour means family, shape means sport, and a word is always beside it.</p>
${sec("Families", null, grid(7, fam))}
${sec("In the app today", "Strength, running, cycling and swimming, with the variants the app records: treadmill or outdoor, indoor or outdoor, pool or open water.", grid(5, now))}
${sec("State", null, grid(7, states))}
${sec("A busier day", "The coach may plan up to 8 endurance sessions in a day. Forms keep slots of at least 40 px; when their names no longer fit over them they share one line, and past what fits the print says how many more. Layout examples: shapes and names only, not account data.", `<div style="${s({ display: "grid", "grid-template-columns": "repeat(3, 400px)", gap: 28 })}">${fig(busy, "Four kinds on one day", "Names share a line")}${fig(eight, "Eight endurance sessions", "Five drawn, then +3")}</div>`)}
${sec("When more sports come, for example", "Each is one change to its family’s shape. None of these exist in the app yet.", grid(8, later))}
${sec("Every size", "From a 12 px mark beside a name to a print.", `<div style="${s({ display: "flex", "flex-direction": "column", gap: 16 })}">${sizes}</div>`)}
${sec("Adding a sport", null, `<ol style="${s({ display: "flex", "flex-direction": "column", gap: 10, "max-width": 720 })}">${rules.map((x, i) => `<li style="${s({ display: "grid", "grid-template-columns": "28px minmax(0,1fr)", gap: 8 })}; ${txt(17, 500, { "line-height": 1.5 })}"><span style="${num(17, { wt: 700 })}">${i + 1}</span><span>${x}</span></li>`).join("")}</ol>`)}
${sec("One cycle, printed", "The seeded programme’s seven days (src/db/seed/data/program.ts, week 1), each laid out by the same rules. Today’s board follows the app’s preview fixture for Easy Run + Arms, which is lighter than week 1.", grid(4, CYCLE.map((d) => `<figure style="margin:0"><div style="line-height:0">${cyclePrint(d, { w: 300, h: 190 })}</div><figcaption style="${txt(15, 700)}; margin-top: 10px">${d.name}</figcaption></figure>`).join("")))}
</div>`;
}

// ---------- SYSTEM KIT ----------
function weightPrint(t) {
  const pts = P.weights.map(([, kg]) => kg),
    w = 340,
    h = 150,
    min = 75.5,
    max = 78;
  const x = (i) => 14 + (i / (pts.length - 1)) * (w - 64),
    y = (v) => 22 + (1 - (v - min) / (max - min)) * (h - 52);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const n = pts.length - 1,
    f = "font-family:'Atkinson Hyperlegible Next',sans-serif;font-size:12px;font-weight:600";
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" role="img" aria-label="Body weight from 76.05 kg on 8 July to 77.47 kg on 28 September" style="display:block"><rect width="${w}" height="${h}" fill="${t.paper}"/>
${[76, 77].map((v) => `<path d="M14 ${y(v)}H${w - 44}" stroke="${PIG.dot}" stroke-width="1"/><text x="${w - 14}" y="${y(v) + 4}" text-anchor="end" style="${f};fill:${t.paperLabel}">${v}</text>`).join("")}
<path d="${d}" fill="none" stroke="${PIG.ink}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${x(n)}" cy="${y(pts[n])}" r="7" fill="${PIG.verm}"/>
${[
  ["8 Jul", 0],
  ["1 Aug", 4],
  ["1 Sept", 9],
  ["28 Sept", 13],
]
  .map(
    ([l, i]) =>
      `<text x="${x(i)}" y="${h - 10}" text-anchor="${i === 0 ? "start" : i === 13 ? "end" : "middle"}" style="${f};fill:${t.paperLabel}">${l}</text>`,
  )
  .join("")}</svg>`;
}
function gymSheet(t) {
  const gyms = [
    ["Anytime Fitness", "Gym", true],
    ["Samsung Gym", "Gym"],
    ["Society Gym", "Gym"],
    ["Home", "Home"],
    ["Outdoor", "Outdoor"],
  ];
  return `<div style="${s({ position: "relative", height: 500, background: t.scrim, overflow: "hidden" })}">
<div role="dialog" aria-modal="true" aria-labelledby="gym-title" style="${s({ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 0, width: 402, background: t.ground, "border-radius": "24px 24px 0 0", padding: "10px 20px 20px", "overscroll-behavior": "contain" })}">
<span aria-hidden="true" style="${s({ display: "block", width: 40, height: 5, "border-radius": 3, background: t.surface2, margin: "0 auto 8px" })}"></span>
<div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between" })}"><p id="gym-title" style="${title(30)}">Choose gym</p><button type="button" aria-label="Close" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "margin-right": -10 })}">${icon("close", 20)}</button></div>
<ul style="${s({ "margin-top": 6 })}">${gyms.map(([n, k, cur]) => `<li><button type="button" aria-pressed="${!!cur}" style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", width: "100%", "min-height": 58, "border-bottom": `1px solid ${t.hair}`, "text-align": "left" })}"><span style="${s({ display: "flex", "flex-direction": "column" })}"><span style="${txt(16, 700)}">${n}</span><span style="${txt(13, 500, { color: t.ink2 })}">${k}</span></span>${cur ? `<span style="${s({ width: 28, height: 28, "border-radius": 14, background: t.ink, color: t.onInk, display: "grid", "place-items": "center" })}">${icon("check", 16)}</span>` : ""}</button></li>`).join("")}</ul>
<a href="#" style="${s({ display: "flex", "align-items": "center", "justify-content": "center", height: 44, "margin-top": 10, color: t.ink2 })}; ${txt(15, 700)}">Manage gyms</a>
</div></div>`;
}
function printsTile(t) {
  const cap = (a, b) =>
    `<figcaption style="${s({ display: "flex", "flex-direction": "column", gap: 2, "margin-top": 10 })}"><span style="${txt(15, 700)}">${a}</span><span style="${txt(13, 500, { color: t.ink2 })}">${b}</span></figcaption>`;
  const fig = (inner, a, b) =>
    `<figure style="margin:0;min-width:0"><div style="line-height:0">${inner}</div>${cap(a, b)}</figure>`;
  const parts = (runDone, sets) => [
    {
      kind: "strength",
      name: "Arms",
      rows: [
        [{ n: 3, done: sets[0] }],
        [{ n: 3, done: sets[1] }],
        [
          { n: 3, done: sets[2] },
          { n: 2, done: sets[3] },
        ],
      ],
    },
    {
      kind: "run",
      name: "Run",
      figure: runDone ? "logged" : "25–30 min",
      minutes: 30,
      done: runDone,
    },
  ];
  return `<div style="${s({ display: "grid", "grid-template-columns": "repeat(5, minmax(0, 1fr))", gap: 22, "align-items": "start" })}">
${fig(dayPrint({ w: 362, h: 240, parts: parts(false, [0, 0, 0, 0]) }), "The day, before", "Easy Run + Arms: everything thinned")}
${fig(dayPrint({ w: 362, h: 240, parts: parts(true, [3, 2, 0, 0]) }), "The day, as it goes", "The run logged and five sets saved")}
${fig(dayPrint({ w: 362, h: 240, parts: parts(true, [3, 3, 3, 2]) }), "The day, done", "Every shape in full ink")}
${fig(quarterPrint({ w: 362 }), "The quarter", "6 Jul – 30 Sept, one mark a day")}
${fig(dayPrint({ w: 362, h: 240, paper: PAL.dark.paper, parts: parts(true, [3, 2, 0, 0]) }), "The day, in dark", "The same print on near-black paper")}
</div>`;
}
export function kit() {
  const L1 = TOKENS.light,
    D1 = TOKENS.dark;
  const fitNote = (t, label, S, dv) =>
    `<div style="${s({ display: "flex", "flex-direction": "column", gap: 6, width: dv.W - 2 * gut(dv) })}"><p style="${txt(13, 700, { color: t.ink2 })}; ${tn}">${label}</p>${steppers(t, S, dv)}</div>`;
  return {
    title: "Form · system",
    light: L1,
    dark: D1,
    textFont: FONTS.text,
    states,
    h1: (t) => title(68, { lh: 1 }) + `; color: ${t.ink}`,
    h2: (t) => title(32, { lh: 1 }) + `; color: ${t.ink}`,
    mark: (t, size) => markSvg(size, { ink: t.ink }),
    wordmark,
    appIcon,
    icon: (name, size) =>
      ["lift", "run", "ride", "swim"].includes(name)
        ? mark(L1, name, Math.round(size * 0.8))
        : icon(name, size),
    iconRule:
      "24-unit grid · 2.0 stroke · round caps · the destinations are drawn from the forms, filled where you are; the sports are the forms themselves (see The alphabet)",
    tileRadius: 20,
    chipRadius: 10,
    colourTokens: [
      { key: "ground", name: "Ground", job: "The page: the interface is black and white" },
      { key: "surface", name: "Surface", job: "Steppers, tonal buttons, coach notes" },
      {
        key: "ink",
        name: "Ink",
        job: "Text, figures, the main button, whatever is chosen",
        pair: ["ink", "ground"],
        pairLabel: "Ink on ground",
      },
      {
        key: "ink2",
        name: "Ink 2",
        job: "Secondary text, suggested values",
        pair: ["ink2", "ground"],
        pairLabel: "Ink 2 on ground",
      },
      {
        key: "control",
        name: "Control",
        job: "Outline buttons, fields, the macro rail",
        pair: ["control", "ground"],
        pairLabel: "Control on ground",
      },
      {
        key: "paper",
        name: "Paper",
        job: "What every print is made on: warm paper in light, near-black paper in dark",
        on: "printInk",
        pair: ["printInk", "paper"],
        pairLabel: "Print ink on paper",
      },
      {
        key: "ultra",
        name: "Ultramarine",
        job: "Load: slabs and saved sets",
        on: "onUltra",
        pair: ["onUltra", "ultra"],
        pairLabel: "White on ultramarine",
      },
      {
        key: "ultraT",
        name: "Ultramarine, thinned",
        job: "A set or a slab still to do",
        on: "ink",
        pair: ["ink", "ultraT"],
        pairLabel: "Ink on thinned",
      },
      {
        key: "lift",
        name: "Load mark",
        job: "The slab, on the page",
        pair: ["lift", "ground"],
        pairLabel: "Mark on ground",
      },
      {
        key: "run",
        name: "Vermilion",
        job: "On foot: the disc",
        pair: ["run", "ground"],
        pairLabel: "Mark on ground",
      },
      {
        key: "ride",
        name: "Violet",
        job: "On wheels: the dome",
        pair: ["ride", "ground"],
        pairLabel: "Mark on ground",
      },
      {
        key: "swim",
        name: "Viridian",
        job: "In water: the wave",
        pair: ["swim", "ground"],
        pairLabel: "Mark on ground",
      },
      {
        key: "mob",
        name: "Rose",
        job: "Practice: the quarter disc",
        pair: ["mob", "ground"],
        pairLabel: "Mark on ground",
      },
      {
        key: "food",
        name: "Cadmium",
        job: "Food: the bowl, only ever on paper",
        on: "onFood",
        pair: ["onFood", "food"],
        pairLabel: "Ink on cadmium",
      },
    ],
    colourRule:
      "The interface is black and white. Colour means a family of sport and is only ever ink on paper: the prints, and the marks beside a name. Thinned is to do; full ink is done; a dashed edge is skipped.",
    typeScale: [
      {
        name: "Figure XL",
        spec: "Jost · 64/1 · 600 · tabular, on the bowl",
        style: num(64),
        sample: "1,147.5 kcal",
      },
      {
        name: "Entry",
        spec: "Jost · 46 or 40 down to 26 px to fit, never truncated",
        style: num(40, { lh: 1.1 }),
        sample: "62.5 · 140 · 0 1 7",
      },
      {
        name: "Display",
        spec: "Jost · 36–40/1.05 · 700; steps down 4 for a long name, then wraps",
        style: title(40),
        sample: "Easy Run + Arms",
      },
      {
        name: "Figure",
        spec: "Jost · 20–30/1 · 600 · tabular; its zero is plain and narrower than the O",
        style: num(30),
        sample: "22 sessions · 60 × 5 · 2:14",
      },
      {
        name: "Heading",
        spec: "Atkinson Hyperlegible Next · 17/1.3 · 700",
        style: txt(17, 700) + "; " + tn,
        sample: "Training totals · Set 3 · Working",
      },
      {
        name: "Body and coach text",
        spec: "Atkinson Hyperlegible Next · 16/1.45 · 500, two lines inline; numbers in a sentence keep its slashed zero",
        style: txt(16, 500) + "; " + tn,
        sample: "Choose a load leaving three reps in reserve · 0 O 1 l I",
      },
      {
        name: "Caption",
        spec: "Atkinson Hyperlegible Next · 13–15 · 500–700; print labels 12",
        style: txt(14, 500) + "; " + tn,
        sample: "Cycle 1 of 8 · Day 3 · 6 Jul – 30 Sept 2026",
      },
    ],
    typeRule:
      "Jost for titles and figures; Atkinson Hyperlegible Next for everything you read, the coach included. Ranges inside a figure take Atkinson’s en dash",
    spacing: [4, 8, 12, 16, 20, 24, 32, 48],
    spaceFill: (t) => t.ink,
    radii: [
      [0, "prints"],
      [4, "set tiles"],
      [10, "segments"],
      [14, "buttons, notes"],
      [18, "steppers"],
    ],
    elevation: [
      ["Flat: everything on the page", "none", `1px solid ${L1.hair}`],
      ["Floating: the session strip, the only shadow", L1.float],
      ["Sheet: over a scrim, above everything", "none"],
    ],
    navTitle:
      "Tab bar: outlines, filled where you are; 50 pt of targets and 20 pt above the home indicator",
    stripTitle: "Session strip: the unfinished workout, rest as one figure",
    sheetTitle: "Sheet: Choose gym, one tap from Today",
    extraPrimitives: [
      [
        "Coach note: two lines, then More",
        (t) =>
          `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${coachNote(t, { context: "your new programme", text: "A six-day block built around your confirmed training time." })}${coachNote(t, { context: "a change to your programme", text: "Swaps your barbell curl for a cable curl and adds a cable crunch. Bayesian cable curls go in on your upper day. Core work needs one answer before I can place it." })}</div>`,
        { span: 2 },
      ],
      [
        "Figures fit: side by side only where both fit at 30 px",
        (t) =>
          `<div style="${s({ display: "flex", "flex-direction": "column", gap: 16 })}">${fitNote(t, "402 pt · 62.5 kg", SESSIONS.vinit, DEVICES.d402)}${fitNote(t, "375 pt · 140 lb", SESSIONS.pounds, DEVICES.d375)}${fitNote(t, "320 pt · 140 lb, stacked", SESSIONS.pounds, DEVICES.d320)}</div>`,
        { span: 2 },
      ],
      ["The prints: drawn from the account’s records and nothing else", printsTile, { span: 4 }],
    ],
    primitives: {
      button: (t) =>
        `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}"><button type="button" style="${BTN(t, "primary")}">${icon("play", 20)}Start workout</button><button type="button" style="${BTN(t, "primary")}; background: #34353b; transform: scale(0.97)">Start workout · pressed</button><div style="${s({ display: "flex", gap: 10 })}"><button type="button" style="${BTN(t, "tonal", { h: 48 })}; flex: 1 1 0">Log it</button><button type="button" style="${BTN(t, "outline", { h: 48 })}; flex: 1 1 0">${icon("flag", 18)}Finish</button></div><button type="button" style="${BTN(t, "tonal")}; color: ${t.ink2}">Choose RIR to save</button></div>`,
      field: (t) =>
        `<label style="${s({ display: "flex", "flex-direction": "column", gap: 6 })}"><span style="${s({ display: "flex", "justify-content": "space-between" })}"><span style="${txt(14, 700)}">Anything the coach should know</span><span style="${txt(13, 500, { color: t.ink2 })}">Optional</span></span><input type="text" name="coach-note" autocomplete="off" placeholder="Short on time, knee is sore, …" style="${s({ height: 52, padding: "0 16px", "border-radius": 14, border: `1.5px solid ${t.control}`, background: t.ground, color: t.ink, "font-family": FONTS.text, "font-size": 16 })}"><span style="${txt(13, 500, { color: t.ink2 })}">3 requests a day.</span></label>`,
      stepper: (t) =>
        `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}">${steppers(t, SESSIONS.vinit, D)}<p style="${txt(13, 500, { color: t.ink2 })}">Ink 2 with a dotted underline: suggested. Ink once touched, or once RIR is chosen: then it is what Save records. 6+ opens 6 to 10.</p>${rirControl(t, "2", { id: "rir-kit" })}</div>`,
      listRow: (t) =>
        `<div style="${s({ display: "flex", "flex-direction": "column", gap: 12 })}">${setStrip(t, SESSIONS.vinit, D)}${restRow(t)}</div>`,
      sheet: gymSheet,
      stat: (t) =>
        `<div style="${s({ display: "flex", "flex-direction": "column", gap: 6 })}"><span style="display:grid">${mark(t, "lift", 26)}</span><span style="${txt(15, 700)}">Strength</span><span style="${s({ display: "flex", "align-items": "baseline", gap: 8 })}"><span style="${num(64)}">22</span><span style="${txt(16, 700, { color: t.ink2 })}">sessions</span></span><span style="${txt(14, 500, { color: t.ink2 })}; ${tn}">22 days · 18 h 54 min</span></div>`,
      chart: (t) =>
        `<div style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}"><p style="${s({ display: "flex", "align-items": "baseline", gap: 6 })}"><span style="${num(36)}">77.47</span><span style="${txt(14, 600, { color: t.ink2 })}">kg · +1.42 since 8 Jul</span></p>${weightPrint(t)}</div>`,
      tabbar: (t) =>
        `<div style="${s({ position: "relative", height: navH(D), width: 402, margin: "0 auto", background: t.ground })}">${navbar(t, "today")}</div>`,
      strip: (t) =>
        `<div style="${s({ position: "relative", height: 80, width: 402, margin: "0 auto" })}">${strip(t, { bottom: 12 })}</div>`,
    },
    motionSpec: [
      ["Press", "120 ms · cubic-bezier(0.23, 1, 0.32, 1)", "Scale 0.97 on touch-down"],
      [
        "Ink",
        "420 ms · cubic-bezier(0.65, 0, 0.35, 1)",
        "A tile or a shape fills with pigment from its bottom edge, like ink rolled on",
      ],
      [
        "Swap",
        "out 80 ms, then in 120 ms · ease-out",
        "A label or a figure changes in place; the old one is gone before the new one comes",
      ],
      [
        "Sheet",
        "spring · response 0.4 s · damping 0.92",
        "Sheets rise from the bottom edge and follow the finger",
      ],
    ],
    moments: [
      [
        "A set is inked",
        "Save presses. Set 3’s tile clears, then fills with ultramarine from the bottom edge and shows its numbers; set 4 takes the outline, the values go back to suggestions, RIR clears and rest restarts at 3:00.",
        "Press 120 ms · text out 80 ms · ink 420 ms cubic-bezier(0.65, 0, 0.35, 1) · swaps out 80 ms, then in 120 ms · light haptic",
        "the tile changes in a 150 ms cross-fade; nothing moves.",
      ],
      [
        "The day inks up",
        "Each part of the day turns from thinned to full ink on Today’s print: the disc when the run is logged, a segment for each saved set.",
        "Ink 420 ms when Today next shows · one shape at a time, 80 ms apart",
        "shapes change in place in a 150 ms cross-fade.",
      ],
      [
        "Rest runs and ends",
        "The rest row counts down once a second beside +30 s and Stop. At 0:00 it reads Go, which clears after 60 s.",
        "Figures change once a second with no animation · Go 150 ms fade · haptic at 0:00",
        "the same: nothing in the row moves.",
      ],
      [
        "A coach note opens",
        "More lifts the note into a sheet with the whole text; a drag or Close puts it back.",
        "Open spring 0.4 s, damping 0.92 · scrim 200 ms",
        "the sheet fades in and out in 150 ms.",
      ],
    ],
  };
}

// ---------- SIGNATURE: a set is inked ----------
export function momentScreen(t, { reduced = false, dv = D } = {}) {
  const S = SESSIONS.vinit;
  const swap = (a, b, ca, cb) =>
    `<span style="display:inline-grid"><span class="${ca}" style="grid-area:1/1">${a}</span><span class="${cb}" aria-hidden="true" style="grid-area:1/1">${b}</span></span>`;
  const cw = dv.W - 2 * gut(dv),
    tileW = (cw - 18) / 4,
    h = roomy(dv) ? 86 : 78;
  const vSize = Math.min(...["60", "62.5"].map((v) => fit(v, tileW - 20, h > 80 ? 28 : 24, 18)));
  const o = { tileW, h, vSize };
  const tile3 = `<div style="display:grid"><div style="grid-area:1/1;display:grid" class="cur3">${setTile(t, { kind: "now", n: 3, target: "3–5 @ 2" }, S.unit, { ...o, txtCls: "cur3txt" })}</div><div style="grid-area:1/1;display:grid" class="ink3">${setTile(t, { kind: "saved", n: 3, v: "62.5", reps: 3, rir: 2 }, S.unit, o)}</div></div>`;
  const tile4 = `<div style="display:grid"><div style="grid-area:1/1;display:grid" class="next4">${setTile(t, { kind: "next", n: 4, target: "3–5 @ 2" }, S.unit, o)}</div><div style="grid-area:1/1;display:grid" class="cur4">${setTile(t, { kind: "now", n: 4, target: "3–5 @ 2" }, S.unit, o)}</div></div>`;
  const tiles = [
    setTile(t, S.tiles[0], S.unit, o),
    setTile(t, S.tiles[1], S.unit, o),
    tile3,
    tile4,
  ];
  const selHtml = `<span class="sel2" aria-hidden="true" style="${s({ position: "absolute", inset: 0, "border-radius": 10, background: t.ink, color: t.onInk, display: "grid", "place-items": "center" })}">2<span style="${s({ position: "absolute", left: "50%", bottom: 6, width: 4, height: 4, "margin-left": -2, "border-radius": 2, background: t.onInk })}"></span></span>`;
  const saveHtml = `<div style="display:grid">
    <span class="svguard" aria-hidden="true" style="${BTN(t, "tonal")}; grid-area: 1/1; color: ${t.ink2}">Choose RIR to save</span>
    <span class="svsaved" aria-hidden="true" style="${BTN(t, "primary")}; grid-area: 1/1">${icon("check", 20)}Saved</span>
    <button type="button" class="svarmed" style="${BTN(t, "primary")}; grid-area: 1/1">Save set 3 · <span class="nb">62.5 kg × 3 @ 2</span></button>
  </div>`;
  const inner = logBody(t, S, dv, {
    progressHtml: swap("2 of 4", "3 of 4", "p2", "p3"),
    tiles,
    restHtml: restRow(t, { timeHtml: swap("2:14", "3:00", "t1", "t2"), aria: "Rest timer" }),
    headHtml: swap("Set 3", "Set 4", "n3", "n4"),
    rirHtml: rirControl(t, null, { selHtml, dv }),
    saveHtml,
    swap: ["va", "vb"],
  });
  const body = `${screenMain(t, inner, { dv, flex: true, fade: false })}<p class="sr" role="status">Set 3 saved: 62.5 kg, 3 reps, 2 RIR. Rest 3:00.</p>${navbar(t, "today", { nested: true, dv })}`;
  return root(t, body, {
    label: reduced ? "A set is inked, reduced motion" : "A set is inked",
    dv,
  });
}

export function momentCss(t, { reduced = false } = {}) {
  const Lp = 8,
    pct = (sec) => ((sec / Lp) * 100).toFixed(3) + "%";
  const O = "cubic-bezier(0.23, 1, 0.32, 1)",
    INK = "cubic-bezier(0.65, 0, 0.35, 1)";
  const END = 7.2,
    RESET = 7.5;
  // every swap also toggles visibility, so a layer that is not showing is not there at all
  const fade = (cls, a, b, from = 0) =>
    `@keyframes ${cls}{0%,${pct(a)}{opacity:${from};visibility:${from ? "visible" : "hidden"}}${pct(b)},${pct(END)}{opacity:${1 - from};visibility:${from ? "hidden" : "visible"}}${pct(RESET)},100%{opacity:${from};visibility:${from ? "visible" : "hidden"}}}.${cls}{opacity:${from};visibility:${from ? "visible" : "hidden"};animation:${cls} ${Lp}s linear infinite}`;
  // a swap in place: the old word is gone (80 ms) before the new one comes (120 ms)
  const seq = (outCls, inCls, a) =>
    `${fade(outCls, a, a + 0.08, 1)}\n${fade(inCls, a + 0.08, a + 0.2)}`;
  const common = `
${fade("svarmed", 1.35, 1.43, 1)}
@keyframes svsaved{0%,${pct(1.43)}{opacity:0;visibility:hidden}${pct(1.55)},${pct(2.1)}{opacity:1;visibility:visible}${pct(2.18)},100%{opacity:0;visibility:hidden}}.svsaved{opacity:0;animation:svsaved ${Lp}s linear infinite}
${fade("svguard", 2.18, 2.3)}
${fade("cur3txt", 1.32, 1.4, 1)}
${seq("p2", "p3", 1.7)}
${seq("t1", "t2", 1.7)}
${seq("n3", "n4", 1.9)}
${seq("va", "vb", 1.9)}
${fade("sel2", 1.9, 1.98, 1)}
${fade("cur3", 1.82, 1.9, 1)}
${seq("next4", "cur4", 1.75)}`;
  const reducedRules = `
@keyframes ink3R{0%,${pct(1.45)}{opacity:0;visibility:hidden}${pct(1.6)},${pct(END)}{opacity:1;visibility:visible}${pct(RESET)},100%{opacity:0;visibility:hidden}}`;
  const reducedUse = `.ink3{opacity:0;visibility:hidden;clip-path:none;animation:ink3R ${Lp}s linear infinite}
.svarmed{transform:none}`;
  if (reduced) return `${common}\n${reducedRules}\n${reducedUse}`;
  return `${common}
@keyframes press{0%,${pct(1.2)}{transform:scale(1)}${pct(1.28)}{transform:scale(0.97)}${pct(1.4)},100%{transform:scale(1)}}.svarmed{animation:press ${Lp}s ${O} infinite, svarmed ${Lp}s linear infinite}
@keyframes ink3{0%,${pct(1.4)}{clip-path:inset(100% 0 0 0);visibility:hidden}${pct(1.401)}{visibility:visible}${pct(1.82)},${pct(END)}{clip-path:inset(0 0 0 0);visibility:visible}${pct(RESET)},100%{clip-path:inset(100% 0 0 0);visibility:hidden}}.ink3{clip-path:inset(100% 0 0 0);visibility:hidden;animation:ink3 ${Lp}s ${INK} infinite}
${reducedRules}
@media (prefers-reduced-motion: reduce){${reducedUse}}`;
}

// ---------- STATES (system sheet) ----------
export function states(t) {
  const quiet = (label, aria = null) =>
    `<button type="button"${aria ? ` aria-label="${aria}"` : ""} style="${BTN(t, "outline", { h: 44 })}; width: 100%">${label}</button>`;
  const spinner = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 3a9 9 0 1 1-9 9"/></svg>`;
  const warn = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r="1" fill="currentColor" stroke="none"/></svg>`;
  const skel = (w, h = 14) =>
    `<span style="${s({ display: "block", height: h, width: w, "border-radius": 4, background: t.surface2 })}"></span>`;
  const tileBase = {
    display: "flex",
    "flex-direction": "column",
    "justify-content": "space-between",
    height: 78,
    padding: "8px 10px 9px",
    "border-radius": 4,
  };
  return [
    [
      "Offline: a banner under the header",
      `<div role="status" style="${s({ display: "flex", gap: 10, padding: "12px 14px", "border-radius": 14, background: t.surface })}"><span style="${s({ display: "grid", "flex-shrink": 0 })}">${icon("offline", 20)}</span><p style="${txt(14, 600)}">${C.offline}</p></div>`,
    ],
    [
      "A set: saving, saved, not saved",
      `<div style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0, 1fr))", gap: 6 })}"><div role="status" style="${s({ ...tileBase, background: t.ultraT, color: t.ink })}"><span style="${txt(12, 700)}">Set 3</span><span style="display:grid">${spinner}</span><span style="${txt(13, 600)}">Saving</span></div>${setTile(t, { kind: "saved", n: 3, v: "62.5", reps: 3, rir: 2 }, "kg")}<div style="${s({ ...tileBase, border: `2px solid ${t.ink}`, padding: "7px 9px 8px" })}"><span style="${txt(12, 700)}">Set 3</span><span style="display:grid">${warn}</span><span style="${txt(13, 700)}">Not saved</span></div></div><p role="alert" style="${txt(14, 600)}; margin: 10px 0 8px">${C.setFailed}</p>${quiet("Retry", "Retry saving set 3")}`,
    ],
    [
      "A light first set, with no RIR: Save as warm-up",
      `<button type="button" style="${BTN(t, "primary")}; width: 100%">Save as warm-up · <span class="nb">40 kg × 8</span></button><p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 10px">Under 90% of today’s working load, with no RIR and before any working set, the app saves a set as a warm-up. With an RIR it stays a working set.</p>`,
    ],
    [
      "Saved as a warm-up, with Undo",
      `<div style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0, 1fr))", gap: 6 })}">${setTile(t, { kind: "warm", n: 1, v: "40", reps: 8 }, "kg")}</div><p role="status" style="${txt(14, 500, { color: t.ink2 })}; margin-top: 10px">${C.warmup}</p><button type="button" aria-label="Set 1 was a working set" style="${s({ height: 44, "text-decoration": "underline", "text-underline-offset": 3 })}; ${txt(15, 700)}">Undo</button>`,
    ],
    [
      "Rest at 0:00: Go, cleared after 60 s",
      `${restRow(t, { time: "Go", aria: "Rest is over" })}<p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 8px">The row stays one row tall. A haptic marks 0:00; Go clears itself after 60 s, and the row goes with it.</p>`,
    ],
    [
      "Loading, then slow",
      `<div aria-hidden="true" style="${s({ display: "flex", "flex-direction": "column", gap: 10, padding: "4px 0" })}">${skel("100%", 96)}${skel("62%")}${skel("84%")}</div><p role="status" style="${txt(14, 600, { color: t.ink2 })}; margin: 8px 0 10px">${C.slow}</p>${quiet("Retry")}`,
    ],
    [
      "A screen that failed",
      `<div style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}"><p style="${title(28)}">${C.errorTitle}</p><p style="${txt(14, 500, { color: t.ink2 })}">${C.errorBody}</p>${quiet("Try again")}<a href="#" style="${s({ display: "flex", "align-items": "center", "justify-content": "center", height: 44 })}; ${txt(15, 700)}">Back to Today</a></div>`,
    ],
    [
      "Today, a session open, rest running",
      `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10 })}"><p style="${title(28)}">Easy Run + Arms</p><p style="${txt(14, 500, { color: t.ink2 })}; ${tn}">Started Fri 11 Sept, 12:35 · ${L.gym} · 5 sets</p><button type="button" style="${BTN(t, "primary", { h: 52 })}">${icon("play", 20)}Resume session</button><p role="timer" aria-label="Rest, 2 minutes 14 seconds left" style="${s({ display: "flex", "align-items": "center", gap: 6 })}; ${txt(14, 500, { color: t.ink2 })}">${icon("timer", 16)}Rest <span style="${num(20)}; color: ${t.ink}">${L.rest.remaining}</span></p></div>`,
    ],
    [
      "Today, done: the print in full ink",
      `<div style="line-height:0">${dayPrint({
        w: 362,
        h: 220,
        paper: t.paper,
        parts: [
          {
            kind: "strength",
            name: "Arms",
            rows: [
              [{ n: 3, done: 3 }],
              [{ n: 3, done: 3 }],
              [
                { n: 3, done: 3 },
                { n: 2, done: 2 },
              ],
            ],
          },
          { kind: "run", name: "Run", figure: "logged", minutes: 30, done: true },
        ],
        ariaLabel: "Today’s print in full ink: the run and all eleven sets",
      })}</div><p style="${txt(15, 700)}; margin-top: 12px">${C.done}</p><p style="${s({ display: "flex", "align-items": "baseline", "justify-content": "space-between", "margin-top": 6 })}"><span style="${txt(14, 500, { color: t.ink2 })}">Next in the programme</span><span style="${txt(14, 700)}; ${tn}">Lower B · Day 4</span></p>`,
    ],
    [
      "No gym yet",
      `<div style="${s({ display: "flex", "flex-direction": "column", gap: 12 })}"><p style="${title(28)}">${C.noGymTitle}</p><button type="button" style="${BTN(t, "primary")}">${icon("plus", 20)}${C.noGymAction}</button></div>`,
    ],
    [
      "Food: no target yet",
      `<div style="${s({ display: "flex", "flex-direction": "column", gap: 8 })}"><p style="${title(28)}">${C.noTarget}</p><p style="${txt(15, 500, { color: t.ink2 })}; ${tn}">${C.noTargetGoal}</p><button type="button" style="${BTN(t, "primary", { h: 52 })}">${icon("target", 20)}Set target</button></div>`,
    ],
    [
      "Food: how each day went",
      `<ul style="${s({ display: "grid", "grid-template-columns": "1fr 1fr", gap: "14px 12px" })}">${[
        ["met", "Goal met, 90–110%"],
        ["logged", "Logged, under the band"],
        ["over", "Over the band"],
        ["none", "Nothing logged"],
      ]
        .map(
          ([k, l]) =>
            `<li style="${s({ display: "flex", "align-items": "center", gap: 10 })}; ${txt(14, 600)}"><span style="${s({ width: 26, display: "grid", "place-items": "center" })}">${dayBowl(t, k, false, 24)}</span>${l}</li>`,
        )
        .join(
          "",
        )}</ul><p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 12px">The bowl’s level says it as well as the word: 1,147.5 kcal left, Goal met, or 236 over.</p>`,
    ],
    [
      "A record, on the finished workout",
      `<div style="${s({ display: "flex", "flex-direction": "column", gap: 4, padding: "14px 16px", "border-radius": 4, background: t.ultra, color: t.onUltra })}"><p style="${txt(14, 700, { color: t.onUltra2 })}">Record · Barbell bench press</p><p class="nb" style="${s({ display: "flex", "align-items": "baseline", gap: 6 })}"><span style="${txt(15, 700)}">Est. 1RM</span><span style="${num(40)}">88</span><span style="${txt(15, 700)}">kg</span><span style="${txt(14, 600, { color: t.onUltra2 })}">(was 85 kg)</span></p></div><div style="margin-top:10px">${quiet("Save or repeat this workout")}</div>`,
    ],
  ];
}

// ---------- ABOUT: how the art is made, and how it holds up ----------
export const AW = 640;
export function aboutBoard(t = TOKENS.light) {
  const h3 = (x) => `<h3 style="${txt(17, 700)}; margin-top: 30px">${x}</h3>`;
  const p = (x, mt = 10) =>
    `<p style="${txt(16, 500, { "line-height": 1.55 })}; margin-top: ${mt}px">${x}</p>`;
  const li = (x) =>
    `<li style="${s({ display: "grid", "grid-template-columns": "14px minmax(0,1fr)", gap: 10, "margin-top": 8 })}; ${txt(16, 500, { "line-height": 1.5 })}"><span aria-hidden="true" style="${s({ width: 6, height: 6, background: t.ink, "margin-top": 9 })}"></span><span>${x}</span></li>`;
  return `<div style="${s({ width: AW, "box-sizing": "border-box", padding: "48px 48px 56px", background: t.ground, color: t.ink, "font-family": FONTS.text, "font-size": 16, "line-height": 1.45, "-webkit-font-smoothing": "antialiased" })}">
${wordmark(t, 24)}
<h2 style="${title(46)}; margin-top: 26px; text-wrap: balance">The art is your training</h2>
${p("A black-and-white app that stays out of the way. Every colour on screen is a print, made from what this account has logged and nothing else, so the art is the record and the reward at once.", 14)}
${h3("It grows with the app")}
${p("The prints are a grammar, not a set of pictures. A family says how the body moves and gives a shape and a pigment: load, on foot, on wheels, in water, practice, food, and play reserved for later. A new sport is one change cut into its family’s shape, never to the ground under it; indoors, sets and intervals, size, to do, done and skipped mean the same on every shape. A busier day keeps every form in its own slot and says how many more. The alphabet board shows the rules, today’s sports and examples to come.")}
${h3("It fits any phone")}
<ul>${li("Every screen is laid out from the device: 320, 375, 402 and 440 points are drawn here, with and without a home indicator.")}${li("Logging docks the entry above the tab bar and lets the record scroll above it, so a long name, more sets or a wide figure never pushes RIR or Save off the screen.")}${li("Figures never truncate. An entry steps down until it fits; load and reps sit side by side only where both fit at 30 px, so the pounds audit’s 140 lb stacks at 320 instead of shrinking.")}${li("The sets are one row with one figure size: as many as fit at 74 pt share it, and past that the row scrolls sideways, opened at the set you are on.")}${li("RIR keeps seven choices in a row while each is 44 pt wide, and takes two rows below that. 6+ opens 6 to 10, the rest of the app’s range.")}${li("Short screens fold detail behind a tap: Today keeps the plan one tap away, Logging moves the last session into Why.")}${li("The tab bar is 50 pt of targets with 20 pt above the home indicator, not the full 34 pt inset; 8 pt where there is no indicator.")}</ul>
${h3("The coach has one voice")}
${p("Everything an LLM writes sits in one quiet block: attributed, black on grey, never on the art, at most one per screen, two lines and then More, clamped by the browser so it holds at any text size. A note on an exercise sits under its targets. When the coach is planning, has failed or has not planned, its status takes that place and says whose targets apply; when it needs an answer, it asks with a field and a way out.")}
${h3("Rules that keep it clean")}
<ul>${li("The interface is black and white, so a colour always means a sport.")}${li("Text never sits on the art, except labels printed on its paper. In dark, the paper is near-black, so the art is never the brightest thing on screen.")}${li("Nothing is drawn as a sequence: the parts of a day, the exercises and the meals are rows you take in any order. The workout groups exercises by state: in progress, to do, done, skipped.")}${li("A dashed edge means skipped and nothing else.")}${li("Rest is one row: the time, +30 s and Stop.")}${li("Jost for titles and figures; Atkinson Hyperlegible Next for everything you read.")}</ul>
</div>`;
}
