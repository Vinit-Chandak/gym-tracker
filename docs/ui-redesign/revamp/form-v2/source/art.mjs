// Prints: the artwork in FORM, drawn from the account's own records and nothing else.
//
// The grammar is generative, so it grows with the app:
//   FAMILY  — how the body moves — gives the primitive and the pigment:
//             load = slab (ultramarine) · on foot = disc (vermilion) · on wheels = dome (violet)
//             in water = wave (viridian) · practice = quarter disc (rose) · food = bowl (cadmium)
//             (play, for court, wall and field sports later, is reserved: umber triangles)
//   SPORT   — one change to its family's primitive, cut into or added to the shape itself (walk =
//             ring, hike = notched disc, spin = dome with its hub cut out, yoga = quarter with an
//             arc …). A variant never touches the ground: that belongs to context.
//   CONTEXT — modifiers that mean the same on every form:
//             a platform under it = indoors, on a machine or in a pool
//             segments = its structure: sets, intervals, laps, drills
//             size = how long or how far
//   STATE   — thinned pigment = still to do · full ink = done · dashed edge = skipped
// Shapes never overlap: every mark stays readable, down to 12 px.

export const PIG = {
  paper: "#f2eee5",
  paperDim: "#d6d0c4",
  dot: "#cfc9bc",
  ink: "#16171b",
  label: "#615c50",
  labelDim: "#57524a",
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
    strata: [PIG.ochre, PIG.cad, PIG.straw],
  },
};
export const palFor = (paper) => (paper === PAL.dark.paper ? PAL.dark : PAL.light);
export const labelFor = (paper) => palFor(paper).label;

// Each sport the app records today, and how it is drawn.
export const FAMILY = {
  strength: { family: "Load", form: "slab", col: PIG.ultra, tint: PIG.ultraT },
  run: { family: "On foot", form: "disc", col: PIG.verm, tint: PIG.vermT },
  ride: { family: "On wheels", form: "dome", col: PIG.violet, tint: PIG.violetT },
  swim: { family: "In water", form: "wave", col: PIG.viri, tint: PIG.viriT },
  mobility: { family: "Practice", form: "quarter", col: PIG.rose, tint: PIG.roseT },
  food: { family: "Food", form: "bowl", col: PIG.cad, tint: PIG.cadT },
};
const FORM_OF = {
  strength: "slab",
  run: "disc",
  ride: "dome",
  swim: "wave",
  mobility: "quarter",
  food: "bowl",
  play: "triangle",
};

let uid = 0;
const nextId = (p) => `${p}${++uid}`;
const f1 = (n) => +n.toFixed(1);
const FONT = "font-family:'Atkinson Hyperlegible Next',sans-serif";
const textW = (s, size = 12) => [...String(s)].length * size * 0.58; // Atkinson 700, near enough to keep labels apart

// Paper with a faint grain under every label, so labels stay crisp.
export function paperOpen(w, h, { paper = PIG.paper, label = null } = {}) {
  const P = palFor(paper),
    g = nextId("grain");
  return {
    open: `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} style="display:block;width:100%;height:auto">
<defs><filter id="${g}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ${P.grain.rgb.split(" ")[0]}  0 0 0 0 ${P.grain.rgb.split(" ")[1]}  0 0 0 0 ${P.grain.rgb.split(" ")[2]}  0 0 0 1 0"/></filter></defs>
<rect width="${w}" height="${h}" fill="${paper}"/>`,
    grain: `<rect width="${w}" height="${h}" filter="url(#${g})" opacity="${P.grain.opacity}" pointer-events="none" style="mix-blend-mode:${P.grain.blend}"/>`,
    end: "</svg>",
  };
}
const label = (P, x, y, a, b, { anchor = "start", size = 12 } = {}) =>
  `<text x="${f1(x)}" y="${f1(y)}" text-anchor="${anchor}" style="${FONT};font-size:${size}px;font-weight:700;fill:${P.ink}">${a}${b ? ` <tspan style="font-weight:500;fill:${P.label}">${b}</tspan>` : ""}</text>`;

