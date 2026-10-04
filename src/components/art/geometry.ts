/**
 * The prints: Form v2's art, drawn from the account's own records and nothing else.
 *
 * Ported from the design's generator (docs/ui-redesign/revamp/form-v2/source/art.mjs and the
 * calendar month in progress.mjs) as pure geometry: every function here returns shapes, and
 * `art.tsx` draws them. Shapes name what they are painted with (a pigment, the paper showing
 * through, the print's ink), never a colour, so one geometry serves both papers and the light
 * or dark choice stays in CSS.
 *
 * The grammar (DESIGN.md, Shapes and Prints):
 * - FAMILY, how the body moves, gives the form and its pigment: load is a block, on foot a
 *   track, on wheels a wheel, in water a wave, practice a fan, food a bowl, play a triangle.
 * - SPORT: a family's form with one cut, the paper showing through (walk, hike, spin, row,
 *   paddle, yoga, climbing, racket sports).
 * - CONTEXT means the same on every form: segments are its structure (sets, intervals, laps,
 *   drills); size is how long, in whole modules.
 * - STATE: thinned pigment with an edge of the full one is to do, full is done, a dashed edge
 *   is skipped. A warm-up is grey.
 * Every form stands on one baseline, on one module grid, with nothing drawn under it, and the
 * composition sits in the middle of its paper. A print carries no words.
 */

export const FAMILIES = ["strength", "run", "ride", "swim", "mobility", "food", "play"] as const;
export type Family = (typeof FAMILIES)[number];

export const VARIANTS = [
  "walk",
  "hike",
  "spin",
  "row",
  "paddle",
  "yoga",
  "climb",
  "racket",
] as const;
export type Variant = (typeof VARIANTS)[number];

/** Anything that prints: a family, or a sport that is its family's form with one cut. */
export type Sport = Family | Variant;

export type FormName = "block" | "track" | "wheel" | "wave" | "fan" | "bowl" | "triangle";
export type Cut = "open" | "peak" | "hub" | "oar" | "blade" | "arc" | "steps" | "ball";

/** Thinned with an edge of the full pigment is to do; full is done; a dashed edge is skipped. */
export type FormState = "todo" | "done" | "skipped";

export const FAMILY: Readonly<Record<Family, { family: string; form: FormName; name: string }>> = {
  strength: { family: "Load", form: "block", name: "Lifting" },
  run: { family: "On foot", form: "track", name: "Running" },
  ride: { family: "On wheels", form: "wheel", name: "Cycling" },
  swim: { family: "In water", form: "wave", name: "Swimming" },
  mobility: { family: "Practice", form: "fan", name: "Mobility" },
  food: { family: "Food", form: "bowl", name: "Food" },
  play: { family: "Play", form: "triangle", name: "Play" },
};

/** A sport the app may add later: its family's form with one cut. */
export const VARIANT: Readonly<Record<Variant, { base: Family; cut: Cut; name: string }>> = {
  walk: { base: "run", cut: "open", name: "Walk" },
  hike: { base: "run", cut: "peak", name: "Hike" },
  spin: { base: "ride", cut: "hub", name: "Spin class" },
  row: { base: "swim", cut: "oar", name: "Row" },
  paddle: { base: "swim", cut: "blade", name: "Paddle" },
  yoga: { base: "mobility", cut: "arc", name: "Yoga" },
  climb: { base: "play", cut: "steps", name: "Climbing" },
  racket: { base: "play", cut: "ball", name: "Racket sports" },
};

const isVariant = (sport: Sport): sport is Variant => sport in VARIANT;

/** The family a sport prints as. */
export function familyOf(sport: Sport): Family {
  return isVariant(sport) ? VARIANT[sport].base : sport;
}

/**
 * What a shape is painted with.
 * - a family: its pigment, full; `<family>-todo`: thinned;
 * - `cut`: whatever the form stands on showing through (the paper, or the ground for a mark);
 * - `ink`, `label`, `dot`: the print's ink, its labels, and the 3:1 dot of an empty day;
 * - `warm`: a warm-up set; `ochre` and `straw`: the bowl's outer meal layers (cadmium, `food`,
 *   is the middle one).
 */
export type Paint =
  Family | `${Family}-todo` | "cut" | "ink" | "label" | "dot" | "warm" | "ochre" | "straw";

export type Paintable = {
  fill?: Paint | "none";
  fillOpacity?: number;
  stroke?: Paint;
  strokeWidth?: number;
  dash?: readonly [number, number];
  linecap?: "round" | "butt";
  linejoin?: "miter" | "round";
};

