// Content for every board, taken from the repository and never invented. Where a figure is worked
// out (a warm-up ramp, a pace, a total) it is worked out with the app's own rule, named beside it.
//
// - Today: src/app/(preview)/preview/page.tsx (Fri 11 Sept 2026, Easy Run + Arms, 2 of 56 done)
// - The workout and logging: src/db/seed/data/program.ts (Upper A) and src/server/repositories/
//   sessions.test.ts (the bench press across Upper A's first three cycles, the Hold it earns)
// - Warm-up ramp: src/db/seed/data/warmups.ts ("40% × 8; 55–60% × 5; 70–75% × 2–3") applied by
//   src/domain/warmup-ramp.ts to 62.5 kg, in 2.5 kg steps
// - Progress, the calendar and history: the audit database overload_audit_20260929, account
//   "vinit", as scripts/dev/audit.mjs seeds it (seed-audit-history, -boundaries, -multisport and
//   seed-people; seed-people and -multisport dated from a 29 Sept setup, which the audit's 1,123
//   body-weight readings imply)
// - Food: src/app/(preview)/preview/food/page.tsx (Fri 25 Sept 2026; ?state=over for the heap)

export const today = {
  date: "Fri 11 Sept",
  gym: { name: "Anytime Fitness", kind: "Gym" },
  gyms: [
    ["Anytime Fitness", "gym", true],
    ["Samsung Gym", "gym"],
    ["Society Gym", "gym"],
    ["Home", "home"],
    ["Outdoor", "outdoor"],
  ],
  programme: "8-Week Strength + Aesthetics Hybrid",
  cycle: 1,
  cycles: 8,
  dayIndex: 3,
  daysDone: 2, // of 56
  day: "Easy Run + Arms",
  focus: "Aerobic + arms/forearms",
  time: "70–100 min",
  effort: "1–2 RIR arms",
  notes: "Run first, arms after",
  plan: [
    { name: "Barbell curl", sets: 3, rx: "3 × 8–12 @ 1–2 RIR", modality: "barbell" },
    { name: "Rope triceps pushdown", sets: 3, rx: "3 × 12–15 @ 1 RIR", modality: "cable" },
    {
      name: "Farmer’s carry",
      sets: 3,
      rx: "3 × 20–40 m",
      modality: "dumbbell",
      superset: "forearms",
    },
    {
      name: "Wrist curl",
      sets: 2,
      rx: "2 × 12–20 @ 1 RIR",
      modality: "dumbbell",
      superset: "forearms",
    },
  ],
  run: {
    name: "Run",
    target: "25–30",
    unit: "min",
    note: "Talk-test; slower than push pace",
    minutes: 30,
  },
};

// The cycle's seven days (program.ts), for Training and the cycle mark on Today.
export const cycle = [
  {
    name: "Lower A",
    focus: "Squat + quads",
    time: "70–90 min",
    columns: [3, 3, 3, 2, 3, 2],
    warm: 6,
  },
  {
    name: "Upper A",
    focus: "Bench + back",
    time: "70–90 min",
    columns: [4, 3, 3, 2, 3, 2, 2],
    warm: 4,
  },
  // day 3 as program.ts has it: six exercises, the forearms pair a superset, and cycle 1's run
  // (20–25 min); Today's preview plans its own version of the day
  {
    name: "Easy Run + Arms",
    focus: "Aerobic + arms/forearms",
    time: "70–100 min",
    columns: [3, 3, 2, 2, [2, 2]],
    run: "20–25 min",
    minutes: 25,
  },
  {
    name: "Lower B",
    focus: "Deadlift + posterior chain",
    time: "70–90 min",
    columns: [3, 2, 2, 2, 2, 2],
  },
  {
    name: "Upper B",
    focus: "Pull-up + incline + shoulders",
    time: "70–90 min",
    columns: [3, 4, 2, 2, 3, 2, 2],
  },
  {
    name: "Easy Run + Light Upper",
    focus: "Aerobic + delts/core",
    time: "60–90 min",
    columns: [2, 2, 2, 2, 2],
    run: "25–30 min",
    minutes: 30,
  },
  { name: "Rest + Mobility", focus: "Recovery", time: "10–15 min", drills: 7 },
];

// Upper A (program.ts), with each exercise's modality (exercises.ts), in its third cycle
// (sessions.test.ts). The bench is open: warm-ups done, sets 1 and 2 saved.
export const upperA = {
  session: "Upper A",
  focus: "Bench + back",
  time: "70–90 min",
  gym: "Anytime Fitness",
  warmup: { name: "Upper-body warm-up", drills: 4 },
  exercises: [
    {
      name: "Barbell bench press",
      modality: "barbell",
      sets: 4,
      rx: "4 × 3–5 @ 2 RIR",
      done: 2,
      state: "open",
      last: "60 kg × 4, 60 kg × 4",
    },
    { name: "Pull-up", modality: "bodyweight", sets: 3, rx: "3 × 6–10 @ 1–2 RIR" },
    {
      name: "Seated cable row",
      modality: "cable",
      machine: "Cable station",
      sets: 3,
      rx: "3 × 6–10 @ 1–2 RIR",
    },
    { name: "Incline dumbbell press", modality: "dumbbell", sets: 2, rx: "2 × 8–12 @ 1–2 RIR" },
    {
      name: "Cable lateral raise",
      modality: "cable",
      machine: "Cable station",
      sets: 3,
      rx: "3 × 12–20 @ 1 RIR",
    },
    {
      name: "Reverse pec deck",
      modality: "machine",
      machine: "Pec deck",
      sets: 2,
      rx: "2 × 12–20 @ 1 RIR",
    },
    {
      name: "Overhead cable triceps extension",
      modality: "cable",
      machine: "Cable station",
      sets: 2,
      rx: "2 × 10–15 @ 1 RIR",
    },
  ],
};

