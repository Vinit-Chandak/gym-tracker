// Prints: the artwork in Form, drawn from the account's own records and nothing else.
//
// The grammar is generative, so it grows with the app:
//   FAMILY  — how the body moves — gives the primitive and the pigment:
//             load = block (ultramarine) · on foot = stride (vermilion) · on wheels = wheel (violet)
//             in water = wave (viridian) · practice = fan (rose) · food = bowl (cadmium)
//             (play, for court, wall and field sports later, is reserved: umber triangles)
//   SPORT   — one cut into its family's primitive (walk = an open stride, hike = a stride with a
//             peak cut out, spin = a wheel cut in four, row = the waves cut by two oars, yoga = a
//             fan with an arc cut in, racket = a triangle with a ball punched out …).
//             A variant never touches the ground: that belongs to context.
//   CONTEXT — modifiers that mean the same on every form:
//             a platform under it = indoors, on a machine or in a pool
//             segments = its structure: sets, intervals, laps, drills
//             size = how long or how far, in whole modules
//   STATE   — thinned pigment = still to do · full ink = done · dashed edge = skipped
//
// Every print is laid out on one module grid: a square module, one gap, one ground line. A set of
// lifting is one module; an exercise is a column of its sets standing on the ground; every other
// form stands on the same ground, as tall as a whole number of modules, so tops and rows line up.
// Shapes never overlap, and a print carries no text unless it is asked to.

export const PIG = {
  paper: "#f2eee5",
  dot: "#cfc9bc",
  ink: "#16171b",
  label: "#615c50",
  ultra: "#2b40c8",
  verm: "#e5432a",
  violet: "#6b48c0",
  viri: "#1d7a62",
  rose: "#c8487a",
  cad: "#f2b12a",
  ultraT: "#9aaaf0",
  vermT: "#f6a08a",
  violetT: "#bfb1ff",
  viriT: "#7cd1b6",
  roseT: "#f89fbb",
  cadT: "#e3b667",
  ochre: "#c98712",
  straw: "#f7d47e",
  umber: "#8a5a2b",
  umberT: "#d9b48c",
};

