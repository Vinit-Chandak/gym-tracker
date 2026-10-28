// The consistency audit (DESIGN.md: The Rhythm Rule, The Equal Actions Rule, The Heading Rule,
// The One Card Rule and Inputs and choices): the basic faults no reviewer should
// have to point out, measured on every screen instead of spotted on one. Each check is a rule
// the owner had to name by hand on 24 October 2026:
//
// - actions-unequal: buttons that share a row differ in height or width (Back beside Create my
//   programme, Decline beside Approve).
// - actions-ragged: a group of actions wraps into rows of different widths (Start programme,
//   Ask for changes, Edit draft, Discard draft).
// - field-invisible: a field that cannot be told from what it stands on (a lap's distance, a
//   filled tray on a tray of the same tone).
// - heading-body-face: words at 20 px or more set outside the app's one face, Host Grotesk, or
//   lighter than 600, so a screen reads as a sentence set large rather than a heading ("Which
//   sounds like you?" under its title; owner, 28 October 2026: one face for everything).
// - heading-weak: a heading lighter than 600, which reads as a sentence rather than a heading.
// - stepper-misaligned: rows of steppers whose buttons do not stand in one column (Distance
//   above Duration).
// - repeated-text: the same sentence three times or more on one screen (a caution repeated on
//   every session of a plan).
// - rhythm: the space from a screen's header to its first content, which must be the same on
//   every screen of a kind (Muscles against Running).
// - section-gap and heading-gap: a section's heading with a section's gap over it and a heading's
//   gap under it ("Sets" and "Check-in" standing on the rows above them).
//
// It runs against the audit app (docs/local-dev.md). AUDIT_DEVICE picks iphone17 (WebKit,
// 402 × 874), android (Chromium, Pixel 7) or narrow (Chromium, 320 × 740); AUDIT_THEME light or
// dark; AUDIT_ROUTE_FILTER a pattern; AUDIT_EXPAND_DETAILS=true opens every fold first. It exits
// 1 when a check fails, unless AUDIT_REPORT_ONLY=true.
import { devices } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { launch, skipDevice } from "./audit-engines.mjs";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
  throw new Error("Local audit only.");
const output = process.env.AUDIT_OUTPUT_DIR ?? "output/flow-audit";
const fixtures = JSON.parse(await readFile(`${output}/fixtures.json`, "utf8"));
const theme = process.env.AUDIT_THEME === "dark" ? "dark" : "light";
const expand = process.env.AUDIT_EXPAND_DETAILS === "true";
const filter = process.env.AUDIT_ROUTE_FILTER ? new RegExp(process.env.AUDIT_ROUTE_FILTER) : null;

const person = (name) => fixtures.people.find((p) => p.username === name).id;
const own = (rows, name) => rows.filter((row) => row.userId === person(name));
const first = (rows, name) => own(rows, name)[0];
const occurrence = (name, sport) =>
  own(fixtures.occurrences, name).find(
    (o) => o.sport === sport && !o.familyId && o.disposition === "pending",
  ) ?? own(fixtures.occurrences, name).find((o) => o.sport === sport);
const activity = (name, sport) => own(fixtures.activities, name).find((a) => a.sport === sport);

