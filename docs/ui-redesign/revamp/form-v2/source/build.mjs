// Writes Form v2's boards and canvas index to ../canvas, and its tokens to ../tokens.
// Usage: node docs/ui-redesign/revamp/form-v2/source/build.mjs
// Boards that are a whole scroll take their heights from heights.json, which render.mjs --measure
// writes; build, measure, then build again.
import {
  writeFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { page } from "./lib.mjs";
import * as K from "./kit.mjs";
import { PAL, FAMILY } from "./art.mjs";
import * as TO from "./today.mjs";
import * as SE from "./session.mjs";
import * as PR from "./progress.mjs";
import * as FO from "./food.mjs";
import * as MO from "./more.mjs";
import * as PE from "./people.mjs";
import * as EX from "./extra.mjs";
import * as VA from "./variants.mjs";
import { systemSheet, SW } from "./system.mjs";
import { alphabetBoard, ABW } from "./alphabet.mjs";
import { nativeBoard, NW } from "./native.mjs";
import { readmeBoard, RW } from "./readme.mjs";
import { squatLb } from "./data.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.resolve(HERE, "..", "canvas");
const TOKENS_OUT = path.resolve(HERE, "..", "tokens");
const HFILE = path.join(HERE, "heights.json");
const HEIGHTS = existsSync(HFILE) ? JSON.parse(readFileSync(HFILE, "utf8")) : {};
mkdirSync(OUT, { recursive: true });
mkdirSync(TOKENS_OUT, { recursive: true });

const L = K.TOKENS.light,
  Dk = K.TOKENS.dark,
  DV = K.DEVICES,
  d = DV.d402;
const COACH_PLANNING = {
  who: "Coach",
  tone: "planning",
  text: "Coach is planning for Anytime Fitness, since 09:00. This screen updates itself.",
  more: false,
};

// The destinations link to their boards, so the canvas can be clicked through.
K.LINKS.light = {
  today: "Today.dc.html",
  training: "Training.dc.html",
  food: "Food.dc.html",
  progress: "Progress.dc.html",
  profile: "Profile.dc.html",
};
K.LINKS.dark = {
  today: "Today-Dark.dc.html",
  training: "Training.dc.html",
  food: "Food-Dark.dc.html",
  progress: "Progress-Dark.dc.html",
  profile: "Profile.dc.html",
};

K.BACKS.light = {
  Today: "Today.dc.html",
  Training: "Training.dc.html",
  Programme: "Training.dc.html",
  Food: "Food.dc.html",
  Progress: "Progress.dc.html",
  Calendar: "Calendar.dc.html",
  History: "Progress-History.dc.html",
  Profile: "Profile.dc.html",
  Gyms: "Gyms.dc.html",
  "Upper A": "Workout.dc.html",
  "Lower A": "Workout-Coach.dc.html",
  "Easy Run + Arms": "Workout-Superset.dc.html",
};
K.BACKS.dark = {
  Today: "Today-Dark.dc.html",
  Food: "Food-Dark.dc.html",
  Progress: "Progress-Dark.dc.html",
  "Upper A": "Workout-Dark.dc.html",
};

// ---------- every board: a phone screen, or a wide board ----------
// s(file, title, render, { dv, t, tall, css }): render returns the body; tall boards are a whole
// scroll whose height is measured.
const scr = (file, title, render, o = {}) => ({
  file,
  title,
  render,
  dv: o.dv || d,
  t: o.t || L,
  tall: !!o.tall,
  css: o.css || "",
  fallback: o.fallback || 1200,
});
const wide = (file, title, render, w, fallback) => ({
  file,
  title,
  render,
  w,
  wide: true,
  t: L,
  fallback,
});

const PAGES = [
  {
    id: "readme",
    name: "Read me",
    note: "What changed after your notes, how to read the canvas, and what the critiques found",
    rows: [{ boards: [wide("Main.dc.html", "Read me: Form v2, refined", null, RW, 3400)] }],
  },
  {
    id: "session",
    name: "Today and the session",
    note: "Today, then the session: a layer over the tabs, from Start to the summary",
    rows: [
      {
        title: "Today, and starting",
        boards: [
          scr("Today.dc.html", "Today", () => TO.todayScreen(L, d)),
          scr("Today-Coach.dc.html", "Today, the coach planning", () =>
            TO.todayScreen(L, d, { coach: COACH_PLANNING, label: "Today" }),
          ),
          scr("Today-More-options.dc.html", "Today › More options", () =>
            EX.moreOptionsScreen(L, d),
          ),
          scr("Check-in.dc.html", "Check-in before the session", () => SE.checkInScreen(L, d)),
        ],
      },
      {
        title: "The workout",
        boards: [
          scr("Workout.dc.html", "The workout: Upper A in progress", () => SE.workoutScreen(L, d)),
          scr("Workout-Superset.dc.html", "The workout: a superset to do", () =>
            SE.workoutScreen(L, d, { kind: "arms" }),
          ),
          scr("Workout-Coach.dc.html", "The workout the coach planned", () =>
            SE.workoutScreen(L, d, { kind: "coach" }),
          ),
          scr("Add-exercise.dc.html", "Add exercise", () => EX.addExerciseScreen(L, d)),
          scr("Fallback.dc.html", "Choose a fallback", () => EX.substituteScreen(L, d)),
        ],
      },
      {
        title: "Logging a set",
        boards: [
          scr("Log-Warm-ups.dc.html", "Logging: warm-up 2 of 3", () =>
            SE.logScreen(L, d, { warm: 1 }),
          ),
          scr("Log.dc.html", "Logging a set", () => SE.logScreen(L, d)),
          scr("Log-Typing.dc.html", "Logging: typing a load", () => VA.logTypingScreen(L, d)),
          scr("Moment.dc.html", "Signature: a set is written", () => SE.momentScreen(L, d), {
            css: SE.momentCss(L),
          }),
          scr("Moment-Reduced.dc.html", "Signature, reduced motion", () => SE.momentScreen(L, d), {
            css: SE.momentCss(L, { reduced: true }),
          }),
          scr("Why.dc.html", "Why: the suggestion, explained", () => SE.whyScreen(L, d)),
          scr("Technique.dc.html", "Technique", () => SE.techniqueScreen(L, d)),
          scr("History.dc.html", "History, every session", () => SE.historyScreen(L, d)),
          scr("Superset-Log.dc.html", "Logging a superset", () => EX.supersetLogScreen(L, d)),
        ],
      },
      {
        title: "Finishing",
        boards: [
          scr("Finish.dc.html", "Finish", () => SE.finishScreen(L, d)),
          scr("Summary.dc.html", "The session, finished", () => SE.summaryScreen(L, d)),
          scr("Offline.dc.html", "Offline", () => EX.offlineScreen(L, d)),
        ],
      },
    ],
  },
  {
    id: "training",
    name: "Training",
    note: "Training: the programme as prints, and the other sports",
    rows: [
      {
        boards: [
          scr("Training.dc.html", "Training", () => MO.trainingScreen(L, d)),
          scr("Programme-Day.dc.html", "A day of the programme: Upper B", () =>
            EX.programmeDayScreen(L, d),
          ),
          scr("Log-Run.dc.html", "Log a run", () => SE.runLogScreen(L, d)),
          scr("Log-Ride.dc.html", "Log a ride", () => EX.rideLogScreen(L, d)),
          scr("Log-Swim.dc.html", "Log a swim", () => EX.swimLogScreen(L, d)),
          scr("Run.dc.html", "A run, read back", () => SE.runDetailScreen(L, d)),
        ],
      },
    ],
  },
  {
    id: "progress",
    name: "Progress",
    note: "Progress: one month, every activity of every day",
    rows: [
      {
        title: "The month, the calendar, a day",
        boards: [
          scr("Progress.dc.html", "Progress", () => PR.progressScreen(L, d)),
          scr("Calendar.dc.html", "The calendar", () => PR.calendarScreen(L, d)),
          scr("Day.dc.html", "A day: Fri 25 Sept", () => PR.dayScreen(L, d)),
          scr("Past-Workout.dc.html", "A past workout: Tue 8 Sept", () =>
            SE.summaryScreen(L, d, { past: true }),
          ),
        ],
      },
      {
        title: "The sections",
        boards: [
          scr("Progress-History.dc.html", "Progress › History", () => EX.historyListScreen(L, d)),
          scr("Running.dc.html", "Progress › Running", () => EX.runningScreen(L, d)),
          scr("Recovery.dc.html", "Progress › Recovery", () => EX.recoveryScreen(L, d)),
          scr("Body.dc.html", "Progress › Body", () => EX.bodyScreen(L, d)),
          scr("Exercise.dc.html", "An exercise, its whole life", () => PR.exerciseScreen(L, d)),
        ],
      },
    ],
  },
  {
    id: "food",
    name: "Food",
    note: "Food: the day’s bowl, filled meal by meal",
    rows: [
      {
        boards: [
          scr("Food.dc.html", "Food", () => FO.foodScreen(L, d)),
          scr("Food-Over.dc.html", "Food, over the target", () =>
            FO.foodScreen(L, d, { over: true }),
          ),
          scr("Dinner.dc.html", "Adding to dinner", () => EX.mealScreen(L, d)),
          scr("Portion.dc.html", "A portion", () => EX.portionScreen(L, d)),
        ],
      },
    ],
  },
  {
    id: "profile",
    name: "Profile, coach, people",
    note: "Profile: the person and their settings, the coach, people and places",
    rows: [
      {
        title: "Profile and settings",
        boards: [
          scr("Profile.dc.html", "Profile", () => MO.profileScreen(L, d)),
          scr(
            "Edit-profile.dc.html",
            "Edit profile, the whole scroll",
            () => MO.editProfileScreen(L, d),
            {
              tall: true,
              fallback: 1500,
            },
          ),
          scr("Appearance.dc.html", "Appearance", () => MO.appearanceScreen(L, d)),
          scr("Privacy.dc.html", "Privacy", () => PE.privacyScreen(L, d)),
          scr("Delete-account.dc.html", "Delete account", () => PE.deleteAccountScreen(L, d)),
        ],
      },
      {
        title: "The coach, people and places",
        boards: [
          scr("AI-coach.dc.html", "The AI coach", () => MO.coachScreen(L, d)),
          scr("Programme-change.dc.html", "The coach’s proposed change", () =>
            PE.programmeChangeScreen(L, d),
          ),
          scr("Friends.dc.html", "Friends", () => PE.friendsScreen(L, d)),
          scr("Gyms.dc.html", "Gyms", () => PE.gymsScreen(L, d)),
          scr("Gym.dc.html", "A gym and its machines", () => PE.gymScreen(L, d)),
        ],
      },
    ],
  },
  {
    id: "first-run",
    name: "First run",
    note: "The first run: five short steps",
    rows: [
      {
        boards: [
          scr("Welcome.dc.html", "Welcome", () => MO.welcomeScreen(L, d)),
          scr("Sports.dc.html", "Your sports", () => MO.sportsScreen(L, d)),
          scr("Gym-step.dc.html", "Your gym", () => MO.gymStepScreen(L, d)),
          scr("Machines.dc.html", "Its machines", () => MO.machinesStepScreen(L, d)),
          scr("Plan.dc.html", "Choose a programme", () => MO.planStepScreen(L, d)),
        ],
      },
    ],
  },
  {
    id: "sizes",
    name: "Sizes, themes, platforms",
    note: "The same screens dark, small, large, on Android and at 200% text",
    rows: [
      {
        title: "Dark",
        boards: [
          scr("Today-Dark.dc.html", "Today, dark", () => TO.todayScreen(Dk, d), { t: Dk }),
          scr("Workout-Dark.dc.html", "The workout, dark", () => SE.workoutScreen(Dk, d), {
            t: Dk,
          }),
          scr(
            "Log-Dark.dc.html",
            "Logging, dark, RIR chosen",
            () => SE.logScreen(Dk, d, { armed: true }),
            { t: Dk },
          ),
          scr("Food-Dark.dc.html", "Food, dark", () => FO.foodScreen(Dk, d), { t: Dk }),
          scr("Progress-Dark.dc.html", "Progress, dark", () => PR.progressScreen(Dk, d), { t: Dk }),
        ],
      },
      {
        title: "Small phones",
        boards: [
          scr("Today-375.dc.html", "Today at 375 × 667", () => TO.todayScreen(L, DV.d375), {
            dv: DV.d375,
          }),
          scr(
            "Log-Pounds-375.dc.html",
            "Logging in pounds at 375 × 667, Save tapped before RIR",
            () => SE.logScreen(L, DV.d375, { S: squatLb, need: true }),
            { dv: DV.d375 },
          ),
          scr("Today-320.dc.html", "Today at 320 × 568", () => TO.todayScreen(L, DV.d320), {
            dv: DV.d320,
          }),
          scr(
            "Log-Pounds-320.dc.html",
            "Logging in pounds at 320, the whole scroll",
            () => SE.logScreen(L, DV.d320, { S: squatLb, whole: true }),
            { dv: DV.d320, tall: true, fallback: 900 },
          ),
          scr(
            "Food-320.dc.html",
            "Food at 320, the whole scroll",
            () => FO.foodScreen(L, DV.d320, { whole: true }),
            { dv: DV.d320, tall: true, fallback: 1150 },
          ),
        ],
      },
      {
        title: "Large, Android, 200% text",
        boards: [
          scr("Today-440.dc.html", "Today at 440 × 956", () => TO.todayScreen(L, DV.d440), {
            dv: DV.d440,
          }),
          scr(
            "Workout-440.dc.html",
            "The workout at 440 × 956",
            () => SE.workoutScreen(L, DV.d440),
            { dv: DV.d440 },
          ),
          scr(
            "Today-Android.dc.html",
            "Today on Android, 360 × 800",
            () => TO.todayScreen(L, DV.a360),
            { dv: DV.a360 },
          ),
          scr(
            "Log-Android.dc.html",
            "Logging on Android, 360 × 800",
            () => SE.logScreen(L, DV.a360),
            { dv: DV.a360 },
          ),
          scr("Log-200.dc.html", "Logging at 200% text", () => VA.largeLogScreen(L)),
        ],
      },
    ],
  },
  {
    id: "system",
    name: "System",
    note: "The system, the alphabet, and iOS and Android",
    rows: [
      {
        boards: [
          wide("System.dc.html", "The system", () => systemSheet(), SW, 6640),
          wide("Alphabet.dc.html", "The alphabet", () => alphabetBoard(), ABW, 3914),
          wide("Platforms.dc.html", "iOS and Android", () => nativeBoard(), NW, 3405),
        ],
      },
    ],
  },
];

// ---------- write the boards and place them ----------
const GAP = 80,
  ROW_GAP = 120,
  NOTE_ROOM = 260;
const boards = {},
  order = [],
  notes = {},
  tall = {};
const boardCount = PAGES.reduce((a, p) => a + p.rows.reduce((b, r) => b + r.boards.length, 0), 0);
// the read-me board needs the page list and the count, so it is drawn here
PAGES[0].rows[0].boards[0].render = () =>
  readmeBoard({
    boardCount,
    pages: PAGES.map((p) => [p.name, p.note]),
  });
const written = new Set();
for (const P of PAGES) {
  let y = 0;
  P.rows.forEach((R, ri) => {
    let x = 0,
      rowH = 0;
    // the page's title over its first row; each later row its own
    if (ri === 0 || R.title) {
      const id = `${P.id}_${ri}`.replace(/[^A-Za-z0-9_-]/g, "_");
      notes[id] = {
        x: 0,
        y: y - NOTE_ROOM,
        text: ri === 0 ? P.note : R.title,
        kind: "title1",
        maxW: 1848,
        page: P.id,
      };
    }
    for (const B of R.boards) {
      const w = B.wide ? B.w : B.dv.W;
      const h = B.wide || B.tall ? HEIGHTS[B.file] || B.fallback : B.dv.H;
      if (B.wide || B.tall) tall[B.file] = h;
      const body = B.render();
      const css = K.css(B.t) + (B.css ? "\n" + B.css : "");
      writeFileSync(
        path.join(OUT, B.file),
        page({ title: B.title, fonts: K.FONTS.href, css, body, w, h }),
      );
      written.add(B.file);
      boards[B.file] = {
        x,
        y,
        w,
        h,
        title: B.title,
        page: P.id,
        ...(B.wide ? {} : { is_interactive: true }),
      };
      order.push(B.file);
      x += w + GAP;
      rowH = Math.max(rowH, h);
    }
    y += rowH + ROW_GAP + NOTE_ROOM;
  });
}
// a canvas drawn from scratch: anything left from the last one goes
for (const f of readdirSync(OUT))
  if (f.endsWith(".dc.html") && !written.has(f)) unlinkSync(path.join(OUT, f));

const canvas = {
  v: 3,
  createdOnFiles: { v: 1, at: "2026-10-02T09:00:00Z" },
  title: "Overload revamp: Form v2, refined",
  launch: { view: "canvas", page: "readme" },
  pages: PAGES.map((p) => ({ id: p.id, name: p.name })),
  boards,
  order,
  notes,
  designSystems: [],
};
writeFileSync(path.join(OUT, "canvas.json"), JSON.stringify(canvas, null, 2) + "\n");
// the boards whose height render.mjs measures
writeFileSync(
  HFILE,
  JSON.stringify(
    { ...tall, ...Object.fromEntries(Object.entries(HEIGHTS).filter(([k]) => tall[k])) },
    null,
    2,
  ) + "\n",
);

// ---------- tokens: the values the boards are drawn with ----------
const COLOUR_KEYS = [
  "ground",
  "surface",
  "surface2",
  "ink",
  "ink2",
  "control",
  "hair",
  "onInk",
  "onInk2",
  "paper",
  "paperLabel",
  "printInk",
  "scrim",
];
const pick = (t) => Object.fromEntries(COLOUR_KEYS.map((k) => [k, t[k]]));
const tokens = {
  name: "Form v2",
  source: "Generated by source/build.mjs from source/kit.mjs and source/art.mjs",
  fonts: {
    href: K.FONTS.href,
    display: K.FONTS.display,
    text: K.FONTS.text,
    figures: "font-variant-numeric: tabular-nums lining-nums",
  },
  colour: { light: pick(L), dark: pick(Dk), selection: "ink on ground, on-ink text" },
  print: {
    light: {
      paper: PAL.light.paper,
      ink: PAL.light.ink,
      label: PAL.light.label,
      warmUp: PAL.light.warm,
      pigments: PAL.light.col,
      toDo: PAL.light.tint,
      foodStrata: PAL.light.strata,
    },
    dark: {
      paper: PAL.dark.paper,
      ink: PAL.dark.ink,
      label: PAL.dark.label,
      warmUp: PAL.dark.warm,
      pigments: PAL.dark.col,
      toDo: PAL.dark.tint,
      foodStrata: PAL.dark.strata,
    },
    families: Object.fromEntries(
      Object.entries(FAMILY).map(([k, v]) => [k, `${v.family}: ${v.form}`]),
    ),
    grid: {
      module: "a square; one set of lifting",
      gapInColumn: 0.14,
      betweenColumns: 0.34,
      supersetPair: 0.14,
      betweenParts: 1,
      baseline: "one, with nothing drawn under it; the composition centred on its paper",
      track: "a module tall, a module longer for every 20 minutes",
    },
    states: {
      toDo: "the pigment thinned, with an edge of the full pigment",
      done: "full pigment",
      skipped: "a dashed edge",
      warmUp: "grey, done but not counted",
    },
  },
  type: {
    title: "Jost 700 36/1 (32 under 360 pt)",
    display: "Jost 700 34 → 30 → 26/1.05, then two lines",
    sheetTitle: "Jost 700 28/1.05",
    figureXL: "Jost 600 56/1, tabular lining",
    entry: "Jost 600 42 (46 on 440 pt), down to 28 to fit",
    log: "Jost 600 32/1, tabular lining; in the entry's columns",
    figureL: "Jost 600 26/1, tabular lining",
    figure: "Jost 600 20/1, tabular lining",
    figureS: "Jost 600 17/1, tabular lining",
    heading: "Atkinson Hyperlegible Next 700 16–17",
    body: "Atkinson Hyperlegible Next 500 15–16/1.45",
    meta: "Atkinson Hyperlegible Next 500 15, ink 2",
    metaSmall: "Atkinson Hyperlegible Next 500 14, ink 2",
    caption: "Atkinson Hyperlegible Next 700 13, ink 2",
    label: "Atkinson Hyperlegible Next 600–700 12–13, never under 12",
  },
  spacing: [4, 6, 8, 10, 12, 14, 16, 20, 24],
  radii: {
    print: 0,
    indicator: 2,
    checkbox: 6,
    tag: 8,
    row: 10,
    segment: 11,
    key: 12,
    control: 14,
    card: 16,
    restPill: 18,
    sheet: 24,
    full: 9999,
  },
  elevation: { strip: L.float, sheet: "none: a scrim", dark: "none" },
  motion: {
    press: "120ms cubic-bezier(0.23, 1, 0.32, 1), scale 0.97",
    ink: "420ms cubic-bezier(0.65, 0, 0.35, 1), on the server's answer",
    swapOut: "80ms",
    swapIn: "120ms",
    sheet: "spring 0.4s, bounce 0.08",
    reduced: "cuts and fades",
  },
  layout: {
    devices: DV,
    gutter: "20 pt; 16 under 360 pt",
    leftEdge:
      "names start at the gutter; only a list that mixes sports gives its marks a 20-pt column, names 12 after it",
    tabBar:
      "64 pt: 3 + 44-pt targets + 17 (11 without a home indicator), the targets 4 clear of the indicator",
    targetsMin: "44 pt (48 dp on Android)",
    session: "a full-screen layer over the tabs",
  },
};
writeFileSync(path.join(TOKENS_OUT, "tokens.json"), JSON.stringify(tokens, null, 2) + "\n");
const cssName = (k) => k.replace(/[A-Z0-9]/g, (c) => "-" + c.toLowerCase());
const vars = (obj, prefix, indent = "  ") =>
  Object.entries(obj)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => `${indent}--${prefix}${cssName(k)}: ${v};`)
    .join("\n");
