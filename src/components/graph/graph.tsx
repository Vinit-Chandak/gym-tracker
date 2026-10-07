"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { InfoTip } from "@/components/ui/info-tip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useMeasure } from "@/components/ui/use-width";
import {
  RANGE_PRESETS,
  RANGE_PRESET_LABELS,
  type GraphRange,
  type RangePreset,
} from "@/domain/graph-range";
import { cn } from "@/lib/utils";

import {
  axisTicks,
  barLayout,
  barPath,
  barScale,
  dayX,
  linePath,
  lineScale,
  markX,
  nearestIndex,
  type Frame,
} from "./geometry";
import { useGraphRange } from "./graph-range-context";

/** One mark: a bucket's value in slot order, or one record's, oldest first. */
export type GraphDatum = { date: string; value: number | null };

/** A line's figure in the readout, and the way into the record behind it. */
export type GraphSide = {
  /** The figure, as written; null when there is none ("No runs"). */
  figure: string | null;
  unit?: string;
  /** One line under the figure: "12 runs"; "100 kg × 6". */
  context?: string | null;
  /** Where the record behind the mark opens. */
  href?: Route;
  /** What opening it is called: "Open workout". */
  action?: string;
};

/** What the readout over the plot says: the graph's summary, or the mark a finger is on. */
export type GraphReadout = GraphSide & {
  /** "Total distance"; "14–20 Sept". */
  label: string;
  /** Head to head (`against`): the second line's figure, read beside the first's. */
  against?: GraphSide;
};

export type GraphProps = {
  /** What the graph draws, for its accessible name: "Distance". */
  name: string;
  /** Bars for totals; a line for a measurement that rises and falls (ADR 0042). */
  mark: "bar" | "line";
  /**
   * Buckets fill fixed slots across the range, one per day, week or month; records stand on
   * their own day, so two weeks without one read as two weeks.
   */
  placement: "bucket" | "record";
  range: GraphRange;
  /** For buckets, exactly one per slot of `range`. */
  data: readonly GraphDatum[];
  /** A value as the scale writes it: "4", "2,000", "5:30". */
  format?: (value: number) => string;
  summary: GraphReadout;
  /** What the readout says for the mark at an index of `data`. */
  describe: (index: number) => GraphReadout;
  scale?: {
    /** Whole numbers only on the scale (counts). */
    integral?: boolean;
    /** A fixed scale (a 1–5 answer), drawn whole whatever the readings. */
    min?: number;
    max?: number;
    ticks?: readonly number[];
    /** The round values a scale may step by, where powers of ten do not suit (minutes, pace). */
    steps?: readonly number[];
    /** Lower is better (pace): the scale runs downward, so better is still up. */
    invert?: boolean;
  };
  /** A value that matters, drawn as a rule in ink: a target, a threshold. */
  rule?: { value: number; label: string };
  /** What the graph counts, one tap away rather than in running text. */
  note?: { label: string; content: ReactNode };
  /** Said in the plot when the range holds nothing to draw. */
  empty: string;
  /**
   * Buckets only: join the readings across buckets with none, as records are joined. For a
   * measure taken on some days and not others (a check-in), where the points say where the
   * readings are and broken pieces would hide the trend.
   */
  join?: boolean;
  /**
   * Head to head, lines only: a second line over the same days (a value for each of `data`'s),
   * drawn in grey (series 2, `control`) under the first, and whose each line is. The readout
   * reads both side by side, each figure under its line's name, the second from each readout's
   * `against`.
   */
  against?: { data: readonly GraphDatum[]; names: readonly [string, string] };
  className?: string;
};

/** The drawing's height: the plot, then a row for the dates under it. */
const HEIGHT = 188;
const DATE_ROW = 24;
const TOP = 12;
/** Values listed before "Show all", so a year of records opens at once. */
const FIRST_VALUES = 60;

/** The scale's labels: 12 pt at 100% text, growing with it, in Atkinson 600, ink 2. */
const LABEL = {
  fontSize: "var(--ov-type-print-label)",
  fontWeight: 600,
  fill: "var(--ov-ink-2)",
} as const;