/** Every screen a change is likely to touch, as an athlete reaches it. */
function routesFor(name) {
  const gym = first(fixtures.gyms, name)?.id;
  const workout = first(fixtures.workouts, name)?.id;
  const draft = first(fixtures.drafts, name)?.id;
  const jobs = own(fixtures.jobs, name).map((job) => job.id);
  const days = own(fixtures.programDays ?? [], name).map((day) => day.id);
  const exercise = fixtures.exercises.find((e) => e.slug === "barbell-bench-press")?.id;
  return [
    "/today",
    "/today/log",
    "/today/log/body-weight",
    "/plan",
    "/plan/new",
    "/plan/past",
    "/food",
    "/food/targets",
    "/food/my-foods",
    "/food/breakfast",
    "/progress",
    "/progress/calendar",
    "/progress/history",
    ...["muscles", "running", "strength", "recovery", "food", "body"].map(
      (view) => `/progress?view=${view}`,
    ),
    "/profile",
    "/profile/edit",
    "/profile/units",
    "/profile/privacy",
    "/profile/password",
    "/profile/sports",
    "/profile/heart-rate",
    "/profile/ai-coach",
    "/profile/friends",
    "/profile/friends/people",
    "/profile/friends/find",
    "/profile/friends/leaderboard",
    "/profile/delete-account",
    `/u/${name}`,
    "/gyms",
    ...(gym ? [`/gyms/${gym}`, `/gyms/${gym}/edit`, `/gyms/${gym}/programme`] : []),
    "/exercises",
    ...(exercise ? [`/exercises/${exercise}`] : []),
    ...(workout ? [`/workouts/${workout}`] : []),
    ...(draft ? [`/plan/drafts/${draft}`, `/plan/drafts/${draft}/programme`] : []),
    ...jobs.map((job) => `/plan/requests/${job}`),
    ...days.slice(0, 2).map((day) => `/plan/strength/days/${day}`),
    ...["strength", "running", "cycling", "swimming"].flatMap((sport) => [
      `/plan/${sport}`,
      `/plan/new?sport=${sport}`,
      `/plan/new?sport=${sport}&method=coach`,
      `/today/log?sport=${sport}`,
    ]),
    "/plan/strength/edit",
    ...["running", "cycling", "swimming"].flatMap((sport) => {
      const done = activity(name, sport);
      const owed = occurrence(name, sport);
      return [
        `/today/log/new?sport=${sport}`,
        ...(done
          ? [`/progress/activities/${done.id}`, `/progress/activities/${done.id}/edit`]
          : []),
        ...(owed ? [`/plan/sessions/${owed.id}`] : []),
        `/plan/${sport}/edit?mode=repeating`,
      ];
    }),
  ];
}

const configurations = {
  iphone17: {
    engine: "webkit",
    options: {
      ...devices["iPhone 13"],
      viewport: { width: 402, height: 874 },
      screen: { width: 402, height: 874 },
      deviceScaleFactor: 3,
    },
  },
  android: { engine: "chromium", options: devices["Pixel 7"] },
  narrow: {
    engine: "chromium",
    options: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true },
  },
};

/**
 * Every check, run in the page. It returns the faults and the screen's rhythm: where its header
 * ends and its first content starts.
 */