// Two papers. In light the prints are pigment on warm paper. In dark the same prints are pulled on
// near-black paper, so the art is never the brightest thing on a dark screen: lighter pigments,
// light ink, and to-do shapes are the pigment thinned half into the paper.
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) =>
  "#" +
  hexRgb(a)
    .map((v, i) =>
      Math.round(v * t + hexRgb(b)[i] * (1 - t))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const DARK_PAPER = "#23211d";
const DARK_COL = {
  strength: "#8796f5",
  run: "#f2704f",
  ride: "#a08cf0",
  swim: "#45b593",
  mobility: "#e07aa3",
  food: "#f2b12a",
  play: "#c4925e",
};
export const PAL = {
  light: {
    paper: PIG.paper,
    ink: PIG.ink,
    label: PIG.label,
    dot: PIG.dot,
    grain: { blend: "multiply", rgb: "0.1 0.09 0.08", opacity: 0.06 },
    col: {
      strength: PIG.ultra,
      run: PIG.verm,
      ride: PIG.violet,
      swim: PIG.viri,
      mobility: PIG.rose,
      food: PIG.cad,
      play: PIG.umber,
    },
    tint: {
      strength: PIG.ultraT,
      run: PIG.vermT,
      ride: PIG.violetT,
      swim: PIG.viriT,
      mobility: PIG.roseT,
      food: PIG.cadT,
      play: PIG.umberT,
    },
    warm: "#d8d2c4", // a warm-up set: done, but not counted
    strata: [PIG.ochre, PIG.cad, PIG.straw],
  },
  dark: {
    paper: DARK_PAPER,
    ink: "#ece7dc",
    label: "#b4ad9f",
    dot: "#4a463e",
    grain: { blend: "screen", rgb: "0.95 0.93 0.9", opacity: 0.045 },
    col: DARK_COL,
    tint: Object.fromEntries(
      Object.entries(DARK_COL).map(([k, c]) => [k, mix(c, DARK_PAPER, 0.5)]),
    ),
    warm: "#4a463e",
    strata: [PIG.ochre, PIG.cad, PIG.straw],
  },
};
export const palFor = (paper) => (paper === PAL.dark.paper ? PAL.dark : PAL.light);

// Each family, its form and the sports it holds today and later.
export const FAMILY = {
  strength: { family: "Load", form: "block", name: "Lifting" },
  run: { family: "On foot", form: "stride", name: "Running" },
  ride: { family: "On wheels", form: "wheel", name: "Cycling" },
  swim: { family: "In water", form: "wave", name: "Swimming" },
  mobility: { family: "Practice", form: "fan", name: "Mobility" },
  food: { family: "Food", form: "bowl", name: "Food" },
  play: { family: "Play", form: "triangle", name: "Play" },
};
const FORM_OF = Object.fromEntries(Object.entries(FAMILY).map(([k, v]) => [k, v.form]));
// A sport the app may add later: its family's form with one cut.
export const VARIANT = {
  walk: { base: "run", op: "open", name: "Walk" },
  hike: { base: "run", op: "peak", name: "Hike" },
  spin: { base: "ride", op: "hub", name: "Spin class" },
  row: { base: "swim", op: "oar", name: "Row" },
  paddle: { base: "swim", op: "single", name: "Paddle" },
  yoga: { base: "mobility", op: "arc", name: "Yoga" },
  climb: { base: "play", op: "steps", name: "Climbing" },
  racket: { base: "play", op: "ball", name: "Racket sports" },
};

let uid = 0;
const nextId = (p) => `${p}${++uid}`;
const f1 = (n) => +(+n).toFixed(1);
const FONT = "font-family:'Atkinson Hyperlegible Next',sans-serif";
export const SLANT = 0.34; // the stride leans forward by a third of its height

// Paper with a faint grain under every label, so labels stay crisp.
export function paperOpen(w, h, { paper = PIG.paper, label = null } = {}) {
  const P = palFor(paper),
    g = nextId("grain");
  const [r, gg, b] = P.grain.rgb.split(" ");
  return {
    open: `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} style="display:block;width:100%;height:auto">
<defs><filter id="${g}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ${r}  0 0 0 0 ${gg}  0 0 0 0 ${b}  0 0 0 1 0"/></filter></defs>
<rect width="${w}" height="${h}" fill="${paper}"/>`,
    grain: `<rect width="${w}" height="${h}" filter="url(#${g})" opacity="${P.grain.opacity}" pointer-events="none" style="mix-blend-mode:${P.grain.blend}"/>`,
    end: "</svg>",
  };
}

// ---------- one form in a box (x, y, w, h): the shape stands on the box's bottom edge ----------
// Used for marks (a square box) and inside prints (a box of whole modules).
export function form(
  sport,
  x,
  y,
  w,
  h,
  {
    state = "done",
    segments = 0,
    done = 0,
    indoor = false,
    paper = PIG.paper,
    col = null,
    tint = null,
    ink = null,
    fill = false,
  } = {},
) {
  const P = palFor(paper);
  const v = VARIANT[sport];
  const key = v ? v.base : sport;
  const shape = FORM_OF[key];
  const C = col || P.col[key],
    T = tint || P.tint[key],
    INK = ink || P.ink;
  const S = Math.min(w, h);
  const plat = indoor ? Math.max(2, S * 0.09) : 0;
  const base = y + h - (plat ? plat + Math.max(1.5, S * 0.06) : 0);
  const fillFor = (k) =>
    state === "skipped" ? "none" : state === "todo" ? T : segments ? (k < done ? C : T) : C;
  // a to-do part keeps a thin edge of its full pigment, so to do and done differ in more than lightness
  const isTodo = (k) => state === "todo" || (state !== "skipped" && segments && k >= done);
  const edge = (k) =>
    isTodo(k)
      ? ` stroke="${C}" stroke-width="${f1(Math.min(1.5, Math.max(1, S * 0.06)))}" stroke-linejoin="miter"`
      : "";
  const sw = f1(Math.max(1.5, S * 0.05));
  const dash =
    state === "skipped"
      ? ` stroke="${C}" stroke-width="${sw}" stroke-dasharray="${f1(S * 0.09)} ${f1(S * 0.07)}"`
      : "";
  const cut = paper; // a cut is the paper showing through
  const cutW = f1(Math.max(1.2, S * 0.045));
  let out = "";
  if (shape === "block") {
    // a block: square at mark size; in a box wider than tall it is a slab cut into its sets
    const hh = fill
        ? h - plat - (plat ? Math.max(1.5, S * 0.06) : 0)
        : Math.min(h - plat, w <= h ? w * 0.84 : h),
      top = base - hh,
      n = Math.max(1, segments || 1),
      gap = n > 1 ? Math.max(1.5, S * 0.06) : 0,
      uw = (w - gap * (n - 1)) / n;
    for (let k = 0; k < n; k++)
      out += isTodo(k)
        ? `<rect x="${f1(x + k * (uw + gap) + 0.6)}" y="${f1(top + 0.6)}" width="${f1(uw - 1.2)}" height="${f1(hh - 1.2)}" fill="${fillFor(k)}"${edge(k)}/>`
        : `<rect x="${f1(x + k * (uw + gap))}" y="${f1(top)}" width="${f1(uw)}" height="${f1(hh)}" fill="${fillFor(k)}"${dash}/>`;
  } else if (shape === "stride") {
    // a parallelogram leaning forward; segments are slanted bars (splits, intervals)
    const hh = fill
        ? h - plat - (plat ? Math.max(1.5, S * 0.06) : 0)
        : Math.min(h - plat, w <= h ? w * 0.84 : h),
      top = base - hh,
      o = hh * SLANT * (fill ? 1 : w <= h ? 1.2 : 1),
      n = Math.max(1, segments || 1),
      gap = n > 1 ? Math.max(1.5, S * 0.05) : 0,
      bw = (w - o - gap * (n - 1)) / n;
    for (let k = 0; k < n; k++) {
      const x0 = x + k * (bw + gap);
      if (v && v.op === "open") {
        // walk: the stride drawn open, lighter than a run
        const t = Math.max(1.5, hh * 0.22);
        out += `<path d="M${f1(x0 + o)} ${f1(top)}H${f1(x0 + o + bw)}L${f1(x0 + bw)} ${f1(base)}H${f1(x0)}Z M${f1(x0 + o + t * 1.2)} ${f1(top + t)}L${f1(x0 + t * 1.2 + t * SLANT)} ${f1(base - t)}H${f1(x0 + bw - t * 1.2)}L${f1(x0 + o + bw - t * 1.2 - t * SLANT)} ${f1(top + t)}Z" fill="${fillFor(k)}" fill-rule="evenodd"${dash}/>`;
      } else
        out += `<path d="M${f1(x0 + o)} ${f1(top)}H${f1(x0 + o + bw)}L${f1(x0 + bw)} ${f1(base)}H${f1(x0)}Z" fill="${fillFor(k)}"${isTodo(k) ? edge(k) : dash}/>`;
    }
    if (v && v.op === "peak") {
      // hike: a peak cut deep into the top edge
      const mx = x + o + (w - o) * 0.5,
        pw = (w - o) * 0.36;
      out += `<path d="M${f1(mx - pw / 2)} ${f1(top - 0.5)}L${f1(mx)} ${f1(top + hh * 0.42)}L${f1(mx + pw / 2)} ${f1(top - 0.5)}Z" fill="${cut}"/>`;
    }
  } else if (shape === "wheel") {
    // a ring, thick as a tyre; segments are arcs (intervals)
    const d = Math.min(w, h - plat),
      r = d / 2,
      cx = x + w / 2,
      cy = base - r,
      th = r * 0.56,
      rm = r - th / 2,
      n = Math.max(1, segments || 1);
    if (state === "skipped")
      out += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r - 0.75)}" fill="none" stroke="${C}" stroke-width="${sw}" stroke-dasharray="${f1(S * 0.09)} ${f1(S * 0.07)}"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r - th + 0.75)}" fill="none" stroke="${C}" stroke-width="${sw}" stroke-dasharray="${f1(S * 0.06)} ${f1(S * 0.06)}"/>`;
    else if (n === 1)
      out += isTodo(0)
        ? `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rm)}" fill="none" stroke="${C}" stroke-width="${f1(th)}"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rm)}" fill="none" stroke="${T}" stroke-width="${f1(Math.max(1, th - 2.6))}"/>`
        : `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rm)}" fill="none" stroke="${fillFor(0)}" stroke-width="${f1(th)}"/>`;
    else
      for (let k = 0; k < n; k++) {
        const a0 = -Math.PI / 2 + (k / n) * Math.PI * 2,
          a1 = -Math.PI / 2 + ((k + 1) / n) * Math.PI * 2;
        const pa = (a, rr) => `${f1(cx + rr * Math.cos(a))} ${f1(cy + rr * Math.sin(a))}`;
        out += `<path d="M${pa(a0, r)}A${f1(r)} ${f1(r)} 0 0 1 ${pa(a1, r)}L${pa(a1, r - th)}A${f1(r - th)} ${f1(r - th)} 0 0 0 ${pa(a0, r - th)}Z" fill="${fillFor(k)}" stroke="${isTodo(k) ? C : cut}" stroke-width="${isTodo(k) ? 1.2 : cutW}"/>`;
      }
    if (v && v.op === "hub")
      // spin: the wheel's spokes cut as a cross, a flywheel turning in place
      out += `<path d="M${f1(cx - r)} ${f1(cy)}H${f1(cx + r)}M${f1(cx)} ${f1(cy - r)}V${f1(cy + r)}" stroke="${cut}" stroke-width="${f1(Math.max(1.4, r * 0.16))}"/>`;
  } else if (shape === "wave") {
    // two crests of water; a paddle is one filled crest; a row is one crest crossed by an oar
    const ww = Math.min(w, h * 1.6),
      x0 = x + (w - ww) / 2,
      k = ww / 4,
      amp = Math.min(h, ww) * 0.2,
      stw = Math.max(1.6, Math.min(h, ww) * 0.14);
    const crest = (yy) =>
      `M${f1(x0 + stw / 2)} ${f1(yy)} q${f1((k - stw / 4) / 2)} ${f1(-amp)} ${f1(k - stw / 4)} 0 t${f1(k - stw / 4)} 0 t${f1(k - stw / 4)} 0 t${f1(k - stw / 4)} 0`;
    const wc = state === "todo" ? T : C,
      sk = state === "skipped" ? ` stroke-dasharray="${f1(S * 0.1)} ${f1(S * 0.08)}"` : "";
    const lo = base - stw * 0.6,
      hi = base - Math.min(h, ww) * 0.52;
    if (v && v.op === "single")
      out += `<path d="${crest(lo - amp * 0.4)}" fill="none" stroke="${wc}" stroke-width="${f1(stw * 1.35)}" stroke-linecap="round"${sk}/>`;
    else if (v && v.op === "oar")
      // row: the two crests, cut twice straight down, as oars cut the water
      out += `<path d="${crest(hi)} ${crest(lo)}" fill="none" stroke="${wc}" stroke-width="${f1(stw)}" stroke-linecap="round"${sk}/>${[0.36, 0.64].map((f) => `<path d="M${f1(x0 + ww * f)} ${f1(hi - amp - stw)}V${f1(lo + stw)}" stroke="${cut}" stroke-width="${f1(Math.max(1.6, stw * 0.55))}"/>`).join("")}`;
    else if (state === "todo")
      out += `<path d="${crest(hi)} ${crest(lo)}" fill="none" stroke="${C}" stroke-width="${f1(stw)}" stroke-linecap="round"/><path d="${crest(hi)} ${crest(lo)}" fill="none" stroke="${T}" stroke-width="${f1(Math.max(0.8, stw - 2.6))}" stroke-linecap="round"/>`;
    else
      out += `<path d="${crest(hi)} ${crest(lo)}" fill="none" stroke="${wc}" stroke-width="${f1(stw)}" stroke-linecap="round"${sk}/>`;
  } else if (shape === "fan") {
    const r = Math.min(w, h - plat),
      ox = x,
      oy = base,
      n = Math.max(1, segments || 1);
    for (let k = 0; k < n; k++) {
      const a0 = -Math.PI / 2 + (k / n) * (Math.PI / 2),
        a1 = -Math.PI / 2 + ((k + 1) / n) * (Math.PI / 2);
      out += `<path d="M${f1(ox)} ${f1(oy)}L${f1(ox + r * Math.cos(a0))} ${f1(oy + r * Math.sin(a0))}A${f1(r)} ${f1(r)} 0 0 1 ${f1(ox + r * Math.cos(a1))} ${f1(oy + r * Math.sin(a1))}Z" fill="${fillFor(k)}"${isTodo(k) ? edge(k) : n > 1 ? ` stroke="${cut}" stroke-width="${cutW}"` : dash}/>`;
    }
    if (v && v.op === "arc") {
      const ar = r * 0.62;
      out += `<path d="M${f1(ox)} ${f1(oy - ar)}A${f1(ar)} ${f1(ar)} 0 0 1 ${f1(ox + ar)} ${f1(oy)}" fill="none" stroke="${cut}" stroke-width="${f1(Math.max(1.6, S * 0.08))}"/>`;
    }
  } else if (shape === "bowl") {
    const r = Math.min(w / 2, h - plat),
      cx = x + w / 2,
      top = base - r;
    out += `<path d="M${f1(cx - r)} ${f1(top)}h${f1(2 * r)}a${f1(r)} ${f1(r)} 0 0 1 ${f1(-2 * r)} 0z" fill="${fillFor(0)}"${isTodo(0) ? ` stroke="${INK}" stroke-width="1.2"` : dash}/>`;
  } else if (shape === "triangle") {
    const tw = Math.min(w, (h - plat) * 1.1),
      x0 = x + (w - tw) / 2,
      th = Math.min(h - plat, tw * 0.9);
    if (v && v.op === "steps") {
      const st = 4,
        sw2 = tw / st;
      let d = `M${f1(x0)} ${f1(base)}`;
      for (let k = 0; k < st; k++)
        d += `V${f1(base - ((k + 1) * th) / st)}H${f1(x0 + (k + 1) * sw2)}`;
      out += `<path d="${d}V${f1(base)}Z" fill="${fillFor(0)}"/>`;
    } else {
      out += `<path d="M${f1(x0)} ${f1(base)}L${f1(x0 + tw / 2)} ${f1(base - th)}L${f1(x0 + tw)} ${f1(base)}Z" fill="${fillFor(0)}"${isTodo(0) ? edge(0) : dash}/>`;
      if (v && v.op === "ball")
        // racket sports: a ball punched out of the triangle
        out += `<circle cx="${f1(x0 + tw / 2)}" cy="${f1(base - th * 0.36)}" r="${f1(tw * 0.13)}" fill="${cut}"/>`;
    }
  }
  if (plat)
    out += `<rect x="${f1(x - S * 0.04)}" y="${f1(y + h - plat)}" width="${f1(w + S * 0.08)}" height="${f1(plat)}" fill="${INK}"/>`;
  return out;
}
// A mark in a square: the small form beside a name (lists, legends, the alphabet).
export function formMark(sport, x, y, size, opts = {}) {
  return form(sport, x, y, size, size, opts);
}
export function markIcon(sport, size = 22, opts = {}) {
  const pad = Math.max(1, Math.round(size * 0.06));
  return `<svg width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${size + 2 * pad} ${size + 2 * pad}" aria-hidden="true" style="display:block;flex-shrink:0;overflow:visible">${formMark(sport, 0, 0, size, opts)}</svg>`;
}