export type Shape =
  | ({ kind: "rect"; x: number; y: number; width: number; height: number } & Paintable)
  | ({ kind: "path"; d: string } & Paintable)
  | ({ kind: "circle"; cx: number; cy: number; r: number } & Paintable)
  | { kind: "clip"; clip: string; shapes: Shape[] }
  | { kind: "text"; x: number; y: number; text: string };

/** One decimal, as the generator rounds, so a path reads the same on every engine. */
export const f1 = (n: number): number => Math.round(n * 10) / 10;

const todoOf = (family: Family): Paint => `${family}-todo`;

/** A run's track grows longer with its time: a module, and another for every 20 minutes. */
export function trackModules(minutes = 30): number {
  return Math.min(5, Math.max(1.8, 1 + minutes / 20));
}

export type FormOptions = {
  state?: FormState;
  /** Its structure: sets, intervals, laps or drills. */
  segments?: number;
  /** How many of the segments are done, from the first. */
  done?: number;
  /** Fill the box instead of standing in it at the form's own proportions (inside a print). */
  fill?: boolean;
};

/**
 * One form in a box (x, y, w, h), standing on the box's bottom edge. Used for a mark (a square
 * box) and inside prints (a box of whole modules).
 */
export function form(
  sport: Sport,
  x: number,
  y: number,
  w: number,
  h: number,
  { state = "done", segments = 0, done = 0, fill = false }: FormOptions = {},
): Shape[] {
  const family = familyOf(sport);
  const cut = isVariant(sport) ? VARIANT[sport].cut : null;
  const shape = FAMILY[family].form;
  const C: Paint = family;
  const T: Paint = todoOf(family);
  const S = Math.min(w, h);
  const base = y + h;
  const fillFor = (k: number): Paint | "none" =>
    state === "skipped" ? "none" : state === "todo" ? T : segments ? (k < done ? C : T) : C;
  // A to-do part keeps a thin edge of its full pigment, so to do and done differ in more than
  // lightness.
  const isTodo = (k: number): boolean =>
    state === "todo" || (state !== "skipped" && segments > 0 && k >= done);
  const edge = (k: number): Paintable =>
    isTodo(k)
      ? { stroke: C, strokeWidth: f1(Math.min(1.5, Math.max(1, S * 0.06))), linejoin: "miter" }
      : {};
  const sw = f1(Math.max(1.5, S * 0.05));
  const dashed: readonly [number, number] = [f1(S * 0.09), f1(S * 0.07)];
  const dash: Paintable = state === "skipped" ? { stroke: C, strokeWidth: sw, dash: dashed } : {};
  const cutW = f1(Math.max(1.2, S * 0.045));
  const out: Shape[] = [];

  if (shape === "block") {
    // A block: square at mark size; in a box wider than tall, a slab cut into its sets.
    const hh = fill ? h : Math.min(h, w <= h ? w * 0.84 : h);
    const top = base - hh;
    const n = Math.max(1, segments || 1);
    const gap = n > 1 ? Math.max(1.5, S * 0.06) : 0;
    const uw = (w - gap * (n - 1)) / n;
    for (let k = 0; k < n; k++) {
      out.push(
        isTodo(k)
          ? {
              kind: "rect",
              x: f1(x + k * (uw + gap) + 0.6),
              y: f1(top + 0.6),
              width: f1(uw - 1.2),
              height: f1(hh - 1.2),
              fill: fillFor(k),
              ...edge(k),
            }
          : {
              kind: "rect",
              x: f1(x + k * (uw + gap)),
              y: f1(top),
              width: f1(uw),
              height: f1(hh),
              fill: fillFor(k),
              ...dash,
            },
      );
    }
  } else if (shape === "track") {
    // A running track seen from above: a stadium lying on the baseline, its lane cut in paper.
    // In a mark's square it is a little over half as tall as wide; in a print it fills its box
    // and grows longer with the run's time. Segments (intervals, laps) are cut straight across.
    const hh = fill ? h : Math.min(h, w * 0.56);
    const top = base - hh;
    const r = hh / 2;
    const cy = top + r;
    const x0 = x;
    const x1 = x + w;
    const stad = (rr: number) =>
      `M${f1(x0 + r)} ${f1(cy - rr)}H${f1(x1 - r)}A${f1(rr)} ${f1(rr)} 0 0 1 ${f1(x1 - r)} ${f1(cy + rr)}H${f1(x0 + r)}A${f1(rr)} ${f1(rr)} 0 0 1 ${f1(x0 + r)} ${f1(cy - rr)}Z`;
    const lane: Shape = {
      kind: "path",
      d: stad(r * 0.44),
      fill: "none",
      stroke: "cut",
      strokeWidth: f1(Math.max(1.1, hh * 0.075)),
    };
    const n = Math.max(1, segments || 1);
    if (state === "skipped") {
      out.push({
        kind: "path",
        d: stad(r - sw / 2),
        fill: "none",
        stroke: C,
        strokeWidth: sw,
        dash: dashed,
      });
    } else if (n === 1) {
      out.push(
        isTodo(0)
          ? { kind: "path", d: stad(r - 0.6), fill: T, ...edge(0) }
          : { kind: "path", d: stad(r), fill: C },
        lane,
      );
    } else {
      // Done segments in full, the rest thinned, each cut from the next by a line of paper.
      const sx = (k: number) => x0 + ((x1 - x0) * k) / n;
      const inside: Shape[] = [];
      for (let k = 0; k < n; k++)
        inside.push({
          kind: "rect",
          x: f1(sx(k)),
          y: f1(top),
          width: f1(sx(k + 1) - sx(k)),
          height: f1(hh),
          fill: k < done ? C : T,
        });
      for (let k = 1; k < n; k++)
        inside.push({
          kind: "path",
          d: `M${f1(sx(k))} ${f1(top)}V${f1(top + hh)}`,
          stroke: "cut",
          strokeWidth: cutW,
        });
      out.push({ kind: "clip", clip: stad(r), shapes: inside });
      if (done < n)
        out.push({ kind: "path", d: stad(r - 0.6), fill: "none", stroke: C, strokeWidth: 1.2 });
      out.push(lane);
    }
    if (cut === "open")
      // Walk: the lane runs out through the track's front end, an open loop.
      out.push({
        kind: "path",
        d: `M${f1(x1 - r)} ${f1(cy)}H${f1(x1 + 0.5)}`,
        stroke: "cut",
        strokeWidth: f1(Math.max(1.6, hh * 0.16)),
      });
    if (cut === "peak") {
      // Hike: a peak cut deep into the top edge.
      const mx = (x0 + x1) / 2;
      const pw = Math.min(hh * 0.9, (x1 - x0) * 0.36);
      out.push({
        kind: "path",
        d: `M${f1(mx - pw / 2)} ${f1(top - 0.5)}L${f1(mx)} ${f1(top + hh * 0.5)}L${f1(mx + pw / 2)} ${f1(top - 0.5)}Z`,
        fill: "cut",
      });
    }
  } else if (shape === "wheel") {
    // A ring, thick as a tyre; segments are its arcs (intervals).
    const d = Math.min(w, h);
    const r = d / 2;
    const cx = x + w / 2;
    const cy = base - r;
    const th = r * 0.56;
    const rm = r - th / 2;
    const n = Math.max(1, segments || 1);
    if (state === "skipped") {
      out.push(
        {
          kind: "circle",
          cx: f1(cx),
          cy: f1(cy),
          r: f1(r - 0.75),
          fill: "none",
          stroke: C,
          strokeWidth: sw,
          dash: dashed,
        },
        {
          kind: "circle",
          cx: f1(cx),
          cy: f1(cy),
          r: f1(r - th + 0.75),
          fill: "none",
          stroke: C,
          strokeWidth: sw,
          dash: [f1(S * 0.06), f1(S * 0.06)],
        },
      );
    } else if (n === 1) {
      out.push(
        ...(isTodo(0)
          ? ([
              {
                kind: "circle",
                cx: f1(cx),
                cy: f1(cy),
                r: f1(rm),
                fill: "none",
                stroke: C,
                strokeWidth: f1(th),
              },
              {
                kind: "circle",
                cx: f1(cx),
                cy: f1(cy),
                r: f1(rm),
                fill: "none",
                stroke: T,
                strokeWidth: f1(Math.max(1, th - 2.6)),
              },
            ] satisfies Shape[])
          : ([
              {
                kind: "circle",
                cx: f1(cx),
                cy: f1(cy),
                r: f1(rm),
                fill: "none",
                stroke: C,
                strokeWidth: f1(th),
              },
            ] satisfies Shape[])),
      );
    } else {
      const pa = (a: number, rr: number) =>
        `${f1(cx + rr * Math.cos(a))} ${f1(cy + rr * Math.sin(a))}`;
      for (let k = 0; k < n; k++) {
        const a0 = -Math.PI / 2 + (k / n) * Math.PI * 2;
        const a1 = -Math.PI / 2 + ((k + 1) / n) * Math.PI * 2;
        out.push({
          kind: "path",
          d: `M${pa(a0, r)}A${f1(r)} ${f1(r)} 0 0 1 ${pa(a1, r)}L${pa(a1, r - th)}A${f1(r - th)} ${f1(r - th)} 0 0 0 ${pa(a0, r - th)}Z`,
          fill: fillFor(k),
          stroke: isTodo(k) ? C : "cut",
          strokeWidth: isTodo(k) ? 1.2 : cutW,
        });
      }
    }
    if (cut === "hub")
      // Spin: the wheel cut as a cross, a flywheel turning in place.
      out.push({
        kind: "path",
        d: `M${f1(cx - r)} ${f1(cy)}H${f1(cx + r)}M${f1(cx)} ${f1(cy - r)}V${f1(cy + r)}`,
        stroke: "cut",
        strokeWidth: f1(Math.max(1.4, r * 0.16)),
      });
  } else if (shape === "wave") {
    // Two crests of water filling the box: the lower one's trough and stroke stand on the
    // ground, the upper one's crest meets the top, a band of paper between. A paddle is the two
    // crests cut once, aslant, as a blade enters the water; a row the crests cut by two oars.
    const ww = Math.min(w, h * 1.6);
    const x0 = x + (w - ww) / 2;
    const k = ww / 4;
    const m = Math.min(h, ww) * (fill ? 1 : 0.84);
    const amp = m * 0.22;
    const stw = Math.max(1.6, m * 0.15);
    const step = k - stw / 4;
    const crest = (yy: number) =>
      `M${f1(x0 + stw / 2)} ${f1(yy)} q${f1(step / 2)} ${f1(-amp)} ${f1(step)} 0 t${f1(step)} 0 t${f1(step)} 0 t${f1(step)} 0`;
    const band = (amp + stw) / 2;
    const lo = base - band;
    const hi = base - m + band;
    const crests = `${crest(hi)} ${crest(lo)}`;
    const wc: Paint = state === "todo" ? T : C;
    const blade = f1(Math.max(1.6, stw * 0.55));
    if (state === "skipped") {
      out.push({
        kind: "path",
        d: crests,
        fill: "none",
        stroke: C,
        strokeWidth: sw,
        linecap: "butt",
        dash: dashed,
      });
    } else if (cut === "blade") {
      out.push(
        {
          kind: "path",
          d: crests,
          fill: "none",
          stroke: wc,
          strokeWidth: f1(stw),
          linecap: "round",
        },
        {
          kind: "path",
          d: `M${f1(x0 + ww * 0.6)} ${f1(base - m)}L${f1(x0 + ww * 0.4)} ${f1(base)}`,
          stroke: "cut",
          strokeWidth: blade,
        },
      );
    } else if (cut === "oar") {
      // Row: the two crests, cut twice straight down, as oars cut the water.
      out.push(
        {
          kind: "path",
          d: crests,
          fill: "none",
          stroke: wc,
          strokeWidth: f1(stw),
          linecap: "round",
        },
        ...[0.36, 0.64].map((fr): Shape => ({
          kind: "path",
          d: `M${f1(x0 + ww * fr)} ${f1(base - m)}V${f1(base)}`,
          stroke: "cut",
          strokeWidth: blade,
        })),
      );
    } else if (state === "todo") {
      out.push(
        {
          kind: "path",
          d: crests,
          fill: "none",
          stroke: C,
          strokeWidth: f1(stw),
          linecap: "round",
        },
        {
          kind: "path",
          d: crests,
          fill: "none",
          stroke: T,
          strokeWidth: f1(Math.max(0.8, stw - 2.6)),
          linecap: "round",
        },
      );
    } else {
      out.push({
        kind: "path",
        d: crests,
        fill: "none",
        stroke: wc,
        strokeWidth: f1(stw),
        linecap: "round",
      });
    }
  } else if (shape === "fan") {
    // A quarter disc standing on its corner, cut into its drills.
    const r = Math.min(w, h);
    const ox = x;
    const oy = base;
    const n = Math.max(1, segments || 1);
    for (let k = 0; k < n; k++) {
      const a0 = -Math.PI / 2 + (k / n) * (Math.PI / 2);
      const a1 = -Math.PI / 2 + ((k + 1) / n) * (Math.PI / 2);
      out.push({
        kind: "path",
        d: `M${f1(ox)} ${f1(oy)}L${f1(ox + r * Math.cos(a0))} ${f1(oy + r * Math.sin(a0))}A${f1(r)} ${f1(r)} 0 0 1 ${f1(ox + r * Math.cos(a1))} ${f1(oy + r * Math.sin(a1))}Z`,
        fill: fillFor(k),
        ...(isTodo(k) ? edge(k) : n > 1 ? { stroke: "cut", strokeWidth: cutW } : dash),
      });
    }
    if (cut === "arc") {
      const ar = r * 0.62;
      out.push({
        kind: "path",
        d: `M${f1(ox)} ${f1(oy - ar)}A${f1(ar)} ${f1(ar)} 0 0 1 ${f1(ox + ar)} ${f1(oy)}`,
        fill: "none",
        stroke: "cut",
        strokeWidth: f1(Math.max(1.6, S * 0.08)),
      });
    }
  } else if (shape === "bowl") {
    // A half disc on the rim's chord.
    const r = Math.min(w / 2, h);
    const cx = x + w / 2;
    const top = base - r;
    out.push({
      kind: "path",
      d: `M${f1(cx - r)} ${f1(top)}h${f1(2 * r)}a${f1(r)} ${f1(r)} 0 0 1 ${f1(-2 * r)} 0z`,
      fill: fillFor(0),
      ...(isTodo(0) ? { stroke: "ink", strokeWidth: 1.2 } : dash),
    });
  } else {
    // The triangle: play, reserved for climbing and racket sports.
    const tw = Math.min(w, h * 1.1);
    const x0 = x + (w - tw) / 2;
    const th = Math.min(h, tw * 0.9);
    if (cut === "steps") {
      const steps = 4;
      const sw2 = tw / steps;
      let d = `M${f1(x0)} ${f1(base)}`;
      for (let k = 0; k < steps; k++)
        d += `V${f1(base - ((k + 1) * th) / steps)}H${f1(x0 + (k + 1) * sw2)}`;
      out.push({ kind: "path", d: `${d}V${f1(base)}Z`, fill: fillFor(0) });
    } else {
      out.push({
        kind: "path",
        d: `M${f1(x0)} ${f1(base)}L${f1(x0 + tw / 2)} ${f1(base - th)}L${f1(x0 + tw)} ${f1(base)}Z`,
        fill: fillFor(0),
        ...(isTodo(0) ? edge(0) : dash),
      });
      if (cut === "ball")
        // Racket sports: a ball punched out of the triangle.
        out.push({
          kind: "circle",
          cx: f1(x0 + tw / 2),
          cy: f1(base - th * 0.36),
          r: f1(tw * 0.13),
          fill: "cut",
        });
    }
  }
  return out;
}

