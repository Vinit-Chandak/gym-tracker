// Native: how Form v2 goes to iOS and Android. The screens are the same; the shell is the
// platform's. Built from the native review (critique C) and the decisions on these boards.
import { s, esc } from "./lib.mjs";
import * as K from "./kit.mjs";

export const NW = 1400;
const { txt, title } = K;
const L = K.TOKENS.light;
const PAD = 64,
  GAP = 24;
const H2 = (text, note = "") =>
  `<div style="${s({ display: "flex", "flex-direction": "column", gap: 6 })}"><h2 style="${title(32, { lh: 1 })}">${text}</h2>${note ? `<p style="${txt(16, 500, { color: L.ink2, "max-width": 1000, "line-height": 1.45 })}">${note}</p>` : ""}</div>`;
const section = (inner) =>
  `<section style="${s({ display: "flex", "flex-direction": "column", gap: 18 })}">${inner}</section>`;
const table = (head, rows, widths) =>
  `<table style="${s({ width: "100%", "border-collapse": "collapse" })}; ${txt(14, 500)}"><thead><tr>${head.map((h, i) => `<th style="${s({ "text-align": "left", padding: "10px 12px 10px 0", "border-bottom": `2px solid ${L.ink}`, width: widths?.[i] })}; ${txt(14, 700)}">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td style="${s({ "vertical-align": "top", padding: "10px 12px 10px 0", "border-bottom": `1px solid ${L.hair}`, "font-weight": i ? 500 : 700, "line-height": 1.4 })}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const code = (x) =>
  `<code style="${s({ "font-family": "ui-monospace, monospace", "font-size": 13, background: L.surface, padding: "1px 5px", "border-radius": 6 })}">${esc(x)}</code>`;