// ---------- the module grid ----------
// A strength part is its exercises as columns, each a stack of its sets (done from the bottom up).
// A superset is two columns drawn closer, under one beam. Endurance and practice parts stand beside
// them as whole-module forms. Returns the layout in modules, then draws it at the module that fits.
function columnsOf(part) {
  // part.columns: [{ n, done, warm?, skipped?, pair? }] where pair marks the first of a superset pair
  return part.columns;
}
function formModules(p, cap) {
  // width in modules of a non-strength form whose height is `hm` modules (≤ cap)
  const minutes = p.minutes || 0;
  const hm = Math.max(1, Math.min(cap, p.modules || cap));
  // a run's body grows with its time, a module for every 15 minutes (1 to 3), plus its lean
  if (p.kind === "run")
    return { hm, wm: hm * SLANT + Math.min(3, Math.max(1.4, (minutes || 30) / 15)) };
  if (p.kind === "ride" || p.kind === "spin") return { hm, wm: hm };
  if (p.kind === "swim") return { hm, wm: hm * 1.5 };
  if (p.kind === "mobility") return { hm, wm: hm };
  return { hm, wm: hm };
}
export function dayPrint({
  w = 362,
  h = 200,
  parts,
  paper = PIG.paper,
  ariaLabel = null,
  labels = false,
  maxModule = 44,
  align = "start",
} = {}) {
  const P = palFor(paper),
    PO = paperOpen(w, h, { paper, label: ariaLabel });
  const pad = Math.max(16, Math.round(Math.min(w, 400) * 0.055));
  const groundH = 3,
    ground = h - Math.max(18, Math.round(h * 0.11)),
    labelBand = labels ? 26 : 0,
    top = Math.max(16, Math.round(h * 0.1)) + labelBand;
  const str = parts.find((p) => p.kind === "strength");
  const others = parts.filter((p) => p.kind !== "strength");
  const cols = str ? columnsOf(str) : [];
  const cap = Math.max(2, str ? Math.max(...cols.map((c) => c.n)) : 3);
  // gaps in modules
  const g = 0.14,
    pairG = 0.14,
    colG = 0.34,
    partG = 1;
  let strWm = 0;
  cols.forEach((c, i) => {
    strWm += 1;
    if (i < cols.length - 1) strWm += c.pair ? pairG : colG;
  });
  const fm = others.map((p) => formModules(p, cap));
  const totalWm =
    strWm +
    fm.reduce((a, q) => a + q.wm, 0) +
    partG * Math.max(0, others.length + (str ? 1 : 0) - 1);
  const capHm = cap + (cap - 1) * g;
  const u = Math.min(maxModule, (w - 2 * pad) / totalWm, (ground - 4 - top) / capHm);
  const usedW = totalWm * u;
  let x = align === "center" ? (w - usedW) / 2 : pad;
  const spare = Math.max(0, w - 2 * pad - usedW);
  let art = "",
    labs = "";
  const labelY = top - 10;
  const lab = (lx, name, fig) =>
    `<text x="${f1(lx)}" y="${f1(labelY)}" style="${FONT};font-size:12px;font-weight:700;fill:${P.ink}">${name}${fig ? ` <tspan style="font-weight:500;fill:${P.label}">${fig}</tspan>` : ""}</text>`;
  if (str) {
    const sx = x;
    cols.forEach((c, i) => {
      for (let k = 0; k < c.n; k++) {
        const yy = ground - (k + 1) * u - k * g * u;
        // warm-up sets are the foot of a column: done in grey, to do as a grey outline
        const isWarm = typeof c.warm === "number" ? k < c.warm : !!c.warm;
        const state = c.skipped ? "skipped" : k < c.done ? "done" : "todo";
        const ew = f1(Math.max(1.2, Math.min(1.8, u * 0.07)));
        art += c.skipped
          ? `<rect x="${f1(x + 0.9)}" y="${f1(yy + 0.9)}" width="${f1(u - 1.8)}" height="${f1(u - 1.8)}" fill="none" stroke="${P.col.strength}" stroke-width="1.8" stroke-dasharray="${f1(u * 0.16)} ${f1(u * 0.12)}"/>`
          : isWarm
            ? state === "done"
              ? `<rect x="${f1(x)}" y="${f1(yy)}" width="${f1(u)}" height="${f1(u)}" fill="${P.warm}"/>`
              : `<rect x="${f1(x + 0.75)}" y="${f1(yy + 0.75)}" width="${f1(u - 1.5)}" height="${f1(u - 1.5)}" fill="none" stroke="${P.label}" stroke-width="${ew}"/>`
            : state === "done"
              ? `<rect x="${f1(x)}" y="${f1(yy)}" width="${f1(u)}" height="${f1(u)}" fill="${P.col.strength}"/>`
              : `<rect x="${f1(x + 0.6)}" y="${f1(yy + 0.6)}" width="${f1(u - 1.2)}" height="${f1(u - 1.2)}" fill="${P.tint.strength}" stroke="${P.col.strength}" stroke-width="${ew}"/>`;
      }
      // a superset's two columns stand closer than any others; the lists bracket them in words' place
      x += u;
      if (i < cols.length - 1) x += (c.pair ? pairG : colG) * u;
    });
    if (labels) labs += lab(sx, str.name, str.figure);
    x += partG * u;
    if (align === "ends" && others.length === 1) x += spare;
  }
  others.forEach((p, i) => {
    const { hm, wm } = fm[i];
    const fw = wm * u,
      fh = hm * u + (hm - 1) * g * u;
    art += form(p.kind, x, ground - fh, fw, fh, {
      state: p.state || (p.done ? "done" : "todo"),
      indoor: p.indoor,
      segments: p.segments || 0,
      done: p.segDone || 0,
      paper,
      fill: true,
    });
    if (labels) labs += lab(x, p.name, p.figure);
    x += fw + partG * u;
    if (align === "ends" && i === others.length - 2) x += spare;
  });
  return `${PO.open}${art}<rect x="${f1(pad - 6)}" y="${f1(ground)}" width="${f1(w - 2 * pad + 12)}" height="${groundH}" fill="${P.ink}"/>${PO.grain}${labs}${PO.end}`;
}

