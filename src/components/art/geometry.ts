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
 *   runner, on wheels a wheel, in water a wave, practice a fan, food a bowl, play a triangle.
 * - SPORT: a family's form with one cut, the paper showing through (spin, row, paddle, yoga,
 *   climbing, racket sports). The runner is a figure, which a cut cannot read on: walking and
 *   hiking print as the runner until they are drawn.
 * - CONTEXT means the same on every form: segments are its structure (sets, intervals, laps,
 *   drills); size is how long, in whole modules. The runner is one fixed drawing.
 * - STATE: thinned pigment with an edge of the full one is to do, full is done, a dashed edge
 *   is skipped. A warm-up is grey.
 * - REST: a day that asks for nothing is a crescent, in the greys a warm-up is drawn in: it is
 *   no sport, so it takes no pigment.
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

export type FormName = "block" | "runner" | "wheel" | "wave" | "fan" | "bowl" | "triangle";
export type Cut = "hub" | "oar" | "blade" | "arc" | "steps" | "ball";

/** Thinned with an edge of the full pigment is to do; full is done; a dashed edge is skipped. */
export type FormState = "todo" | "done" | "skipped";

export const FAMILY: Readonly<Record<Family, { family: string; form: FormName; name: string }>> = {
  strength: { family: "Load", form: "block", name: "Lifting" },
  run: { family: "On foot", form: "runner", name: "Running" },
  ride: { family: "On wheels", form: "wheel", name: "Cycling" },
  swim: { family: "In water", form: "wave", name: "Swimming" },
  mobility: { family: "Practice", form: "fan", name: "Mobility" },
  food: { family: "Food", form: "bowl", name: "Food" },
  play: { family: "Play", form: "triangle", name: "Play" },
};

/**
 * A sport the app may add later: its family's form with one cut. Walking and hiking have none
 * yet: a cut does not read on the runner, so they print as it until they are drawn.
 */