/**
 * Every graph in the app (ADR 0042; DESIGN.md, Graphs). One anatomy wherever it is
 * drawn: the readout over the plot (the graph's one summary, or the mark a finger is on, with
 * the way into the record behind it), the plot in ink on the ground with the scale's round
 * values as hairlines and their labels in the left margin, the dates under it at the calendar's
 * own boundaries, the shared spans, and every value behind one row.
 *
 * Tap or drag across the plot to read a mark; tap it again, tap elsewhere or press Escape to go
 * back to the summary. With the keyboard, the plot takes focus and the arrow keys step through
 * the marks; Enter opens the record behind the one read.
 */
export function Graph({
  name,
  mark,
  placement,
  range,
  data,
  format = (value) => String(value),
  summary,
  describe,
  scale = {},
  rule,
  note,
  empty,
  join = false,
  against,
  className,
}: GraphProps) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const { width, root: rem } = useMeasure(holder, undefined, {
    width: 362,
    height: HEIGHT,
    root: 16,
  });
  const shared = useGraphRange();
  const readoutId = useId();
  const [chosen, setChosen] = useState<{ index: number; date: string; pinned: boolean } | null>(
    null,
  );
  const drag = useRef<{
    x: number;
    y: number;
    /** A sideways drag (or any mouse press): it reads marks as it goes. */
    scrubbing: boolean;
    moved: boolean;
    wasChosen: boolean;
  } | null>(null);

  const bars = mark === "bar";
  // A head to head's second line, on the same days as the first.
  const second = bars ? null : (against?.data ?? null);
  /** Whether either line has something at an index: a mark a finger can read. */
  const filled = (index: number) =>
    (data[index]?.value ?? null) !== null || (second?.[index]?.value ?? null) !== null;

  // A new range, measure or series replaces the marks: a choice that no longer names the same
  // mark, or names one with nothing in it now, is let go rather than moved elsewhere.
  const selected =
    chosen && data[chosen.index]?.date === chosen.date && filled(chosen.index) ? chosen : null;

  const values = [...data, ...(second ?? [])].flatMap((datum) =>
    datum.value === null ? [] : [datum.value],
  );
  const hasData = values.length > 0;

  // ---- scale ----
  const barScaled = bars
    ? barScale(values, {
        integral: scale.integral,
        include: rule ? [rule.value] : [],
        steps: scale.steps,
      })
    : null;
  const lineScaled = bars
    ? null
    : lineScale(rule ? [...values, rule.value] : values, {
        min: scale.min,
        max: scale.max,
        ticks: scale.ticks,
        steps: scale.steps,
      });
  const ticks = hasData ? (barScaled?.ticks ?? lineScaled!.ticks) : [];
  const shownTicks = bars ? ticks.filter((tick) => tick !== 0) : ticks;
  const labels = [...shownTicks.map(format), ...(rule ? [rule.label] : [])];
  const px = 0.75 * rem;
  const left = Math.max(
    26,
    Math.ceil(Math.max(0, ...labels.map((l) => l.length)) * 0.62 * px) + 10,
  );
  const frame: Frame = {
    width,
    left,
    right: width - (bars ? 0 : 8),
    top: TOP,
    bottom: HEIGHT - DATE_ROW,
  };
  const plot = frame.bottom - frame.top;
  const y = (value: number) => {
    if (barScaled) return frame.bottom - (value / barScaled.max) * plot;
    const { lo, hi } = lineScaled!;
    const share = (value - lo) / (hi - lo || 1);
    return scale.invert ? frame.top + share * plot : frame.bottom - share * plot;
  };

  // ---- marks ----
  const count = data.length;
  const xs = data.map((datum, index) => markX(index, datum.date, range, frame, placement, count));
  // A finger snaps to the nearest mark with something in it: an empty slot has nothing to say
  // that the gap does not, and on a phone a tap meant for a bar often lands beside it.
  const readable = data.map((_, index) => (filled(index) ? xs[index]! : null));
  const latest = data.findLastIndex((datum) => datum.value !== null);
  const inked = selected ? selected.index : latest;
  const layout = barLayout(count, frame);
  const pointsOf = (line: readonly GraphDatum[]) =>
    line.map((datum, index) =>
      datum.value === null ? null : { x: xs[index]!, y: y(datum.value), index },
    );
  const points = pointsOf(data);
  const known = points.filter((point) => point !== null);
  const sparse = known.length <= 40;
  const secondPoints = second ? pointsOf(second) : [];
  const secondKnown = secondPoints.filter((point) => point !== null);
  const secondInked = selected
    ? selected.index
    : (second?.findLastIndex((datum) => datum.value !== null) ?? -1);

  const ticksX = axisTicks(
    range,
    frame,
    (date) => dayX(date, range, frame, placement, count),
    (label) => label.length * 0.6 * px,
  );

  // ---- reading a mark ----
  const choose = (index: number | null, pinned: boolean) =>
    setChosen(index === null ? null : { index, date: data[index]!.date, pinned });
  const indexAt = (event: PointerEvent<SVGSVGElement>) =>
    nearestIndex(readable, event.clientX - event.currentTarget.getBoundingClientRect().left);

  useEffect(() => {
    if (!selected?.pinned) return;
    const away = (event: Event) => {
      if (root.current && !root.current.contains(event.target as Node)) setChosen(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [selected?.pinned]);

  // A mouse reads a mark on a press, and previews one on hover. A finger reads one on a tap,
  // or on a drag that goes sideways; one that goes up or down is scrolling the page, so it reads
  // nothing and the browser takes it.
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!hasData || (event.pointerType === "mouse" && event.button !== 0)) return;
    const index = indexAt(event);
    if (index === null) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      scrubbing: event.pointerType === "mouse",
      moved: false,
      wasChosen: selected?.pinned === true && selected.index === index,
    };
    if (event.pointerType === "mouse") choose(index, true);
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!hasData) return;
    const index = indexAt(event);
    if (index === null) return;
    const press = drag.current;
    if (press) {
      const dx = Math.abs(event.clientX - press.x);
      const dy = Math.abs(event.clientY - press.y);
      if (dx > 4 || dy > 4) press.moved = true;
      if (!press.scrubbing && dx > 6 && dx > dy) press.scrubbing = true;
      if (press.scrubbing) choose(index, true);
    } else if (event.pointerType === "mouse" && !selected?.pinned) choose(index, false);
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const press = drag.current;
    drag.current = null;
    if (!press || press.moved) return;
    // A tap on the mark already read lets it go; a tap anywhere else reads the nearest.
    if (press.wasChosen) setChosen(null);
    else if (event.pointerType !== "mouse") choose(indexAt(event), true);
  };
  const onPointerLeave = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse" && !selected?.pinned) setChosen(null);
  };

  const step = (from: number | null, direction: 1 | -1): number | null => {
    for (
      let index = from === null ? (direction === 1 ? 0 : count - 1) : from + direction;
      index >= 0 && index < count;
      index += direction
    )
      if (readable[index] !== null) return index;
    return from;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!hasData) return;
    const keys: Record<string, () => number | null> = {
      ArrowRight: () => step(selected?.index ?? null, 1),
      ArrowLeft: () => step(selected?.index ?? null, -1),
      Home: () => step(null, 1),
      End: () => step(null, -1),
    };
    if (event.key in keys) {
      event.preventDefault();
      choose(keys[event.key]!(), true);
    } else if (event.key === "Escape" && selected) {
      event.preventDefault();
      setChosen(null);
    } else if (event.key === "Enter" && selected) {
      // Head to head: the first line's record, or the second's where only it has one.
      const read = describe(selected.index);
      const href = read.href ?? read.against?.href;
      if (href) router.push(href);
    }
  };

  const readout = selected ? describe(selected.index) : summary;

  return (
    <div
      ref={root}
      className={cn(
        "graph",
        shared?.pending && "opacity-50 transition-opacity duration-[var(--ov-duration-feedback)]",
        className,
      )}
    >
      <div id={readoutId} className="graph-readout" aria-live="polite">
        <p className="graph-readout-head">
          <span className="graph-readout-label">{readout.label}</span>
          {note && !selected && (
            <InfoTip label={note.label} className="graph-readout-note">
              {note.content}
            </InfoTip>
          )}
        </p>
        {against && second ? (
          <div className="graph-readout-pair">
            <ReadoutSide
              name={against.names[0]}
              line="first"
              side={readout}
              reading={selected !== null}
            />
            <ReadoutSide
              name={against.names[1]}
              line="second"
              side={readout.against ?? { figure: null }}
              reading={selected !== null}
            />
          </div>
        ) : (
          <div className="graph-readout-body">
            <p className="graph-readout-value">
              {readout.figure === null ? (
                <span className="type-figure-l">—</span>
              ) : (
                <Figure text={readout.figure} unit={readout.unit} />
              )}
              {/* Held even when empty, so a mark without a second line keeps the figure in place. */}
              <span className="graph-readout-context">{readout.context || "\u00a0"}</span>
            </p>
            {selected && readout.href && (
              <Link href={readout.href} className="graph-readout-open">
                {readout.action ?? "Open"}
                <Glyph name="chevronRight" className="glyph-18" />
              </Link>
            )}
          </div>
        )}
      </div>

      <div
        ref={holder}
        className="graph-plot"
        style={{ height: HEIGHT }}
        tabIndex={hasData ? 0 : -1}
        role="group"
        aria-roledescription="graph"
        aria-label={`${name}. ${hasData ? "Arrow keys read each mark; the values are listed below." : empty}`}
        aria-describedby={readoutId}
        onKeyDown={onKeyDown}
      >
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          aria-hidden
          className="block w-full touch-pan-y overflow-visible select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (drag.current = null)}
          onPointerLeave={onPointerLeave}
        >
          {/* The scale: its round values as hairlines, their labels in the margin. */}
          {shownTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={left - 4}
                x2={frame.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--ov-hair)"
                strokeWidth={1}
              />
              {/* The rule's own label takes its place where the two would touch. */}
              {!(hasData && rule && Math.abs(y(tick) - y(rule.value)) < 1.6 * px) && (
                <text x={0} y={y(tick) + 4} style={LABEL}>
                  {format(tick)}
                </text>
              )}
            </g>
          ))}
          {/* A bar stands on a baseline; a line floats, and has none. */}
          {(bars || !hasData) && (
            <line
              x1={left - 4}
              x2={frame.right}
              y1={frame.bottom}
              y2={frame.bottom}
              stroke="var(--ov-hair)"
              strokeWidth={1}
            />
          )}
          {/* The mark being read, found by its column. */}
          {selected && (
            <line
              x1={xs[selected.index]}
              x2={xs[selected.index]}
              y1={frame.top - 6}
              y2={frame.bottom}
              stroke="var(--ov-control)"
              strokeWidth={1}
            />
          )}
          {hasData && rule && (
            <g>
              <line
                x1={left - 4}
                x2={frame.right}
                y1={y(rule.value)}
                y2={y(rule.value)}
                stroke="var(--ov-ink)"
                strokeWidth={1}
              />
              <text
                x={0}
                y={y(rule.value) + 4}
                style={{ ...LABEL, fontWeight: 700, fill: "var(--ov-ink)" }}
              >
                {rule.label}
              </text>
            </g>
          )}
          {bars &&
            data.map((datum, index) => {
              if (datum.value === null || datum.value <= 0) return null;
              const top = y(datum.value);
              return (
                <path
                  key={`${datum.date}-${index}`}
                  d={barPath(xs[index]! - layout.bar / 2, top, layout.bar, frame.bottom - top)}
                  style={{ fill: index === inked ? "var(--ov-ink)" : "var(--ov-control)" }}
                />
              );
            })}
          {/* A head to head's second line, in grey under the first, joined as records are. */}
          {secondKnown.length > 1 && (
            <path
              d={linePath(secondKnown)}
              fill="none"
              stroke="var(--ov-series-2)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {secondKnown.map((point) =>
            point.index === secondInked ? null : secondKnown.length <= 40 ? (
              <circle
                key={point.index}
                cx={point.x}
                cy={point.y}
                r={2.6}
                style={{ fill: "var(--ov-ground)", stroke: "var(--ov-series-2)" }}
                strokeWidth={1.6}
              />
            ) : null,
          )}
          {secondInked >= 0 && secondPoints[secondInked] && (
            <circle
              cx={secondPoints[secondInked]!.x}
              cy={secondPoints[secondInked]!.y}
              r={selected ? 6 : 5}
              style={{ fill: "var(--ov-series-2)", stroke: "var(--ov-ground)" }}
              strokeWidth={2}
            />
          )}
          {!bars && known.length > 1 && (
            <path
              d={linePath(placement === "record" || join ? known : points)}
              fill="none"
              stroke="var(--ov-ink)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {!bars &&
            known.map((point) =>
              point.index === inked ? null : sparse || known.length === 1 ? (
                <circle
                  key={point.index}
                  cx={point.x}
                  cy={point.y}
                  r={2.6}
                  style={{ fill: "var(--ov-ground)", stroke: "var(--ov-ink)" }}
                  strokeWidth={1.6}
                />
              ) : null,
            )}
          {!bars && inked >= 0 && points[inked] && (
            <circle
              cx={points[inked]!.x}
              cy={points[inked]!.y}
              r={selected ? 6 : 5}
              style={{ fill: "var(--ov-ink)", stroke: "var(--ov-ground)" }}
              strokeWidth={2}
            />
          )}
          {ticksX.map((tick) => (
            <text key={tick.date} x={tick.x} y={HEIGHT - 6} style={LABEL}>
              {tick.label}
            </text>
          ))}
        </svg>
        {!hasData && (
          <p className="graph-empty" style={{ left, bottom: DATE_ROW }}>
            {empty}
          </p>
        )}
      </div>

      <RangeSpans name={name} />

      {hasData && (
        <GraphValues
          data={data}
          filled={filled}
          describe={describe}
          name={name}
          names={second ? against?.names : undefined}
        />
      )}
    </div>
  );
}