// ---------- one form, any size, any state ----------
// sport: a key of FAMILY or a variant below. (x, y, size): the square it is drawn in.
const VARIANT = {
  walk: { base: "run", op: "ring" },
  hike: { base: "run", op: "notch" },
  row: { base: "swim", op: "oar" },
  paddle: { base: "swim", op: "single" },
  yoga: { base: "mobility", op: "arc" },
  spin: { base: "ride", op: "hub" },
  climb: { base: "play", op: "steps" },
  racket: { base: "play", op: "ball" },
};
export function formMark(
  sport,
  x,
  y,
  size,
  {
    state = "done",
    segments = 0,
    done = 0,
    indoor = false,
    paper = PIG.paper,
    col = null,
    tint = null,
    ink = null,
  } = {},
) {
  const P = palFor(paper);
  const v = VARIANT[sport];
  const key = v ? v.base : sport;
  const form = FORM_OF[key];
  const C = col || P.col[key],
    T = tint || P.tint[key],
    INK = ink || P.ink;
  const plat = indoor ? Math.max(2, size * 0.09) : 0;
  const S = size,
    cx = x + S / 2,
    base = y + S - plat - (plat ? Math.max(1.5, S * 0.05) : 0);
  const fillFor = (k) =>
    state === "skipped" ? "none" : state === "todo" ? T : segments ? (k < done ? C : T) : C;
  const dash =
    state === "skipped"
      ? ` stroke="${C}" stroke-width="${f1(Math.max(1.5, S * 0.05))}" stroke-dasharray="${f1(S * 0.09)} ${f1(S * 0.07)}"`
      : "";
  const cut = paper; // a cut-out is the paper showing through
  let out = "";
  if (form === "slab") {
    const h = S * (segments > 1 ? 0.5 : 0.66),
      top = base - h,
      n = Math.max(1, segments || 1),
      gap = n > 1 ? Math.max(1.5, S * 0.05) : 0,
      uw = (S - gap * (n - 1)) / n;
    for (let k = 0; k < n; k++)
      out += `<rect x="${f1(x + k * (uw + gap))}" y="${f1(top)}" width="${f1(uw)}" height="${f1(h)}" fill="${fillFor(k)}"${dash}/>`;
  } else if (form === "disc") {
    const r = S * 0.46,
      cy = base - r;
    if (v && v.op === "ring")
      out += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r * 0.78)}" fill="none" stroke="${state === "todo" ? T : C}" stroke-width="${f1(r * 0.44)}"/>`;
    else if (segments > 1) {
      for (let k = 0; k < segments; k++) {
        const a0 = -Math.PI / 2 + (k / segments) * Math.PI * 2,
          a1 = -Math.PI / 2 + ((k + 1) / segments) * Math.PI * 2;
        out += `<path d="M${f1(cx)} ${f1(cy)}L${f1(cx + r * Math.cos(a0))} ${f1(cy + r * Math.sin(a0))}A${f1(r)} ${f1(r)} 0 0 1 ${f1(cx + r * Math.cos(a1))} ${f1(cy + r * Math.sin(a1))}Z" fill="${fillFor(k)}" stroke="${cut}" stroke-width="${f1(Math.max(1.2, S * 0.035))}"/>`;
      }
    } else
      out += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="${fillFor(0)}"${dash}/>`;
    // a hike: a peak cut deep into the top, a quarter of the disc high, so it still reads at 12 px
    if (v && v.op === "notch")
      out += `<path d="M${f1(cx - r * 0.55)} ${f1(cy - r * 1.05)}L${f1(cx)} ${f1(cy - r * 0.42)}L${f1(cx + r * 0.55)} ${f1(cy - r * 1.05)}Z" fill="${cut}"/>`;
  } else if (form === "dome") {
    const r = S * 0.5;
    out += `<path d="M${f1(cx - r)} ${f1(base)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(cx + r)} ${f1(base)}Z" fill="${fillFor(0)}"${dash}/>`;
    // spin: the flywheel's hub cut out of the dome, so a class bike is never just "a ride indoors"
    if (v && v.op === "hub") {
      const hr = r * 0.36;
      out += `<path d="M${f1(cx - hr)} ${f1(base)}A${f1(hr)} ${f1(hr)} 0 0 1 ${f1(cx + hr)} ${f1(base)}Z" fill="${cut}"/>`;
    }
  } else if (form === "wave") {
    // two crests of water; a paddle is one filled crest; a row is one stroked crest crossed by an oar
    const a = S * 0.46,
      k = (2 * a) / 4,
      amp = S * 0.18,
      sw = Math.max(1.6, S * 0.13);
    const crest = (yy) =>
      `M${f1(cx - a)} ${f1(yy)} q${f1(k / 2)} ${f1(-amp)} ${f1(k)} 0 t${f1(k)} 0 t${f1(k)} 0 t${f1(k)} 0`;
    const wc = state === "todo" ? T : C,
      sk = state === "skipped" ? ` stroke-dasharray="${f1(S * 0.1)} ${f1(S * 0.08)}"` : "";
    if (v && v.op === "single")
      out += `<path d="${crest(base - S * 0.3)} V${f1(base)} H${f1(cx - a)}Z" fill="${wc}"/>`;
    else if (v && v.op === "oar")
      out += `<path d="${crest(base - S * 0.24)}" fill="none" stroke="${wc}" stroke-width="${f1(sw)}" stroke-linecap="round"${sk}/><path d="M${f1(cx - a * 0.9)} ${f1(base - S * 0.86)}L${f1(cx + a * 0.9)} ${f1(base - S * 0.02)}" stroke="${INK}" stroke-width="${f1(Math.max(1.8, S * 0.085))}" stroke-linecap="round"/>`;
    else
      out += `<path d="${crest(base - S * 0.5)} ${crest(base - S * 0.16)}" fill="none" stroke="${wc}" stroke-width="${f1(sw)}" stroke-linecap="round"${sk}/>`;
  } else if (form === "quarter") {
    const r = S,
      ox = x,
      oy = base,
      n = Math.max(1, segments || 1);
    for (let k = 0; k < n; k++) {
      const a0 = -Math.PI / 2 + (k / n) * (Math.PI / 2),
        a1 = -Math.PI / 2 + ((k + 1) / n) * (Math.PI / 2);
      out += `<path d="M${f1(ox)} ${f1(oy)}L${f1(ox + r * Math.cos(a0))} ${f1(oy + r * Math.sin(a0))}A${f1(r)} ${f1(r)} 0 0 1 ${f1(ox + r * Math.cos(a1))} ${f1(oy + r * Math.sin(a1))}Z" fill="${fillFor(k)}"${n > 1 ? ` stroke="${cut}" stroke-width="${f1(Math.max(1.2, S * 0.035))}"` : dash}/>`;
    }
    // yoga: an arc drawn into the quarter, like a held line
    if (v && v.op === "arc") {
      const ar = r * 0.62;
      out += `<path d="M${f1(ox)} ${f1(oy - ar)}A${f1(ar)} ${f1(ar)} 0 0 1 ${f1(ox + ar)} ${f1(oy)}" fill="none" stroke="${cut}" stroke-width="${f1(Math.max(1.6, S * 0.08))}"/>`;
    }
  } else if (form === "bowl") {
    const r = S / 2,
      top = base - r;
    out += `<path d="M${f1(cx - r)} ${f1(top)}h${f1(2 * r)}a${f1(r)} ${f1(r)} 0 0 1 ${f1(-2 * r)} 0z" fill="${fillFor(0)}"/>`;
  } else if (form === "triangle") {
    if (v && v.op === "steps") {
      const st = 4,
        sw = S / st;
      let d = `M${f1(x)} ${f1(base)}`;
      for (let k = 0; k < st; k++)
        d += `V${f1(base - ((k + 1) * (S * 0.9)) / st)}H${f1(x + (k + 1) * sw)}`;
      out += `<path d="${d}V${f1(base)}Z" fill="${fillFor(0)}"/>`;
    } else {
      out += `<path d="M${f1(x)} ${f1(base)}L${f1(cx)} ${f1(base - S * 0.9)}L${f1(x + S)} ${f1(base)}Z" fill="${fillFor(0)}"/>`;
      // the ball is the family's own pigment: colour always means the family
      if (v && v.op === "ball")
        out += `<circle cx="${f1(x + S * 0.86)}" cy="${f1(base - S * 0.8)}" r="${f1(S * 0.13)}" fill="${fillFor(0)}"/>`;
    }
  }
  if (plat)
    out += `<rect x="${f1(x - S * 0.04)}" y="${f1(y + S - plat)}" width="${f1(S * 1.08)}" height="${f1(plat)}" fill="${INK}"/>`;
  return out;
}
// A mark as a standalone inline SVG (lists, legends, the alphabet).
export function markIcon(sport, size = 22, opts = {}) {
  const pad = Math.max(1, Math.round(size * 0.06));
  return `<svg width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${size + 2 * pad} ${size + 2 * pad}" aria-hidden="true" style="display:block;flex-shrink:0;overflow:visible">${formMark(sport, 0, 0, size, opts)}</svg>`;
}