export const VARIANT: Readonly<Record<Variant, { base: Family; cut: Cut | null; name: string }>> = {
  walk: { base: "run", cut: null, name: "Walk" },
  hike: { base: "run", cut: null, name: "Hike" },
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
  | ({ kind: "rect"; x: number; y: number; width: number; height: number; rx?: number } & Paintable)
  | ({ kind: "path"; d: string } & Paintable)
  | ({ kind: "circle"; cx: number; cy: number; r: number } & Paintable)
  | { kind: "clip"; clip: string; shapes: Shape[] }
  | { kind: "text"; x: number; y: number; text: string };

/** One decimal, as the generator rounds, so a path reads the same on every engine. */
export const f1 = (n: number): number => Math.round(n * 10) / 10;

const todoOf = (family: Family): Paint => `${family}-todo`;

/**
 * A path drawn on a glyph's grid (24 units, or a sign's 48), in absolute commands with each point
 * an "x y" pair, placed at (x, y) and scaled by k.
 */
function onGrid(d: string, x: number, y: number, k: number): string {
  return d.replace(
    /(-?[\d.]+) (-?[\d.]+)/g,
    (_, px: string, py: string) => `${f1(x + Number(px) * k)} ${f1(y + Number(py) * k)}`,
  );
}

/** The runner on the glyph's grid: the torso, the arms swinging, the knee up, the back leg long. */
const RUNNER =
  "M13.2 7.6L10.6 13.8M13.2 7.6L16.5 10.7L19.5 9.1M13.2 7.6L9.3 9.2L7.7 12.7M10.6 13.8L15 16.4L14.1 21.8M10.6 13.8L8.3 18.2L3.7 18.8";
/** Its head, a disc. */
const RUNNER_HEAD = { cx: 15.6, cy: 3.6 } as const;
/** How far it is lowered to stand on the bottom of its box: the front foot, at its widest line. */
const RUNNER_DROP = 0.25;
/** In a print the runner is two modules tall, the same every day: a print does not measure a run. */
const RUNNER_MODULES = 2;

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
  } else if (shape === "runner") {
    // A runner, the glyph's figure scaled to the box and standing on its bottom edge: one fixed
    // drawing, with no segments and no length. To do is a line of the thinned pigment inside an
    // edge of the full one; skipped is that edge dashed, the paper inside it.
    const k = S / 24;
    const gx = x + (w - S) / 2;
    const gy = base - S + RUNNER_DROP * k;
    const limbs = onGrid(RUNNER, gx, gy, k);
    const head = { cx: f1(gx + RUNNER_HEAD.cx * k), cy: f1(gy + RUNNER_HEAD.cy * k) };
    const line = (paint: Paint, width: number, more: Paintable = {}): Shape => ({
      kind: "path",
      d: limbs,
      fill: "none",
      stroke: paint,
      strokeWidth: f1(width * k),
      linecap: "round",
      linejoin: "round",
      ...more,
    });
    if (state === "skipped")
      out.push(
        line(C, 3.9, { linecap: "butt", dash: [f1(1.4 * k), f1(1.1 * k)] }),
        line("cut", 2.1),
        {
          kind: "circle",
          ...head,
          r: f1(2.1 * k),
          fill: "cut",
          stroke: C,
          strokeWidth: f1(0.8 * k),
          dash: [f1(1.1 * k), f1(0.9 * k)],
        },
      );
    else if (state === "todo")
      out.push(
        line(C, 3.9),
        line(T, 2.1),
        { kind: "circle", ...head, r: f1(2.5 * k), fill: C },
        { kind: "circle", ...head, r: f1(1.8 * k), fill: T },
      );
    else out.push(line(C, 2.9), { kind: "circle", ...head, r: f1(2.5 * k), fill: C });
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
    // A quarter disc standing on its corner, cut into its drills. Skipped, it is a dashed edge
    // with the paper inside, and each cut between drills a dashed line of its own: a cut in the
    // paper's colour around nothing drew no fan at all, and a warm-up a workout finished without
    // stood as blank paper in its print; a dashed edge round each drill dashed every line between
    // two drills twice, out of step, so those read as solid and only the rim as dashed.
    const r = Math.min(w, h);
    const ox = x;
    const oy = base;
    const n = Math.max(1, segments || 1);
    const at = (k: number) => {
      const a = -Math.PI / 2 + (k / n) * (Math.PI / 2);
      return `${f1(ox + r * Math.cos(a))} ${f1(oy + r * Math.sin(a))}`;
    };
    if (state === "skipped") {
      out.push({
        kind: "path",
        d: `M${f1(ox)} ${f1(oy)}L${at(0)}A${f1(r)} ${f1(r)} 0 0 1 ${at(n)}Z`,
        fill: "none",
        ...dash,
      });
      for (let k = 1; k < n; k++)
        out.push({ kind: "path", d: `M${f1(ox)} ${f1(oy)}L${at(k)}`, fill: "none", ...dash });
    } else {
      for (let k = 0; k < n; k++) {
        out.push({
          kind: "path",
          d: `M${f1(ox)} ${f1(oy)}L${at(k)}A${f1(r)} ${f1(r)} 0 0 1 ${at(k + 1)}Z`,
          fill: fillFor(k),
          ...(isTodo(k) ? edge(k) : n > 1 ? { stroke: "cut", strokeWidth: cutW } : dash),
        });
      }
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

// ---------- rest: a day that asks for nothing ----------

/** In a print a rest day is two modules tall, as the runner is: rest is not measured either. */
const REST_MODULES = 2;
/** The disc cut from it, as the moon glyph's is: up and to the right, nearly as large. */
const REST_CUT = { offset: 0.45, radius: 0.9 } as const;

/** A crescent of radius r about (cx, cy), the paper showing where the cut is. */
function crescent(cx: number, cy: number, r: number): string {
  const d = REST_CUT.offset * r;
  const rc = REST_CUT.radius * r;
  // Where the two circles cross, either side of the line between their centres (up and right).
  const a = (r * r - rc * rc + d * d) / (2 * d);
  const h = Math.sqrt(r * r - a * a);
  const k = Math.SQRT1_2;
  const mx = cx + a * k;
  const my = cy - a * k;
  const east = `${f1(mx + h * k)} ${f1(my + h * k)}`;
  const north = `${f1(mx - h * k)} ${f1(my - h * k)}`;
  // The outer edge the long way round, under and behind; the cut's edge back, inside the disc.
  return `M${east}A${f1(r)} ${f1(r)} 0 1 1 ${north}A${f1(rc)} ${f1(rc)} 0 0 0 ${east}Z`;
}

/**
 * A rest day: a crescent, the moon the app says sleep with, standing on the bottom of its box.
 * It is no sport, so it takes no pigment: it is drawn in the print's greys, as a warm-up is, and
 * keeps the grammar's states in them. To do is the pale grey inside a 3:1 edge, done is that
 * edge's grey in full, and skipped is the edge dashed with the paper inside. One fixed drawing,
 * like the runner: a day of rest has no structure and no length.
 */
export function restForm(
  x: number,
  y: number,
  w: number,
  h: number,
  state: FormState = "todo",
): Shape[] {
  const S = Math.min(w, h);
  const r = S / 2;
  const cx = x + w / 2;
  const cy = y + h - r;
  if (state === "done") return [{ kind: "path", d: crescent(cx, cy, r), fill: "dot" }];
  // An edge stands inside the disc, so nothing is drawn under the baseline.
  const sw = f1(
    state === "skipped" ? Math.max(1.5, S * 0.05) : Math.min(1.5, Math.max(1, S * 0.06)),
  );
  return [
    {
      kind: "path",
      d: crescent(cx, cy, r - sw / 2),
      fill: state === "skipped" ? "none" : "warm",
      stroke: "dot",
      strokeWidth: sw,
      linejoin: "round",
      ...(state === "skipped"
        ? { dash: [f1(S * 0.09), f1(S * 0.07)] as const, linecap: "butt" as const }
        : {}),
    },
  ];
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
  /** A rest day with nothing in it: its routine, when it has one, is a fan instead. */
  | { kind: "rest"; state?: FormState }
  | {
      kind: Exclude<Sport, "strength" | "food">;
      state?: FormState;
      /** How tall, in whole modules (at most the tallest column); a runner is always two. */
      modules?: number;
      segments?: number;
      segmentsDone?: number;
    };

/** Gaps, in modules: between sets, between exercises, a superset's pair, between parts. */
export const GAPS = { set: 0.14, column: 0.34, pair: 0.14, part: 1 } as const;

type Size = { wm: number; hm: number };

function partModules(part: Exclude<PrintPart, { kind: "strength" }>, cap: number): Size {
  if (part.kind === "rest")
    return { hm: REST_MODULES, wm: REST_MODULES + (REST_MODULES - 1) * GAPS.set };
  const family = familyOf(part.kind);
  const hm = family === "run" ? RUNNER_MODULES : Math.max(1, Math.min(cap, part.modules || cap));
  // A runner, a wheel, a fan and a bowl are as wide as they are tall: hm modules and the gaps
  // between.
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
        ...(part.kind === "rest"
          ? restForm(x, base - fh, fw, fh, part.state)
          : form(part.kind, x, base - fh, fw, fh, {
              state: part.state ?? "todo",
              segments: part.segments ?? 0,
              done: part.segmentsDone ?? 0,
              fill: true,
            })),
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

// ---------- the month: a tile for each day, an icon for each activity ----------

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

/**
 * Each sport's sign (sign.tsx; owner, 28 October 2026) as the month draws it: the Munich-grid
 * figure on its 48-unit square, its limbs as absolute paths of "x y" pairs, its head a disc and,
 * for a ride, its wheels and, for play, its ball as rings. Food and the variants a family has no
 * figure for draw their form.
 */
const SIGN_FIGURES: Partial<
  Record<
    Family,
    {
      path: string;
      discs: readonly [number, number][];
      rings?: readonly [number, number, number][];
    }
  >
> = {
  strength: {
    path: "M4 8L44 8M9 2L9 14M39 2L39 14M24 26L16 18L16 8M24 26L32 18L32 8M24 22L24 36M24 36L16 44M24 36L32 44",
    discs: [[24, 15]],
  },
  run: {
    path: "M29 14L20 23M20 23L29 32L29 42M20 23L12 31L5 31M27 16L34 23L40 17M27 16L19 16L14 21",
    discs: [[31, 7]],
  },
  ride: {
    path: "M28 15L19 24M28 15L35 22M19 24L26 31L26 36M11 36L19 24M35 22L37 36",
    discs: [[30, 8]],
    rings: [
      [11, 36, 7],
      [37, 36, 7],
    ],
  },
  swim: {
    path: "M30 24L12 24M27 22L34 14L41 14M4 35Q8 31 12 35T20 35T28 35T36 35T44 35",
    discs: [[36, 19]],
  },
  mobility: {
    path: "M24 13L24 27M24 16L17 9M24 16L31 9M24 27L16 35L16 43M24 27L34 37L40 37",
    discs: [[24, 7]],
  },
  play: {
    path: "M21 15L17 27M20 17L29 18L34 14M17 27L10 34L10 42M17 27L26 33L26 42",
    discs: [[20, 8]],
    rings: [[38, 10, 5.5]],
  },
};

/**
 * A sport's icon on the calendar, in a square box `size` wide at (x, y): its sign in the sport's
 * pigment, one stroke 4.6 units of 48 wide, as every list draws it (owner, 28 October 2026), so a
 * month and a list speak one language. A sport with no figure draws its form.
 *
 * `open` draws one still under way in the thinned pigment, as a mark to do was drawn, so the
 * workout in progress never looks like one of the month's finished sessions beside a count that
 * leaves it out (year audit, October 2026).
 */
export function calendarIcon(
  sport: Sport,
  x: number,
  y: number,
  size: number,
  { open = false }: { open?: boolean } = {},
): Shape[] {
  const family = familyOf(sport);
  const figure = SIGN_FIGURES[family];
  if (!figure) return form(sport, x, y, size, size, open ? { state: "todo" } : {});
  const k = size / 48;
  const paint: Paint = open ? todoOf(family) : family;
  const width = f1(4.6 * k);
  const at = (cx: number, cy: number) => ({ cx: f1(x + cx * k), cy: f1(y + cy * k) });
  return [
    ...(figure.rings ?? []).map(([cx, cy, r]): Shape => ({
      kind: "circle",
      ...at(cx, cy),
      r: f1(r * k),
      fill: "none",
      stroke: paint,
      strokeWidth: width,
    })),
    {
      kind: "path",
      d: onGrid(figure.path, x, y, k),
      fill: "none",
      stroke: paint,
      strokeWidth: width,
      linecap: "round",
      linejoin: "round",
    },
    ...figure.discs.map(([cx, cy]): Shape => ({
      kind: "circle",
      ...at(cx, cy),
      r: f1(4.4 * k),
      fill: paint,
    })),
  ];
}

/** The calendar's icons are 16 pt, 3 apart, so four stand in a 35-pt square. */
export const ICON = { size: 16, gap: 3 } as const;

/**
 * A day's icons, one for each activity in the order they were done, as one group centred on
 * (cx, cy): one, or two side by side; three or four in two rows of two; past four, three and
 * +N. Every icon is the same size whatever the day holds. `open` flags, by its place, an
 * activity still under way (`calendarIcon`).
 */
export function dayIcons(
  sports: readonly Sport[],
  cx: number,
  cy: number,
  open: readonly boolean[] = [],
): Shape[] {
  const { size, gap } = ICON;
  const shown = sports.length > 4 ? sports.slice(0, 3) : sports;
  const more = sports.length - shown.length;
  const items: ({ sport: Sport; open: boolean } | null)[] = shown.map((sport, index) => ({
    sport,
    open: open[index] ?? false,
  }));
  if (more) items.push(null);
  const rows = items.length > 2 ? [items.slice(0, 2), items.slice(2)] : [items];
  const block = rows.length * size + (rows.length - 1) * gap;
  const out: Shape[] = [];
  rows.forEach((row, ri) => {
    const y = cy - block / 2 + ri * (size + gap);
    const total = row.length * size + (row.length - 1) * gap;
    row.forEach((item, j) => {
      const x = cx - total / 2 + j * (size + gap);
      if (item) out.push(...calendarIcon(item.sport, x, y, size, { open: item.open }));
      else
        out.push({ kind: "text", x: f1(x + size / 2), y: f1(y + size / 2 + 4), text: `+${more}` });
    });
  });
  return out;
}