/**
 * A figure as the readout sets it: its numbers in the figures' face, any words in it ("3 h 15
 * min") and its unit set as units are, smaller and in ink 2.
 */
function Figure({ text, unit }: { text: string; unit?: string }) {
  return (
    <span className="whitespace-nowrap">
      {text
        .split(/(\d[\d.,:]*)/)
        .filter(Boolean)
        .map((part, index) =>
          /\d/.test(part) ? (
            <span key={index} className="type-figure-l">
              {part}
            </span>
          ) : (
            <span key={index} className="graph-readout-unit">
              {part}
            </span>
          ),
        )}
      {unit && <span className="graph-readout-unit"> {unit}</span>}
    </span>
  );
}

/**
 * One line's figure in a head-to-head readout, under its name and its line's key. While a mark
 * is read and the line has a record there, the figure is the way into it.
 */
function ReadoutSide({
  name,
  line,
  side,
  reading,
}: {
  name: string;
  line: "first" | "second";
  side: GraphSide;
  reading: boolean;
}) {
  const href = reading ? side.href : undefined;
  const value = (
    <>
      {side.figure === null ? (
        // Set as a figure with its unit is, so the line under it stands level with the other's.
        <span className="whitespace-nowrap">
          <span className="type-figure-l">—</span>
          <span className="graph-readout-unit">{"\u00a0"}</span>
        </span>
      ) : (
        <Figure text={side.figure} unit={side.unit} />
      )}
      {href ? (
        <span className="graph-side-action">
          {side.action ?? "Open"}
          <Glyph name="chevronRight" className="glyph-16" />
        </span>
      ) : (
        <span className="graph-readout-context">{side.context || "\u00a0"}</span>
      )}
    </>
  );
  return (
    <div className="graph-side">
      <p className="graph-side-name">
        <span className="graph-side-key" data-line={line} aria-hidden />
        <span className="graph-side-label">{name}</span>
      </p>
      {href ? (
        <Link href={href} className="graph-side-value">
          <span className="sr-only">{name}: </span>
          {value}
        </Link>
      ) : (
        <p className="graph-side-value">{value}</p>
      )}
    </div>
  );
}

