import { describe, expect, it } from "vitest";

import {
  bowlFigure,
  bowlPrint,
  calendarIcon,
  dayIcons,
  dayPrint,
  f1,
  familyOf,
  form,
  GAPS,
  heapHeight,
  levelFor,
  monthCells,
  type PrintPart,
  type Shape,
} from "./geometry";

type Rect = Extract<Shape, { kind: "rect" }>;
type Path = Extract<Shape, { kind: "path" }>;
type Circle = Extract<Shape, { kind: "circle" }>;

/** The list's item at `i`, which the test expects to be there. */
function at<T>(list: readonly T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`Expected an item at ${i}`);
  return item;
}
const rects = (shapes: Shape[]) => shapes.filter((s): s is Rect => s.kind === "rect");

/** The end points of a path's absolute M, H, V, L and A commands, which are all the prints use. */
function points(d: string): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  let x = 0;
  let y = 0;
  for (const [, command = "", args = ""] of d.matchAll(/([MHVLAZ])([^MHVLAZ]*)/g)) {
    const n = args.trim()
      ? args
          .trim()
          .split(/[\s,]+/)
          .map(Number)
      : [];
    if (command === "M" || command === "L") [x, y] = [at(n, 0), at(n, 1)];
    else if (command === "H") x = at(n, 0);
    else if (command === "V") y = at(n, 0);
    else if (command === "A") [x, y] = [at(n, 5), at(n, 6)];
    else continue;
    xs.push(x);
    ys.push(y);
  }
  return { xs, ys };
}

/** The composition the Today board draws: a run, then four arm exercises. */
const TODAY: PrintPart[] = [
  { kind: "run" },
  {
    kind: "strength",
    columns: [
      { sets: 3, done: 0 },
      { sets: 3, done: 0 },
      { sets: 3, done: 0, pair: true },
      { sets: 2, done: 0 },
    ],
  },
];

describe("the grammar", () => {
  it("prints a sport as its family's form", () => {
    expect(familyOf("walk")).toBe("run");
    expect(familyOf("spin")).toBe("ride");
    expect(familyOf("yoga")).toBe("mobility");
    expect(familyOf("swim")).toBe("swim");
  });

  it("draws a run as a runner, one drawing scaled to its box", () => {
    const small = form("run", 0, 0, 24, 24);
    expect(small.map((s) => s.kind)).toEqual(["path", "circle"]);
    const large = form("run", 0, 0, 48, 48);
    const line = (shapes: Shape[]) => at(shapes, 0) as Path;
    const head = (shapes: Shape[]) => at(shapes, 1) as Circle;
    expect(line(large).strokeWidth).toBeCloseTo(2 * line(small).strokeWidth!, 1);
    expect(head(large).r).toBeCloseTo(2 * head(small).r, 1);
  });
});

