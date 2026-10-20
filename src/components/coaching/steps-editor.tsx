"use client";

import { useState, type ComponentProps } from "react";

import {
  clockEntry,
  formatDuration,
  parseDuration,
} from "@/components/activities/activity-form-fields";
import { PHASE_WORDS, paceRangeLine } from "@/components/activities/prescription-lines";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Glyph } from "@/components/ui/glyphs";
import { Select } from "@/components/ui/select";
import {
  DISTANCE_METRES,
  DURATION_MS,
  PACE_TARGET_SECONDS_PER_KM,
  PRESCRIPTION_LIMITS,
  TEXT_LIMITS,
} from "@/domain/activity-limits";
import { pacePerUnit } from "@/domain/activity-metrics";
import {
  STEP_PHASES,
  type PrescriptionNode,
  type PrescriptionRepeat,
  type PrescriptionStep,
  type StepPhase,
} from "@/domain/activity-prescription";
import { ZONE_NAMES, zoneRangeLabel, type ZoneNumber } from "@/domain/heart-rate";
import {
  METRES_PER_MILE,
  fromMetres,
  roundTo,
  toMetres,
  type DistanceUnit,
} from "@/lib/distance-units";

/**
 * A run's steps, written by hand (ADR 0059): a warm-up, the work — one step, or a repeated block
 * of a rep and its recovery — and a cool-down, in the order they are run.
 *
 * Each step ends one way, after a time or after a distance, which is how a watch runs it: "6 ×
 * 800 m" ends each rep at 800 metres, "8 × 2 min" at two minutes. A step may ask for a pace or a
 * heart-rate zone; a recovery is a jog, a walk or standing still. One level of repeats, as the
 * schema allows, and the schema's limits.
 *
 * A figure is typed freely and read when its field is left. One the session cannot hold — a
 * pace of a minute a kilometre, a rep of no distance — goes back to the last one it could.
 */

type Range = [number, number];

/** A pair from its first figure and an optional second, low to high. */
const pair = (low: number, high: number | null): Range =>
  high === null ? [low, low] : low <= high ? [low, high] : [high, low];

/** A new first figure moves a single value whole and keeps a range's other end. */
const withFirst = (current: Range | undefined, value: number): Range =>
  !current || current[0] === current[1] ? [value, value] : pair(value, current[1]);