// ---------- the calendar: a month of days, every activity of a day in its cell ----------
// days: { dom: [{ sport, indoor? }] }. A cell stacks its marks on its own baseline, two to a row
// and up to `fit`; past that it shows +N. Today is ringed in ink; days after today stay blank.
// With `weeks`, an eighth column gives each week's sessions, this week's marked "so far".
export function monthPrint({
  w = 362,
  year,
  month, // 0-based
  days,
  today = null,
  paper = PIG.paper,
  cellH = 52,
  mark = 13,
  weekdays = true,
  ariaLabel = null,
  fit = 4,
  perRow = 2,
  weeks = false,
  numSize = 12,
} = {}) {
  const P = palFor(paper);
  const first = new Date(Date.UTC(year, month, 1));
  const nDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const rows = Math.ceil((lead + nDays) / 7);
  const pad = 8,
    head = weekdays ? 24 : 6;
  const h = head + rows * cellH + pad;
  const weekW = weeks ? 34 : 0;
  const cw = (w - 2 * pad - weekW) / 7;
  const PO = paperOpen(w, h, { paper, label: ariaLabel });
  let out = "";
  const T = (x, y, t, { a = "start", wt = 700, fill = P.label, size = 12 } = {}) =>
    `<text x="${f1(x)}" y="${f1(y)}" text-anchor="${a}" style="${FONT};font-size:${size}px;font-weight:${wt};fill:${fill};font-variant-numeric:tabular-nums">${t}</text>`;
  if (weekdays) {
    ["M", "T", "W", "T", "F", "S", "S"].forEach((d, i) => (out += T(pad + i * cw + 6, 16, d)));
    if (weeks) out += T(w - pad, 16, "Week", { a: "end" });
  }
  const weekCount = Array(rows).fill(0);
  for (let dom = 1; dom <= nDays; dom++) {
    const i = lead + dom - 1,
      r = Math.floor(i / 7),
      c = i % 7;
    const x = pad + c * cw,
      y = head + r * cellH;
    const sessions = days[dom] || [];
    const future = today !== null && dom > today;
    const isToday = dom === today;
    weekCount[r] += future ? 0 : sessions.length;
    out += T(x + 6, y + 14, dom, {
      wt: isToday ? 800 : 600,
      fill: future ? P.dot : isToday ? P.ink : P.label,
      size: numSize,
    });
    if (isToday)
      out += `<rect x="${f1(x + 1.5)}" y="${f1(y + 1.5)}" width="${f1(cw - 3)}" height="${f1(cellH - 3)}" fill="none" stroke="${P.ink}" stroke-width="1.5"/>`;
    const baseY = y + cellH - 7;
    if (!sessions.length) {
      if (!future)
        out += `<circle cx="${f1(x + 9)}" cy="${f1(baseY - 2)}" r="1.4" fill="${P.dot}"/>`;
      continue;
    }
    const shown = sessions.length > fit ? sessions.slice(0, fit - 1) : sessions;
    const more = sessions.length - shown.length;
    const gap = Math.max(3, Math.round(mark * 0.28));
    const slots = [...shown.map((ss) => ({ ss })), ...(more ? [{ more }] : [])];
    slots.forEach((sl, k) => {
      const col = k % perRow,
        row = Math.floor(k / perRow);
      const mx = x + 6 + col * (mark * 1.3 + gap),
        my = baseY - (row + 1) * mark - row * gap;
      if (sl.more) out += T(mx, my + mark - 2, `+${sl.more}`, { fill: P.ink, size: 12 });
      else {
        const mw = sl.ss.sport === "run" ? mark * 1.3 : mark;
        out += form(sl.ss.sport, mx, my, mw, mark, {
          indoor: sl.ss.indoor,
          paper,
          state: sl.ss.state || "done",
          fill: true,
        });
      }
    });
  }
  if (weeks)
    weekCount.forEach((n, r) => {
      const y = head + r * cellH;
      const current = today !== null && r === Math.floor((lead + today - 1) / 7);
      out += T(w - pad, y + cellH / 2 + 5, n || "–", { a: "end", fill: P.ink, size: 15, wt: 600 });
      if (current) out += T(w - pad, y + cellH / 2 + 19, "so far", { a: "end", size: 12, wt: 600 });
    });
  return `${PO.open}${out}${PO.grain}${PO.end}`;
}