describe("a form's state", () => {
  it("fills done in full pigment", () => {
    const block = at(rects(form("strength", 0, 0, 20, 20)), 0);
    expect(block.fill).toBe("strength");
    expect(block.stroke).toBeUndefined();
  });

  it("thins to do, keeping an edge of the full pigment", () => {
    const block = at(rects(form("strength", 0, 0, 20, 20, { state: "todo" })), 0);
    expect(block.fill).toBe("strength-todo");
    expect(block.stroke).toBe("strength");
  });

  it("draws skipped as a dashed edge with nothing inside, and dashes mean nothing else", () => {
    for (const sport of ["strength", "run", "ride", "swim", "mobility", "food", "play"] as const) {
      const skipped = form(sport, 0, 0, 24, 24, { state: "skipped" });
      expect(skipped.some((s) => "dash" in s && s.dash)).toBe(true);
      for (const state of ["todo", "done"] as const)
        expect(form(sport, 0, 0, 24, 24, { state }).some((s) => "dash" in s && s.dash)).toBe(false);
    }
  });

  it("inks a form's segments from the first as they are done", () => {
    const drills = form("mobility", 0, 0, 40, 40, { segments: 5, done: 2 });
    const fills = drills.map((s) => ("fill" in s ? s.fill : undefined));
    expect(fills).toEqual([
      "mobility",
      "mobility",
      "mobility-todo",
      "mobility-todo",
      "mobility-todo",
    ]);
  });

  it("thins a runner to do inside an edge of its pigment, and leaves paper inside when skipped", () => {
    const todo = form("run", 0, 0, 24, 24, { state: "todo" }) as Path[];
    expect(todo.slice(0, 2)).toMatchObject([
      { stroke: "run", strokeWidth: 3.9 },
      { stroke: "run-todo", strokeWidth: 2.1 },
    ]);
    const skipped = form("run", 0, 0, 24, 24, { state: "skipped" });
    expect(skipped.slice(0, 2)).toMatchObject([
      { stroke: "run", dash: [1.4, 1.1] },
      { stroke: "cut" },
    ]);
  });

  it("makes a sport's cut out of whatever the form stands on", () => {
    const spin = form("spin", 0, 0, 40, 40);
    const ride = form("ride", 0, 0, 40, 40);
    expect(spin.length).toBe(ride.length + 1);
    expect(spin.at(-1)).toMatchObject({ stroke: "cut" });
    expect(form("racket", 0, 0, 30, 30).at(-1)).toMatchObject({ kind: "circle", fill: "cut" });
  });

  it("prints walking and hiking as the runner until they are drawn", () => {
    expect(form("walk", 0, 0, 24, 24)).toEqual(form("run", 0, 0, 24, 24));
    expect(form("hike", 0, 0, 24, 24, { state: "todo" })).toEqual(
      form("run", 0, 0, 24, 24, { state: "todo" }),
    );
  });

  it("stands on the bottom of its box", () => {
    const block = at(rects(form("strength", 10, 20, 30, 30)), 0);
    expect(block.y + block.height).toBeCloseTo(50, 1);
    const ring = at(form("ride", 10, 20, 30, 30) as Extract<Shape, { kind: "circle" }>[], 0);
    expect(ring.cy + 15).toBeCloseTo(50, 1);
    // the runner's front foot, at its widest line, ends on the bottom edge
    for (const state of ["todo", "done", "skipped"] as const) {
      const line = at(form("run", 10, 20, 30, 30, { state }), 0) as Path;
      expect(Math.max(...points(line.d).ys) + line.strokeWidth! / 2).toBeLessThanOrEqual(50.1);
    }
    const widest = at(form("run", 10, 20, 30, 30, { state: "todo" }), 0) as Path;
    expect(Math.max(...points(widest.d).ys) + widest.strokeWidth! / 2).toBeCloseTo(50, 0);
  });
});

