// TODAY: what is owed today, where, and one tap to start it.
//
// The print is the day; the rows under it are its legend, each led by a small copy of its part
// (a column of sets, the run's stride), so the print carries no words and nothing is said twice.
// The programme's position is seven squares, not a sentence; status is shown only when it is news
// (behind, skipped, done). Everything starts at one left edge.
import { s, esc } from "./lib.mjs";
import * as K from "./kit.mjs";
import { dayPrint } from "./art.mjs";
import { today as T } from "./data.mjs";

const { txt, num, title, icon, tn } = K;

// The cycle as seven squares: done days in ink, today ringed, the rest a hairline.
export function cycleMark(t, { day = 3, done = 2, of = 7, cycle = 1, cycles = 8 } = {}) {
  const sq = 9,
    g = 4;
  const cells = Array.from({ length: of }, (_, i) => {
    const x = i * (sq + g);
    if (i < done) return `<rect x="${x}" y="1" width="${sq}" height="${sq}" fill="${t.ink}"/>`;
    if (i === day - 1)
      return `<rect x="${x + 1}" y="2" width="${sq - 2}" height="${sq - 2}" fill="none" stroke="${t.ink}" stroke-width="2"/>`;
    return `<rect x="${x + 0.5}" y="1.5" width="${sq - 1}" height="${sq - 1}" fill="none" stroke="${t.control}" stroke-width="1"/>`;
  }).join("");
  const w = of * sq + (of - 1) * g;
  return `<a href="#" aria-label="Cycle ${cycle} of ${cycles}, day ${day} of ${of}. Open the programme" style="${s({ display: "flex", "align-items": "center", height: 44, padding: "0 2px" })}"><svg width="${w}" height="${sq + 2}" viewBox="0 0 ${w} ${sq + 2}" aria-hidden="true" style="display:block">${cells}</svg></a>`;
}

// The gym, as a choice: a pin and the name. Shown because the account has more than one gym.
export const gymChoice = (t, name = T.gym.name, { size = 15 } = {}) =>
  `<button type="button" aria-haspopup="dialog" aria-label="Gym: ${esc(name)}. Change" style="${s({ display: "inline-flex", "align-items": "center", gap: 4, height: 32, "min-width": 0, color: t.ink2, "margin-left": -2 })}; ${txt(size, 600)}">${icon("pin", 17)}<span class="nb" style="overflow:hidden;text-overflow:ellipsis">${name}</span>${icon("chevronDown", 15)}</button>`;

// One planned exercise: its column of sets, its name, its targets.
export function planRow(t, x, { last = false, dv = K.D } = {}) {
  const narrow = dv.W < 360,
    rowH = dv.H < 800 ? 38 : 44;
  return `<li style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": rowH, padding: "3px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(K.colMark(t, x.sets, x.done || 0, { label: `${x.sets} sets` }))}<span style="${s({ display: "flex", "flex-wrap": "wrap", "justify-content": "space-between", "align-items": "baseline", gap: "0 10px", flex: "1 1 auto", "min-width": 0 })}"><span class="wrap" style="${txt(narrow ? 15 : 16, 600)}">${x.name}</span><span class="nb" style="${txt(narrow ? 14 : 15, 500, { color: t.ink2 })}; ${tn}">${K.dashes(x.rx).replace(/<span[^>]*>–<\/span>/g, "–")}</span></span></li>`;
}

export function todayScreen(t, dv = K.D, { coach = null, label = "Today" } = {}) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G,
    narrow = dv.W < 360,
    short = K.short(dv),
    tiny = dv.H < 600;
  const ph = coach ? (short ? 104 : 160) : tiny ? 96 : short ? 132 : dv.H >= 900 ? 250 : 214;
  const cols = T.plan.map((x, i) => ({
    n: x.sets,
    done: 0,
    pair: x.superset && T.plan[i + 1]?.superset === x.superset,
  }));
  const print = dayPrint({
    w: cw,
    h: ph,
    paper: t.paper,
    parts: [
      { kind: "strength", columns: cols },
      { kind: "run", minutes: T.run.minutes },
    ],
    ariaLabel:
      "Today’s print: four arm exercises as columns of their sets, the superset under one beam, and the run’s stride. Nothing done yet.",
  });
  // the run, then the plan: one mark column, one name edge
  const runRow = `<li style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": short ? 50 : 56, padding: short ? "4px 0" : "6px 0", "border-bottom": `1px solid ${t.hair}` })}">${K.markCell(K.stateMark(t, "run", 18, { state: "todo", label: "Run, to do" }))}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span style="${s({ display: "flex", "align-items": "baseline", gap: 8, "flex-wrap": "wrap" })}"><span style="${txt(17, 700)}">Run</span><span class="nb" style="${num(20)}">${K.dashes(T.run.target)} <span style="${txt(14, 600, { color: t.ink2 })}">${T.run.unit}</span></span></span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}">${T.run.note}</span></span><a href="#" style="${K.BTN(t, "tonal", { h: 44 })}; padding: 0 16px">Log it</a></li>`;
  const ss = T.plan.filter((x) => x.superset);
  const single = T.plan.filter((x) => !x.superset);
  const plan = `${single.map((x) => planRow(t, x, { dv })).join("")}<li style="position:relative"><ul aria-label="Superset: ${ss.map((x) => x.name).join(" and ")}">${ss.map((x, i) => planRow(t, x, { dv, last: i === ss.length - 1 })).join("")}</ul>${K.supersetBracket(t, "Superset")}</li>`;
  const pinned = K.navH(dv) + (tiny ? 10 : 12);
  const body = `${K.screenMain(
    t,
    `<header style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 8, height: 44 })}"><p style="${txt(17, 700)}; ${tn}">${T.date}</p>${cycleMark(t, { day: T.dayIndex, done: T.daysDone, cycle: T.cycle, cycles: T.cycles })}</header>
${K.printFrame(print, { mt: 2 })}
<section aria-labelledby="day" style="margin-top:${tiny ? 8 : 12}px">
  <h2 id="day" style="${title(K.titleSize(T.day, cw, narrow ? 30 : short ? 32 : 36))}">${T.day}</h2>
  ${K.metaLine(t, [gymChoice(t), `${icon("rest", 16)}<span>${T.time}</span>`], { mt: 2 })}
</section>
${coach ? `<div style="margin-top:10px">${K.coachNote(t, { ...coach, dv, size: 15 })}</div>` : ""}
${short && !coach ? "" : `<p style="${txt(14, 500, { color: t.ink2 })}; margin-top: ${coach ? 10 : 8}px">${T.notes}</p>`}
<ul aria-label="Today, in any order" style="margin-top:2px">${runRow}${plan}</ul>`,
    { dv, bottom: pinned + 56 + 8, fade: tiny ? 12 : true },
  )}
<div style="${s({ position: "absolute", left: G, right: G, bottom: pinned, display: "flex", gap: 10 })}">
  <button type="button" style="${K.BTN(t, "primary")}; flex: 1 1 auto; min-width: 0">${icon("play", 20)}Start workout</button>
  <button type="button" aria-label="More options: another day, ad hoc, the coach, skip" aria-haspopup="dialog" style="${K.BTN(t, "tonal", { w: 56 })}">${icon("more", 24)}</button>
</div>
${K.navbar(t, "today", { dv })}`;
  return K.root(t, body, { label, dv });
}