// Logging the bench, Upper A's third cycle (sessions.test.ts "holds after a miss"): the rule holds
// 62.5 kg × 3 @ 2 with the reason progression.ts gives; the cycle logs 60 × 4 @ 2, so sets 1 and 2
// are saved at that and set 3 is offered the suggestion. The test's sessions carry no dates, so the
// history names each by its cycle (the app shows a date).
export const bench = {
  exercise: "Barbell bench press",
  modality: "barbell",
  back: "Upper A",
  unit: "kg",
  rx: "4 × 3–5 @ 2 RIR",
  rest: "3–4 min",
  // the first compound ramp, offered as warm-ups in front of 62.5 kg (warmup-ramp.ts)
  warmups: [
    { n: "W", v: "25", reps: 8 },
    { n: "W", v: "35", reps: 5 },
    { n: "W", v: "45", reps: 3 },
  ],
  // sets 1 and 2 as sessions.test.ts logs cycle 3
  sets: [
    { n: 1, v: "60", reps: 4, rir: 2 },
    { n: 2, v: "60", reps: 4, rir: 2 },
  ],
  next: { n: 3, load: "62.5", reps: "3", target: 2 },
  todo: [{ n: 4 }],
  // progression.ts's reason and advice for this hold (cycle 2's first set fell under the range);
  // the app dates the basis, the test's sessions have no dates, so it names the cycle
  suggestion: {
    kind: "Hold",
    reason: "One low performance does not lower the baseline.",
    advice:
      "Repeat the planned range and check effort, rest and why the set stopped. A persistent reduction needs repeated comparable evidence.",
    basis: "Based on this exercise, cycle 2.",
  },
  restNow: { time: "2:14", frac: 0.74, aria: "Rest, 2 minutes 14 seconds left" },
  // The exercise's guide (plan: Technique, the same as the library's), then the programme's cue;
  // the programme's load and progression notes stay in the programme.
  technique: [
    ["Setup", "Eyes under the racked bar, feet flat, shoulder blades pulled together and down."],
    [
      "Steps",
      [
        "Lift the bar off the hooks over your shoulders.",
        "Breathe in and brace.",
        "Lower it to the lower chest, elbows partly in.",
        "Press up and slightly back.",
      ],
    ],
    ["Cues", ["Wrists over elbows.", "Push the floor away."]],
    ["Common mistakes", ["Flaring the elbows straight out.", "Bouncing the bar off the chest."]],
    ["Programme cue", "Stable upper back; controlled touch"],
  ],
  demonstration: "Coach channel, on YouTube",
  // Upper A's earlier cycles at Anytime Fitness (sessions.test.ts): every set, in the app's notation
  history: [
    {
      when: "Cycle 2",
      where: "Anytime Fitness",
      sets: [
        ["62.5", 2, 1],
        ["62.5", 3, 1],
        ["62.5", 3, 1],
        ["62.5", 3, 1],
      ],
    },
    {
      when: "Cycle 1",
      where: "Anytime Fitness",
      sets: [
        ["60", 5, 2],
        ["60", 5, 2],
        ["60", 5, 2],
        ["60", 5, 2],
      ],
    },
  ],
};

// Logging in pounds (scripts/dev/audit-workout.mjs): High-bar barbell squat at 135 and 140 lb.
export const squatLb = {
  exercise: "High-bar barbell squat",
  modality: "barbell",
  back: "Lower A",
  unit: "lb",
  rx: "3 × 4–6 @ 2–3 RIR",
  rest: "3–4 min",
  warmups: [],
  sets: [
    { n: 1, v: "135", reps: 5, rir: 2 },
    { n: 2, v: "140", reps: 6, rir: 2 },
  ],
  next: { n: 3, load: "140", reps: "6", target: "2–3" },
  todo: [],
  restNow: { time: "3:00", frac: 1, aria: "Rest, 3 minutes left" },
};

// The coach's Lower A at Anytime Fitness (src/server/repositories/coach-plans.test.ts). "@" is kept
// for RIR alone: a load the coach set leads the line.
export const lowerA = {
  session: "Lower A",
  focus: "Squat + quads",
  time: "70–90 min",
  gym: "Anytime Fitness",
  warmup: ["Bike 4 min", "Squat ramp 40×6, 50×3"],
  entries: [
    {
      name: "High-bar barbell squat",
      modality: "barbell",
      sets: 3,
      rx: "60 kg · 3 × 5 @ 2, 2, 1 RIR",
      note: "Add 2.5 kg after clean sets.",
    },
    {
      name: "Horizontal leg press",
      modality: "machine",
      sets: 1,
      rx: "100 kg · 1 × 10 @ 2 RIR",
      instead: "45° leg press",
    },
    { name: "Seated leg curl", modality: "machine", sets: 3, rx: "3 × 8–12 @ 1–2 RIR" },
    { name: "Leg extension", modality: "machine", sets: 2, rx: "2 × 10–15 @ 1–2 RIR" },
    {
      name: "Smith machine calf raise",
      modality: "smith_machine",
      sets: 3,
      rx: "3 × 8–15 @ 1–2 RIR",
    },
    {
      name: "Cable crunch",
      modality: "cable",
      sets: 2,
      dropped: true,
      note: "Back is sore today.",
    },
    {
      name: "Face pull",
      modality: "cable",
      machine: "Cable station",
      sets: 1,
      rx: "15 kg · 1 × 15 @ 2 RIR",
      added: true,
      note: "Light, for the shoulders.",
    },
  ],
};