describe("the day's print", () => {
  it("centres the composition on its paper, across and down", () => {
    for (const [width, height] of [
      [362, 214],
      [288, 96],
      [400, 190],
    ] as const) {
      const day = dayPrint({ width, height, parts: TODAY });
      expect((day.left + day.right) / 2).toBeCloseTo(width / 2, 6);
      expect((day.top + day.baseline) / 2).toBeCloseTo(height / 2, 6);
    }
  });

  it("stands every set on one baseline, done from the bottom up", () => {
    const day = dayPrint({
      width: 362,
      height: 214,
      parts: [{ kind: "strength", columns: [{ sets: 3, done: 1 }] }],
    });
    const blocks = rects(day.shapes).sort((a, b) => b.y - a.y);
    expect(at(blocks, 0).y + at(blocks, 0).height).toBeCloseTo(day.baseline, 0);
    expect(blocks.map((b) => b.fill)).toEqual(["strength", "strength-todo", "strength-todo"]);
  });

  it("lays every form on one module grid, with the grammar's gaps", () => {
    const u = 30;
    const day = dayPrint({
      width: 600,
      height: 200,
      module: u,
      parts: [
        {
          kind: "strength",
          columns: [
            { sets: 2, done: 2 },
            { sets: 2, done: 2, pair: true },
            { sets: 2, done: 2 },
          ],
        },
      ],
    });
    const blocks = rects(day.shapes);
    const xs = [...new Set(blocks.map((b) => b.x))].sort((a, b) => a - b);
    const ys = [...new Set(blocks.map((b) => b.y))].sort((a, b) => a - b);
    // a superset's two columns stand closer than any others
    expect(at(xs, 1) - at(xs, 0)).toBeCloseTo(u + GAPS.column * u, 0);
    expect(at(xs, 2) - at(xs, 1)).toBeCloseTo(u + GAPS.pair * u, 0);
    expect(GAPS.pair).toBeLessThan(GAPS.column);
    // sets stand 0.14 of a module apart
    expect(at(ys, 1) - at(ys, 0)).toBeCloseTo(u + GAPS.set * u, 0);
  });

  it("takes the largest module that fits, never more than the maximum, or the one it is given", () => {
    const wide = dayPrint({ width: 2000, height: 2000, parts: TODAY });
    expect(wide.module).toBe(44);
    const shared = dayPrint({ width: 362, height: 214, parts: TODAY, module: 12 });
    expect(shared.module).toBe(12);
    const narrow = dayPrint({ width: 288, height: 96, parts: TODAY });
    expect(narrow.module).toBeLessThan(dayPrint({ width: 362, height: 214, parts: TODAY }).module);
  });

  it("stands a runner two modules tall, however tall the columns beside it", () => {
    const u = 20;
    const side = (2 + GAPS.set) * u;
    const alone = dayPrint({
      width: 400,
      height: 120,
      module: u,
      parts: [{ kind: "run", state: "done" }],
    });
    expect(alone.right - alone.left).toBeCloseTo(side, 6);
    expect(alone.baseline - alone.top).toBeCloseTo(side, 6);
    const beside = dayPrint({
      width: 600,
      height: 200,
      module: u,
      parts: [
        { kind: "run", state: "done" },
        { kind: "strength", columns: [{ sets: 5, done: 5 }] },
      ],
    });
    expect(beside.right - beside.left).toBeCloseTo(side + u + u, 6);
    const head = at(beside.shapes, 1) as Circle;
    expect(head.cy - head.r).toBeGreaterThan(beside.baseline - side);
  });

  it("stands each part a whole module apart, in the rows' order, without overlapping", () => {
    const u = 20;
    const day = dayPrint({
      width: 500,
      height: 160,
      module: u,
      parts: [
        { kind: "run", state: "done" },
        { kind: "strength", columns: [{ sets: 3, done: 3 }] },
      ],
    });
    const blocks = rects(day.shapes).filter((r) => r.fill === "strength");
    const runnerEnd = day.left + (2 + GAPS.set) * u;
    expect(Math.min(...blocks.map((b) => b.x)) - runnerEnd).toBeCloseTo(u, 0);
  });

  it("greys a column's warm-ups at its foot, and dashes a skipped exercise", () => {
    const day = dayPrint({
      width: 362,
      height: 168,
      parts: [
        {
          kind: "strength",
          columns: [
            { sets: 3, done: 3, warm: 1 },
            { sets: 3, done: 0, skipped: true },
          ],
        },
      ],
    });
    const blocks = rects(day.shapes);
    const first = blocks.slice(0, 3).sort((a, b) => b.y - a.y);
    expect(at(first, 0)).toMatchObject({ fill: "warm", stroke: "dot" });
    expect(at(first, 1).fill).toBe("strength");
    expect(blocks.slice(3).every((b) => b.fill === "none" && b.dash)).toBe(true);
  });

  it("draws nothing under the forms and carries no words", () => {
    const day = dayPrint({ width: 362, height: 214, parts: TODAY });
    expect(day.shapes.some((s) => s.kind === "text")).toBe(false);
    const bottoms = rects(day.shapes).map((r) => r.y + r.height);
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(day.baseline + 0.1);
  });
});

