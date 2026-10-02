// The rest of the app in the same language: Training, the coach, Profile and its settings, and the
// first run. Every figure and line is the repository's: src/app/(app)/training, profile, the
// onboarding under src/app/(onboarding)/welcome, the coach's audit seed (scripts/dev/seed-audit.ts),
// seed-people.ts for the person, and src/db/seed/data for the programme and its template.
import { s, esc } from "./lib.mjs";
import * as K from "./kit.mjs";
import { dayPrint } from "./art.mjs";
import { cycle, today as T, me, machineCatalogue as MC } from "./data.mjs";

const { txt, title, icon, tn } = K;
export const sect = (t, label, rows, { mt = 18 } = {}) =>
  `<section>${label ? K.caption(t, label, { mt }) : `<div style="height:${mt - 6}px"></div>`}<ul>${rows}</ul></section>`;
// A settings row: its glyph in the mark column, the label, a value, then a chevron or a control.
export const setRow = (
  t,
  ic,
  label,
  { value = "", trail = null, last = false, href = "#", badge = "" } = {},
) =>
  `<li><a href="${href}" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 50, "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(`<span style="display:grid;color:${t.ink}">${icon(ic, 21)}</span>`)}<span class="wrap" style="${txt(16, 600, { flex: "1 1 auto" })}">${label}</span>${badge ? `<span class="nb" style="${s({ padding: "3px 9px", "border-radius": 10, background: t.ink, color: t.onInk })}; ${txt(13, 700)}">${badge}</span>` : ""}${value ? `<span class="nb" style="${txt(15, 500, { color: t.ink2 })}">${value}</span>` : ""}${trail ?? K.chev(t)}</a></li>`;
// A segmented choice: two to four words on a surface, the chosen one in ink.
export const seg = (t, items, on, label, { h = 44, size = 16 } = {}) =>
  `<div role="radiogroup" aria-label="${esc(label)}" style="${s({ display: "grid", "grid-template-columns": `repeat(${items.length}, minmax(0,1fr))`, gap: 2, padding: 3, background: t.surface, "border-radius": 14 })}">${items.map((x, i) => `<button type="button" role="radio" aria-checked="${i === on}" style="${s({ height: h, "border-radius": 11, background: i === on ? t.ink : "transparent", color: i === on ? t.onInk : t.ink, padding: "0 6px", "min-width": 0 })}; ${txt(size, 700)}"><span class="nb">${x}</span></button>`).join("")}</div>`;
export const labelled = (t, label, control, { note = "" } = {}) =>
  `<div style="${s({ display: "flex", "flex-direction": "column", gap: 6 })}"><span style="${txt(14, 700)}">${label}</span>${control}${note ? `<span style="${txt(13, 500, { color: t.ink2 })}">${note}</span>` : ""}</div>`;
// A tile that starts something: its mark top left, its word bottom left.
export const startTile = (t, markHtml, word, { h = 76, href = "#" } = {}) =>
  `<a href="${href}" style="${s({ display: "flex", "flex-direction": "column", "justify-content": "space-between", height: h, padding: "12px 12px 10px", "border-radius": 14, background: t.surface, "min-width": 0 })}"><span style="display:grid;justify-items:start">${markHtml}</span><span class="nb" style="${txt(15, 700)}">${word}</span></a>`;