let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++counter}`;

const DEFAULT_MINUTES: Record<StepPhase, number> = {
  warmup: 10,
  work: 3,
  recovery: 2,
  cooldown: 10,
};

function blankStep(phase: StepPhase): PrescriptionStep {
  return {
    kind: "step",
    id: newId(phase),
    phase,
    action: "run",
    target:
      phase === "work"
        ? { kind: "distance", metres: [800, 800], unit: "m" }
        : {
            kind: "duration",
            ms: [DEFAULT_MINUTES[phase] * 60_000, DEFAULT_MINUTES[phase] * 60_000],
          },
    effort: null,
    stroke: null,
    notes: null,
  };
}

function blankRepeat(): PrescriptionRepeat {
  return {
    kind: "repeat",
    id: newId("repeat"),
    repetitions: 6,
    restBetweenMs: null,
    steps: [blankStep("work"), blankStep("recovery")],
  };
}

/** How a step ends: after a time, or after a distance in metres or the athlete's own unit. */
type Measure = "duration" | "m" | DistanceUnit;

const MEASURE_WORDS: Record<Measure, string> = {
  duration: "Time",
  m: "Metres",
  km: "Kilometres",
  mi: "Miles",
};

/** A distance reads in metres when it was written so, or is under a kilometre and unmarked. */
function measureOf(step: PrescriptionStep, unit: DistanceUnit): Measure {
  if (step.target.kind === "duration") return "duration";
  const { unit: written, metres } = step.target;
  return written === "m" || (written === undefined && metres[1] < 1000) ? "m" : unit;
}

/** "4:05" a kilometre or mile, from seconds per kilometre. */
const paceText = (secondsPerKm: number, unit: DistanceUnit) =>
  formatDuration(Math.round(pacePerUnit(secondsPerKm, unit)!));

/** Seconds per kilometre from "4:05" a kilometre or mile, or null when it is not a pace. */
function paceFrom(text: string, unit: DistanceUnit): number | null {
  const seconds = parseDuration(text);
  if (seconds === null) return null;
  const perKm =
    Math.round((unit === "mi" ? seconds / (METRES_PER_MILE / 1000) : seconds) * 10) / 10;
  return perKm >= PACE_TARGET_SECONDS_PER_KM.min && perKm <= PACE_TARGET_SECONDS_PER_KM.max
    ? perKm
    : null;
}

/**
 * A field that is typed in freely and read on leaving it: while it is being typed in it shows
 * what is typed, and otherwise what is stored. A clock field takes digits as the log form's
 * do, so 405 is 4:05.
 */
function TypedInput({
  value,
  onCommit,
  clock = false,
  ...props
}: Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (text: string) => void;
  clock?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      {...props}
      value={draft ?? value}
      onChange={(event) => setDraft(clock ? clockEntry(event.target.value) : event.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
    />
  );
}

const ZONES = [1, 2, 3, 4, 5] as const satisfies readonly ZoneNumber[];

/**
 * A pace and a heart-rate zone, each one figure or a range, for a step or a whole run. Neither
 * is required, and either may be cleared; a pace reads fastest first.
 */
export function PaceZoneFields({
  pace,
  zones,
  unit,
  onChange,
}: {
  pace: Range | undefined;
  zones: Range | undefined;
  unit: DistanceUnit;
  onChange: (next: { pace: Range | undefined; zones: Range | undefined }) => void;
}) {
  return (
    <div className="step-editor-fields">
      <Field label={`Pace per ${unit}`} aside="Optional">
        <TypedInput
          clock
          inputMode="numeric"
          placeholder="m:ss"
          value={pace ? paceText(pace[0], unit) : ""}
          onCommit={(text) => {
            if (text.trim() === "") return onChange({ pace: undefined, zones });
            const value = paceFrom(text, unit);
            if (value !== null) onChange({ pace: withFirst(pace, value), zones });
          }}
        />
      </Field>
      <Field label="Pace up to" aside="Optional">
        <TypedInput
          clock
          inputMode="numeric"
          placeholder="m:ss"
          disabled={!pace}
          value={pace && pace[1] !== pace[0] ? paceText(pace[1], unit) : ""}
          onCommit={(text) => {
            if (!pace) return;
            if (text.trim() === "") return onChange({ pace: [pace[0], pace[0]], zones });
            const value = paceFrom(text, unit);
            if (value !== null) onChange({ pace: pair(pace[0], value), zones });
          }}
        />
      </Field>
      <Field label="Zone" aside="Optional">
        <Select
          value={zones ? String(zones[0]) : ""}
          onChange={(event) => {
            const zone = Number(event.target.value);
            onChange({ pace, zones: zone ? withFirst(zones, zone) : undefined });
          }}
        >
          <option value="">None</option>
          {ZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone} · {ZONE_NAMES[zone]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Zone up to" aside="Optional">
        <Select
          disabled={!zones}
          value={zones && zones[1] !== zones[0] ? String(zones[1]) : ""}
          onChange={(event) => {
            if (!zones) return;
            const zone = Number(event.target.value);
            onChange({ pace, zones: zone ? pair(zones[0], zone) : [zones[0], zones[0]] });
          }}
        >
          <option value="">Same</option>
          {ZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone} · {ZONE_NAMES[zone]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

/** The step's pace, zone and note in a few words, for the line that folds them away. */
function intensitySummary(step: PrescriptionStep, unit: DistanceUnit): string {
  const parts = [
    step.paceSecondsPerKm ? paceRangeLine(step.paceSecondsPerKm, { distanceUnit: unit }) : null,
    step.heartRateZones ? zoneRangeLabel(step.heartRateZones) : null,
    step.notes ? "Note" : null,
  ].filter((part) => part !== null);
  if (parts.length > 0) return parts.join(" · ");
  return step.action === "rest" ? "Add a note" : "Add a pace, zone or note";
}

const ACTION_WORDS = (phase: StepPhase) =>
  [
    { value: "run", label: phase === "recovery" ? "Jog" : "Run" },
    { value: "walk", label: "Walk" },
    { value: "rest", label: "Stand" },
  ] as const;

type Placement = {
  /** Where it is: "step 2", or "the rep of step 2". */
  name: string;
  onMove?: (by: -1 | 1) => void;
  canMove: { up: boolean; down: boolean };
  onRemove?: () => void;
};

function NodeHead({ title, placement }: { title: string; placement: Placement }) {
  return (
    <div className="step-editor-head">
      <span className="step-editor-title">{title}</span>
      {placement.onMove && (
        <>
          <button
            type="button"
            className="icon-button"
            aria-label={`Move ${placement.name} up`}
            disabled={!placement.canMove.up}
            onClick={() => placement.onMove!(-1)}
          >
            <Glyph name="chevronUp" className="glyph-20" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Move ${placement.name} down`}
            disabled={!placement.canMove.down}
            onClick={() => placement.onMove!(1)}
          >
            <Glyph name="chevronDown" className="glyph-20" />
          </button>
        </>
      )}
      {placement.onRemove && (
        <button
          type="button"
          className="icon-button"
          aria-label={`Remove ${placement.name}`}
          onClick={placement.onRemove}
        >
          <Glyph name="close" className="glyph-20" />
        </button>
      )}
    </div>
  );
}