// Easy Run + Arms as the preview's open session (?state=training: 4 exercises, 5 sets saved), its
// forearms superset grouped. The preview stores no set values, so the rows show only how many.
export const armsWorkout = {
  session: "Easy Run + Arms",
  gym: "Anytime Fitness",
  time: "70–100 min",
  exercises: [
    {
      name: "Barbell curl",
      modality: "barbell",
      sets: 3,
      done: 3,
      rx: "3 × 8–12 @ 1–2 RIR",
      state: "done",
    },
    {
      name: "Rope triceps pushdown",
      modality: "cable",
      machine: "Cable station",
      sets: 3,
      done: 2,
      rx: "3 × 12–15 @ 1 RIR",
      state: "open",
    },
    {
      name: "Farmer’s carry",
      modality: "dumbbell",
      sets: 3,
      done: 0,
      rx: "3 × 20–40 m",
      superset: "forearms",
    },
    {
      name: "Wrist curl",
      modality: "dumbbell",
      sets: 2,
      done: 0,
      rx: "2 × 12–20 @ 1 RIR",
      superset: "forearms",
    },
  ],
};

// ---------- the account "vinit": September 2026, every activity of every day ----------
// sport, minutes, km or m, indoor; s = which seed (H history, P people, M multisport, B boundaries)
const S = (sport, o = {}) => ({ sport, ...o });
export const september = {
  1: [S("strength", { min: 42, name: "Ad hoc session", sets: 9 })],
  2: [S("run", { km: 3, time: "17:18", pace: "5:46", indoor: true })],
  4: [
    S("run", { km: 3.1, time: "21:00", pace: "6:46" }),
    S("strength", { min: 48, name: "Ad hoc session", sets: 9 }),
  ],
  5: [S("strength", { min: 62, name: "Push", sets: 15 })],
  6: [
    S("run", { km: 4, time: "23:44", pace: "5:56", indoor: true }),
    S("strength", { min: 55, name: "Pull", sets: 14 }),
  ],
  7: [S("strength", { min: 70, name: "Legs", sets: 13 })],
  8: [S("strength", { min: 54, name: "Ad hoc session", sets: 9 })],
  10: [S("run", { km: 5, time: "30:30", pace: "6:06", indoor: true })],
  11: [
    S("run", { km: 4, time: "26:30", pace: "6:38" }),
    S("strength", { min: 60, name: "Ad hoc session", sets: 9 }),
  ],
  12: [S("strength", { min: 62, name: "Push", sets: 15 })],
  13: [S("strength", { min: 55, name: "Pull", sets: 14 })],
  14: [S("ride", { min: 60, indoor: true }), S("strength", { min: 70, name: "Legs", sets: 13 })],
  15: [S("strength", { min: 42, name: "Ad hoc session", sets: 9 })],
  18: [
    S("run", { km: 2.7, time: "18:12", pace: "6:44" }),
    S("strength", { min: 48, name: "Ad hoc session", sets: 9 }),
  ],
  19: [S("strength", { min: 62, name: "Push", sets: 15 })],
  20: [
    S("swim", { m: 800, time: "30:00", indoor: true }),
    S("strength", { min: 55, name: "Pull", sets: 14 }),
  ],
  21: [S("strength", { min: 70, name: "Legs", sets: 13 })],
  22: [S("strength", { min: 54, name: "Ad hoc session", sets: 9 })],
  25: [
    S("run", { km: 5, time: "33:00", pace: "6:36" }),
    S("swim", { m: 1500, time: "30:00" }),
    S("strength", { min: 60, name: "Ad hoc session", sets: 9 }),
  ],
  26: [
    S("swim", { m: 1000, time: "20:00", indoor: true }),
    S("run", { km: 4, time: "24:24", pace: "6:06", indoor: true }),
    S("swim", { m: 1000, time: "30:00", indoor: true }),
    S("strength", { min: 62, name: "Push", sets: 15 }),
  ],
  27: [
    S("ride", { min: 30, indoor: true }),
    S("ride", { min: 15, km: 0, indoor: true }),
    S("strength", { min: 55, name: "Pull", sets: 14 }),
  ],
  28: [S("ride", { min: 70, km: 25 }), S("strength", { min: 70, name: "Legs", sets: 13 })],
};
// August 2026 for the scrolling calendar (same seeds)
export const august = {
  1: [S("strength", { min: 42 })],
  2: [S("run", { km: 3 })],
  4: [S("strength", { min: 48 })],
  6: [S("run", { km: 4 })],
  8: [S("strength", { min: 54 })],
  10: [S("run", { km: 5 })],
  11: [S("strength", { min: 60 })],
  14: [S("ride", { min: 50, indoor: true })],
  15: [S("strength", { min: 42 })],
  18: [S("strength", { min: 48 })],
  20: [S("swim", { m: 1200, indoor: true })],
  22: [S("strength", { min: 54 }), S("strength", { min: 62 })],
  23: [S("strength", { min: 55 })],
  24: [S("strength", { min: 70 })],
  25: [S("strength", { min: 60 })],
  26: [S("run", { km: 4 })],
  29: [S("strength", { min: 62 })],
  30: [S("strength", { min: 55 })],
  31: [S("strength", { min: 70 })],
};
// Totals for September, worked out from the days above.
export const septTotals = {
  strength: { sessions: 20 },
  run: { sessions: 8, km: "30.8" },
  ride: { sessions: 4, km: "25" },
  swim: { sessions: 4, km: "4.3" },
};
// Fri 25 Sept, the day the scrolling calendar opens: a run, a swim and a lift.
export const day25 = {
  date: "Fri 25 Sept",
  items: [
    { sport: "run", title: "Outdoor · 5 km", meta: "33:00 · 6:36/km", time: "06:00" },
    { sport: "swim", title: "Open water · 1,500 m", meta: "30:00 · Mixed", time: "13:30" },
    {
      sport: "strength",
      title: "Ad hoc session",
      meta: "Anytime Fitness · 60 min · 9 sets",
      time: "19:00",
    },
  ],
};
// Tue 8 Sept, a finished workout with four records (seed-audit-history.ts, idx 2)
export const sept8 = {
  title: "Ad hoc session",
  date: "Tue 8 Sept",
  time: "19:00–19:54",
  gym: "Anytime Fitness",
  minutes: 54,
  // its check-in, labelled as session-details.tsx labels it
  checkin: [
    ["Sleep (h)", "7.5"],
    ["Sleep quality", "5"],
    ["Fatigue", "3"],
    ["Soreness", "3"],
  ],
  volume: "2,580",
  exercises: [
    {
      name: "Barbell bench press",
      modality: "barbell",
      warm: ["37.8", 10],
      sets: [
        ["63", 10, 2],
        ["63", 10, 2],
      ],
    },
    {
      name: "Goblet squat",
      modality: "dumbbell",
      warm: ["39.6", 10],
      sets: [
        ["66", 10, 2],
        ["66", 10, 2],
      ],
    },
    {
      name: "Plank",
      modality: "bodyweight",
      timed: true,
      sets: [
        ["60 s", "RPE 3"],
        ["60 s", "RPE 3"],
        ["60 s", "RPE 3"],
      ],
    },
  ],
  records: [
    ["Barbell bench press", "Est. 1RM", "84", "kg", "82.7 kg"],
    ["Barbell bench press", "Best set", "630", "kg", "620 kg"],
    ["Goblet squat", "Est. 1RM", "88", "kg", "86.7 kg"],
    ["Goblet squat", "Best set", "660", "kg", "650 kg"],
  ],
};
// Upper A, cycle 3, finished as sessions.test.ts finishes it: the bench's warm-ups as the ramp
// offered them and its four sets of 60 × 4 @ 2; nothing else logged, so six exercises are not done
// and nothing is a record (60 × 4 estimates under cycle 1's 60 × 5). The finish page counts every
// set (src/app/(app)/workouts/[sessionId]/finish/page.tsx); volume is the working sets' kg × reps.
export const upperA3 = {
  title: "Upper A",
  gym: "Anytime Fitness",
  done: [
    {
      name: "Barbell bench press",
      modality: "barbell",
      warm: [
        ["25", 8],
        ["35", 5],
        ["45", 3],
      ],
      sets: [
        ["60", 4, 2],
        ["60", 4, 2],
        ["60", 4, 2],
        ["60", 4, 2],
      ],
    },
  ],
  sets: 7,
  volume: "960",
};
// Barbell bench press, the account's whole record at Anytime Fitness: 454 sessions over 56 months.
export const benchLife = {
  sessions: 454,
  since: "Feb 2022",
  // the heaviest working set of each month, Feb 2022 to Sept 2026: the history seed's working load
  // (Math.round(30 + 0.6 × month)), and in Aug and Sept 2026 seed-people's push days (62.5, 72.5)
  months: Array.from({ length: 56 }, (_, m) =>
    m === 54 ? 62.5 : m === 55 ? 72.5 : Math.round(30 + 0.6 * m),
  ),
  recent: [
    {
      date: "Sat 26 Sept",
      top: "72.5 kg × 6",
      e1rm: "87",
      sets: "72.5 kg × 6, 72.5 kg × 6, 72.5 kg × 6, 67.5 kg × 8",
    },
    { date: "Fri 25 Sept", top: "63 kg × 9", e1rm: "81.9", sets: "63 kg × 9, 63 kg × 9" },
    { date: "Tue 22 Sept", top: "63 kg × 8", e1rm: "79.8", sets: "63 kg × 8, 63 kg × 8" },
    {
      date: "Sat 19 Sept",
      top: "70 kg × 6",
      e1rm: "84",
      sets: "70 kg × 6, 70 kg × 6, 70 kg × 6, 65 kg × 8",
    },
    { date: "Fri 18 Sept", top: "63 kg × 10", e1rm: "84", sets: "63 kg × 10, 63 kg × 10" },
    { date: "Tue 15 Sept", top: "63 kg × 9", e1rm: "81.9", sets: "63 kg × 9, 63 kg × 9" },
  ],
};
// Runs in the history (seed-audit-history.ts and seed-people.ts)
export const runs = [
  { date: "Sat 26 Sept", where: "Treadmill", km: 4, time: "24:24", pace: "6:06", effort: "4/5" },
  { date: "Fri 25 Sept", where: "Outdoor", km: 5, time: "33:00", pace: "6:36", effort: "Not sure" },
  {
    date: "Fri 18 Sept",
    where: "Outdoor",
    km: 2.7,
    time: "18:12",
    pace: "6:44",
    effort: "Not sure",
  },
];
// The 2 Aug run in full (history seed): its title and note
export const run2Aug = {
  title: "Easy session before work",
  date: "Sun 2 Aug, 17:30",
  where: "Outdoor",
  km: "3",
  time: "17:20",
  pace: "5:47",
  effort: "2/5",
  hr: "138 / 169",
  note: "Comfortable effort; stopped with energy left for tomorrow.",
};
// Body weight, Jul–Sept 2026 (seed-audit-history.ts; 30 Aug from seed-people.ts)
export const weights = [
  ["1 Jul", 76.37],
  ["8 Jul", 76.05],
  ["15 Jul", 76.1],
  ["22 Jul", 76.51],
  ["28 Jul", 76.32],
  ["1 Aug", 75.96],
  ["8 Aug", 76.17],
  ["15 Aug", 76.67],
  ["22 Aug", 77.21],
  ["28 Aug", 77.01],
  ["30 Aug", 76.4],
  ["1 Sept", 76.28],
  ["8 Sept", 76.83],
  ["15 Sept", 77.32],
  ["22 Sept", 77.5],
  ["28 Sept", 77.47],
];