// ---------- the day ----------
// parts: { kind: 'strength', name, rows: [[{ n, done }], [{ n, done }, { n, done }] …], count } — a row
// with two slabs is a superset — and endurance or practice parts { kind: 'run' | 'ride' | 'swim' |
// 'mobility', name, figure, minutes, done, indoor, segments, segDone }.
// The forms stand to the right of the slabs, each in its own slot of at least 40 px. A day with more
// forms than fit shows what fits and "+N". Labels sit over their forms while they fit; otherwise the
// forms share one label line, and nothing is ever drawn over anything else.
export function dayPrint({ w = 362, h = 220, parts, paper = PIG.paper, ariaLabel = null } = {}) {
  const P = palFor(paper),
    PO = paperOpen(w, h, { paper, label: ariaLabel });
  // A short print (under 150 px) keeps a tighter label band, so its shapes still have height.
  const small = h < 150,
    pad = Math.max(18, Math.round(w * 0.06)),
    ground = h - 26,
    top = small ? 18 : 30;
  const headroom = small ? 22 : top + 24,
    gapY = small ? 8 : 10;
  const str = parts.find((p) => p.kind === "strength");
  const forms = parts.filter((p) => p.kind !== "strength");
  let art = "",
    labs = "";
  const gapX = 22;
  let slabRight = pad,
    strLabel = null;
  if (str) {
    const rows = str.rows;
    const segsIn = (row) => row.reduce((a, x) => a + x.n, 0);
    const maxSegs = Math.max(...rows.map(segsIn));
    const share = forms.length > 2 ? 0.48 : 0.6;
    const areaW = forms.length ? Math.round((w - 2 * pad - gapX) * share) : w - 2 * pad;
    const segGap = 4,
      pairGap = 12,
      rowGap = small ? 4 : rows.length > 5 ? 5 : 8;
    const pairs = Math.max(...rows.map((r) => r.length - 1));
    const unit = Math.min(52, (areaW - pairGap * pairs - segGap * (maxSegs - 1 - pairs)) / maxSegs);
    const sh = Math.max(
      small ? 5 : 7,
      Math.min(h > 250 ? 38 : 30, (ground - top - 22 - rowGap * (rows.length - 1)) / rows.length),
    );
    let y = ground - 6 - rows.length * sh - (rows.length - 1) * rowGap;
    const stackTop = y;
    for (const row of rows) {
      let x = pad;
      row.forEach((ex, j) => {
        if (j) x += pairGap - segGap;
        for (let k = 0; k < ex.n; k++) {
          art += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(unit)}" height="${f1(sh)}" fill="${k < ex.done ? P.col.strength : P.tint.strength}"/>`;
          x += unit + segGap;
        }
      });
      slabRight = Math.max(slabRight, x - segGap);
      y += sh + rowGap;
    }
    const total = rows.flat().reduce((a, x) => a + x.n, 0),
      doneSets = rows.flat().reduce((a, x) => a + x.done, 0);
    const fig =
      str.count === false ? null : doneSets ? `${doneSets} of ${total} sets` : `${total} sets`;
    strLabel = {
      x: pad,
      y: stackTop - gapY,
      right: pad + textW(str.name) + (fig ? textW(" " + fig) : 0),
    };
    labs += label(P, pad, stackTop - gapY, str.name, fig);
  }
  if (forms.length) {
    const x0 = str ? slabRight + gapX : pad,
      areaW = w - pad - x0,
      n = forms.length,
      gap = 14,
      MIN = 40;
    const fitN = Math.max(1, Math.floor((areaW + gap) / (MIN + gap)));
    const shown = n > fitN ? Math.max(1, fitN - 1) : n,
      more = n - shown,
      slots = shown + (more ? 1 : 0);
    const slot = (areaW - (slots - 1) * gap) / slots;
    const each = Math.min(slot, ground - 6 - headroom);
    const placed = forms.slice(0, shown).map((p, i) => {
      const scale = p.minutes ? Math.min(1, 0.78 + p.minutes / 150) : 0.9;
      const S = each * scale;
      const x = n === 1 ? w - pad - S : x0 + i * (slot + gap) + (slot - S) / 2;
      art += formMark(p.kind, x, ground - 6 - S, S, {
        state: p.done ? "done" : "todo",
        indoor: p.indoor,
        segments: p.segments || 0,
        done: p.segDone || 0,
        paper,
      });
      return { p, x, S };
    });
    if (more)
      art += `<text x="${f1(x0 + shown * (slot + gap) + slot / 2)}" y="${f1(ground - 6 - each / 2 + 6)}" text-anchor="middle" style="font-family:'Jost',sans-serif;font-size:18px;font-weight:600;fill:${P.ink}">+${more}</text>`;
    const tallest = Math.max(...placed.map((q) => q.S));
    // one label over each form, while each fits its slot and clears the strength label
    const own = placed.map((q) => ({
      ...q,
      w: textW(q.p.name) + (q.p.figure ? textW(" " + q.p.figure) : 0),
    }));
    const fitsOwn = !more && (n === 1 || own.every((q) => q.w <= slot + gap - 6));
    if (fitsOwn) {
      own.forEach((q) => {
        const anchor = n === 1 ? "end" : "middle",
          ax = n === 1 ? w - pad : q.x + q.S / 2;
        const left = anchor === "end" ? ax - q.w : ax - q.w / 2;
        const ly =
          strLabel &&
          left < strLabel.right + 12 &&
          Math.abs(ground - 6 - q.S - gapY - strLabel.y) < 16
            ? strLabel.y - 16
            : ground - 6 - q.S - gapY;
        labs += label(P, ax, ly, q.p.name, q.p.figure, { anchor });
      });
    } else {
      // the forms share one line, right-aligned, above the tallest; it moves up a line if it would meet the slabs' label
      const names = forms.map((p) => p.name).join(" · ");
      const lw = textW(names);
      let ly = ground - 6 - tallest - gapY;
      if (strLabel && w - pad - lw < strLabel.right + 12 && Math.abs(ly - strLabel.y) < 16)
        ly = Math.min(ly, strLabel.y) - 16;
      labs += label(P, w - pad, Math.max(14, ly), names, null, { anchor: "end" });
    }
  }
  return `${PO.open}${art}<rect x="${pad - 6}" y="${ground}" width="${w - 2 * pad + 12}" height="3" fill="${P.ink}"/>${PO.grain}${labs}${PO.end}`;
}

