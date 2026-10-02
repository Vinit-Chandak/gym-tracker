// FOOD: the day's bowl, filled meal by meal; past the target it heaps over the rim.
//
// The bowl is the target. Each meal is a layer of the bowl, by area; past the target the food
// heaps above the rim as one symmetric mound (at twice the target the heap closes the circle), so
// "over" reads at a glance without a second colour or a broken shape. The rows below are the
// bowl's legend: each meal is led by its own layer, and nothing on the print repeats them.
import { s } from "./lib.mjs";
import * as K from "./kit.mjs";
import { bowlPrint, palFor } from "./art.mjs";
import { food as F, foodOver } from "./data.mjs";

const { txt, num, icon, tn } = K;

// A day's mark in the strip: an outline bowl; met is full, logged under the band half, over heaps.
export function dayBowl(t, state, on = false, size = 22) {
  const c = on ? t.onInk : t.ink,
    w = size,
    r = w / 2 - 1.5,
    top = 6;
  const bowl = `M${w / 2 - r} ${top}h${2 * r}a${r} ${r} 0 0 1 ${-2 * r} 0z`;
  const id = `cb${state}${on ? 1 : 0}${size}${t.scheme}`;
  const f = { met: 1, over: 1, logged: 0.5, today: 0.5, none: 0 }[state];
  const fill =
    f > 0
      ? `<clipPath id="${id}"><path d="${bowl}"/></clipPath><rect x="0" y="${(top + r * (1 - f)).toFixed(1)}" width="${w}" height="${(r * f + 1).toFixed(1)}" fill="${c}" clip-path="url(#${id})"/>`
      : "";
  const heap =
    state === "over"
      ? `<path d="M${w / 2 - r} ${top}A${r * 1.5} ${r * 1.5} 0 0 1 ${w / 2 + r} ${top}Z" fill="${c}"/>`
      : "";
  return `<svg width="${w}" height="${top + r + 2}" viewBox="0 0 ${w} ${top + r + 2}" aria-hidden="true" style="display:block;overflow:visible">${fill}${heap}<path d="${bowl}" fill="none" stroke="${c}" stroke-width="1.75" stroke-linejoin="round"/></svg>`;
}
function dayStrip(t, dv, week = F.week) {
  const words = {
    met: "goal met",
    logged: "logged, under the goal band",
    over: "over the goal band",
    none: "nothing logged",
    today: "today",
  };
  const G = K.gut(dv),
    cw = dv.W - 2 * G,
    fits = (cw - 6 * 4) / 7 >= 44;
  const cells = week
    .map((d) => {
      const on = d.state === "today" || d.on;
      return `<a href="#" aria-label="${["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"][week.indexOf(d)]} ${d.n} September, ${words[d.on ? d.mark : d.state]}" ${on ? 'aria-current="date"' : ""} style="${s({ display: "flex", "flex-direction": "column", "align-items": "center", gap: 3, padding: "6px 0 8px", "border-radius": 14, background: on ? t.ink : "transparent", color: on ? t.onInk : t.ink, "min-width": 44 })}"><span style="${txt(12, 600, { color: on ? t.onInk2 : t.ink2 })}">${d.d}</span><span style="${num(20)}">${d.n}</span>${dayBowl(t, d.on ? d.mark : d.state, on)}</a>`;
    })
    .join("");
  if (fits)
    return `<div style="${s({ display: "grid", "grid-template-columns": "repeat(7, minmax(0, 1fr))", gap: 4 })}">${cells}</div>`;
  const gap = 3,
    inner = 7 * 44 + 6 * gap,
    shift = inner - cw;
  return `<div style="${s({ position: "relative", overflow: "hidden", margin: `0 -${G}px`, padding: `0 ${G}px` })}"><div style="${s({ display: "grid", "grid-template-columns": "repeat(7, 44px)", gap, transform: `translateX(-${shift}px)` })}">${cells}</div><span aria-hidden="true" style="${s({ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, background: `linear-gradient(to right, ${t.ground}, ${K.rgba0(t.ground)})`, "pointer-events": "none" })}"></span></div>`;
}
// A macro: what was eaten, against its limit (≤) or its minimum (≥), on a rail. Over a limit, the
// ink runs past a tick at the target, so it never reads like the bowl's heap.
const macro = (t, m) => {
  const isMin = m.kind === "minimum",
    f = Math.min(1, m.eaten / m.target);
  return `<li style="min-width:0"><a href="#" aria-label="${m.name}: ${m.eaten} of ${m.target} grams, ${isMin ? "at least" : "up to"}. Open the breakdown." style="${s({ display: "flex", "flex-direction": "column", gap: 2, "min-height": 44 })}"><span style="${txt(14, 700)}">${m.name}</span><span class="nb" style="${s({ display: "flex", "align-items": "baseline", gap: 4 })}"><span style="${num(26)}">${m.eaten}</span><span style="${txt(13, 600, { color: t.ink2 })}; ${tn}">${isMin ? "≥" : "≤"} ${m.target} g</span></span><span aria-hidden="true" style="${s({ position: "relative", height: 4, "margin-top": 4 })}"><span style="${s({ position: "absolute", left: 0, right: 0, top: 1, height: 2, background: t.control })}"></span><span style="${s({ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(f * 100).toFixed(1)}%`, background: t.ink })}"></span></span></a></li>`;
};
// A meal row: its layer as the mark, its foods, its calories; an empty meal is its name and +.
const meal = (t, m, i, strata) => {
  const sw = `<span aria-hidden="true" style="${s({ width: 14, height: 9, background: m.kcal ? strata[i % 3] : "transparent", border: m.kcal ? 0 : `1.5px solid ${t.control}`, "border-radius": "0 0 7px 7px" })}"></span>`;
  if (!m.kcal)
    return `<li><a href="#" aria-label="${m.name}: nothing yet. Add" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 46, "border-bottom": `1px solid ${t.hair}` })}">${K.markCell(sw)}<span style="${txt(16, 600, { color: t.ink2, flex: "1 1 auto" })}">${m.name}</span><span style="${s({ width: 36, height: 36, "border-radius": 18, background: t.surface, display: "grid", "place-items": "center" })}">${icon("plus", 18)}</span></a></li>`;
  return `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 58, padding: "7px 0", "border-bottom": `1px solid ${t.hair}` })}">${K.markCell(sw)}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span style="${txt(16, 700)}">${m.name}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2, "line-height": 1.35 })}">${m.items.join(" · ")}</span></span><span class="nb" style="${num(20)}">${m.kcal.toLocaleString("en-GB")}</span></a></li>`;
};