// ---------- food: Fri 25 Sept (src/app/(preview)/preview/food/page.tsx) ----------
export const food = {
  date: "Fri 25 Sept",
  target: 2300,
  band: [2070, 2530],
  macros: [
    { name: "Carbs", eaten: 86, target: 297, kind: "limit" },
    { name: "Fat", eaten: 24, target: 64, kind: "limit" },
    { name: "Protein", eaten: 53, target: 134, kind: "minimum" },
  ],
  // seven days ending today (ADR 0037), marked against the 2,070–2,530 band
  week: [
    { d: "S", n: 19, state: "met" },
    { d: "S", n: 20, state: "none" },
    { d: "M", n: 21, state: "logged" },
    { d: "T", n: 22, state: "met" },
    { d: "W", n: 23, state: "met" },
    { d: "T", n: 24, state: "met" },
    { d: "F", n: 25, state: "today" },
  ],
  meals: [
    {
      name: "Breakfast",
      kcal: 445,
      items: ["Milk", "Morning dry fruits", "MuscleBlaze Biozyme whey"],
      saved: "Usual breakfast",
    },
    { name: "Morning snack", kcal: 0, items: [] },
    { name: "Lunch", kcal: 647.5, items: ["Home food", "Cooked chickpea"] },
    { name: "Afternoon snack", kcal: 60, items: ["Fruit"] },
    { name: "Evening snack", kcal: 0, items: [] },
    { name: "Dinner", kcal: 0, items: [] },
    { name: "Late-night snack", kcal: 0, items: [] },
  ],
  myFoods: "10\u00a0foods · 2\u00a0meals",
  targets: "2,300 kcal",
};
// ?state=over: dinner adds Home food × 4 (800 kcal) and Oats 150 g (583.5 kcal): 2,536 kcal, 236 over.
export const foodOver = {
  macros: [
    { name: "Carbs", eaten: 185, target: 297, kind: "limit" },
    { name: "Fat", eaten: 35, target: 64, kind: "limit" },
    { name: "Protein", eaten: 78, target: 134, kind: "minimum" },
  ],
  dinner: { name: "Dinner", kcal: 1383.5, items: ["Home food", "Oats"] },
  total: 2536,
};