// ---------- the session: every exercise a slab of its sets, the warm-up a quarter disc ----------
// An exercise skipped for the day keeps its row as a dashed outline, with nothing inked in it.
// The label has its own band; rows share what is left, down to 3 px each, and past that the
// print shows how many more there are rather than drawing over its label.
export function sessionPrint({
  w = 362,
  h = 116,
  name,
  exercises,
  warmup = null,
  paper = PIG.paper,
  count = true,
} = {}) {
  const P = palFor(paper);
  const live = exercises.filter((x) => !x.skipped),
    skipped = exercises.length - live.length;
  const total = live.reduce((a, x) => a + x.sets, 0),
    doneSets = live.reduce((a, x) => a + x.done, 0);
  const PO = paperOpen(w, h, {
    paper,
    label: `${name}: ${doneSets} of ${total} sets saved${skipped ? `, ${skipped} exercise skipped today` : ""}${warmup ? `, warm-up ${warmup.done ? "done" : "to do"}` : ""}. Each exercise is a slab of its sets.`,
  });
  const pad = Math.max(16, Math.round(w * 0.05)),
    ground = h - 16,
    band = 28;
  const avail = ground - 6 - band;
  let rows = exercises.length,
    rowGap = rows > 6 ? 3 : 4;
  let sh = (avail - rowGap * (rows - 1)) / rows;
  if (sh < 4) {
    rowGap = 2;
    sh = (avail - rowGap * (rows - 1)) / rows;
  }
  let list = exercises,
    hidden = 0;
  if (sh < 3) {
    const fitRows = Math.max(1, Math.floor((avail + rowGap) / (3 + rowGap)));
    hidden = rows - fitRows;
    list = exercises.slice(0, fitRows);
    rows = fitRows;
    sh = (avail - rowGap * (rows - 1)) / rows;
  }
  sh = Math.min(sh, 16);
  const maxSets = Math.max(...list.map((x) => x.sets));
  const wuS = warmup ? Math.min(avail, 66) : 0;
  const areaW = w - 2 * pad - (warmup ? wuS + 28 : 0);
  const segGap = 3,
    unit = Math.min(60, (areaW - segGap * (maxSets - 1)) / maxSets);
  let art = "",
    y = ground - 6 - rows * sh - (rows - 1) * rowGap;
  for (const ex of list) {
    for (let k = 0; k < ex.sets; k++) {
      const x = pad + k * (unit + segGap);
      art += ex.skipped
        ? `<rect x="${f1(x + 0.75)}" y="${f1(y + 0.75)}" width="${f1(unit - 1.5)}" height="${f1(Math.max(1.5, sh - 1.5))}" fill="none" stroke="${P.col.strength}" stroke-width="1.5" stroke-dasharray="4 3"/>`
        : `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(unit)}" height="${f1(sh)}" fill="${k < ex.done ? P.col.strength : P.tint.strength}"/>`;
    }
    y += sh + rowGap;
  }
  const fig = [count ? `${doneSets} of ${total} sets` : null, hidden ? `+${hidden} more` : null]
    .filter(Boolean)
    .join(" · ");
  let labs = label(P, pad, 20, name, fig || null);
  if (warmup) {
    const x = w - pad - wuS;
    art += formMark("mobility", x, ground - 6 - wuS, wuS, {
      state: warmup.done ? "done" : "todo",
      segments: warmup.drills,
      done: warmup.done ? warmup.drills : 0,
      paper,
    });
    labs += label(
      P,
      w - pad,
      20,
      "Warm-up",
      warmup.what || (warmup.done ? "done" : `${warmup.drills} drills`),
      { anchor: "end" },
    );
  }
  return `${PO.open}${art}<rect x="${pad - 6}" y="${ground}" width="${w - 2 * pad + 12}" height="2.5" fill="${P.ink}"/>${PO.grain}${labs}${PO.end}`;
}