function inspect() {
  const faults = [];
  const visible = (element) => {
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    for (let at = element; at; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
        return false;
      if (at.tagName === "DETAILS" && !at.open && at !== element) {
        const summary = at.querySelector(":scope > summary");
        if (!summary?.contains(element)) return false;
      }
    }
    return !element.closest("[inert], [aria-hidden='true'] *, .sr-only");
  };
  const name = (element) =>
    (element.getAttribute("aria-label") || element.innerText || element.value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70);
  const where = (element) => {
    const heading = element
      .closest("section, form, [role=group], .box, .ov-panel, article, li")
      ?.querySelector("h1, h2, h3, legend, label");
    return heading ? name(heading) : "";
  };

  // Colours, composited over what stands behind, and their contrast (WCAG's relative luminance).
  const parse = (value) => {
    const found = value.match(/rgba?\(([^)]+)\)/);
    if (!found) return null;
    const [r, g, b, a = 1] = found[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r, g, b, a };
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const behind = (element) => {
    const layers = [];
    for (let at = element.parentElement; at; at = at.parentElement) {
      const colour = parse(getComputedStyle(at).backgroundColor);
      if (colour && colour.a > 0) {
        layers.push(colour);
        if (colour.a >= 1) break;
      }
    }
    let colour = parse(getComputedStyle(document.body).backgroundColor) ?? {
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    };
    for (const layer of layers.reverse()) colour = over(layer, colour);
    return colour;
  };
  const luminance = ({ r, g, b }) => {
    const channel = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const contrast = (one, two) => {
    const [a, b] = [luminance(one), luminance(two)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };

  // ---------- actions: a row of buttons shares one height and one width ----------
  const looksLikeButton = (element) => {
    if (!visible(element)) return false;
    if (
      element.closest(
        "[role=radiogroup], [role=tablist], [role=group][aria-label='The week, day by day'], .primary-nav, .month, summary, .nav-row, [role=checkbox], [aria-pressed], .row-stepper, .stepper, .scale, .segmented",
      )
    )
      return false;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    if (box.height < 36 || box.height > 120) return false;
    const fill = parse(style.backgroundColor);
    const edge = parseFloat(style.borderTopWidth) >= 1 && (parse(style.borderTopColor)?.a ?? 0) > 0;
    return ((fill && fill.a > 0) || edge) && parseFloat(style.borderTopLeftRadius) >= 8;
  };
  const iconOnly = (element) => (element.innerText || "").replace(/[^\p{L}\p{N}]/gu, "").length < 2;
  const buttons = [...document.querySelectorAll("button, a, [role=button]")].filter(
    looksLikeButton,
  );
  const groups = new Map();
  for (const button of buttons) {
    let container = button.parentElement;
    while (
      container &&
      !["flex", "inline-flex", "grid"].includes(getComputedStyle(container).display)
    )
      container = container.parentElement;
    if (!container) continue;
    if (!groups.has(container)) groups.set(container, []);
    groups.get(container).push(button);
  }
  for (const [container, members] of groups) {
    if (members.length < 2) continue;
    const rows = [];
    for (const member of members) {
      const box = member.getBoundingClientRect();
      const middle = box.top + box.height / 2;
      const row = rows.find((r) => Math.abs(r.middle - middle) < Math.max(12, box.height / 3));
      if (row) row.members.push({ member, box });
      else rows.push({ middle, members: [{ member, box }] });
    }
    for (const row of rows) {
      if (row.members.length < 2) continue;
      const heights = row.members.map(({ box }) => Math.round(box.height));
      if (Math.max(...heights) - Math.min(...heights) > 1.5)
        faults.push({
          check: "actions-unequal",
          detail: `heights ${heights.join(" / ")}`,
          what: row.members.map(({ member }) => name(member)).join(" | "),
          where: where(container),
        });
      const worded = row.members.filter(({ member }) => !iconOnly(member));
      const widths = worded.map(({ box }) => Math.round(box.width));
      if (worded.length >= 2 && Math.max(...widths) - Math.min(...widths) > 2)
        faults.push({
          check: "actions-unequal",
          detail: `widths ${widths.join(" / ")}`,
          what: worded.map(({ member }) => name(member)).join(" | "),
          where: where(container),
        });
    }
    if (rows.length >= 2 && members.length >= 3) {
      const span = container.getBoundingClientRect().width;
      const fills = rows.map(
        (row) => row.members.reduce((sum, { box }) => sum + box.width, 0) / Math.max(1, span),
      );
      const counts = rows.map((row) => row.members.length);
      if (new Set(counts).size > 1 && Math.min(...fills) < 0.85)
        faults.push({
          check: "actions-ragged",
          detail: `rows of ${counts.join(" + ")}, filling ${fills.map((f) => `${Math.round(f * 100)}%`).join(" / ")}`,
          what: members.map((member) => name(member)).join(" | "),
          where: where(container),
        });
    }
  }

  // ---------- fields: every field can be told from what it stands on ----------
  const typed =
    "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=submit]):not([type=button]), select, textarea";
  for (const field of document.querySelectorAll(typed)) {
    if (!visible(field) || field.closest(".sr-only")) continue;
    const style = getComputedStyle(field);
    const ground = behind(field);
    const fill = parse(style.backgroundColor);
    const fillRatio = fill && fill.a > 0 ? contrast(over(fill, ground), ground) : 1;
    const edges = ["Top", "Right", "Bottom", "Left"].map((side) => ({
      width: parseFloat(style[`border${side}Width`]),
      colour: parse(style[`border${side}Color`]),
    }));
    const edgeRatio = Math.max(
      1,
      ...edges
        .filter(({ width, colour }) => width >= 1 && colour && colour.a > 0)
        .map(({ colour }) => contrast(over(colour, ground), ground)),
    );
    const ring = style.boxShadow.match(/inset[^,]*?(rgba?\([^)]+\))|(rgba?\([^)]+\))[^,]*inset/);
    const ringColour = ring ? parse(ring[1] ?? ring[2]) : null;
    const ringRatio = ringColour ? contrast(over(ringColour, ground), ground) : 1;
    // A figure typed inside a box drawn as its field (a stepper's figure and its unit) is seen
    // by that box's edge.
    const frame = field.parentElement;
    const frameStyle = frame ? getComputedStyle(frame) : null;
    const frameColour = frameStyle ? parse(frameStyle.borderTopColor) : null;
    const framed =
      frame &&
      frame.matches(".row-stepper-figure, .figure-field-box, .search-box") &&
      parseFloat(frameStyle.borderTopWidth) >= 1 &&
      frameColour &&
      contrast(over(frameColour, behind(frame)), behind(frame)) >= 1.35;
    if (framed) continue;
    // An underlined figure (a stepper's) says it is typed by its rule: the bottom edge counts.
    if (fillRatio < 1.08 && edgeRatio < 1.35 && ringRatio < 1.35)
      faults.push({
        check: "field-invisible",
        detail: `fill ${fillRatio.toFixed(2)}:1, edge ${edgeRatio.toFixed(2)}:1`,
        what:
          (field.labels?.[0] && name(field.labels[0])) ||
          field.getAttribute("aria-label") ||
          field.name ||
          field.placeholder ||
          field.type,
        where: where(field),
      });
  }

  // ---------- headings: what is large is a heading in the one face, and reads as one ----------
  const seenFaces = new Set();
  for (const element of document.querySelectorAll("body *")) {
    if (element.closest("svg, input, textarea, select, option, .sr-only")) continue;
    const own = [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 1,
    );
    if (!own || !visible(element)) continue;
    const style = getComputedStyle(element);
    const size = parseFloat(style.fontSize);
    if (
      size >= 20 &&
      (!/host[ _]grotesk/i.test(style.fontFamily) || Number(style.fontWeight) < 600)
    ) {
      const text = name(element);
      if (!seenFaces.has(text)) {
        seenFaces.add(text);
        faults.push({
          check: "heading-body-face",
          detail: `${Math.round(size)} px ${style.fontWeight} in ${style.fontFamily.split(",")[0]}`,
          what: text,
          where: where(element),
        });
      }
    }
  }
  for (const heading of document.querySelectorAll("h1, h2, h3")) {
    if (!visible(heading)) continue;
    const style = getComputedStyle(heading);
    if (Number(style.fontWeight) < 600)
      faults.push({
        check: "heading-weak",
        detail: `${Math.round(parseFloat(style.fontSize))} px ${style.fontWeight}`,
        what: name(heading),
        where: "",
      });
  }

  // ---------- steppers: rows of steppers keep their buttons in one column ----------
  const stepperGroups = new Map();
  for (const row of document.querySelectorAll(".row-stepper")) {
    if (!visible(row)) continue;
    const parent = row.parentElement;
    if (!stepperGroups.has(parent)) stepperGroups.set(parent, []);
    stepperGroups.get(parent).push(row);
  }
  for (const rows of stepperGroups.values()) {
    if (rows.length < 2) continue;
    const columns = rows.map((row) => {
      const controls = [...row.querySelectorAll("button")].filter(visible);
      const minus = controls[0]?.getBoundingClientRect();
      const plus = controls.at(-1)?.getBoundingClientRect();
      return { minus: Math.round(minus?.left ?? 0), plus: Math.round(plus?.left ?? 0) };
    });
    const minus = columns.map((c) => c.minus);
    const plus = columns.map((c) => c.plus);
    if (Math.max(...minus) - Math.min(...minus) > 2 || Math.max(...plus) - Math.min(...plus) > 2)
      faults.push({
        check: "stepper-misaligned",
        detail: `− at ${minus.join(" / ")}, + at ${plus.join(" / ")}`,
        what: rows.map((row) => name(row.querySelector("label, span") ?? row)).join(" | "),
        where: where(rows[0]),
      });
  }

  // ---------- words: one sentence is said once, not on every row ----------
  const counts = new Map();
  for (const element of document.querySelectorAll("p, li, dd, span, div")) {
    const own = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (own.length < 50 || !visible(element)) continue;
    counts.set(own, (counts.get(own) ?? 0) + 1);
  }
  for (const [text, count] of counts)
    if (count >= 3)
      faults.push({
        check: "repeated-text",
        detail: `${count} times`,
        what: text.slice(0, 90),
        where: "",
      });

  // ---------- what paints, and where ----------
  // Measured as the screen opens, from its top: a page that scrolls itself to its latest month
  // would otherwise be measured wherever it stopped.
  scrollTo({ top: 0, behavior: "instant" });
  // Words, a filled or edged box, a picture or a control. A wrapper's padding paints nothing, so
  // it counts as the gap it makes.
  // An edge paints only its own side: a ruled row's rule is under it, not over it.
  const paints = (element, side) => {
    // A row is content where it starts, its words centred in its target. A button with neither
    // a fill nor an edge (a tip's circled "i") is seen by its glyph, not its target.
    if (element.matches("svg, img, canvas, input, select, textarea, a, li")) return true;
    const style = getComputedStyle(element);
    const fill = parse(style.backgroundColor);
    if (fill && fill.a > 0) return true;
    const edge = (name) =>
      parseFloat(style[`border${name}Width`]) >= 1 &&
      (parse(style[`border${name}Color`])?.a ?? 0) > 0;
    if ((side !== "bottom" && edge("Top")) || (side !== "top" && edge("Bottom"))) return true;
    return [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0,
    );
  };
  // Words start and end where their line does: a large figure's inline box rises above its line,
  // but the eye reads the line's block, so inline text is placed by the block it sits in.
  const blockOf = (element) => {
    let at = element;
    while (at.parentElement && getComputedStyle(at).display === "inline") at = at.parentElement;
    return at;
  };
  const topOf = (element) => {
    const at = blockOf(element);
    const style = getComputedStyle(at);
    const top = at.getBoundingClientRect().top;
    return at === element
      ? top
      : top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
  };
  const bottomOf = (element) => {
    const at = blockOf(element);
    const style = getComputedStyle(at);
    const bottom = at.getBoundingClientRect().bottom;
    return at === element
      ? bottom
      : bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
  };
  // Painted counts whether or not a screen reader hears it (a calendar's weekday letters). A
  // closed fold paints its summary alone: Chromium still lays out what it holds, so a field's
  // label folded away under a card would otherwise read as standing over the next heading.
  const shown = (element) => {
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    for (let at = element; at; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
        return false;
      if (at.tagName === "DETAILS" && !at.open && at !== element) {
        const summary = at.querySelector(":scope > summary");
        if (!summary?.contains(element)) return false;
      }
    }
    return !element.closest(".sr-only");
  };
  const painted = [...document.querySelectorAll("body *")].filter(
    (element) =>
      !element.closest(".primary-nav, .viewport-chrome, .pinned-actions, nextjs-portal, dialog") &&
      shown(element) &&
      paints(element),
  );

  // ---------- rhythm: header to first content ----------
  const header = document.querySelector("main header.page-header, header.page-header");
  let rhythm = null;
  if (header && visible(header)) {
    const end = header.getBoundingClientRect().bottom;
    // The nearest painted thing under the header, wherever it falls in the markup.
    const after = painted
      .filter((element) => {
        if (header.contains(element) || element.contains(header)) return false;
        const box = element.getBoundingClientRect();
        // A progress bar is content too, however thin.
        return box.top >= end - 1 && box.height >= 2 && paints(element, "top");
      })
      .sort((a, b) => topOf(a) - topOf(b))[0];
    const kind = header.classList.contains("page-root") ? "root" : "nested";
    const title = header.querySelector("h1, .page-root-chooser")?.getBoundingClientRect();
    rhythm = {
      kind,
      titleTop: title ? Math.round(title.top + scrollY) : null,
      gap: after ? Math.round(topOf(after) - end) : null,
      first: after ? name(after).slice(0, 40) : null,
    };
  }

  // ---------- section headings: a section's gap over each, a heading's gap under ----------
  // From the nearest painted thing above a section's heading, across the heading's width, to its
  // words (`gap-section`, 28 on a phone), and from its words to what it heads (`gap-heading`,
  // 12). A heading that opens the screen is the rhythm's, measured from the header.
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;height:var(--ov-gap-section)";
  document.body.append(probe);
  const section = probe.getBoundingClientRect().height || 28;
  probe.remove();
  for (const heading of document.querySelectorAll(".caption-head, .heading-row")) {
    if (heading.matches(".heading-row .caption-head") || !visible(heading)) continue;
    if (heading.closest(".page-header, dialog, [popover], details:not([open])")) continue;
    const box = heading.getBoundingClientRect();
    let above = null;
    let below = null;
    for (const element of painted) {
      if (heading.contains(element) || element.contains(heading)) continue;
      const other = element.getBoundingClientRect();
      if (other.right <= box.left + 1 || other.left >= box.right - 1 || other.height < 1) continue;
      const bottom = bottomOf(element);
      const top = topOf(element);
      if (bottom <= box.top + 1 && (!above || bottom > above.edge) && paints(element, "bottom"))
        above = { edge: bottom, element };
      else if (top >= box.bottom - 1 && (!below || top < below.edge) && paints(element, "top"))
        below = { edge: top, element };
    }
    // A heading inside a card or a panel is inset by it: the card's own edge is what stands
    // over it, and the card's padding its gap.
    for (let at = heading.parentElement; at && at !== document.body; at = at.parentElement) {
      const style = getComputedStyle(at);
      const fill = parse(style.backgroundColor);
      const edged =
        parseFloat(style.borderTopWidth) >= 1 && (parse(style.borderTopColor)?.a ?? 0) > 0;
      if (!edged && !(fill && fill.a > 0 && parseFloat(style.borderTopLeftRadius) > 0)) continue;
      const edge = at.getBoundingClientRect().top;
      if (!above || edge > above.edge) above = { edge, element: at, container: true };
      break;
    }
    const text = name(heading).slice(0, 40);
    if (above && !above.container && !above.element.closest(".page-header")) {
      const gap = Math.round(box.top - above.edge);
      if (gap < section - 8 || gap > section + 12)
        faults.push({
          check: "section-gap",
          detail: `${gap} pt over the heading, where a section keeps ${Math.round(section)}`,
          what: text,
          where: name(above.element).slice(0, 40),
        });
    }
    if (below) {
      const gap = Math.round(below.edge - box.bottom);
      if (gap < 4 || gap > 22)
        faults.push({
          check: "heading-gap",
          detail: `${gap} pt under the heading, where a heading keeps 12 over what it heads`,
          what: text,
          where: name(below.element).slice(0, 40),
        });
    }
  }
  return { faults, rhythm };
}