// Real copy for the states (src/app/(app)/error.tsx, set-grid.tsx, use-set-rows.ts, today-view.tsx).
export const copy = {
  offline: "You’re offline. Reconnect and try again. Unsaved set drafts stay on this device.",
  setFailed: "Connection lost. Your entries are still here. Retry saving when connected.",
  slow: "Taking longer than usual…",
  errorTitle: "Something went wrong",
  errorBody: "The page could not load. Retry to fetch it again.",
  warmup: "Saved as a warm-up: well under today’s working weight, with no RIR.",
  done: "Done. Nothing left to do here today.",
  noGymTitle: "Add a gym to start training",
  noGymAction: "Add your first gym",
  noTarget: "No daily target yet",
  noTargetGoal: "Build muscle · 55 / 25 / 20",
};

// Equipment, from an exercise's modality (src/domain/types.ts) to its glyph.
export const EQUIP = {
  barbell: "dumbbell",
  dumbbell: "dumbbell",
  bodyweight: "bodyweight",
  cable: "cable",
  machine: "machine",
  smith_machine: "smith",
  mobility: "bodyweight",
};

// ---------- Training: a day of the programme opened (src/db/seed/data/program.ts, Upper B) ----------
export const upperB = {
  name: "Upper B",
  day: 5,
  focus: "Pull-up + incline + shoulders",
  time: "70–90 min",
  effort: "1–3 RIR",
  notes: "Pull-up strength",
  warmup: { name: "Upper-body warm-up", drills: 4 },
  exercises: [
    {
      name: "Incline barbell bench press",
      modality: "barbell",
      sets: 3,
      rx: "3 × 4–6 @ 2 RIR",
      rest: "3 min",
      cue: "Low incline",
    },
    {
      name: "Pull-up",
      modality: "bodyweight",
      sets: 4,
      rx: "4 × 4–6 @ 2 RIR",
      rest: "2–3 min",
      cue: "Full ROM",
    },
    {
      name: "Lat pulldown",
      modality: "machine",
      sets: 2,
      rx: "2 × 8–12 @ 1–2 RIR",
      rest: "2 min",
      cue: "To upper chest",
    },
    {
      name: "Seated cable row",
      modality: "cable",
      sets: 2,
      rx: "2 × 8–12 @ 1–2 RIR",
      rest: "2 min",
      cue: "No back rocking",
    },
    {
      name: "Seated dumbbell shoulder press",
      modality: "dumbbell",
      sets: 3,
      rx: "3 × 6–10 @ 1–2 RIR",
      rest: "2 min",
      cue: "Back supported",
    },
    {
      name: "Pec deck chest fly",
      modality: "machine",
      sets: 2,
      rx: "2 × 10–15 @ 1 RIR",
      rest: "90 s",
      cue: "Controlled stretch",
    },
    {
      name: "Dumbbell lateral raise",
      modality: "dumbbell",
      sets: 2,
      rx: "2 × 12–20 @ 1 RIR",
      rest: "60–90 s",
      cue: "Control down",
    },
  ],
};