// ---------- the quarter: 6 Jul – 30 Sept 2026, one cell a day ----------
// From scripts/dev/seed-audit-history.ts for the "vinit" persona (months 53–55 of its window):
// strength on the 1st, 4th, 8th, 11th, 15th, 18th, 22nd and 25th; runs on the 2nd (3 km), 6th
// (4 km), 10th (5 km) and 26th (4 km), outdoors in July and August and on a treadmill in
// September; an indoor ride on the 14th and a pool swim on the 20th.
// Totals: 22 strength, 11 runs (45 km), 3 rides, 3 swims.
export function quarterDays() {
  const days = [],
    start = Date.UTC(2026, 6, 6),
    end = Date.UTC(2026, 8, 30);
  const sDays = { 1: 42, 4: 48, 8: 54, 11: 60, 15: 42, 18: 48, 22: 54, 25: 60 };
  const rDays = { 2: 3, 6: 4, 10: 5, 26: 4 };
  for (let i = 0; i < 13 * 7; i++) {
    const t = start + i * 86400000,
      d = new Date(t),
      dom = d.getUTCDate(),
      mon = d.getUTCMonth();
    const day = {
      i,
      week: Math.floor(i / 7),
      dow: i % 7,
      date: d,
      inRange: t <= end,
      sessions: [],
    };
    if (day.inRange) {
      if (sDays[dom]) day.sessions.push({ sport: "strength", min: sDays[dom] });
      if (rDays[dom]) day.sessions.push({ sport: "run", km: rDays[dom], indoor: mon === 8 });
      if (dom === 14) day.sessions.push({ sport: "ride", indoor: true });
      if (dom === 20) day.sessions.push({ sport: "swim", indoor: true });
    }
    days.push(day);
  }
  return days;
}
export function quarterTotals(days = quarterDays()) {
  const c = { strength: 0, run: 0, ride: 0, swim: 0, km: 0 };
  for (const d of days)
    for (const x of d.sessions) {
      c[x.sport]++;
      if (x.km) c.km += x.km;
    }
  return c;
}
export function quarterPrint({ w = 362, h = 214, paper = PIG.paper } = {}) {
  const P = palFor(paper),
    days = quarterDays();
  const PO = paperOpen(w, h, {
    paper,
    label:
      "Every session from 6 July to 30 September, one mark on each day: 22 strength sessions, 11 runs, 3 rides and 3 swims. A platform under a mark means indoors: the September runs on a treadmill, the rides indoors and the swims in a pool.",
  });
  const labW = 16,
    gap = 2,
    cell = Math.floor((w - 24 - labW - 12 * gap) / 13);
  const gx = w - 12 - (13 * cell + 12 * gap),
    gy = 34;
  const cxw = (wk) => gx + wk * (cell + gap),
    cyd = (dw) => gy + dw * (cell + gap);
  let grid = "",
    marks = "";
  for (const d of days) {
    if (!d.inRange) continue;
    const x = cxw(d.week),
      y = cyd(d.dow);
    if (!d.sessions.length) {
      grid += `<circle cx="${f1(x + cell / 2)}" cy="${f1(y + cell / 2)}" r="1.5" fill="${P.dot}"/>`;
      continue;
    }
    const one = d.sessions.length === 1,
      inset = cell * (one ? 0.1 : 0.06),
      sz = one ? cell - 2 * inset : cell * 0.6;
    d.sessions.forEach((ss, k) => {
      const ox = one ? x + inset : x + (k ? cell - sz - inset : inset),
        oy = one ? y + inset : y + (k ? cell - sz - inset : inset);
      const S = sz * (ss.km ? 0.84 + (ss.km - 3) * 0.08 : 1);
      marks += formMark(ss.sport, ox + (sz - S) / 2, oy + (sz - S), S, {
        indoor: ss.indoor,
        paper,
      });
    });
  }
  const T = (x, y, t, a = "start", wt = 600) =>
    `<text x="${f1(x)}" y="${f1(y)}" text-anchor="${a}" style="${FONT};font-size:12px;font-weight:${wt};fill:${P.label}">${t}</text>`;
  const wk = ["M", "T", "W", "T", "F", "S", "S"]
    .map((l, i) => T(gx - 6, cyd(i) + cell / 2 + 4, l, "end"))
    .join("");
  const months = [
    ["Jul", 0],
    ["Aug", 3],
    ["Sept", 8],
  ]
    .map(([l, i]) => T(cxw(i), gy - 12, l, "start", 700))
    .join("");
  return `${PO.open}${grid}${marks}${PO.grain}${wk}${months}${PO.end}`;
}

