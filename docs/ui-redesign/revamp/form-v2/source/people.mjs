// People, places and the account: Friends, Gyms and a gym, Privacy, Delete account, and the coach's
// proposed change. Copy and values from src/app/(app)/profile (friends, privacy, delete-account),
// src/app/(app)/gyms, src/components/coaching/change-detail.tsx and program-diff-view.tsx, with the
// preview's change (src/app/(preview)/preview/coaching/page.tsx), seed-people.ts and the fixtures.
import { s } from "./lib.mjs";
import * as K from "./kit.mjs";
import { feed, gymList, machines, unavailable, change as CH, me } from "./data.mjs";
import { sect, setRow, avatar } from "./more.mjs";

const { txt, num, title, icon, tn } = K;
const pageTitle = (t, text, size = 34) =>
  `<h2 style="${title(size)}; margin-top: 2px">${text}</h2>`;

// ---------- FRIENDS: four ways in, then what the people you follow did ----------
export function friendsScreen(t, dv = K.D) {
  const tile = (ic, label, badge = "") =>
    `<a href="#" style="${s({ position: "relative", display: "flex", "flex-direction": "column", "justify-content": "space-between", height: 84, padding: "12px 12px 10px", "border-radius": 14, background: t.surface, "min-width": 0 })}"><span style="display:grid;justify-items:start">${icon(ic, 24)}</span><span class="nb" style="${txt(15, 700)}">${label}</span>${badge ? `<span style="${s({ position: "absolute", top: 10, right: 10, padding: "3px 9px", "border-radius": 10, background: t.ink, color: t.onInk })}; ${txt(13, 700)}">${badge}</span>` : ""}</a>`;
  const rowFor = (r, last) => {
    const lead =
      r.sport === "strength"
        ? K.colMark(t, Math.min(4, r.sets > 12 ? 4 : 3), Math.min(4, r.sets > 12 ? 4 : 3))
        : K.stateMark(t, r.sport, 16);
    return `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 64, padding: "8px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${avatar(t, r.initial, 40)}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0, gap: 2 })}"><span style="${s({ display: "flex", "justify-content": "space-between", gap: 8, "align-items": "baseline" })}"><span class="wrap" style="${txt(16, 700)}">${r.who}</span><span class="nb" style="${txt(13, 600, { color: t.ink2 })}">${r.day}</span></span><span style="${s({ display: "flex", "align-items": "center", gap: 8 })}"><span style="${s({ display: "grid", width: 16, "justify-items": "center", "flex-shrink": 0 })}">${lead}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${r.text}</span></span></span></a></li>`;
  };
  const inner = `${K.nestedHeader(t, "Profile")}
${pageTitle(t, "Friends")}
<div style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: 8, "margin-top": 14 })}">${tile("trophy", "Leaderboard")}${tile("scales", "Compare")}${tile("personPlus", "Find people")}${tile("people", "People", `${me.requests} request`)}</div>
${sect(t, "Recent activity", feed.map((r, i) => rowFor(r, i === feed.length - 1)).join(""))}`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv })}${K.navbar(t, "profile", { dv, nested: true })}`,
    { label: "Friends", dv },
  );
}

// ---------- GYMS: each place as its kind of glyph, the default marked ----------
const KIND = { gym: ["machine", "Gym"], outdoor: ["outdoor", "Outdoor"], home: ["indoor", "Home"] };
export function gymsScreen(t, dv = K.D) {
  const rowFor = (g, last) =>
    `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 60, padding: "8px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(`<span role="img" aria-label="${KIND[g.kind][1]}" style="display:grid">${icon(KIND[g.kind][0], 22)}</span>`)}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span class="wrap" style="${txt(16, 700)}">${g.name}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}; ${tn}">${g.meta}</span></span>${g.def ? `<span class="nb" style="${s({ padding: "3px 9px", "border-radius": 8, border: `1.5px solid ${t.ink}` })}; ${txt(13, 700)}">Default</span>` : ""}${K.chev(t)}</a></li>`;
  const inner = `${K.nestedHeader(t, "Profile", `<button type="button" style="${K.BTN(t, "tonal", { h: 36 })}; padding: 0 12px; font-size: 15px; margin-right: 12px">${icon("plus", 18)}Add gym</button>`)}