// ---------- the session, more of it ----------
// Farmer's carry in the forearms superset, as the preview's set grid suggests it (32 kg × 30 m;
// src/app/(preview)/preview/logging/page.tsx). A distance set is rated by RPE (src/domain/effort.ts).
export const carry = {
  exercise: "Farmer’s carry",
  partner: "Wrist curl",
  modality: "dumbbell",
  back: "Easy Run + Arms",
  rx: "3 × 20–40 m",
  rest: "90 s",
  load: "32",
  metres: "30",
};
// Add exercise, searching "pull up": exercise-search.ts over the 276 seeded exercises, ties in the
// library's name order; the picker filters nothing.
export const pullUpSearch = {
  query: "pull up",
  best: [
    ["Pull-up", "bodyweight", "Lats, Biceps"],
    ["Assisted pull-up (machine)", "machine", "Lats, Biceps"],
    ["Neutral-grip pull-up", "bodyweight", "Lats, Biceps"],
    ["Scapular pull-up", "bodyweight", "Lats, Traps"],
    ["Towel pull-up", "bodyweight", "Forearms, Lats"],
  ],
  other: [["Chin-up", "bodyweight", "Biceps, Lats"]],
  chosen: "Assisted pull-up (machine)",
  machine: "Assisted pull-up machine",
};
// A fallback for Lower A's leg extension at Samsung Gym, where it is not yet known to be there (the
// default gym has one); searching "quads" over the 275 others: 1 best match, then 43 by muscle,
// equipment or movement in name order. The chosen split squat is the group's 27th; the picker
// names it under the search.
export const quadSearch = {
  gym: "Samsung Gym",
  query: "quads",
  best: [["Foam roll quads", "bodyweight", "Quads"]],
  other: [
    ["45° leg press", "machine", "Quads, Glutes"],
    ["Belt squat", "machine", "Quads, Glutes"],
    ["Bodyweight squat", "bodyweight", "Quads, Glutes"],
    ["Box jump", "bodyweight", "Quads, Glutes"],
    ["Box squat", "barbell", "Quads, Glutes"],
    ["Bulgarian split squat", "dumbbell", "Quads, Glutes"],
    ["Cossack squat", "bodyweight", "Adductors, Quads"],
  ],
  otherCount: 43,
  chosen: "Split squat (supported)",
};

// ---------- other sports: the multisport seed's ride and swim (seed-audit-multisport.ts) ----------
export const ride = { where: 0, time: "1:10:00", km: "25", speed: "21.4", effort: 3, assist: 1 };
export const swim = {
  where: 0,
  time: "20:00",
  poolLength: "25",
  lengths: "40",
  total: "1,000",
  effort: 3,
};