// ---------- the bowl: Fri 25 Sept, 1,152.5 of 2,300 kcal ----------
function segArea(r, hh) {
  const d = r - hh;
  return r * r * Math.acos(d / r) - d * Math.sqrt(Math.max(0, 2 * r * hh - hh * hh));
}
export function levelFor(frac, r) {
  const target = (frac * Math.PI * r * r) / 2;
  let lo = 0,
    hi = r;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (segArea(r, m) < target) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
export function bowlPrint({
  w = 362,
  h = 250,
  meals = [
    ["Breakfast", 445],
    ["Lunch", 647.5],
    ["Afternoon snack", 60],
  ],
  target = 2300,
  left = "1,147.5",
  eaten = "1,152.5",
  paper = PIG.paper,
} = {}) {
  const P = palFor(paper);
  const PO = paperOpen(w, h, {
    paper,
    label: `${left} kcal left. The day’s bowl, filled by what was eaten: ${meals.map(([n, k]) => `${n} ${k} kcal`).join(", ")}; ${eaten} of ${target.toLocaleString("en-GB")} kcal`,
  });
  const pad = 20,
    labW = Math.min(136, Math.round(w * 0.36));
  const big = Math.min(64, Math.round(w * 0.17));
  const r = Math.min(104, (w - 2 * pad - labW - 34) / 2, h - (pad + big * 0.82 + 52) - 20);
  const cx = pad + r,
    top = h - 18 - r,
    bottom = top + r;
  const yAt = (kcal) => bottom - levelFor(Math.min(1, kcal / target), r);
  const half = (yy) => Math.sqrt(Math.max(0, r * r - (yy - top) * (yy - top)));
  const cols = P.strata;
  let acc = 0,
    strata = "";
  const mids = [];
  meals.forEach(([name, kcal], i) => {
    const y0 = yAt(acc);
    let y1 = yAt(acc + kcal);
    if (y0 - y1 < 3) y1 = y0 - 3; // a sliver still shows: at least 3 px
    strata += `<rect x="${f1(cx - r)}" y="${f1(y1)}" width="${f1(2 * r)}" height="${f1(y0 - y1)}" fill="${cols[i % 3]}"/>`;
    if (i)
      strata += `<rect x="${f1(cx - r)}" y="${f1(y0 - 0.75)}" width="${f1(2 * r)}" height="1.5" fill="${paper}"/>`;
    mids.push([name, kcal, (y0 + y1) / 2]);
    acc += kcal;
  });
  const lx = cx + r + 30;
  const placed = [];
  mids.forEach((m, i) => {
    const want = m[2] + 4;
    placed.push(i ? Math.min(want, placed[i - 1] - 34) : Math.min(want, h - 30));
  });
  const labs = mids
    .map(([name, kcal, ym], i) => {
      const ly = placed[i],
        ex = cx + half(ym) - 12;
      return `<path d="M${f1(ex)} ${f1(ym)}L${f1(lx - 16)} ${f1(ym)}L${f1(lx - 6)} ${f1(ly - 4)}" fill="none" stroke="${P.ink}" stroke-width="1.25"/><circle cx="${f1(ex)}" cy="${f1(ym)}" r="2.2" fill="${P.ink}"/><text x="${f1(lx)}" y="${f1(ly)}" style="${FONT};font-size:13px;font-weight:700;fill:${P.ink}">${name}</text><text x="${f1(lx)}" y="${f1(ly + 16)}" style="${FONT};font-size:13px;font-weight:500;fill:${P.label};font-variant-numeric:tabular-nums">${kcal} kcal</text>`;
    })
    .join("");
  const clip = nextId("bowl");
  return `${PO.open}
<defs><clipPath id="${clip}"><path d="M${f1(cx - r)} ${f1(top)}A${f1(r)} ${f1(r)} 0 0 0 ${f1(cx + r)} ${f1(top)}Z"/></clipPath></defs>
<g clip-path="url(#${clip})">${strata}</g>
<path d="M${f1(cx - r)} ${f1(top)}A${f1(r)} ${f1(r)} 0 0 0 ${f1(cx + r)} ${f1(top)}" fill="none" stroke="${P.ink}" stroke-width="3"/>
<path d="M${f1(cx - r - 12)} ${f1(top)}H${f1(cx + r + 12)}" stroke="${P.ink}" stroke-width="3"/>
${PO.grain}
<text x="${pad}" y="${f1(pad + big * 0.82)}" style="font-family:'Jost',sans-serif;font-size:${big}px;font-weight:600;letter-spacing:-0.01em;fill:${P.ink};font-variant-numeric:tabular-nums">${left}</text>
<text x="${pad + 2}" y="${f1(pad + big * 0.82 + 26)}" style="${FONT};font-size:15px;font-weight:700;fill:${P.ink}">kcal left <tspan style="font-weight:500;fill:${P.label}">· ${eaten} of ${target.toLocaleString("en-GB")}</tspan></text>
<text x="${f1(cx + r + 12)}" y="${f1(top - 9)}" text-anchor="end" style="${FONT};font-size:12px;font-weight:600;fill:${P.label};font-variant-numeric:tabular-nums">${target.toLocaleString("en-GB")} kcal</text>
${labs}
${PO.end}`;
}

// ---------- the mark: a slab and a disc on the ground — a day of lifting and running ----------
export function markSvg(size = 64, { ink = PIG.ink, bg = null } = {}) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" style="display:block">${bg ? `<rect width="64" height="64" fill="${bg}"/>` : ""}<rect x="7" y="36" width="25" height="12" fill="${PIG.ultra}"/><circle cx="46" cy="35" r="13" fill="${PIG.verm}"/><rect x="5" y="51" width="54" height="4" fill="${ink}"/></svg>`;
}