// ---------- the bowl: the day's food, filled meal by meal; past the target it heaps ----------
// The bowl is a half disc whose area is the day's target. Inside it, each meal is a layer whose
// area is its calories. Past the target, food heaps over the rim: a lens that always spans the
// whole rim and rises as the excess grows, so bowl and heap stay one symmetric figure; at twice
// the target the heap is the bowl's mirror and the figure closes into a circle.
function segArea(r, hh) {
  const d = r - hh;
  return (
    r * r * Math.acos(Math.max(-1, Math.min(1, d / r))) -
    d * Math.sqrt(Math.max(0, 2 * r * hh - hh * hh))
  );
}
const solve = (fn, want, lo, hi) => {
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (fn(m) < want) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};
// height of a fill of `frac` of the half disc, from its round edge up
export const levelFor = (frac, r) =>
  solve((m) => segArea(r, m), (frac * Math.PI * r * r) / 2, 0, r);
// the heap: a circular segment on the rim's chord (half-width r) with height t
const lensR = (r, t) => (r * r + t * t) / (2 * t);
const lensArea = (r, t) => (t <= 0 ? 0 : segArea(lensR(r, t), t));
// area of the heap between the rim and height s (s ≤ t)
const lensBelow = (r, t, s) => {
  if (s <= 0) return 0;
  if (s >= t) return lensArea(r, t);
  const R = lensR(r, t);
  return lensArea(r, t) - segArea(R, t - s);
};
export function bowlFigure({ r, cx, rim, meals, target, paper = PIG.paper, ink = null, rimW = 3 }) {
  const P = palFor(paper);
  const INK = ink || P.ink;
  const half = (Math.PI * r * r) / 2;
  const total = meals.reduce((a, [, k]) => a + k, 0);
  const ex = Math.min(1, Math.max(0, total - target) / target);
  const t = ex > 0 ? solve((m) => lensArea(r, m), ex * half, 0.0001, r) : 0;
  const cols = P.strata;
  const yIn = (kcal) => rim + r - levelFor(Math.min(1, kcal / target), r);
  const yOver = (kcal) => {
    const e = Math.min(ex, Math.max(0, kcal - target) / target) * half;
    return rim - (e <= 0 ? 0 : solve((s) => lensBelow(r, t, s), e, 0, t));
  };
  const clipB = nextId("bowl"),
    clipH = nextId("heap");
  let acc = 0,
    strata = "",
    heap = "";
  meals.forEach(([, kcal, pending], i) => {
    const a = acc,
      b = acc + kcal;
    if (a < target) {
      const y0 = yIn(a);
      let y1 = yIn(Math.min(b, target));
      if (y0 - y1 < 3 && b <= target) y1 = y0 - 3; // a sliver still shows
      // a layer not yet logged is thinned, with its top edge in full: the alphabet's "to do"
      strata += pending
        ? `<rect x="${f1(cx - r)}" y="${f1(y1)}" width="${f1(2 * r)}" height="${f1(y0 - y1 + 0.5)}" fill="${cols[i % 3]}" fill-opacity="0.32"/><rect x="${f1(cx - r)}" y="${f1(y1)}" width="${f1(2 * r)}" height="2.5" fill="${cols[i % 3]}"/>`
        : `<rect x="${f1(cx - r)}" y="${f1(y1)}" width="${f1(2 * r)}" height="${f1(y0 - y1 + 0.5)}" fill="${cols[i % 3]}"/>`;
      if (i)
        strata += `<rect x="${f1(cx - r)}" y="${f1(y0 - 0.75)}" width="${f1(2 * r)}" height="1.5" fill="${paper}"/>`;
    }
    if (b > target) {
      const y0 = a > target ? yOver(a) : rim,
        y1 = yOver(b);
      heap += `<rect x="${f1(cx - r)}" y="${f1(y1 - 0.5)}" width="${f1(2 * r)}" height="${f1(y0 - y1 + 0.5)}" fill="${cols[i % 3]}"/>`;
      if (a > target)
        heap += `<rect x="${f1(cx - r)}" y="${f1(y0 - 0.75)}" width="${f1(2 * r)}" height="1.5" fill="${paper}"/>`;
    }
    acc = b;
  });
  const R = t ? lensR(r, t) : 0;
  return {
    svg: `<defs><clipPath id="${clipB}"><path d="M${f1(cx - r)} ${f1(rim)}A${f1(r)} ${f1(r)} 0 0 0 ${f1(cx + r)} ${f1(rim)}Z"/></clipPath>${t ? `<clipPath id="${clipH}"><path d="M${f1(cx - r)} ${f1(rim)}A${f1(R)} ${f1(R)} 0 0 1 ${f1(cx + r)} ${f1(rim)}Z"/></clipPath>` : ""}</defs>
<g clip-path="url(#${clipB})">${strata}</g>${t ? `<g clip-path="url(#${clipH})">${heap}</g>` : ""}
<path d="M${f1(cx - r)} ${f1(rim)}A${f1(r)} ${f1(r)} 0 0 0 ${f1(cx + r)} ${f1(rim)}" fill="none" stroke="${INK}" stroke-width="${rimW}"/>
<path d="M${f1(cx - r - rimW * 3)} ${f1(rim)}H${f1(cx + r + rimW * 3)}" stroke="${INK}" stroke-width="${rimW}"/>`,
    over: total > target,
    heapTop: rim - t,
  };
}
// The day's print on Food: the bowl alone, centred on its paper. The figure that matters (left,
// over or met) is the screen's, above the print: a print carries no words. Above the rim the
// paper keeps air, or the heap's height when that is more, so the bowl stays as large as it can.
export function bowlPrint({
  w = 362,
  meals,
  target,
  paper = PIG.paper,
  ariaLabel = "",
  maxR = 100,
} = {}) {
  const rimW = 3,
    pad = 18;
  const r = Math.round(Math.min(maxR, (w - 2 * pad) / 2 - rimW * 3));
  const total = meals.reduce((a, [, k]) => a + k, 0);
  const ex = Math.min(1, Math.max(0, total - target) / target);
  const heap = ex > 0 ? solve((m) => lensArea(r, m), (ex * Math.PI * r * r) / 2, 0.0001, r) : 0;
  const rim = pad + Math.max(Math.round(r * 0.3), Math.ceil(heap) + 12);
  const h = rim + r + rimW + pad;
  const PO = paperOpen(w, h, { paper, label: ariaLabel });
  const fig = bowlFigure({ r, cx: Math.round(w / 2), rim, meals, target, paper, rimW });
  return `${PO.open}${fig.svg}${PO.grain}${PO.end}`;
}

// ---------- the mark: a slab and a disc on the ground ----------
// The brand keeps the first alphabet's disc: it is the name's mark, not a print.
export function markSvg(size = 64, { ink = PIG.ink, bg = null } = {}) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" style="display:block">${bg ? `<rect width="64" height="64" fill="${bg}"/>` : ""}<rect x="7" y="36" width="25" height="12" fill="${PIG.ultra}"/><circle cx="46" cy="35" r="13" fill="${PIG.verm}"/><rect x="5" y="51" width="54" height="4" fill="${ink}"/></svg>`;
}