// ---------- the day: one module grid ----------

/** One exercise: a column of its sets, done from the bottom up, its warm-ups at the foot. */
export type StrengthColumn = {
  sets: number;
  done: number;
  /** How many of the sets, from the foot, are warm-ups (or all of them, when true). */
  warm?: number | boolean;
  skipped?: boolean;
  /** The first of a superset's two columns: the pair stands closer than any others. */
  pair?: boolean;
};

export type PrintPart =
  | { kind: "strength"; columns: readonly StrengthColumn[] }
  | {
      kind: Exclude<Sport, "strength" | "food">;
      state?: FormState;
      /** A run's time, which sets its track's length. */
      minutes?: number;
      /** How tall, in whole modules (at most the tallest column). */
      modules?: number;
      segments?: number;
      segmentsDone?: number;
    };

/** Gaps, in modules: between sets, between exercises, a superset's pair, between parts. */
export const GAPS = { set: 0.14, column: 0.34, pair: 0.14, part: 1 } as const;

type Size = { wm: number; hm: number };

function partModules(part: Exclude<PrintPart, { kind: "strength" }>, cap: number): Size {
  const family = familyOf(part.kind);
  // A run's track is a module tall and grows longer with its time.
  if (family === "run") return { hm: 1, wm: trackModules(part.minutes || 30) };
  const hm = Math.max(1, Math.min(cap, part.modules || cap));
  // A wheel, a fan and a bowl are as wide as they are tall: hm modules and the gaps between.
  const side = hm + (hm - 1) * GAPS.set;
  if (family === "swim") return { hm, wm: side * 1.5 };
  return { hm, wm: side };
}