// ---------- Progress: History, Running, Body, Recovery ----------
// History, newest first, as /progress/history lists them for vinit on 29 Sept (the audit database):
// each row the page's own title, time and meta (src/app/(app)/progress/history/page.tsx).
export const historyDays = [
  {
    day: "Mon 28 Sept",
    rows: [
      { sport: "strength", title: "Ad hoc session", time: "19:00", meta: "13 sets", sets: 13 },
      { sport: "ride", title: "Ride · 25 km", time: "13:30", meta: "1:10:00", extra: "Effort 3" },
    ],
  },
  {
    day: "Sun 27 Sept",
    rows: [
      {
        sport: "strength",
        title: "Ad hoc session",
        time: "19:00",
        meta: "14 sets",
        extra: "Sleep 7 h",
        sets: 14,
      },
      { sport: "ride", indoor: true, title: "Ride · 0 km", time: "17:30", meta: "15:00" },
      { sport: "ride", indoor: true, title: "Ride", time: "13:30", meta: "30:00" },
      {
        sport: "recovery",
        title: "Recovery · 2026-09-27",
        meta: "",
        extra: "Sleep 7.5 h · Fatigue 4 · Soreness 2",
      },
    ],
  },
  {
    day: "Sat 26 Sept",
    rows: [
      { sport: "strength", title: "Ad hoc session", time: "19:00", meta: "15 sets", sets: 15 },
      {
        sport: "run",
        indoor: true,
        title: "Treadmill · 4 km",
        time: "17:30",
        meta: "24:24 · 6:06/km",
        extra: "Effort 4",
      },
      { sport: "swim", indoor: true, title: "Swim · 1 km", time: "17:30", meta: "30:00" },
      {
        sport: "swim",
        indoor: true,
        title: "Swim · 1 km",
        time: "13:30",
        meta: "20:00",
        extra: "Effort 3",
      },
    ],
  },
];
// Every run in the Progress range, 6 Jul – 29 Sept 2026, newest first, as the Running list renders
// them (progress-view.tsx): the audit database for vinit on 29 Sept.
export const rangeRuns = [
  { when: "Sat 26 Sept, 17:30", where: "Treadmill", km: 4, time: "24:24", pace: "6:06" },
  { when: "Fri 25 Sept, 06:00", where: "Outdoor", km: 5, time: "33:00", pace: "6:36" },
  { when: "Fri 18 Sept, 06:00", where: "Outdoor", km: 2.7, time: "18:12", pace: "6:44" },
  { when: "Fri 11 Sept, 06:00", where: "Outdoor", km: 4, time: "26:30", pace: "6:38" },
  { when: "Thu 10 Sept, 17:30", where: "Treadmill", km: 5, time: "30:30", pace: "6:06" },
  { when: "Sun 6 Sept, 17:30", where: "Treadmill", km: 4, time: "23:44", pace: "5:56" },
  { when: "Fri 4 Sept, 06:00", where: "Outdoor", km: 3.1, time: "21:00", pace: "6:46" },
  { when: "Wed 2 Sept, 17:30", where: "Treadmill", km: 3, time: "17:18", pace: "5:46" },
  { when: "Wed 26 Aug, 17:30", where: "Outdoor", km: 4, time: "24:27", pace: "6:07" },
  { when: "Mon 10 Aug, 17:30", where: "Outdoor", km: 5, time: "30:34", pace: "6:07" },
  { when: "Thu 6 Aug, 17:30", where: "Outdoor", km: 4, time: "23:47", pace: "5:57" },
  { when: "Sun 2 Aug, 17:30", where: "Outdoor", km: 3, time: "17:20", pace: "5:47" },
  { when: "Sun 26 Jul, 17:30", where: "Outdoor", km: 4, time: "24:30", pace: "6:08" },
  { when: "Fri 10 Jul, 17:30", where: "Outdoor", km: 5, time: "30:38", pace: "6:08" },
  { when: "Mon 6 Jul, 17:30", where: "Outdoor", km: 4, time: "23:50", pace: "5:58" },
];
// Weekly distance, Monday weeks from 6 Jul (analytics.ts); this week, from 28 Sept, so far
export const runWeeks = [
  ["6 Jul", 9],
  ["13 Jul", 0],
  ["20 Jul", 4],
  ["27 Jul", 3],
  ["3 Aug", 4],
  ["10 Aug", 5],
  ["17 Aug", 0],
  ["24 Aug", 4],
  ["31 Aug", 10.1],
  ["7 Sept", 9],
  ["14 Sept", 2.7],
  ["21 Sept", 9],
  ["28 Sept", 0, "so far"],
];
// Check-ins in the Progress range, 6 Jul – 29 Sept: every response kept apart, workout check-ins
// and daily readings both (recovery-history.ts); sleep h, quality, fatigue, soreness; null where it
// was not answered. 44 readings, 31 of them with sleep.
const R = (date, src, sleep, q, f, so) => ({ date, src, sleep, q, f, s: so });
export const recovery = [
  R("8 Jul", "workout", 7.5, 5, 3, 3),
  R("9 Jul", "daily", null, null, 2, null),
  R("15 Jul", "daily", 6.5, 5, 2, 3),
  R("15 Jul", "workout", 7, 4, 1, 2),
  R("18 Jul", "workout", null, null, 2, null),
  R("21 Jul", "daily", 6.5, 5, null, 3),
  R("22 Jul", "workout", 6.5, 3, 3, 1),
  R("27 Jul", "daily", 6.5, 5, 2, 3),
  R("1 Aug", "workout", 6.5, 3, 1, 1),
  R("3 Aug", "daily", 7, 3, 3, 1),
  R("4 Aug", "workout", null, null, 2, null),
  R("8 Aug", "workout", 7.5, 5, 3, 3),
  R("9 Aug", "daily", null, null, 3, null),
  R("15 Aug", "daily", 7, 3, 3, 1),
  R("15 Aug", "workout", 7, 4, 1, 2),
  R("18 Aug", "workout", null, null, 2, null),
  R("21 Aug", "daily", 7, 3, null, 1),
  R("22 Aug", "workout", 6.5, 3, 1, 2),
  R("22 Aug", "workout", 6.5, 3, 3, 1),
  R("23 Aug", "workout", null, null, 2, null),
  R("24 Aug", "workout", 7.5, 5, 3, 2),
  R("27 Aug", "daily", 7, 3, 3, 1),
  R("30 Aug", "workout", 7, 4, 2, 2),
  R("31 Aug", "workout", null, null, 3, null),
  R("1 Sept", "workout", 6.5, 3, 1, 1),
  R("3 Sept", "daily", 7.5, 4, 4, 2),
  R("4 Sept", "workout", null, null, 2, null),
  R("5 Sept", "workout", 6.5, 3, 1, 2),
  R("7 Sept", "workout", 7.5, 5, 3, 2),
  R("8 Sept", "workout", 7.5, 5, 3, 3),
  R("9 Sept", "daily", null, null, 4, null),
  R("12 Sept", "workout", null, null, 1, null),
  R("13 Sept", "workout", 7, 4, 2, 2),
  R("15 Sept", "daily", 7.5, 4, 4, 2),
  R("15 Sept", "workout", 7, 4, 1, 2),
  R("18 Sept", "workout", null, null, 2, null),
  R("19 Sept", "workout", 6.5, 3, 1, 2),
  R("20 Sept", "workout", null, null, 2, null),
  R("21 Sept", "daily", 7.5, 4, null, 2),
  R("21 Sept", "workout", 7.5, 5, 3, 2),
  R("22 Sept", "workout", 6.5, 3, 3, 1),
  R("27 Sept", "daily", 7.5, 4, 4, 2),
  R("27 Sept", "workout", 7, 4, 2, 2),
  R("28 Sept", "workout", null, null, 3, null),
];

// ---------- Food: adding to a meal (src/app/(preview)/preview/food/page.tsx) ----------
export const foodLibrary = {
  saved: [
    { name: "Post-workout shake", items: ["MuscleBlaze Biozyme whey", "Milk"], kcal: "338.5" },
    {
      name: "Usual breakfast",
      items: ["Milk", "Morning dry fruits", "MuscleBlaze Biozyme whey"],
      kcal: "445",
    },
  ],
  // my foods, the most lately eaten first: name, portion, kcal
  foods: [
    ["Fruit", "1 piece", "60"],
    ["Cooked chickpea", "100 g", "165"],
    ["Home food", "1 serving", "200"],
    ["MuscleBlaze Biozyme whey", "1 scoop", "139"],
    ["Morning dry fruits", "1 serving", "150"],
    ["Milk", "100 ml", "52"],
    ["Oats", "100 g", "389"],
    ["Amul high protein milk", "250 ml", "225"],
    ["Amul protein blueberry shake", "200 ml", "138"],
    ["Paneer", "100 g", "265"],
  ],
  // Oats, 150 g of it: 389 kcal and 66.3 / 6.9 / 16.9 g per 100 g, grams rounded as formatMacros does
  oats: {
    amount: "150",
    unit: "g",
    kcal: "583.5",
    per: "100 g",
    perKcal: "389",
    perMacros: "Carbs 66 g · Fat 7 g · Protein 17 g",
    macros: [
      ["Carbs", "99"],
      ["Fat", "10"],
      ["Protein", "25"],
    ],
  },
};