const results = [];
for (const device of (process.env.AUDIT_DEVICE ?? "android").split(",")) {
  const config = configurations[device];
  if (!config) throw new Error(`Unknown device ${device}: use iphone17, android or narrow.`);
  const label = `${device}-${theme}`;
  if (skipDevice(label, config.engine)) continue;
  const browser = await launch(config.engine);
  const context = await browser.newContext({ ...config.options, baseURL, colorScheme: theme });
  await context.addInitScript((mode) => {
    try {
      localStorage.setItem("overload:appearance", mode);
    } catch {}
  }, theme);
  for (const persona of (process.env.AUDIT_PERSONAS ?? "vinit,priya").split(",")) {
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(`${persona}@local.test`);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 120_000 });
    for (const route of [...new Set(routesFor(persona))]) {
      if (filter && !filter.test(route)) continue;
      try {
        await page.goto(route, { waitUntil: "load", timeout: 120_000 });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
        await page.evaluate(async (open) => {
          if (open) document.querySelectorAll("details").forEach((d) => (d.open = true));
          await document.fonts.ready;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        }, expand);
        const found = await page.evaluate(inspect);
        results.push({ device: label, persona, route, ...found });
        const summary = found.faults.length
          ? found.faults.map((fault) => fault.check).join(", ")
          : "clean";
        console.log(`${label} ${persona} ${route}: ${summary}`);
      } catch (error) {
        results.push({ device: label, persona, route, error: error.message.split("\n")[0] });
        console.log(`${label} ${persona} ${route}: FAILED ${error.message.split("\n")[0]}`);
      }
    }
    await page.close();
  }
  await browser.close();
}