${pageTitle(t, "Gyms")}
<ul style="margin-top:10px">${gymList.map((g, i) => rowFor(g, i === gymList.length - 1)).join("")}</ul>`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv })}${K.navbar(t, "profile", { dv, nested: true })}`,
    { label: "Gyms", dv },
  );
}
// A gym: its machines, each led by its kind of equipment, and what it lacks.
export function gymScreen(t, dv = K.D) {
  const rowFor = (m, last) =>
    `<li><a href="#" style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 56, padding: "7px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(`<span style="display:grid">${icon(m.glyph, 21)}</span>`)}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span class="wrap" style="${txt(16, 700)}">${m.name}</span><span class="wrap" style="${txt(14, 500, { color: t.ink2 })}">${m.load}</span></span>${m.step ? `<span class="nb" style="${num(16)}; color: ${t.ink2}">${m.step}</span>` : ""}${K.chev(t)}</a></li>`;
  const lack = (name, last) =>
    `<li style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 52, padding: "4px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(`<span style="display:grid;color:${t.ink2}">${icon("close", 18)}</span>`)}<span class="wrap" style="${txt(15, 600, { flex: "1 1 auto", color: t.ink2 })}">${name}</span><button type="button" style="${K.BTN(t, "text", { h: 44 })}; font-size: 15px; margin-right: -10px">Remove</button></li>`;
  const head = (label, action) =>
    `<div style="${s({ display: "flex", "align-items": "center", "justify-content": "space-between", "margin-top": 16 })}">${K.caption(t, label, { mt: 0 })}${action}</div>`;
  const inner = `${K.nestedHeader(t, "Gyms", `<button type="button" style="${K.BTN(t, "text", { h: 44 })}; margin-right: 6px; font-size: 16px">Edit</button>`)}
${pageTitle(t, "Anytime Fitness")}
${K.metaLine(t, [`${icon("machine", 16)}<span>Gym</span>`, `${icon("check", 16)}<span>Default gym</span>`], { mt: 4 })}
${head("Equipment", `<button type="button" style="${K.BTN(t, "tonal", { h: 36 })}; padding: 0 12px; font-size: 14px">${icon("plus", 16)}Add machine</button>`)}
<ul>${machines.map((m, i) => rowFor(m, i === machines.length - 1)).join("")}</ul>
${head("Unavailable equipment", "")}
<ul>${unavailable.map((n, i) => lack(n, i === unavailable.length - 1)).join("")}</ul>`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv })}${K.navbar(t, "profile", { dv, nested: true })}`,
    { label: "Anytime Fitness", dv },
  );
}

// ---------- PRIVACY: what followers see, a switch at a time ----------
export function privacyScreen(t, dv = K.D) {
  const sw = (label, subText, on, { lead = "", last = false } = {}) =>
    `<li style="${s({ display: "flex", "align-items": "center", gap: 12, "min-height": 64, padding: "10px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${lead ? K.markCell(lead) : ""}<span style="${s({ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-width": 0 })}"><span class="wrap" style="${txt(16, 700)}">${label}</span>${subText ? `<span class="wrap" style="${txt(14, 500, { color: t.ink2, "line-height": 1.35 })}">${subText}</span>` : ""}</span>${K.toggle(t, on, label)}</li>`;
  const inner = `${K.nestedHeader(t, "Profile")}
${pageTitle(t, "Privacy")}
<ul style="margin-top:8px">
${sw("Approve follow requests", "Off means anyone in the app can follow you without asking.", true)}
${sw("Share training with followers", "Off means followers see your profile card only: no stats, no records, not on their leaderboards.", true)}
${sw("Share body weight for relative strength", "On means followers who also share theirs see “per kg of body weight” rows and rankings.", true)}
${sw("Let people find me by email", "Off means the exact-email lookup does not return you; username search still does.", true, { last: true })}
</ul>
${K.caption(t, "Rides and swims", { mt: 18 })}<p style="${txt(14, 500, { color: t.ink2, "line-height": 1.35 })}">Share the date, duration and known distance. Share training with followers must also be on.</p>
<ul>${sw("Cycling", "", true, { lead: K.stateMark(t, "ride", 16) })}${sw("Swimming", "", true, { lead: K.stateMark(t, "swim", 16), last: true })}</ul>
${sect(t, "", `${setRow(t, "people", "What a follower can see")}${setRow(t, "lock", "What nobody can see", { last: true })}`, { mt: 12 })}`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv })}${K.navbar(t, "profile", { dv, nested: true })}`,
    { label: "Privacy", dv },
  );
}

// ---------- DELETE ACCOUNT: one sentence, a word to type, one button ----------
export function deleteAccountScreen(t, dv = K.D) {
  const G = K.gut(dv);
  const inner = `${K.nestedHeader(t, "Profile")}
${pageTitle(t, "Delete account")}
<p style="${txt(17, 500, { "line-height": 1.45 })}; margin-top: 12px">Permanently removes your gyms, machines, programmes, sessions, sets, activities and tokens. Nothing is exported first.</p>
<div style="margin-top:20px">${K.field(t, "Type DELETE to confirm", { value: "" })}</div>`;
  const foot = `<div style="${s({ position: "absolute", left: G, right: G, bottom: K.navH(dv) + 12 })}"><button type="button" aria-disabled="true" style="${K.BTN(t, "waiting")}; width: 100%">${icon("trash", 20)}Delete everything</button></div>`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv, bottom: K.navH(dv) + 12 + 56 + 8 })}${foot}${K.navbar(t, "profile", { dv, nested: true })}`,
    { label: "Delete account", dv },
  );
}