// ---------- one cycle of the seeded programme (src/db/seed/data/program.ts, week 1) ----------
export const CYCLE = [
  { name: "Lower A", rows: [3, 3, 3, 2, 3, 2] },
  { name: "Upper A", rows: [4, 3, 3, 2, 3, 2, 2] },
  { name: "Easy Run + Arms", rows: [3, 3, 2, 2, [2, 2]], run: "20–25", minutes: 25 },
  { name: "Lower B", rows: [3, 2, 2, 2, 2, 2] },
  { name: "Upper B", rows: [3, 4, 2, 2, 3, 2, 2] },
  { name: "Easy Run + Light Upper", rows: [2, 2, 2, 2, 2], run: "25–30", minutes: 30 },
  { name: "Rest + Mobility", drills: 7 },
];
export function cyclePrint(day, { w = 300, h = 190, paper = PIG.paper } = {}) {
  const parts = [];
  if (day.rows)
    parts.push({
      kind: "strength",
      name: "Lifting",
      rows: day.rows.map((r) =>
        Array.isArray(r) ? r.map((n) => ({ n, done: 0 })) : [{ n: r, done: 0 }],
      ),
    });
  if (day.run)
    parts.push({ kind: "run", name: "Run", figure: `${day.run} min`, minutes: day.minutes });
  if (day.drills)
    parts.push({
      kind: "mobility",
      name: "Daily mobility",
      figure: `${day.drills} drills`,
      segments: day.drills,
      segDone: 0,
      minutes: 15,
    });
  return dayPrint({ w, h, parts, paper, ariaLabel: `${day.name}, as its print` });
}