export type DayLayout = {
  /** The module the print was drawn at, so a page of prints can share the smallest. */
  module: number;
  /** Where the shapes stand, and how far they reach, for checking the composition. */
  baseline: number;
  left: number;
  right: number;
  top: number;
  shapes: Shape[];
};

/**
 * The day's print: its parts in the order of the rows under it, a module apart, on one
 * baseline, the composition centred on its paper across and down. A strength part is its
 * exercises as columns of sets; every other part is a form a whole number of modules tall.
 * `module` fixes the module (a page of prints sharing one); otherwise the largest that fits,
 * up to `maxModule`.
 */
export function dayPrint({
  width,
  height,
  parts,
  maxModule = 44,
  module,
}: {
  width: number;
  height: number;
  parts: readonly PrintPart[];
  maxModule?: number;
  module?: number;
}): DayLayout {
  const pad = Math.max(16, Math.round(Math.min(width, 400) * 0.055));
  const vpad = Math.max(12, Math.round(height * 0.1));
  const strength = parts.find((p) => p.kind === "strength");
  const columns = strength && strength.kind === "strength" ? strength.columns : [];
  const cap = Math.max(2, columns.length ? Math.max(...columns.map((c) => c.sets)) : 3);
  let strengthWm = 0;
  columns.forEach((c, i) => {
    strengthWm += 1;
    if (i < columns.length - 1) strengthWm += c.pair ? GAPS.pair : GAPS.column;
  });
  const capHm = cap + (cap - 1) * GAPS.set;
  const sizes: Size[] = parts.map((p) =>
    p.kind === "strength" ? { wm: strengthWm, hm: capHm } : partModules(p, cap),
  );
  // A form's height in modules, its gaps included.
  const tall = (q: Size) => (q.hm >= capHm ? q.hm : q.hm + (q.hm - 1) * GAPS.set);
  const totalWm = sizes.reduce((a, q) => a + q.wm, 0) + GAPS.part * Math.max(0, parts.length - 1);
  const maxHm = Math.max(1, ...sizes.map(tall));
  const u =
    module ??
    Math.max(0, Math.min(maxModule, (width - 2 * pad) / totalWm, (height - 2 * vpad) / maxHm));
  const base = (height + maxHm * u) / 2;
  const left = (width - totalWm * u) / 2;
  let x = left;
  const shapes: Shape[] = [];
  parts.forEach((part, pi) => {
    if (part.kind === "strength") {
      const ew = f1(Math.max(1.2, Math.min(1.8, u * 0.07)));
      columns.forEach((c, i) => {
        for (let k = 0; k < c.sets; k++) {
          const yy = base - (k + 1) * u - k * GAPS.set * u;
          // Warm-up sets are the foot of a column: done in grey with a 3:1 edge, to do as an
          // outline.
          const warm = typeof c.warm === "number" ? k < c.warm : !!c.warm;
          const state: FormState = c.skipped ? "skipped" : k < c.done ? "done" : "todo";
          if (c.skipped)
            shapes.push({
              kind: "rect",
              x: f1(x + 0.9),
              y: f1(yy + 0.9),
              width: f1(u - 1.8),
              height: f1(u - 1.8),
              fill: "none",
              stroke: "strength",
              strokeWidth: 1.8,
              dash: [f1(u * 0.16), f1(u * 0.12)],
            });
          else if (warm)
            shapes.push(
              state === "done"
                ? {
                    kind: "rect",
                    x: f1(x + 0.75),
                    y: f1(yy + 0.75),
                    width: f1(u - 1.5),
                    height: f1(u - 1.5),
                    fill: "warm",
                    stroke: "dot",
                    strokeWidth: ew,
                  }
                : {
                    kind: "rect",
                    x: f1(x + 0.75),
                    y: f1(yy + 0.75),
                    width: f1(u - 1.5),
                    height: f1(u - 1.5),
                    fill: "none",
                    stroke: "label",
                    strokeWidth: ew,
                  },
            );
          else
            shapes.push(
              state === "done"
                ? {
                    kind: "rect",
                    x: f1(x),
                    y: f1(yy),
                    width: f1(u),
                    height: f1(u),
                    fill: "strength",
                  }
                : {
                    kind: "rect",
                    x: f1(x + 0.6),
                    y: f1(yy + 0.6),
                    width: f1(u - 1.2),
                    height: f1(u - 1.2),
                    fill: "strength-todo",
                    stroke: "strength",
                    strokeWidth: ew,
                  },
            );
        }
        // A superset's two columns stand closer than any others; the lists bracket them.
        x += u;
        if (i < columns.length - 1) x += (c.pair ? GAPS.pair : GAPS.column) * u;
      });
    } else {
      const q = sizes[pi]!;
      const fw = q.wm * u;
      const fh = tall(q) * u;
      shapes.push(
        ...form(part.kind, x, base - fh, fw, fh, {
          state: part.state ?? "todo",
          segments: part.segments ?? 0,
          done: part.segmentsDone ?? 0,
          fill: true,
        }),
      );
      x += fw;
    }
    x += GAPS.part * u;
  });
  return {
    module: u,
    baseline: base,
    left,
    right: left + totalWm * u,
    top: base - maxHm * u,
    shapes,
  };
}

