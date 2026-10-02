// Sample content for every artboard, taken from the repository (never invented):
// - Today: src/app/(preview)/preview/page.tsx (Fri 11 Sept 2026, Easy Run + Arms, Cycle 1 of 8 · Day 3)
// - Logging: src/db/seed/data/program.ts (Upper A bench) + features.md sample sets and labels
// - Progress: scripts/dev/seed-audit-history.ts recomputed for 6 Jul – 30 Sept 2026 (account "vinit")
// - Food: src/app/(preview)/preview/food/page.tsx (Fri 25 Sept 2026)

export const today = {
  date: "Fri 11 Sept",
  gym: { name: "Anytime Fitness", kind: "Gym" },
  otherGym: { name: "Home", kind: "Home" },
  where: "Cycle 1 of 8 · Day 3",
  programme: "8-Week Strength + Aesthetics Hybrid",
  day: "Easy Run + Arms",
  focus: "Aerobic + arms/forearms",
  time: "70–100 min",
  effort: "1–2 RIR arms",
  notes: "Run first, arms after",
  status: "On track",
  planSummary: "4 exercises · 11 sets",
  plan: [
    { name: "Barbell curl", rx: "3 × 8–12 @ 1–2 RIR" },
    { name: "Rope triceps pushdown", rx: "3 × 12–15 @ 1 RIR" },
    { name: "Farmer’s carry", rx: "3 × 20–40 m", superset: "Forearms" },
    { name: "Wrist curl", rx: "2 × 12–20 @ 1 RIR", superset: "Forearms" },
  ],
  run: {
    sport: "Run",
    target: "25–30 min",
    part: "Part of Easy Run + Arms",
    note: "Talk-test; slower than push pace",
  },
  // Programme days, in cycle order (src/db/seed/data/program.ts)
  cycleDays: [
    "Lower A",
    "Upper A",
    "Easy Run + Arms",
    "Lower B",
    "Upper B",
    "Easy Run + Light Upper",
    "Rest + Mobility",
  ],
  cycleDone: 2, // progress.completed in the preview fixture
};

export const log = {
  session: "Upper A",
  gym: "Anytime Fitness",
  exercise: "Barbell bench press",
  equipment: "Free weights",
  progress: "2 of 4 sets",
  rx: "4 × 3–5 @ 2 RIR · rest 3–4 min",
  suggestion: { kind: "Hold", line: "Keep 62.5 kg", detail: "62.5 kg × 3 @ 2 RIR" },
  sets: [
    { n: 1, type: "Working", kg: "60", reps: "5", rir: "2", saved: true },
    { n: 2, type: "Working", kg: "62.5", reps: "4", rir: "1", saved: true },
  ],
  next: { n: 3, type: "Working", kg: "62.5", reps: "3" },
  rest: { remaining: "2:14", total: 180, left: 134 },
  previous: "Previous on this machine: 60 kg × 5, 62.5 kg × 4 · 8 Sep",
  cue: "Stable upper back; controlled touch",
  targetLoad: "Pick the load by RIR, not by a number",
  progression: "+2.5 kg after 4×5",
  record: { line: "Barbell bench press · Est. 1RM 88 kg (was 85 kg)" },
};

export const progress = {
  range: "6 Jul – 30 Sept 2026",
  sections: ["Overview", "History", "Strength", "Running", "Recovery", "Body"],
  totals: [
    {
      sport: "Strength",
      line: "22 sessions · 22 days · 18 h 54 min",
      sessions: 22,
      time: "18 h 54 min",
    },
    {
      sport: "Running",
      line: "11 sessions · 11 days · 4 h 31 min · 45 km",
      sessions: 11,
      time: "4 h 31 min",
      dist: "45 km",
    },
    {
      sport: "Cycling",
      line: "3 sessions · 3 days · 2 h 30 min · 3 without a distance",
      sessions: 3,
      time: "2 h 30 min",
      note: "3 without a distance",
    },
    {
      sport: "Swimming",
      line: "3 sessions · 3 days · 1 h 30 min · 3.1 km",
      sessions: 3,
      time: "1 h 30 min",
      dist: "3.1 km",
    },
  ],
  // Monday weeks; the last is this week so far (the seed has nothing in it yet).
  weeks: [
    { w: "6 Jul", lift: 2, run: 2 },
    { w: "13 Jul", lift: 2, run: 0 },
    { w: "20 Jul", lift: 2, run: 1 },
    { w: "27 Jul", lift: 1, run: 1 },
    { w: "3 Aug", lift: 2, run: 1 },
    { w: "10 Aug", lift: 2, run: 1 },
    { w: "17 Aug", lift: 2, run: 0 },
    { w: "24 Aug", lift: 1, run: 1 },
    { w: "31 Aug", lift: 2, run: 2 },
    { w: "7 Sept", lift: 2, run: 1 },
    { w: "14 Sept", lift: 2, run: 0 },
    { w: "21 Sept", lift: 2, run: 1 },
    { w: "28 Sept", lift: 0, run: 0, soFar: true },
  ],
  weights: [
    ["8 Jul", 76.05],
    ["15 Jul", 76.1],
    ["22 Jul", 76.51],
    ["28 Jul", 76.32],
    ["1 Aug", 75.96],
    ["8 Aug", 76.17],
    ["15 Aug", 76.67],
    ["22 Aug", 77.21],
    ["28 Aug", 77.01],
    ["1 Sep", 76.28],
    ["8 Sep", 76.83],
    ["15 Sep", 77.32],
    ["22 Sep", 77.5],
    ["28 Sep", 77.47],
  ],
};