// ---------- TRAINING: the programme as its seven prints, and logging the other sports ----------
// The cycle in order, two to a row, with today's day the full width: seven tiles and no gap. A
// day's state is its ink (done full, to do thinned), so the tiles carry only their names.
export function trainingScreen(t, dv = K.D) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G,
    gap = 10;
  const tile = (d, i) => {
    const wide = i === T.dayIndex - 1;
    const done = i < T.daysDone;
    const cols = (d.columns || []).flatMap((c) =>
      Array.isArray(c)
        ? c.map((n, j) => ({ n, done: done ? n : 0, pair: j === 0 }))
        : [{ n: c, done: done ? c : 0 }],
    );
    const parts = [];
    if (cols.length) parts.push({ kind: "strength", columns: cols });
    if (d.run) parts.push({ kind: "run", minutes: d.minutes, done });
    if (d.drills)
      parts.push({ kind: "mobility", segments: d.drills, segDone: done ? d.drills : 0, done });
    const tw = wide ? cw : (cw - gap) / 2;
    const state = done ? "done" : wide ? "today" : "to do";
    return `<li style="${s({ "min-width": 0, "grid-column": wide ? "1 / -1" : undefined })}"><a href="#" aria-label="Day ${i + 1}, ${esc(d.name)}, ${state}" style="display:block"><div style="${s({ "line-height": 0, outline: wide ? `2.5px solid ${t.ink}` : undefined, "outline-offset": wide ? 2 : undefined })}">${dayPrint({ w: tw, h: wide ? 92 : 64, paper: t.paper, parts, ariaLabel: "" })}</div><span style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline", gap: 8, "margin-top": 6 })}"><span class="wrap" style="${txt(14, 700, { "line-height": 1.25 })}">${d.name}</span>${wide ? `<span class="nb" style="${txt(13, 700)}">Today</span>` : ""}</span></a></li>`;
  };
  const inner = `${K.topHeader(t, dv, "Training", K.iconBtn(t, "plus", "Schedule an activity", { "margin-right": -10 }))}
<section aria-labelledby="prog" style="margin-top:4px">
<h3 id="prog" style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline", gap: 10 })}"><a href="#" class="wrap" style="${txt(16, 700)}">${T.programme}</a><span class="nb" style="${txt(14, 600, { color: t.ink2 })}; ${tn}">Cycle ${T.cycle} of ${T.cycles}</span></h3>
<ol aria-label="The cycle’s seven days" style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: `14px ${gap}px`, "margin-top": 10 })}">${cycle.map(tile).join("")}</ol>
</section>
<section aria-labelledby="log" style="margin-top:20px">${K.caption(t, "Log", { mt: 0, id: "log" })}<div style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: 8, "margin-top": 6 })}">${startTile(t, K.stateMark(t, "run", 22), "Running")}${startTile(t, K.stateMark(t, "ride", 22), "Cycling")}${startTile(t, K.stateMark(t, "swim", 22), "Swimming")}</div></section>
${sect(t, "", `${setRow(t, "calendar", "Scheduled")}${setRow(t, "note", "Templates", { last: true })}`, { mt: 14 })}`;
  return K.root(t, `${K.screenMain(t, inner, { dv })}${K.navbar(t, "training", { dv })}`, {
    label: "Training",
    dv,
  });
}