function StepFields({
  step,
  unit,
  title,
  placement,
  onChange,
}: {
  step: PrescriptionStep;
  unit: DistanceUnit;
  title: string;
  placement: Placement;
  onChange: (step: PrescriptionStep) => void;
}) {
  const measure = measureOf(step, unit);
  const range: Range = step.target.kind === "duration" ? step.target.ms : step.target.metres;
  const shown = (value: number) =>
    measure === "duration"
      ? formatDuration(value / 1000)
      : String(roundTo(fromMetres(value, measure), measure === "m" ? 0 : 2));
  /** The stored figure for what is typed, or null when the step cannot ask for it. */
  function read(text: string): number | null {
    if (measure === "duration") {
      const seconds = parseDuration(text);
      if (seconds === null) return null;
      const ms = Math.round(seconds * 1000);
      return ms >= DURATION_MS.min && ms <= DURATION_MS.max ? ms : null;
    }
    const value = Number(text.trim().replace(",", "."));
    if (text.trim() === "" || !Number.isFinite(value) || value <= 0) return null;
    const metres = roundTo(toMetres(value, measure), 1);
    return metres > 0 && metres <= DISTANCE_METRES.running.max ? metres : null;
  }
  function setRange(next: Range) {
    onChange({
      ...step,
      target:
        measure === "duration"
          ? { kind: "duration", ms: next }
          : { kind: "distance", metres: next, unit: measure },
    });
  }
  function setMeasure(next: Measure) {
    if (next === measure) return;
    if (next === "duration") {
      const ms = DEFAULT_MINUTES[step.phase] * 60_000;
      onChange({ ...step, target: { kind: "duration", ms: [ms, ms] } });
      return;
    }
    // Between metres and kilometres the distance stays; from a time, one rep's usual length.
    const metres: Range =
      step.target.kind === "distance"
        ? step.target.metres
        : next === "m"
          ? [400, 400]
          : [toMetres(1, next), toMetres(1, next)];
    onChange({ ...step, target: { kind: "distance", metres, unit: next } });
  }
  const amountLabel = MEASURE_WORDS[measure];
  const clock = measure === "duration";
  return (
    <div className="step-editor">
      <NodeHead title={title} placement={placement} />
      <div className="step-editor-fields">
        <Field label="Part">
          <Select
            value={step.phase}
            onChange={(event) => onChange({ ...step, phase: event.target.value as StepPhase })}
          >
            {STEP_PHASES.map((phase) => (
              <option key={phase} value={phase}>
                {PHASE_WORDS[phase]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Doing">
          <Select
            value={step.action}
            onChange={(event) => {
              const action = event.target.value as PrescriptionStep["action"];
              // Standing still has no pace and no zone to hold.
              const { paceSecondsPerKm: _pace, heartRateZones: _zones, ...still } = step;
              onChange(action === "rest" ? { ...still, action } : { ...step, action });
            }}
          >
            {ACTION_WORDS(step.phase).map((action) => (
              <option key={action.value} value={action.value}>
                {action.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ends after">
          <Select value={measure} onChange={(event) => setMeasure(event.target.value as Measure)}>
            {(["duration", "m", unit] as const).map((option) => (
              <option key={option} value={option}>
                {MEASURE_WORDS[option]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="step-editor-fields">
        <Field label={amountLabel}>
          <TypedInput
            clock={clock}
            inputMode={clock ? "numeric" : "decimal"}
            value={shown(range[0])}
            onCommit={(text) => {
              const value = read(text);
              if (value !== null) setRange(withFirst(range, value));
            }}
          />
        </Field>
        <Field label={`${amountLabel} up to`} aside="Optional">
          <TypedInput
            clock={clock}
            inputMode={clock ? "numeric" : "decimal"}
            value={range[1] !== range[0] ? shown(range[1]) : ""}
            onCommit={(text) => {
              if (text.trim() === "") return setRange([range[0], range[0]]);
              const value = read(text);
              if (value !== null) setRange(pair(range[0], value));
            }}
          />
        </Field>
      </div>
      <details className="step-editor-more">
        <summary>{intensitySummary(step, unit)}</summary>
        <div className="space-y-3 pt-2">
          {step.action !== "rest" && (
            <PaceZoneFields
              pace={step.paceSecondsPerKm}
              zones={step.heartRateZones}
              unit={unit}
              onChange={({ pace, zones }) => {
                const { paceSecondsPerKm: _pace, heartRateZones: _zones, ...rest } = step;
                onChange({
                  ...rest,
                  ...(pace ? { paceSecondsPerKm: pace } : {}),
                  ...(zones ? { heartRateZones: zones } : {}),
                });
              }}
            />
          )}
          <Field label="Note" aside="Optional">
            <TypedInput
              maxLength={TEXT_LIMITS.stepNotes}
              placeholder="Relaxed and smooth"
              value={step.notes ?? ""}
              onCommit={(text) => onChange({ ...step, notes: text.trim() || null })}
            />
          </Field>
        </div>
      </details>
    </div>
  );
}

/** Steps a session has written, a block and each step in it counted once. */
const authoredCount = (nodes: readonly PrescriptionNode[]) =>
  nodes.reduce((count, node) => count + (node.kind === "repeat" ? 1 + node.steps.length : 1), 0);

/** A new node goes before a closing cool-down, so the work stays between warm-up and cool-down. */
function withNode(nodes: readonly PrescriptionNode[], node: PrescriptionNode): PrescriptionNode[] {
  const last = nodes.at(-1);
  const closing = last?.kind === "step" && last.phase === "cooldown";
  if (!closing || (node.kind === "step" && node.phase === "cooldown")) return [...nodes, node];
  return [...nodes.slice(0, -1), node, last];
}

function moved<T>(items: readonly T[], index: number, by: -1 | 1): T[] {
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(index + by, 0, item!);
  return next;
}

export function StepsEditor({
  nodes,
  onChange,
  unit,
}: {
  nodes: readonly PrescriptionNode[];
  onChange: (nodes: PrescriptionNode[]) => void;
  unit: DistanceUnit;
}) {
  const full = authoredCount(nodes) >= PRESCRIPTION_LIMITS.authoredNodes;
  const replace = (index: number, node: PrescriptionNode | null) =>
    onChange(
      node === null
        ? nodes.filter((_, i) => i !== index)
        : nodes.map((entry, i) => (i === index ? node : entry)),
    );
  const placement = (index: number): Placement => ({
    name: `step ${index + 1}`,
    onMove: (by) => onChange(moved(nodes, index, by)),
    canMove: { up: index > 0, down: index < nodes.length - 1 },
    onRemove: () => replace(index, null),
  });
  const nextPhase: StepPhase =
    nodes.length === 0
      ? "warmup"
      : nodes.some((node) => node.kind === "repeat" || node.phase === "work") &&
          !nodes.some((node) => node.kind === "step" && node.phase === "cooldown")
        ? "cooldown"
        : "work";
  return (
    <div className="space-y-3">
      {nodes.length === 0 && (
        <p className="text-sm text-ink-2">
          No steps: the run is its overall targets. Add steps for a warm-up, reps by time or
          distance, and a cool-down.
        </p>
      )}
      <ol className="space-y-3">
        {nodes.map((node, index) =>
          node.kind === "step" ? (
            <li key={node.id}>
              <StepFields
                step={node}
                unit={unit}
                title={`${index + 1}. ${PHASE_WORDS[node.phase]}`}
                placement={placement(index)}
                onChange={(step) => replace(index, step)}
              />
            </li>
          ) : (
            <li key={node.id} className="repeat-editor">
              <NodeHead
                title={`${index + 1}. Repeat ${node.repetitions} times`}
                placement={placement(index)}
              />
              <div className="step-editor-fields">
                <Field label="Times">
                  <TypedInput
                    inputMode="numeric"
                    value={String(node.repetitions)}
                    onCommit={(text) => {
                      const repetitions = Number(text.trim());
                      if (Number.isInteger(repetitions))
                        replace(index, {
                          ...node,
                          repetitions: Math.min(
                            PRESCRIPTION_LIMITS.repetitionsPerBlock,
                            Math.max(2, repetitions),
                          ),
                        });
                    }}
                  />
                </Field>
                {node.restBetweenMs !== null && (
                  <Field label="Rest between" hint="Clear it to rest in a recovery step instead.">
                    <TypedInput
                      clock
                      inputMode="numeric"
                      value={formatDuration(node.restBetweenMs / 1000)}
                      onCommit={(text) => {
                        const seconds = parseDuration(text);
                        replace(index, {
                          ...node,
                          restBetweenMs: seconds ? Math.round(seconds * 1000) : null,
                        });
                      }}
                    />
                  </Field>
                )}
              </div>
              <ol className="space-y-2">
                {node.steps.map((step, stepIndex) => (
                  <li key={step.id}>
                    <StepFields
                      step={step}
                      unit={unit}
                      title={PHASE_WORDS[step.phase]}
                      placement={{
                        name: `${PHASE_WORDS[step.phase].toLowerCase()} in step ${index + 1}`,
                        onMove: (by) =>
                          replace(index, { ...node, steps: moved(node.steps, stepIndex, by) }),
                        canMove: { up: stepIndex > 0, down: stepIndex < node.steps.length - 1 },
                        onRemove:
                          node.steps.length > 1
                            ? () =>
                                replace(index, {
                                  ...node,
                                  steps: node.steps.filter((_, i) => i !== stepIndex),
                                })
                            : undefined,
                      }}
                      onChange={(changed) =>
                        replace(index, {
                          ...node,
                          steps: node.steps.map((entry, i) => (i === stepIndex ? changed : entry)),
                        })
                      }
                    />
                  </li>
                ))}
              </ol>
              <Button
                variant="ghost"
                disabled={full}
                onClick={() =>
                  replace(index, {
                    ...node,
                    steps: [
                      ...node.steps,
                      blankStep(node.steps.at(-1)?.phase === "work" ? "recovery" : "work"),
                    ],
                  })
                }
              >
                Add a step to the block
              </Button>
            </li>
          ),
        )}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={full}
          onClick={() => onChange(withNode(nodes, blankStep(nextPhase)))}
        >
          Add step
        </Button>
        <Button
          variant="secondary"
          disabled={full || authoredCount(nodes) + 3 > PRESCRIPTION_LIMITS.authoredNodes}
          onClick={() => onChange(withNode(nodes, blankRepeat()))}
        >
          Add repeats
        </Button>
      </div>
    </div>
  );
}