// ---------- THE COACH'S CHANGE: the programme diff, line by line, then one answer ----------
// Each operation is led by a glyph (added +, replaced ⇄, moved →, changed ✎) and its word; a field
// that changes reads "old → new" with the new value in ink.
const OP = {
  Added: "plus",
  Replaced: "swap",
  "Moved to another day": "arrowRight",
  "Moved here": "arrowRight",
  Changed: "edit",
};
export function programmeChangeScreen(t, dv = K.D) {
  const G = K.gut(dv);
  const arrow = `<span aria-label="becomes" style="${s({ display: "inline-grid", color: t.ink2, "vertical-align": "-3px", margin: "0 4px" })}">${icon("arrowRight", 15)}</span>`;
  const field = ([k, a, b]) =>
    `<p style="${txt(15, 500, { color: t.ink2 })}; ${tn}">${k} <span style="text-decoration:line-through">${a}</span>${arrow}<span style="${s({ color: t.ink, "font-weight": 700 })}">${b}</span></p>`;
  const op = (o, last) => {
    const lead = OP[o.op] ? icon(OP[o.op], 18) : K.stateMark(t, "run", 16);
    const name = o.to ? `${o.name}${arrow}${o.to}` : o.name || "";
    return `<li style="${s({ display: "flex", gap: 12, padding: "10px 0", "border-bottom": last ? 0 : `1px solid ${t.hair}` })}">${K.markCell(`<span style="display:grid;padding-top:2px">${lead}</span>`).replace("align-items: center", "align-items: flex-start")}<span style="${s({ display: "flex", "flex-direction": "column", gap: 2, flex: "1 1 auto", "min-width": 0 })}"><span style="${txt(12, 700, { color: t.ink2, "letter-spacing": "0.02em" })}">${o.op}</span>${name ? `<span class="wrap" style="${txt(16, 700)}">${name}</span>` : ""}${(o.lines || []).map(field).join("")}${o.rx ? `<p style="${txt(15, 500, { color: t.ink2 })}; ${tn}">${o.rx}</p>` : ""}${o.note ? `<p style="${txt(14, 500, { color: t.ink2 })}">${o.note}</p>` : ""}${o.tag ? `<p style="margin-top:4px"><span style="${s({ display: "inline-block", padding: "3px 9px", "border-radius": 8, background: t.surface })}; ${txt(13, 600)}">“${CH.ask}”</span></p>` : ""}</span></li>`;
  };
  const day = (d) =>
    `<section style="${s({ "margin-top": 14, padding: "4px 14px 6px", "border-radius": 14, border: `1.5px solid ${t.hair}` })}"><h3 style="${s({ display: "flex", "justify-content": "space-between", "align-items": "baseline", height: 40 })}"><span style="${txt(17, 700)}">${d.name}</span><span style="${txt(14, 600, { color: t.ink2 })}">${d.when}</span></h3>${(d.fields || []).map((f) => `<div style="padding-bottom:6px">${field(f)}</div>`).join("")}<ul style="border-top:1px solid ${t.hair}">${d.ops.map((o, i) => op(o, i === d.ops.length - 1)).join("")}</ul></section>`;
  const inner = `${K.nestedHeader(t, "Profile")}
<h2 style="${title(26, { lh: 1.15 })}; margin-top: 2px">${CH.headline}</h2>
<details style="margin-top:10px"><summary style="${s({ display: "flex", "align-items": "center", gap: 6, height: 44, "list-style": "none", cursor: "pointer" })}; ${txt(15, 700)}">${icon("info", 18)}Why</summary></details>
<section style="${s({ "margin-top": 4, padding: "4px 14px 8px", "border-radius": 14, border: `1.5px solid ${t.hair}` })}"><h3 style="${s({ display: "flex", "align-items": "center", height: 40 })}; ${txt(17, 700)}">Programme</h3>${CH.programme.map(field).join("")}</section>
${CH.days.map(day).join("")}
<p style="${txt(14, 500, { color: t.ink2 })}; margin-top: 14px">This changes the programme's structure, so it starts a new block.</p>`;
  const foot = `<div style="${s({ position: "absolute", left: G, right: G, bottom: K.navH(dv) + 10, display: "flex", "flex-direction": "column", gap: 4, background: t.ground })}"><div style="${s({ display: "flex", gap: 8 })}"><button type="button" style="${K.BTN(t, "primary")}; flex: 1 1 auto">Approve</button><button type="button" style="${K.BTN(t, "tonal")}">Decline</button></div><button type="button" style="${s({ height: 40 })}; ${txt(15, 700)}">Ask for changes</button></div>`;
  return K.root(
    t,
    `${K.screenMain(t, inner, { dv, bottom: K.navH(dv) + 10 + 56 + 44 + 8 })}${foot}${K.navbar(t, "profile", { dv, nested: true })}`,
    { label: "Programme change", dv },
  );
}