// ---------- THE COACH: what it needs from you, what it proposes, what it knows ----------
// The audit seed's coach for vinit: one question waiting, one change proposed, the memo, and the
// three notes it has read, each with what became of it.
export function coachScreen(t, dv = K.D) {
  const G = K.gut(dv);
  const answer = `<div style="${s({ display: "flex", "flex-direction": "column", gap: 10, padding: 14, "border-radius": 14, background: t.surface })}">
<p style="${s({ display: "flex", "align-items": "center", gap: 6 })}; ${txt(13, 700)}">${icon("coach", 16)}Needs your answer</p>
<p style="${txt(17, 700, { "line-height": 1.3 })}">Which day works best for your core work?</p>
<label><span class="sr">Your answer to the coach</span><textarea rows="2" placeholder="Your answer" style="${s({ width: "100%", "min-height": 70, padding: "12px 14px", "border-radius": 14, border: `1.5px solid ${t.control}`, background: t.ground, color: t.ink, "font-family": K.FONTS.text, "font-size": 16, resize: "none", display: "block" })}"></textarea></label>
<div style="${s({ display: "flex", gap: 6, "flex-wrap": "wrap", "align-items": "center" })}"><button type="button" style="${K.BTN(t, "primary", { h: 44 })}; padding: 0 18px; font-size: 15px">Send answer</button><button type="button" style="${K.BTN(t, "text", { h: 44 })}; font-size: 15px; color: ${t.ink2}">I no longer want this</button></div></div>`;
  const change = `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 62, padding: "8px 0" })}">${K.markCell(`<span style="display:grid">${icon("plus", 20)}</span>`)}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span style="${txt(16, 700)}">Add squat practice</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}">Add the requested squat practice and one set to the first movement.</span></span>${K.chev(t)}</a></li>`;
  const note = (text, outcome, last = false) =>
    `<li style="${s({ padding: "10px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}"><p style="${txt(15, 600, { "line-height": 1.4 })}">${text}</p><p style="${txt(13, 500, { color: t.ink2 })}; margin-top: 2px">${outcome}</p></li>`;
  const inner = `${K.nestedHeader(t, "Profile", `<span style="margin-right:-10px">${K.iconBtn(t, "more", "Goals, availability and reports; programme changes and requests")}</span>`)}
<div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", gap: 12, "margin-top": 2 })}"><h2 style="${s({ display: "flex", "align-items": "center", gap: 6 })}; ${title(34)}">AI coach<button type="button" aria-label="About the AI coach" aria-haspopup="dialog" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", color: t.ink2, "margin-left": -4 })}">${icon("info", 20)}</button></h2>${K.toggle(t, true, "AI coach")}</div>
<div style="margin-top:8px">${answer}</div>
${sect(t, "Waiting for you", change)}
<section>${K.caption(t, "What the coach knows", { mt: 14 })}<p style="${txt(16, 500, { "line-height": 1.45 })}; margin-top: 4px">Prefers training after work. Keep sessions within an hour.</p></section>
${sect(t, "Tell the coach", `${note("Next week I can train on Saturday as well.", "Not read yet")}${note("I prefer training after work.", "Remembered")}${note("Add squat practice. Can we move core work to another day?", "Queued for your programme review — Squat practice proposed; a question remains about core work.", true)}`)}`;
  const ask = `<div style="${s({ position: "absolute", left: G, right: G, bottom: K.navH(dv) + 10, display: "flex", gap: 8, "align-items": "center", padding: "6px 6px 6px 16px", "border-radius": 16, border: `1.5px solid ${t.control}`, background: t.ground })}"><label class="wrap" style="${s({ flex: "1 1 auto", "min-width": 0 })}"><span class="sr">Notes for the coach</span><span aria-hidden="true" style="${txt(16, 500, { color: t.ink2 })}">Notes for the coach</span></label><button type="button" aria-label="Send note" style="${s({ width: 44, height: 44, "border-radius": 12, background: t.ink, color: t.onInk, display: "grid", "place-items": "center", "flex-shrink": 0 })}">${icon("send", 20)}</button></div>`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv, bottom: K.navH(dv) + 10 + 58 + 8 })}${ask}${K.navbar(t, "profile", { dv, nested: true })}`,
    { label: "AI coach", dv },
  );
}

// ---------- PROFILE: the person, then everything they can set, grouped ----------
// The programme lives under Training now, so Profile is the person and their settings. Units and
// time zone stay in Edit profile, where the app keeps them.
export const avatar = (t, letter, size = 56) =>
  `<span aria-hidden="true" style="${s({ width: size, height: size, "border-radius": 9999, background: t.surface, color: t.ink, display: "grid", "place-items": "center", "flex-shrink": 0 })}; ${title(Math.round(size * 0.46), { lh: 1 })}">${letter}</span>`;
export function profileScreen(t, dv = K.D) {
  const person = `<div style="${s({ display: "flex", "align-items": "center", gap: 12, "margin-top": 6 })}"><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 14, flex: "1 1 auto", "min-width": 0 })}">${avatar(t, "V")}<span style="${s({ display: "flex", "flex-direction": "column", "min-width": 0 })}"><span class="wrap" style="${txt(20, 700)}">${me.name}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">@${me.handle} · ${me.followers} follower · ${me.following} following</span></span></a><a href="#" aria-label="Edit profile" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "border-radius": 9999, background: t.surface, "flex-shrink": 0 })}">${icon("edit", 20)}</a></div>`;
  const inner = `${K.topHeader(t, dv, "Profile")}
${person}
${sect(t, "", setRow(t, "people", "Friends", { badge: `${me.requests} request`, last: true }), { mt: 14 })}
${sect(t, "Training", `${setRow(t, "pin", "Gyms and machines")}${setRow(t, "book", "Exercise library")}${setRow(t, "rest", "Rest timer", { trail: K.toggle(t, true, "Rest timer") })}${setRow(t, "coach", "AI coach", { value: "On", last: true })}`)}
${sect(t, "Preferences", `${setRow(t, "contrast", "Appearance", { value: "System" })}${setRow(t, "lock", "Privacy", { last: true })}`)}
${sect(t, "Account", `${setRow(t, "key", "Password")}${setRow(t, "link", "Coach access")}${setRow(t, "exit", "Sign out", { trail: "" })}${setRow(t, "trash", "Delete account", { last: true })}`)}`;
  return K.root(t, `${K.screenMain(t, inner, { dv })}${K.navbar(t, "profile", { dv })}`, {
    label: "Profile",
    dv,
  });
}
// Appearance, a sheet over Profile.
export function appearanceScreen(t, dv = K.D) {
  const under = profileScreen(t, dv)
    .replace(/^<div[^>]*><h1 class="sr">[^<]*<\/h1>/, "")
    .replace(/<\/div>$/, "");
  const opt = (l, on, ic) =>
    `<li><button type="button" role="radio" aria-checked="${on}" style="${s({ display: "flex", "align-items": "center", gap: 12, width: "100%", "min-height": 56, "border-bottom": `1px solid ${t.hair}`, "text-align": "left" })}">${K.markCell(`<span style="display:grid">${icon(ic, 22)}</span>`)}<span style="${txt(17, 600, { flex: "1 1 auto" })}">${l}</span>${on ? `<span style="${s({ width: 26, height: 26, "border-radius": 9999, background: t.ink, color: t.onInk, display: "grid", "place-items": "center" })}">${icon("check", 15)}</span>` : ""}</button></li>`;
  const inner = `<div style="${s({ display: "flex", "align-items": "center", gap: 10 })}"><h2 id="ap-title" style="${title(28)}; flex: 1 1 auto">Appearance</h2><button type="button" aria-label="Close sheet" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", "margin-right": -10 })}">${icon("close", 20)}</button></div><ul role="radiogroup" aria-labelledby="ap-title" style="margin-top:4px">${opt("System", true, "contrast")}${opt("Light", false, "sun")}${opt("Dark", false, "moon")}</ul>`;
  return K.root(t, `${under}${K.sheet(t, inner, { dv, id: "ap-title" })}`, {
    label: "Appearance",
    dv,
  });
}
export function editProfileScreen(t, dv = K.D) {
  const inner = `${K.nestedHeader(t, "Profile")}
<h2 style="${title(34)}; margin-top: 2px">Edit profile</h2>
<div style="${s({ display: "flex", "flex-direction": "column", gap: 16, "margin-top": 14 })}">
${K.field(t, "Name", { value: me.name })}
${K.field(t, "Username", { value: me.handle, help: "3 to 20 characters: lowercase letters, digits, dots and underscores." })}
${K.field(t, "Time zone", { value: "Asia/Kolkata" })}
${labelled(t, "Units", seg(t, ["kg (kilograms)", "lb (pounds)"], 0, "Units", { size: 15 }), { note: "Height in centimetres." })}
<div style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: 12 })}">${K.field(t, "Body weight (kg)", { value: me.weight })}${K.field(t, "Height (cm)", { value: me.height })}</div>
</div>`;
  const G = K.gut(dv);
  const foot = `<div style="${s({ position: "absolute", left: G, right: G, bottom: K.navH(dv) + 12 })}"><button type="button" style="${K.BTN(t, "primary")}; width: 100%">Save</button></div>`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv, bottom: K.navH(dv) + 12 + 56 + 8 })}${foot}${K.navbar(t, "profile", { dv, nested: true })}`,
    { label: "Edit profile", dv },
  );
}

// ---------- THE FIRST RUN: You, Sports, Gym, Machines, Plan ----------
const steps = (t, at) =>
  `<ol aria-label="Setup progress" style="${s({ display: "flex", gap: 6, "align-items": "center" })}">${[
    "You",
    "Sports",
    "Gym",
    "Machines",
    "Plan",
  ]
    .map(
      (n, i) =>
        `<li aria-label="${n}, ${i < at ? "completed" : i === at ? "current step" : "not started"}" style="${s({ width: i === at ? 22 : 8, height: 8, "border-radius": 9999, background: i <= at ? t.ink : t.surface2 })}"></li>`,
    )
    .join("")}</ol>`;
function onboardFrame(t, dv, at, inner, foot, { label }) {
  const G = K.gut(dv);
  const two = foot.includes("<a ");
  const head = `<header style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", height: 48 })}">${at ? `<a href="#" aria-label="Back" style="${s({ display: "flex", "align-items": "center", height: 44, "margin-left": -10, "padding-right": 6 })}; ${txt(17, 700)}">${icon("chevronLeft", 22)}Back</a>` : `<span></span>`}${steps(t, at)}</header>`;
  return K.root(
    t,
    `${K.screenMain(t, head + inner, { dv, bottom: dv.bottom + 8 + 56 + (two ? 46 : 0) + 10 })}<div style="${s({ position: "absolute", left: G, right: G, bottom: dv.bottom + 8, display: "flex", "flex-direction": "column", gap: 2 })}">${foot}</div>`,
    { label, dv },
  );
}
const stepTitle = (t, dv, text) =>
  `<h2 style="${title(dv.W < 360 ? 30 : 34)}; margin-top: 8px">${text}</h2>`;
const sub = (t, text, mt = 6) =>
  `<p style="${txt(16, 500, { color: t.ink2, "line-height": 1.45 })}; margin-top: ${mt}px">${text}</p>`;
const skip = (t, label = "Skip for now") =>
  `<a href="#" style="${s({ display: "grid", "place-items": "center", height: 44 })}; ${txt(15, 700)}">${label}</a>`;
const go = (t, label) => `<button type="button" style="${K.BTN(t, "primary")}">${label}</button>`;

export function welcomeScreen(t, dv = K.D) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const print = dayPrint({
    w: cw,
    h: K.short(dv) ? 96 : 128,
    paper: t.paper,
    align: "center",
    parts: [
      {
        kind: "strength",
        columns: [
          { n: 2, done: 2 },
          { n: 3, done: 3 },
        ],
      },
      { kind: "run", minutes: 30, done: true },
      { kind: "ride", done: true },
      { kind: "swim", minutes: 30, done: true },
    ],
    ariaLabel: "A print: lifting, a run, a ride and a swim",
  });
  const inner = `${K.printFrame(print, { mt: 6 })}