// ---------- Profile, people, places ----------
// vinit, from seed-people.ts: following shreyash and priya, followed by shreyash, priya's request waiting
export const me = {
  name: "Vinit Chandak",
  handle: "vinit",
  followers: 1,
  following: 2,
  requests: 1,
  weight: "77.5", // 77.47 kg, shown to 0.1 as fromKilograms rounds it
  height: "175", // the coach intake's, copied to the profile (seed-audit.ts)
  email: "vinit@local.test",
  // date of birth and training goal are unset, so the profile asks for them (profile.ts)
  missing: "Add your date of birth and training goal",
};
// Friends' recent activity on 29 Sept: the first rows of Recent activity as the app renders them
// (shared-stats.ts readActivity, newest first; activity-row.tsx), from the audit database.
const FD = (who, day, sport, text) => ({ who, initial: who[0], day, sport, text });
export const feed = [
  FD("Priya Menon", "Yesterday", "run", "Run · 6 km · 36:36 · 6:06 /km"),
  FD("Shreyash Laddha", "Yesterday", "ride", "Ride · 25 km · 1:10:00"),
  FD("Priya Menon", "Yesterday", "ride", "Ride · 25 km · 1:10:00"),
  FD("Shreyash Laddha", "Sun 27 Sept", "ride", "Ride · 0 km · 15:00"),
  FD("Priya Menon", "Sun 27 Sept", "ride", "Ride · 0 km · 15:00"),
  FD("Shreyash Laddha", "Sun 27 Sept", "ride", "Ride · 30:00"),
  FD("Priya Menon", "Sun 27 Sept", "ride", "Ride · 30:00"),
  FD("Priya Menon", "Sun 27 Sept", "run", "Run · 5 km · 27:48 · 5:34 /km"),
];
// vinit's gyms as gyms.ts sorts them (default first, then by name): the fixture's five, and at the
// default gym a machine for every one of the 93 equipment types (seed-audit-multisport.ts), so
// nothing is marked absent. The machines in equipment.ts's order (by name, byte order), each with
// its glyph and the second line gym-details.tsx gives it.
export const gymList = [
  { name: "Anytime Fitness", kind: "gym", meta: "93 machines", def: true },
  { name: "Home", kind: "home", meta: "No equipment yet" },
  { name: "Outdoor", kind: "outdoor", meta: "No equipment yet" },
  { name: "Samsung Gym", kind: "gym", meta: "No equipment yet" },
  { name: "Society Gym", kind: "gym", meta: "No equipment yet" },
];
export const machineCount = 93;
export const programmeFit = "33 available";
export const machines = [
  { name: "45° leg press", glyph: "machine", load: "Plate-loaded" },
  { name: "Ab crunch machine", glyph: "machine", load: "Weight stack" },
  { name: "Ab wheel", glyph: "bodyweight", load: "Bodyweight" },
  { name: "Adjustable bench", glyph: "bodyweight", load: "Bodyweight" },
  { name: "Air / assault bike", glyph: "trainer", load: "Cardio" },
  { name: "Assisted dip machine", glyph: "machine", load: "Weight stack" },
  { name: "Assisted pull-up machine", glyph: "machine", load: "Weight stack" },
  { name: "Back extension bench", glyph: "bodyweight", load: "Bodyweight" },
  { name: "Back extension machine", glyph: "machine", load: "Weight stack" },
  { name: "Barbell", glyph: "dumbbell", load: "Free weight" },
];
export const unavailable = [];
// The first-run machine list (equipment-types.ts), its first rows, with the fixture's machines ticked
export const machineCatalogue = {
  Machines: [
    "Smith machine",
    "Chest press machine",
    "Incline press machine",
    "Shoulder press machine",
    "Assisted dip machine",
    "Seated dip machine",
    "Iso-lateral plate-loaded press",
    "Iso-lateral plate-loaded row",
    "Shrug machine",
    "Lat pulldown",
    "Chest-supported row machine",
    "Assisted pull-up machine",
  ],
  ticked: [
    "Smith machine",
    "Assisted pull-up machine",
    "Seated leg curl",
    "Pec deck (fly / reverse fly)",
    "45° leg press",
    "Horizontal leg press",
    "Cable station",
  ],
};
// The coach's change (src/app/(preview)/preview/coaching/page.tsx, ?view=changes)
export const change = {
  headline: "Swaps your barbell curl for a cable curl and adds a cable crunch.",
  ask: "Can I have Bayesian cable curls?",
  why: "Bayesian cable curls go in on your upper day. Core work needs one answer before I can place it.",
  programme: [["Length", "6 weeks", "8 weeks"]],
  days: [
    {
      name: "Upper",
      when: "Monday",
      fields: [["Time", "45 min", "50 min"]],
      ops: [
        {
          op: "Changed",
          name: "Barbell bench press",
          lines: [
            ["Sets", "3", "4"],
            ["Rest", "3 min", "3–4 min"],
          ],
          note: "Progression: Add 2.5 kg once all four sets reach eight at the prescribed effort.",
        },
        {
          op: "Replaced",
          name: "Barbell curl",
          to: "Cable curl",
          lines: [["Reps", "8–12", "10–15"]],
          tag: true,
        },
        { op: "Moved to another day", name: "Cable lateral raise", note: "Now on Lower" },
        { op: "Added", name: "Cable crunch", rx: "3 × 10–15 reps · RIR 1–2 · rest 60–90 s" },
      ],
    },
    {
      name: "Lower",
      when: "Wednesday",
      ops: [{ op: "Moved here", name: "Cable lateral raise", note: "Was on Upper" }],
    },
    {
      name: "Easy run",
      when: "Saturday",
      ops: [
        {
          op: "Run · week 1",
          lines: [
            ["Minutes", "30", "35"],
            ["Distance", "—", "5 km"],
          ],
        },
      ],
    },
  ],
};