export const food = {
  date: "Fri 25 Sept",
  kcal: {
    eaten: "1,152.5",
    target: "2,300",
    left: "1,147.5",
    eatenN: 1152.5,
    targetN: 2300,
    bandLo: 2070,
    bandHi: 2530,
  },
  macros: [
    { name: "Carbs", eaten: 86, target: 297, kind: "limit" },
    { name: "Fat", eaten: 24, target: 64, kind: "limit" },
    { name: "Protein", eaten: 53, target: 134, kind: "minimum" },
  ],
  // The strip: seven days ending on today (ADR 0037), Sat 19 – Fri 25 Sept 2026.
  // Marks from the fixture's HISTORY against the 2,070–2,530 band: met, over, logged (under) or none.
  week: [
    { d: "S", n: 19, state: "met", kcal: 2405 },
    { d: "S", n: 20, state: "none" },
    { d: "M", n: 21, state: "logged", kcal: 1990 },
    { d: "T", n: 22, state: "met", kcal: 2280 },
    { d: "W", n: 23, state: "met", kcal: 2350 },
    { d: "T", n: 24, state: "met", kcal: 2120 },
    { d: "F", n: 25, state: "today" },
  ],
  month: "September",
  meals: [
    {
      name: "Breakfast",
      kcal: "445",
      items: [
        ["Milk", "300 ml", "156"],
        ["Morning dry fruits", "1 serving", "150"],
        ["MuscleBlaze Biozyme whey", "1 scoop", "139"],
      ],
      saved: "Usual breakfast",
    },
    { name: "Morning snack", kcal: null, items: [] },
    {
      name: "Lunch",
      kcal: "647.5",
      items: [
        ["Home food", "2 servings", "400"],
        ["Cooked chickpea", "150 g", "247.5"],
      ],
    },
    { name: "Afternoon snack", kcal: "60", items: [["Fruit", "1 piece", "60"]] },
    { name: "Evening snack", kcal: null, items: [] },
    { name: "Dinner", kcal: null, items: [] },
    { name: "Late-night snack", kcal: null, items: [] },
  ],
  myFoods: "10 foods · 2 meals",
  targets: "2,300 kcal",
};

// The workout, one tap back from logging: Upper A from src/db/seed/data/program.ts, at the
// moment the logging artboards show (bench sets 1 and 2 saved). Warm-up from warmups.ts.
export const workout = {
  session: "Upper A",
  gym: "Anytime Fitness",
  warmup: { name: "Upper-body warm-up", drills: 4, done: true },
  exercises: [
    {
      name: "Barbell bench press",
      equipment: "Free weights",
      sets: 4,
      done: 2,
      so: "60×5, 62.5×4",
      state: "open",
    },
    { name: "Pull-up", sets: 3, done: 0, state: "todo" },
    { name: "Seated cable row", sets: 3, done: 0, state: "todo" },
    { name: "Incline dumbbell press", sets: 2, done: 0, state: "todo" },
    { name: "Cable lateral raise", sets: 3, done: 0, state: "todo" },
    { name: "Reverse pec deck", sets: 2, done: 0, state: "todo" },
    { name: "Overhead cable triceps extension", sets: 2, done: 0, state: "todo" },
  ],
};

// Real copy for the states (src/app/(app)/error.tsx, set-grid.tsx, use-set-rows.ts,
// navigation-feedback.tsx, today-view.tsx, and features.md).
export const copy = {
  offline:
    "You’re offline. Set and activity drafts stay on this device; retry saving when connected.",
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