${stepTitle(t, dv, "Welcome to Overload")}
${sub(t, "A few short steps. Everything here can be changed later, from your profile.")}
<div style="${s({ display: "flex", "flex-direction": "column", gap: 14, "margin-top": 16 })}">${K.field(t, "What should we call you?", { value: me.name, optional: true })}${K.field(t, "Username", { value: me.handle, help: "Available." })}
<div style="${s({ display: "grid", "grid-template-columns": "minmax(0,0.9fr) minmax(0,1.1fr)", gap: 12, "align-items": "end" })}">${labelled(t, "Weight units", seg(t, ["kg", "lb"], 0, "Weight units", { h: 46 }))}${K.field(t, "Time zone", { value: "Asia/Kolkata" })}</div></div>`;
  return onboardFrame(t, dv, 0, inner, go(t, "Continue"), { label: "Welcome, step 1 of 5" });
}
export function sportsScreen(t, dv = K.D) {
  const chip = (k, l, on) =>
    `<button type="button" role="checkbox" aria-checked="${on}" style="${s({ display: "flex", "flex-direction": "column", "align-items": "flex-start", "justify-content": "space-between", height: 120, padding: 14, "border-radius": 16, background: on ? t.ink : t.surface, color: on ? t.onInk : t.ink, "text-align": "left" })}"><span style="${s({ display: "grid", padding: 7, "border-radius": 10, background: on ? t.ground : "transparent" })}">${K.stateMark(t, k, 28, { state: on ? "done" : "todo" })}</span><span style="${s({ display: "flex", "justify-content": "space-between", width: "100%", "align-items": "center" })}"><span style="${txt(17, 700)}">${l}</span>${on ? icon("check", 20) : ""}</span></button>`;
  const inner = `${stepTitle(t, dv, "What do you train?")}