describe("the bowl", () => {
  const halfArea = (r: number) => (Math.PI * r * r) / 2;
  /** The bowl's area between two heights measured from its round edge up. */
  const areaBetween = (r: number, from: number, to: number) => {
    const seg = (h: number) => {
      const d = r - h;
      return r * r * Math.acos(d / r) - d * Math.sqrt(2 * r * h - h * h);
    };
    return seg(to) - seg(from);
  };

  it("fills to the level that holds the share of its area", () => {
    const r = 100;
    expect(levelFor(1, r)).toBeCloseTo(r, 3);
    expect(levelFor(0, r)).toBeCloseTo(0, 3);
    expect(areaBetween(r, 0, levelFor(0.5, r))).toBeCloseTo(halfArea(r) / 2, 0);
  });

  it("lays each meal down as a layer whose area is its calories", () => {
    const r = 100;
    const rim = 50;
    const meals = [{ kcal: 445 }, { kcal: 647.5 }, { kcal: 60 }];
    const target = 2300;
    const bowl = bowlFigure({ r, cx: 150, rim, meals, target });
    const layers = rects(bowl.inside).filter((s) => s.fill !== "cut");
    expect(layers.map((l) => l.fill)).toEqual(["ochre", "food", "straw"]);
    layers.forEach((layer, i) => {
      const from = rim + r - (layer.y + layer.height - 0.5);
      const to = rim + r - layer.y;
      expect(areaBetween(r, from, to) / halfArea(r)).toBeCloseTo(at(meals, i).kcal / target, 1);
    });
    expect(bowl.over).toBe(false);
    expect(bowl.heapClip).toBeNull();
  });

  it("heaps food over the rim past the target, and closes the circle at twice it", () => {
    const r = 100;
    const over = bowlFigure({ r, cx: 150, rim: 120, meals: [{ kcal: 2536 }], target: 2300 });
    expect(over.over).toBe(true);
    expect(over.heapClip).not.toBeNull();
    expect(over.heapTop).toBeLessThan(120);
    expect(heapHeight(1, r)).toBeCloseTo(r, 2);
    expect(heapHeight(2, r)).toBeCloseTo(r, 2);
  });

  it("keeps air above the rim, or the heap's height when that is more", () => {
    const under = bowlPrint({ width: 362, meals: [{ kcal: 1152.5 }], target: 2300 });
    const over = bowlPrint({ width: 362, meals: [{ kcal: 4000 }], target: 2300 });
    expect(under.height).toBe(18 + 30 + 100 + 3 + 18);
    expect(over.height).toBeGreaterThan(under.height);
  });

  it("thins a portion still being added, with its top edge in full", () => {
    const bowl = bowlFigure({
      r: 100,
      cx: 150,
      rim: 50,
      meals: [{ kcal: 400 }, { kcal: 200, pending: true }],
      target: 2300,
    });
    const pending = rects(bowl.inside).filter((s) => s.fill === "food");
    expect(at(pending, 0).fillOpacity).toBe(0.32);
    expect(at(pending, 1)).toMatchObject({ height: 2.5 });
  });
});

describe("the month", () => {
  it("starts on Monday and holds every day once", () => {
    // 1 September 2026 was a Tuesday.
    const cells = monthCells(2026, 8);
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 2)).toEqual([null, 1]);
    expect(cells.filter((c) => c !== null)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("draws each sport's icon in its own pigment, and tells them apart by shape", () => {
    const sports = ["strength", "run", "ride", "swim"] as const;
    for (const sport of sports)
      for (const shape of calendarIcon(sport, 0, 0, 24)) {
        if ("fill" in shape && shape.fill !== "none") expect(shape.fill).toBe(sport);
        if ("stroke" in shape && shape.stroke) expect(shape.stroke).toBe(sport);
      }
    const outline = (sport: (typeof sports)[number]) =>
      calendarIcon(sport, 0, 0, 24)
        .map((shape) => shape.kind)
        .join(" ");
    expect(new Set(sports.map(outline)).size).toBe(sports.length);
    // the runner is the run's own form, wherever it is drawn
    expect(calendarIcon("run", 0, 0, 24)).toEqual(form("run", 0, 0, 24, 24));
  });

  it("stands one icon in the middle, two side by side, three or four in two rows of two", () => {
    // Each dumbbell's bar runs through its middle, so it gives where the icon stands.
    const middles = (shapes: Shape[]) =>
      shapes
        .filter((s): s is Path => s.kind === "path")
        .map((bar) => {
          const { xs, ys } = points(bar.d);
          return [f1((at(xs, 0) + at(xs, 1)) / 2), at(ys, 0)];
        });
    const lifts = (n: number) =>
      dayIcons(
        Array.from({ length: n }, () => "strength" as const),
        17.5,
        17.5,
      );
    expect(middles(lifts(1))).toEqual([[17.5, 17.5]]);
    // 16 pt icons, 3 apart
    expect(middles(lifts(2))).toEqual([
      [8, 17.5],
      [27, 17.5],
    ]);
    expect(middles(lifts(3))).toEqual([
      [8, 8],
      [27, 8],
      [17.5, 27],
    ]);
    expect(middles(lifts(4))).toEqual([
      [8, 8],
      [27, 8],
      [8, 27],
      [27, 27],
    ]);
  });

  it("says +N past four, in the fourth icon's place", () => {
    const five = dayIcons(["run", "swim", "strength", "ride", "strength"], 17.5, 17.5);
    expect(five.filter((s) => s.kind === "text")).toEqual([
      { kind: "text", x: 27, y: 31, text: "+2" },
    ]);
  });

  it("draws nothing for a day with nothing in it", () => {
    expect(dayIcons([], 17.5, 17.5)).toEqual([]);
  });
});