/**
 * The spans every graph offers (ADR 0042), under its plot: the same five on every graph,
 * remembered for every graph once chosen. None is chosen while dates chosen by hand hold.
 */
export function RangeSpans({ name, className }: { name: string; className?: string }) {
  const shared = useGraphRange();
  if (!shared) return null;
  return (
    <div className={cn("graph-spans", className)}>
      <SegmentedControl<RangePreset | "">
        name={`${name}-span`}
        aria-label="Span"
        options={RANGE_PRESETS.map((preset) => ({
          value: preset,
          label: RANGE_PRESET_LABELS[preset].short,
          accessibleLabel: RANGE_PRESET_LABELS[preset].long,
        }))}
        value={shared.preset ?? ""}
        onChange={(preset) => {
          if (preset) shared.choose(preset);
        }}
        columns={RANGE_PRESETS.length}
      />
    </div>
  );
}

/**
 * Every value a graph draws, newest first, behind one row (board Body: View values): the plot
 * is for the shape, this is for the numbers, and it is how a screen reader reads them. A value
 * with a record behind it opens it.
 */
function GraphValues({
  data,
  filled,
  describe,
  name,
  names,
}: {
  data: readonly GraphDatum[];
  /** Whether a mark has anything in it to list. */
  filled: (index: number) => boolean;
  describe: (index: number) => GraphReadout;
  name: string;
  /** Head to head: both lines' values, a column each under its name. */
  names?: readonly [string, string];
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const id = useId();
  const indices = data
    .map((_, index) => (filled(index) ? index : -1))
    .filter((index) => index >= 0)
    .reverse();
  const shown = all ? indices : indices.slice(0, FIRST_VALUES);
  return (
    <div className="chart-values">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        className="chart-values-button"
      >
        <span className="mark-cell">
          <Glyph name="table" className="glyph-20" />
        </span>
        <span className="min-w-0 flex-1 text-left font-bold">
          View values<span className="sr-only"> of {name.toLowerCase()}</span>
        </span>
        <span className="type-meta-small font-semibold text-ink-2 tabular-nums">
          {indices.length}
        </span>
        <Glyph name={open ? "chevronUp" : "chevronDown"} className="glyph-18" />
      </button>
      {open && (
        <ul id={id} className="graph-values-list">
          {names && (
            <li aria-hidden className="graph-value-row graph-value-head">
              <span />
              <span className="graph-value-pair">
                {names.map((person, side) => (
                  <span key={side} className="graph-value-cell">
                    <span className="graph-value-name">
                      <span
                        className="graph-side-key"
                        data-line={side === 0 ? "first" : "second"}
                      />
                      {person}
                    </span>
                  </span>
                ))}
              </span>
            </li>
          )}
          {shown.map((index) => {
            const row = describe(index);
            if (names)
              return (
                <li key={`${data[index]!.date}-${index}`} className="graph-value-row">
                  <span className="min-w-0 text-ink-2">{row.label}</span>
                  <span className="graph-value-pair">
                    {[row, row.against ?? { figure: null }].map((side, i) => {
                      const content = (
                        <>
                          <span className="sr-only">{names[i]}: </span>
                          {side.figure ?? "—"}
                          {side.figure !== null && side.unit ? ` ${side.unit}` : ""}
                          {/* Where a value has no record, the chevron's room keeps the columns. */}
                          {side.href ? (
                            <Glyph name="chevronRight" className="glyph-16 text-ink-2" />
                          ) : (
                            <span className="graph-value-spacer" />
                          )}
                        </>
                      );
                      return side.href ? (
                        <Link key={i} href={side.href} className="graph-value-cell">
                          {content}
                        </Link>
                      ) : (
                        <span key={i} className="graph-value-cell">
                          {content}
                        </span>
                      );
                    })}
                  </span>
                </li>
              );
            const content = (
              <>
                <span className="flex min-w-0 flex-col">
                  <span className="text-ink-2">{row.label}</span>
                  {row.context && (
                    <span className="type-caption font-medium text-ink-2">{row.context}</span>
                  )}
                </span>
                <span className="graph-value-figure">
                  {row.figure ?? "—"}
                  {row.figure !== null && row.unit ? ` ${row.unit}` : ""}
                  {row.href && <Glyph name="chevronRight" className="glyph-16 text-ink-2" />}
                </span>
              </>
            );
            return (
              <li key={`${data[index]!.date}-${index}`}>
                {row.href ? (
                  <Link href={row.href} className="graph-value-row">
                    {content}
                  </Link>
                ) : (
                  <span className="graph-value-row">{content}</span>
                )}
              </li>
            );
          })}
          {!all && indices.length > FIRST_VALUES && (
            <li>
              <button type="button" className="graph-value-more" onClick={() => setAll(true)}>
                Show all {indices.length}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