export function foodScreen(t, dv = K.D, { over = false, whole = false } = {}) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G,
    narrow = dv.W < 360;
  const meals = over
    ? F.meals.map((m) =>
        m.name === "Dinner"
          ? { ...m, kcal: foodOver.dinner.kcal, items: foodOver.dinner.items }
          : m,
      )
    : F.meals;
  const eaten = meals.filter((m) => m.kcal).map((m) => [m.name, m.kcal]);
  const total = eaten.reduce((a, [, k]) => a + k, 0);
  const left = F.target - total;
  const P = palFor(t.paper);
  const fmt = (n) => n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  const figure = `<p style="${s({ display: "flex", "align-items": "baseline", "flex-wrap": "wrap", gap: "0 10px", "margin-top": 16 })}"><span class="nb" style="${num(56)}">${fmt(over ? total - F.target : left)}</span><span style="${txt(17, 700)}">${over ? "kcal over" : "kcal left"}</span></p>`;
  const print = bowlPrint({
    w: cw,
    paper: t.paper,
    meals: eaten,
    target: F.target,
    ariaLabel: `${over ? "The bowl heaped over its rim" : "The bowl"}, filled by ${eaten.map(([n, k]) => `${n} ${fmt(k)} kcal`).join(", ")}: ${fmt(total)} of ${fmt(F.target)} kcal.`,
  });
  const macros = over ? foodOver.macros : F.macros;
  const inner = `${K.topHeader(t, dv, "Food", K.iconBtn(t, "calendar", "September: open the calendar", { "margin-right": -10 }))}
<nav aria-label="Days" style="margin-top:8px">${dayStrip(t, dv, over ? F.week.map((d) => (d.state === "today" ? { ...d, on: true, mark: "over" } : d)) : F.week)}</nav>
${figure}
${K.printFrame(print, { mt: 8 })}
<ul aria-label="Macros" style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0, 1fr))", gap: narrow ? 12 : 18, "margin-top": 14 })}">${macros.map((m) => macro(t, m)).join("")}</ul>
<ul aria-label="Meals" style="margin-top:8px">${meals
    .map((m) =>
      meal(
        t,
        m,
        eaten.findIndex(([n]) => n === m.name),
        P.strata,
      ),
    )
    .join("")}</ul>
<div style="${s({ display: "flex", gap: 10, "margin-top": 12 })}">${[
    ["target", "Targets", F.targets],
    ["book", "My foods", F.myFoods],
  ]
    .map(
      ([i, l, f]) =>
        `<a href="#" style="${s({ flex: "1 1 0", display: "flex", "align-items": "center", gap: 10, "min-height": 52, padding: "6px 12px", "border-radius": 14, background: t.surface, "min-width": 0 })}">${icon(i, 20)}<span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span style="${txt(14, 700)}">${l}</span><span class="wrap" style="${txt(13, 600, { color: t.ink2 })}; ${tn}">${f}</span></span></a>`,
    )
    .join("")}</div>`;
  if (whole)
    return K.wholeBoard(t, inner, dv, "food", `Food at ${dv.W} points wide, the whole scroll`);
  return K.root(t, `${K.screenMain(t, inner, { dv })}${K.navbar(t, "food", { dv })}`, {
    label: over ? "Food, Friday 25 September, over the target" : "Food, Friday 25 September",
    dv,
  });
}