const printVars = (P, indent = "  ") =>
  [
    `${indent}--print-paper: ${P.paper};`,
    `${indent}--print-ink: ${P.ink};`,
    `${indent}--print-label: ${P.label};`,
    `${indent}--print-warm-up: ${P.warm};`,
    vars(P.col, "print-", indent),
    vars(
      Object.fromEntries(Object.entries(P.tint).map(([k, v]) => [k + "Todo", v])),
      "print-",
      indent,
    ),
  ].join("\n");
const css = `/* Form v2 tokens. Generated by source/build.mjs from source/kit.mjs and source/art.mjs:
   edit those and rebuild rather than this file. Fonts: ${K.FONTS.href} */
:root {
  color-scheme: light dark;
  --font-display: ${K.FONTS.display};
  --font-text: ${K.FONTS.text};
${vars(pick(L), "form-")}
${printVars(PAL.light)}
${Object.entries(tokens.radii)
  .map(([k, v]) => `  --radius-${cssName(k)}: ${v}px;`)
  .join("\n")}
${tokens.spacing.map((v) => `  --space-${v}: ${v}px;`).join("\n")}
  --tab-bar: 64px;
  --shadow-strip: ${L.float};
  --duration-press: 120ms;
  --duration-ink: 420ms;
  --duration-swap-out: 80ms;
  --duration-swap-in: 120ms;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-ink: cubic-bezier(0.65, 0, 0.35, 1);
}
::selection { background: var(--form-ink); color: var(--form-on-ink); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${vars(pick(Dk), "form-", "    ")}
${printVars(PAL.dark, "    ")}
  }
}
:root[data-theme="dark"] {
${vars(pick(Dk), "form-")}
${printVars(PAL.dark)}
}
`;
writeFileSync(path.join(TOKENS_OUT, "tokens.css"), css);
console.log("wrote", order.length, "boards on", PAGES.length, "pages, canvas.json and tokens");