// The rhythm holds across screens of a kind: the commonest gap is the rule, and each screen that
// differs from it by more than 4 pt is a fault of its own.
for (const kind of ["root", "nested"]) {
  const measured = results.filter((r) => r.rhythm?.kind === kind && r.rhythm.gap !== null);
  const tally = new Map();
  for (const r of measured) tally.set(r.rhythm.gap, (tally.get(r.rhythm.gap) ?? 0) + 1);
  const mode = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const r of measured)
    if (Math.abs(r.rhythm.gap - mode) > 4)
      r.faults.push({
        check: "rhythm",
        detail: `${r.rhythm.gap} pt from the header to "${r.rhythm.first}", where ${kind} screens keep ${mode}`,
        what: r.route,
        where: "",
      });
}

const folder = `${output}/consistency`;
await mkdir(folder, { recursive: true });
await writeFile(`${folder}/report-${theme}.json`, JSON.stringify(results, null, 2));
const faults = results.flatMap((r) =>
  (r.faults ?? []).map((fault) => ({ ...fault, route: r.route, persona: r.persona })),
);
const byCheck = new Map();
for (const fault of faults) {
  if (!byCheck.has(fault.check)) byCheck.set(fault.check, []);
  byCheck.get(fault.check).push(fault);
}
console.log(`\n${faults.length} faults on ${results.length} screens (${theme})`);
for (const [check, list] of byCheck) {
  console.log(`\n${check}: ${list.length}`);
  for (const fault of list)
    console.log(
      `  ${fault.route} — ${fault.what}${fault.where ? ` [${fault.where}]` : ""}: ${fault.detail}`,
    );
}
const failed = results.filter((r) => r.error);
if (failed.length) console.log(`\n${failed.length} screens failed to load`);
if ((faults.length || failed.length) && process.env.AUDIT_REPORT_ONLY !== "true") process.exit(1);