// ---------- the bowl: the day's food, filled meal by meal; past the target it heaps ----------

/** Area of a circular segment of height h in a circle of radius r. */
function segmentArea(r: number, h: number): number {
  const d = r - h;
  return (
    r * r * Math.acos(Math.max(-1, Math.min(1, d / r))) -
    d * Math.sqrt(Math.max(0, 2 * r * h - h * h))
  );
}

function solve(fn: (m: number) => number, want: number, lo: number, hi: number): number {
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (fn(m) < want) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** The height of a fill of `fraction` of the half disc of radius r, from its round edge up. */
export function levelFor(fraction: number, r: number): number {
  return solve((m) => segmentArea(r, m), (fraction * Math.PI * r * r) / 2, 0, r);
}

// The heap: a circular segment on the rim's chord (half-width r) with height t.
const lensRadius = (r: number, t: number) => (r * r + t * t) / (2 * t);
const lensArea = (r: number, t: number) => (t <= 0 ? 0 : segmentArea(lensRadius(r, t), t));
// The heap's area between the rim and height s (s ≤ t).
function lensBelow(r: number, t: number, s: number): number {
  if (s <= 0) return 0;
  if (s >= t) return lensArea(r, t);
  return lensArea(r, t) - segmentArea(lensRadius(r, t), t - s);
}

/** The heap's height over the rim for an excess of `excess` (a share of the target, 0 to 1). */
export function heapHeight(excess: number, r: number): number {
  const ex = Math.min(1, Math.max(0, excess));
  return ex > 0 ? solve((m) => lensArea(r, m), (ex * Math.PI * r * r) / 2, 0.0001, r) : 0;
}

export type BowlMeal = {
  kcal: number;
  /** A portion being added, not logged yet: a thinned layer with its top edge in full. */
  pending?: boolean;
};

/** The meal layers, from the bottom: ochre, cadmium, straw, then again. */
export const STRATA: readonly Paint[] = ["ochre", "food", "straw"];

export type BowlFigure = {
  /** The bowl's own half disc, which clips the layers inside it. */
  bowlClip: string;
  /** The heap's lens over the rim, when the day is past its target. */
  heapClip: string | null;
  inside: Shape[];
  heap: Shape[];
  /** The rim and the bowl's line, drawn over the food. */
  outline: Shape[];
  over: boolean;
  heapTop: number;
};

/**
 * The bowl is a half disc whose area is the day's target; each meal is a layer whose area is
 * its calories. Past the target, food heaps over the rim: a lens that always spans the whole rim
 * and rises as the excess grows, so bowl and heap stay one symmetric figure; at twice the target
 * the heap is the bowl's mirror and the figure closes into a circle.
 */
export function bowlFigure({
  r,
  cx,
  rim,
  meals,
  target,
  rimWidth = 3,
}: {
  r: number;
  cx: number;
  rim: number;
  meals: readonly BowlMeal[];
  target: number;
  rimWidth?: number;
}): BowlFigure {
  const half = (Math.PI * r * r) / 2;
  const total = meals.reduce((a, m) => a + m.kcal, 0);
  const ex = target > 0 ? Math.min(1, Math.max(0, total - target) / target) : 0;
  const t = heapHeight(ex, r);
  const yIn = (kcal: number) => rim + r - levelFor(Math.min(1, kcal / target), r);
  const yOver = (kcal: number) => {
    const e = Math.min(ex, Math.max(0, kcal - target) / target) * half;
    return rim - (e <= 0 ? 0 : solve((s) => lensBelow(r, t, s), e, 0, t));
  };
  let acc = 0;
  const inside: Shape[] = [];
  const heap: Shape[] = [];
  meals.forEach((meal, i) => {
    const a = acc;
    const b = acc + meal.kcal;
    const paint = STRATA[i % 3]!;
    if (a < target) {
      const y0 = yIn(a);
      let y1 = yIn(Math.min(b, target));
      if (y0 - y1 < 3 && b <= target) y1 = y0 - 3; // a sliver still shows
      if (meal.pending)
        inside.push(
          {
            kind: "rect",
            x: f1(cx - r),
            y: f1(y1),
            width: f1(2 * r),
            height: f1(y0 - y1 + 0.5),
            fill: paint,
            fillOpacity: 0.32,
          },
          { kind: "rect", x: f1(cx - r), y: f1(y1), width: f1(2 * r), height: 2.5, fill: paint },
        );
      else
        inside.push({
          kind: "rect",
          x: f1(cx - r),
          y: f1(y1),
          width: f1(2 * r),
          height: f1(y0 - y1 + 0.5),
          fill: paint,
        });
      if (i)
        inside.push({
          kind: "rect",
          x: f1(cx - r),
          y: f1(y0 - 0.75),
          width: f1(2 * r),
          height: 1.5,
          fill: "cut",
        });
    }
    if (b > target) {
      const y0 = a > target ? yOver(a) : rim;
      const y1 = yOver(b);
      heap.push({
        kind: "rect",
        x: f1(cx - r),
        y: f1(y1 - 0.5),
        width: f1(2 * r),
        height: f1(y0 - y1 + 0.5),
        fill: paint,
      });
      if (a > target)
        heap.push({
          kind: "rect",
          x: f1(cx - r),
          y: f1(y0 - 0.75),
          width: f1(2 * r),
          height: 1.5,
          fill: "cut",
        });
    }
    acc = b;
  });
  const R = t ? lensRadius(r, t) : 0;
  return {
    bowlClip: `M${f1(cx - r)} ${f1(rim)}A${f1(r)} ${f1(r)} 0 0 0 ${f1(cx + r)} ${f1(rim)}Z`,
    heapClip: t
      ? `M${f1(cx - r)} ${f1(rim)}A${f1(R)} ${f1(R)} 0 0 1 ${f1(cx + r)} ${f1(rim)}Z`
      : null,
    inside,
    heap,
    outline: [
      {
        kind: "path",
        d: `M${f1(cx - r)} ${f1(rim)}A${f1(r)} ${f1(r)} 0 0 0 ${f1(cx + r)} ${f1(rim)}`,
        fill: "none",
        stroke: "ink",
        strokeWidth: rimWidth,
      },
      {
        kind: "path",
        d: `M${f1(cx - r - rimWidth * 3)} ${f1(rim)}H${f1(cx + r + rimWidth * 3)}`,
        stroke: "ink",
        strokeWidth: rimWidth,
      },
    ],
    over: total > target,
    heapTop: rim - t,
  };
}

/**
 * The day's print on Food: the bowl alone, centred on its paper. Above the rim the paper keeps
 * air, or the heap's height when that is more, so the bowl stays as large as it can.
 */
export function bowlPrint({
  width,
  meals,
  target,
  maxRadius = 100,
  pad = 18,
  rimWidth = 3,
}: {
  width: number;
  meals: readonly BowlMeal[];
  target: number;
  maxRadius?: number;
  /** The paper's margin round the bowl: 18 for the day's print, less for a small one. */
  pad?: number;
  rimWidth?: number;
}): { height: number; figure: BowlFigure } {
  const r = Math.round(Math.min(maxRadius, (width - 2 * pad) / 2 - rimWidth * 3));
  const total = meals.reduce((a, m) => a + m.kcal, 0);
  const heap = heapHeight(target > 0 ? (total - target) / target : 0, r);
  const rim = pad + Math.max(Math.round(r * 0.3), Math.ceil(heap) + 12);
  const height = rim + r + rimWidth + pad;
  return {
    height,
    figure: bowlFigure({ r, cx: Math.round(width / 2), rim, meals, target, rimWidth }),
  };
}

// ---------- the month: the first calendar's style, pulled on paper ----------

/** Monday first: the cells of a month, `null` before the first and after the last day. */
export function monthCells(year: number, month: number): (number | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const rows = Math.ceil((lead + days) / 7);
  return Array.from({ length: rows * 7 }, (_, i) => {
    const day = i - lead + 1;
    return day >= 1 && day <= days ? day : null;
  });
}

/** One sport's mark on the calendar's paper, its box `size` tall; a run's track is longer. */
const markWidth = (sport: Sport, size: number) => (familyOf(sport) === "run" ? size * 1.6 : size);

function calendarMark(sport: Sport, cx: number, cy: number, size: number): Shape[] {
  const w = markWidth(sport, size);
  const h = familyOf(sport) === "run" ? size * 0.85 : size;
  return form(sport, cx - w / 2, cy - h / 2, w, h);
}

/**
 * A day's marks as one group centred in its cell: one at 40% of its height, two side by side,
 * three or four in two rows of two; past four, three and +N. Nothing is drawn under a mark.
 */
export function dayMarks(
  sports: readonly Sport[],
  width: number,
  height: number,
  fit = 4,
): Shape[] {
  const n = sports.length;
  const cx = width / 2;
  const cy = height / 2;
  // The marks grow with the cell: one at 40% of its height, two a little smaller, four smaller.
  const one = Math.min(22, Math.round(height * 0.4));
  if (n === 0) return [];
  if (n === 1) return calendarMark(sports[0]!, cx, cy, one);
  const shown = n > fit ? sports.slice(0, fit - 1) : sports.slice();
  const more = n - shown.length;
  const size = shown.length === 2 ? Math.round(one * 0.8) : Math.round(one * 0.64);
  const gap = 4;
  const rows = shown.length <= 2 ? [shown] : [shown.slice(0, 2), shown.slice(2, 4)];
  const out: Shape[] = [];
  rows.forEach((row, ri) => {
    const widths = row.map((s) => markWidth(s, size));
    const last = ri === rows.length - 1;
    const plusW = more && last ? 16 : 0;
    const items = row.length + (plusW ? 1 : 0);
    const total = widths.reduce((a, b) => a + b, 0) + plusW + gap * (items - 1);
    let x = cx - total / 2;
    const y = rows.length === 1 ? cy : cy + (ri ? 1 : -1) * (size / 2 + 2.5);
    row.forEach((s, k) => {
      const w = widths[k]!;
      out.push(...calendarMark(s, x + w / 2, y, size));
      x += w + gap;
    });
    if (plusW) out.push({ kind: "text", x: f1(x + plusW / 2), y: f1(y + 4), text: `+${more}` });
  });
  return out;
}