${sub(t, "Pick everything that applies. You can change this whenever you like.")}
<div role="group" aria-label="Sports" style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: 10, "margin-top": 18 })}">${chip("strength", "Strength", true)}${chip("run", "Running", true)}${chip("ride", "Cycling", false)}${chip("swim", "Swimming", false)}</div>
${sub(t, "Only lifting needs a gym set up. The rest you can start logging straight away.", 14)}`;
  return onboardFrame(t, dv, 1, inner, go(t, "Continue"), { label: "Your sports, step 2 of 5" });
}
export function gymStepScreen(t, dv = K.D) {
  const inner = `${stepTitle(t, dv, "Where do you train?")}
<div style="${s({ display: "flex", "flex-direction": "column", gap: 16, "margin-top": 18 })}">${K.field(t, "Name", { value: "Anytime Fitness", placeholder: "e.g. Anytime Fitness, Home" })}
${labelled(
  t,
  "Type",
  K.iconChoice(
    t,
    [
      ["machine", "Gym"],
      ["outdoor", "Outdoor"],
      ["indoor", "Home"],
    ],
    0,
    { label: "Type" },
  ),
)}</div>`;
  return onboardFrame(t, dv, 2, inner, `${go(t, "Add gym")}${skip(t)}`, {
    label: "Add your gym, step 3 of 5",
  });
}
// Machines: the catalogue as ticks, grouped; the count says what will be added.
export function machinesStepScreen(t, dv = K.D) {
  const tick = (name) => {
    const on = MC.ticked.includes(name);
    return `<li><label style="${s({ display: "flex", "align-items": "center", gap: 10, "min-height": 52, height: "100%", padding: "6px 10px 6px 12px", "border-radius": 12, background: on ? t.ink : t.surface, color: on ? t.onInk : t.ink })}"><input type="checkbox" ${on ? "checked" : ""} class="sr"><span aria-hidden="true" style="${s({ width: 22, height: 22, "border-radius": 6, border: on ? 0 : `1.5px solid ${t.control}`, background: on ? t.onInk : "transparent", color: t.ink, display: "grid", "place-items": "center", "flex-shrink": 0 })}">${on ? icon("check", 15) : ""}</span><span class="wrap" style="${txt(15, 600, { "line-height": 1.25 })}">${name}</span></label></li>`;
  };
  const inner = `${stepTitle(t, dv, "What does Anytime Fitness have?")}