function shells() {
  return section(`${H2("One design, three shells", "The content is Form v2 everywhere: prints, marks, the log, steppers, the moment a set is written. The chrome is the platform’s: on iOS and Android the system draws bars, sheets and keyboards, and Form lives inside them.")}
${table(
  ["", "iOS (SwiftUI)", "Android (Compose)", "Web app (now)"],
  [
    [
      "The session",
      `${code(".fullScreenCover")} with ${code(".navigationTransition(.zoom)")} from the tab bar’s bottom accessory (iOS 26), or a ${code("safeAreaInset")} bar (iOS 18): it grows out of the strip and swipes back into it`,
      `A full-screen destination; the strip lives in ${code("Scaffold.bottomBar")} and predictive back collapses the session into it`,
      "A fixed layer over the tabs; the strip on every screen",
    ],
    [
      "Tab bar",
      `The system ${code("TabView")}: 49 + 34 pt, a floating glass bar on iOS 26`,
      `${code("NavigationBar")} or ${code("ShortNavigationBar")} (64 dp) plus the navigation-bar inset`,
      "64 pt: 44-pt targets ending 4 clear of the home indicator; 11 under them where there is none",
    ],
    [
      "Sheets",
      `${code(".presentationDetents([.medium, .large])")}; menus for set options`,
      `${code("ModalBottomSheet")}; ${code("DropdownMenu")} for set options`,
      "A dialog with a scrim; each sheet adds a history entry",
    ],
    [
      "Typing a figure",
      `${code(".keyboardType(.decimalPad)")} with a Previous / Next / Done toolbar`,
      `${code("KeyboardType.Decimal")}, ${code("ImeAction.Next")}`,
      `${code('inputmode="decimal"')} at 16 px; ${code("visualViewport")} keeps the figure and Save above the pad`,
    ],
    [
      "Steppers",
      `Press and hold repeats: ${code(".buttonRepeatBehavior(.enabled)")}`,
      "A repeat after 400 ms, 10 steps a second",
      "The same, in script",
    ],
    [
      "Rest ending",
      `A Live Activity (${code("Text(timerInterval:)")}; +30 s and Stop as App Intents) and a time-sensitive notification`,
      "An ongoing notification with a chronometer (a Live Update on Android 16) and an alert that survives Doze",
      "Go on screen and a Web Push from the server",
    ],
    [
      "Icons",
      "Destinations and sport marks as custom SF Symbols (outline and fill); actions from SF Symbols",
      "Destinations and marks as vector drawables; actions from Material Symbols Rounded, weight 400",
      "The drawn set on the system sheet",
    ],
    [
      "Colour",
      "Ink on ground; increased-contrast tokens",
      "A static scheme, not Dynamic Color: ink → primary, surface → surfaceContainer, hair → outlineVariant, ink 2 → onSurfaceVariant",
      "The tokens, light and dark",
    ],
    [
      "Prints",
      `${code("Canvas")}: rects, circles, arcs, curves, clips, dashes; one shared noise tile for the grain`,
      `${code("Canvas")}, the same primitives`,
      "SVG",
    ],
  ],
  ["150px", "", "", ""],
)}
<p style="${txt(14, 500, { color: L.ink2 })}">One layout engine for prints, written once with golden JSON fixtures for the TypeScript, Swift and Kotlin renderers, so a day prints the same everywhere.</p>`);
}
function insets() {
  const phone = (label, W, H, top, bottom, extra) => {
    const sc = 0.42,
      w = W * sc,
      h = H * sc;
    return `<figure style="${s({ display: "flex", "flex-direction": "column", gap: 10, margin: 0 })}"><div style="${s({ position: "relative", width: w, height: h, border: `2px solid ${L.ink}`, "border-radius": 24, overflow: "hidden", background: L.ground })}"><div style="${s({ position: "absolute", left: 0, right: 0, top: 0, height: top * sc, background: L.surface2 })}"></div><div style="${s({ position: "absolute", left: 0, right: 0, bottom: 0, height: K.navH({ bottom }) * sc, "border-top": `1px solid ${L.ink}`, background: L.surface })}"></div>${bottom ? `<div style="${s({ position: "absolute", left: "50%", bottom: 8 * sc, width: 134 * sc, height: 5 * sc, "margin-left": -67 * sc, "border-radius": 9999, background: L.ink })}"></div>` : ""}<div style="${s({ position: "absolute", left: 20 * sc, right: 20 * sc, top: (top + 8) * sc, bottom: (K.navH({ bottom }) + 8) * sc, border: `1.5px dashed ${L.ink2}` })}"></div></div><figcaption style="${txt(13, 500, { color: L.ink2, "max-width": w + 40, "line-height": 1.4 })}"><b style="color:${L.ink}">${label}</b><br>${extra}</figcaption></figure>`;
  };
  return section(`${H2("Safe areas", "Every pinned control is placed from the bar’s top edge or from the safe area, never from a fixed number. Grey is the platform’s; the dashed box is the content.")}
<div style="${s({ display: "flex", gap: 40, "align-items": "flex-start", "flex-wrap": "wrap" })}">${phone("iPhone 402 × 874", 402, 874, 62, 34, "Status 62, home indicator 34; the tab bar’s targets end 4 above the indicator")}${phone("iPhone SE 375 × 667", 375, 667, 20, 0, "Status 20, no indicator; the tab bar’s targets end 11 above the edge")}${phone("Android 360 × 800", 360, 800, 28, 16, "Status 24–52 with a cutout; gesture handle 16, three buttons 48")}${phone("iPhone 440 × 956", 440, 956, 62, 34, "The largest: the print takes the room, nothing stretches")}</div>`);
}
function textRules() {
  const R = [
    [
      "Text wraps; it never runs off",
      `Every text column is ${code("min-width: 0")} and wraps (${code("overflow-wrap: anywhere")}); a row grows rather than clipping.`,
    ],
    [
      "Figures step down",
      "A figure keeps one line and steps down the type ramp to fit its column (62.5 at 42 pt from 375 up, 36 at 360 dp and 320 pt), never to a size in between, never truncated, never an ellipsis.",
    ],
    [
      "Titles step down, then wrap",
      "A long name loses 4 pt, then 8, then wraps to two lines: “Seated dumbbell shoulder press”.",
    ],
    [
      "Buttons wrap at large sizes",
      "At 200% a button grows to fit its words and wraps; nothing is cut.",
    ],
    [
      "Measure, don’t guess",
      "Natively, measure text with the platform; the web boards estimate from Jost’s widths only to choose a layout.",
    ],
    [
      "Layouts fold, never drop",
      "Three steppers to a row while each column holds its figure and two buttons (375 pt and up). At 320 pt and on 360-dp Android load takes a row, and reps and RIR share the next. The equipment line, the target and the suggestion always stay.",
    ],
  ];
  return section(
    `${H2("Text never runs off the screen")}<ul style="${s({ display: "grid", "grid-template-columns": "repeat(3, minmax(0,1fr))", gap: GAP })}">${R.map(([n, d]) => `<li style="${s({ display: "flex", "flex-direction": "column", gap: 6, padding: "14px 0", "border-top": `2px solid ${L.ink}` })}"><span style="${txt(17, 700)}">${n}</span><span style="${txt(15, 500, { color: L.ink2, "line-height": 1.45 })}">${d}</span></li>`).join("")}</ul>`,
  );
}
function typeMap() {
  return section(`${H2("Text styles", "Each role maps to a platform text style, so Dynamic Type and font scale work without hand-built rules.")}
${table(
  ["Role", "iOS", "Android", "At the largest sizes"],
  [
    [
      "Title",
      `${code(".largeTitle")} (Jost 700)`,
      `${code("headlineLarge")}`,
      "Wraps to two lines",
    ],
    ["Display", `${code(".title")}`, `${code("headlineMedium")}`, "Steps down, then wraps"],
    [
      "Entry figures",
      `Custom, ${code("relativeTo: .largeTitle")}`,
      `${code("displaySmall")}`,
      "Grow by half; steppers stack",
    ],
    ["Heading", `${code(".headline")}`, `${code("titleMedium")}`, "Wraps"],
    [
      "Body, the coach",
      `${code(".body")}`,
      `${code("bodyLarge")}`,
      "Two lines, then More opens a sheet",
    ],
    ["Meta", `${code(".subheadline")}`, `${code("bodyMedium")}`, "Glyphs scale with the text"],
    [
      "Caption, labels",
      `${code(".caption1")}`,
      `${code("labelMedium")}`,
      "Tab labels capped; large content viewer on iOS",
    ],
  ],
  ["160px", "", "", ""],
)}
<p style="${txt(14, 500, { color: L.ink2 })}">At accessibility sizes (iOS ${code("isAccessibilitySize")}, Android font scale 1.5 and up) the logging screen takes the 200% layout: the entry stays docked whole above the home indicator (the set and its tag, load beside its buttons, reps and RIR side by side, Save), the header stays, and the title, tabs and log scroll between, kept at their end.</p>`);
}
function haptics() {
  return section(`${H2("Haptics and motion")}
${table(
  ["Moment", "iOS", "Android", "Web app"],
  [
    [
      "A step",
      `${code(".sensoryFeedback(.increase)")} / ${code(".decrease")}`,
      `${code("SEGMENT_TICK")}`,
      `${code("navigator.vibrate")} on Android; none on iPhone`,
    ],
    ["At a limit", `${code(".warning")}`, `${code("REJECT")}`, ""],
    ["RIR chosen", `${code(".selection")}`, `${code("CLOCK_TICK")}`, ""],
    [
      "A set written",
      `${code(".success")}, on the frame the set lands in the log, not on the press`,
      `${code("CONFIRM")}`,
      "",
    ],
    ["A save failed", `${code(".error")}`, `${code("REJECT")}`, ""],
    [
      "Press",
      `${code(".timingCurve(0.23, 1, 0.32, 1, duration: 0.12)")}`,
      `${code("tween(120, CubicBezierEasing(0.23f, 1f, 0.32f, 1f))")}`,
      "120 ms",
    ],
    [
      "Sheet",
      `${code(".spring(duration: 0.4, bounce: 0.08)")}`,
      `${code("spring(0.92f, stiffness = 247f)")}`,
      "The same spring",
    ],
  ],
  ["160px", "", "", ""],
)}`);
}
function decisions() {
  const D = [
    [
      "The tab bar is 64 pt, not 83",
      "You asked for less room under the icons. The bar’s 44-pt targets end 4 pt above the home indicator (5 pt tall, 8 pt from the edge), inside the 34-pt safe area that otherwise stays empty. On iOS and Android the system bar decides; this applies to the web app.",
    ],
    [
      "RIR is a − / + stepper",
      "You asked for minus, a figure, plus. The review asked for a row of choices, because a stepper needs a starting value and RIR must never be pre-filled. The stepper starts empty (a dash, with the target beside it): tapping the dash takes the target, − and + take one either side of it, then step. Save waits until it is set.",
    ],
    [
      "The session covers the tabs",
      "Logging gets the tab bar’s height, so the entry and Save stay on screen down to 320 pt, and a slip can’t leave a set half entered.",
    ],
    [
      "Typing beside stepping",
      "A stepper is for one step; tapping the figure types it, so 62.5 to 100 kg is one entry, not fifteen taps.",
    ],
  ];
  return section(
    `${H2("Decisions to know before building")}<ul style="${s({ display: "grid", "grid-template-columns": "repeat(2, minmax(0,1fr))", gap: GAP })}">${D.map(([n, d]) => `<li style="${s({ display: "flex", "flex-direction": "column", gap: 6, padding: "14px 0", "border-top": `2px solid ${L.ink}` })}"><span style="${txt(17, 700)}">${n}</span><span style="${txt(15, 500, { color: L.ink2, "line-height": 1.45 })}">${d}</span></li>`).join("")}</ul>`,
  );
}

export function nativeBoard() {
  return `<div style="${s({ width: NW, padding: PAD, background: L.ground, color: L.ink, "font-family": K.FONTS.text, display: "flex", "flex-direction": "column", gap: 56, "-webkit-font-smoothing": "antialiased" })}">
<header><h1 style="${title(68, { lh: 1 })}">iOS and Android</h1><p style="${txt(18, 500, { color: L.ink2 })}; margin-top: 10px">The same screens in each platform’s shell: what is drawn here, what the system draws, and what has to be decided first.</p></header>
${decisions()}${shells()}${insets()}${textRules()}${typeMap()}${haptics()}
</div>`;
}