<p style="${s({ display: "flex", "align-items": "center", gap: 2, "margin-top": 2 })}; ${txt(16, 500, { color: t.ink2 })}">Tick the machines it has.<button type="button" aria-label="About machines" aria-haspopup="dialog" style="${s({ width: 44, height: 44, display: "grid", "place-items": "center", color: t.ink2 })}">${icon("info", 18)}</button></p>
<label style="${s({ display: "flex", "align-items": "center", gap: 10, height: 48, padding: "0 14px", "border-radius": 14, border: `1.5px solid ${t.control}`, "margin-top": 2 })}"><span style="display:grid;color:${t.ink2}">${icon("search", 20)}</span><span class="sr">Find a machine</span><span aria-hidden="true" style="${txt(16, 500, { color: t.ink2 })}">Find a machine</span></label>
<div style="${s({ display: "flex", "align-items": "center", gap: 4, "margin-top": 8 })}"><button type="button" style="${K.BTN(t, "tonal", { h: 40 })}; padding: 0 12px; font-size: 14px">Select all machines</button><button type="button" style="${K.BTN(t, "text", { h: 40 })}; font-size: 14px">Clear all</button><span style="flex:1 1 auto"></span><span role="status" style="${txt(14, 700)}; ${tn}">${MC.ticked.length} selected</span></div>
${K.caption(t, "Machines", { mt: 12 })}
<ul style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: 6, "margin-top": 4 })}">${MC.Machines.map(tick).join("")}</ul>`;
  return onboardFrame(t, dv, 3, inner, `${go(t, "Add and continue")}${skip(t)}`, {
    label: "Machines at your gym, step 4 of 5",
  });
}
export function planStepScreen(t, dv = K.D) {
  const G = K.gut(dv),
    cw = dv.W - 2 * G;
  const opt = (ttl, subText, ic, last = false) =>
    `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 64, padding: "8px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(`<span style="display:grid">${icon(ic, 22)}</span>`)}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span style="${txt(16, 700)}">${ttl}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}">${subText}</span></span>${K.chev(t)}</a></li>`;
  const cols = [3, 3, 3, 2, 3, 2].map((n) => ({ n, done: 0 }));
  const tpl = `<div style="${s({ "border-radius": 16, border: `2px solid ${t.ink}`, padding: 12, "margin-top": 14 })}"><label style="display:block"><input type="radio" name="programme" checked class="sr"><span style="display:block;line-height:0">${dayPrint({ w: cw - 28, h: 76, paper: t.paper, parts: [{ kind: "strength", columns: cols }], ariaLabel: "" })}</span><span style="${s({ display: "flex", "align-items": "flex-start", gap: 8, "margin-top": 10 })}"><span class="wrap" style="${txt(17, 700, { flex: "1 1 auto" })}">${T.programme}</span><span style="${s({ width: 24, height: 24, "border-radius": 9999, background: t.ink, color: t.onInk, display: "grid", "place-items": "center", "flex-shrink": 0 })}">${icon("check", 14)}</span></span><span style="${txt(14, 500, { color: t.ink2, "line-height": 1.4, display: "block" })}; margin-top: 2px">Strength first, muscle second, with two easy runs and a mobility day.</span><span style="${txt(14, 600, { display: "block" })}; margin-top: 8px; ${tn}">8 weeks, 7-day cycle (6 lifting days)</span></label><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 8, height: 44, "margin-top": 6, "border-top": `1px solid ${t.hair}` })}"><span style="display:grid">${icon("calendar", 18)}</span><span style="${txt(15, 600, { flex: "1 1 auto" })}">Start date</span><span style="${txt(15, 700)}">Today</span>${icon("chevronDown", 16)}</a></div>`;
  const inner = `${stepTitle(t, dv, "Choose a programme")}
${tpl}
<ul style="margin-top:6px">${opt("Create with the coach", "Answer a few questions and the coach writes it.", "coach")}${opt("Build it yourself", "Choose your own days, exercises and targets.", "edit", true)}</ul>`;
  return onboardFrame(
    t,
    dv,
    4,
    inner,
    `${go(t, "Start training")}${skip(t, "Just track my workouts")}`,
    { label: "Choose a programme, step 5 of 5" },
  );
}
