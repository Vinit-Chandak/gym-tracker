"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Glyph } from "@/components/ui/glyphs";
import { Select } from "@/components/ui/select";
import { STEP_PHASES, type StepPhase } from "@/domain/activity-prescription";
import { LAP_LIMIT } from "@/domain/activity-limits";
import { formatPaceSeconds, pacePerUnit, paceSecondsPerKm } from "@/domain/activity-metrics";
import { toMetres, type DistanceUnit } from "@/lib/distance-units";
import { readPostedLaps, type LapUnit, type PlannedLap, type PostedLap } from "@/lib/run-laps";

import { clockEntry, formatDuration, parseDuration } from "./activity-form-fields";
import { PHASE_LABELS } from "./activity-plan";

/**
 * A run's laps (ADR 0059): the reps of an interval session, the jogs between them, the miles of
 * a long run — as a watch lists them, typed in from it. Each lap is a distance, a time, or both,
 * with its heart rate if the watch had one.
 *
 * A planned session can lay its reps out as empty laps, each with what the plan asked for shown
 * in its fields as a placeholder and never as a value: the plan is not what happened
 * (ACTUAL-01). A timed rep left without a distance stays a timed rep; "Add lap" copies the
 * previous lap's kind and the distance the athlete typed there, which is how 6 × 800 m is
 * typed once and timed six times.
 */

type LapRow = {
  key: string;
  phase: StepPhase | "";
  distance: string;
  unit: LapUnit;
  duration: string;
  averageHeartRate: string;
  maxHeartRate: string;
  /** What the plan asked of this lap, shown in its empty fields. */
  asked?: PlannedLap["asked"];
};

let rowCounter = 0;
const nextKey = () => `lap-${++rowCounter}`;

function rowFromPosted(lap: PostedLap): LapRow {
  return {
    key: nextKey(),
    phase: lap.phase ?? "",
    distance: lap.distanceValue === null ? "" : String(lap.distanceValue),
    unit: lap.distanceUnit,
    duration: lap.durationMs === null ? "" : formatDuration(lap.durationMs / 1000),
    averageHeartRate: lap.averageHeartRate === null ? "" : String(lap.averageHeartRate),
    maxHeartRate: lap.maxHeartRate === null ? "" : String(lap.maxHeartRate),
  };
}

const typedNumber = (value: string): number | null => {
  const text = value.trim().replace(",", ".");
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const typedBeats = (value: string): number | null => {
  const parsed = typedNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};

function posted(row: LapRow): PostedLap {
  const seconds = parseDuration(row.duration);
  return {
    phase: row.phase === "" ? null : row.phase,
    distanceValue: typedNumber(row.distance),
    distanceUnit: row.unit,
    durationMs: seconds === null || seconds === 0 ? null : Math.round(seconds * 1000),
    averageHeartRate: typedBeats(row.averageHeartRate),
    maxHeartRate: typedBeats(row.maxHeartRate),
  };
}

/** What a typed lap cannot be read as, said under it rather than refused at Save. */
function rowProblem(row: LapRow): string | null {
  if (row.distance.trim() !== "" && typedNumber(row.distance) === null)
    return "The distance is not a number.";
  if (row.duration.trim() !== "" && parseDuration(row.duration) === null)
    return "The time is not a time.";
  for (const value of [row.averageHeartRate, row.maxHeartRate])
    if (value.trim() !== "" && typedBeats(value) === null)
      return "Heart rate is whole beats a minute.";
  return null;
}

function lapPace(lap: PostedLap, readIn: DistanceUnit): string | null {
  if (lap.distanceValue === null || lap.durationMs === null) return null;
  const pace = pacePerUnit(
    paceSecondsPerKm(toMetres(lap.distanceValue, lap.distanceUnit), lap.durationMs),
    readIn,
  );
  return pace === null ? null : `${formatPaceSeconds(pace)} /${readIn}`;
}

/** "6 work laps · average 2:58 · 3:43 /km": what the reps came to, from the laps with a time. */
function workSummary(laps: readonly PostedLap[], readIn: DistanceUnit): string | null {
  const work = laps.some((lap) => lap.phase === "work")
    ? laps.filter((lap) => lap.phase === "work")
    : laps;
  const timed = work.filter((lap) => lap.durationMs !== null);
  if (timed.length < 2) return null;
  const totalMs = timed.reduce((sum, lap) => sum + lap.durationMs!, 0);
  const parts = [
    `${work.length} ${work === laps ? "laps" : "work laps"}`,
    `average ${formatDuration(Math.round(totalMs / timed.length / 1000))}`,
  ];
  const measured = timed.filter((lap) => lap.distanceValue !== null);
  if (measured.length === timed.length) {
    const metres = measured.reduce(
      (sum, lap) => sum + toMetres(lap.distanceValue!, lap.distanceUnit),
      0,
    );
    const pace = pacePerUnit(paceSecondsPerKm(metres, totalMs), readIn);
    if (pace !== null) parts.push(`${formatPaceSeconds(pace)} /${readIn}`);
  }
  return parts.join(" · ");
}

function askedDistance(asked: PlannedLap["asked"] | undefined): string | undefined {
  return asked && "distanceValue" in asked ? String(asked.distanceValue) : undefined;
}

function askedTime(asked: PlannedLap["asked"] | undefined): string | undefined {
  return asked && "durationMs" in asked ? formatDuration(asked.durationMs / 1000) : undefined;
}

export function LapsEditor({
  initial,
  planned,
  readIn,
  error,
}: {
  /** The posted list the form opened on: a draft's, a refused save's or a saved run's. */
  initial: string | undefined;
  /** The planned session's steps, offered as empty laps; none for an unplanned run. */
  planned: readonly PlannedLap[];
  readIn: DistanceUnit;
  error?: string;
}) {
  const id = useId();
  const [rows, setRows] = useState<LapRow[]>(() => readPostedLaps(initial).map(rowFromPosted));
  const [open, setOpen] = useState(() => rows.length > 0 || Boolean(error));
  const postedRows = rows.map(posted);
  const summary = workSummary(postedRows, readIn);

  function change(key: string, patch: Partial<LapRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function add() {
    setRows((current) => {
      const last = current.at(-1);
      return [
        ...current,
        {
          key: nextKey(),
          phase: last?.phase ?? "",
          // The athlete's own distance, carried forward: a rep typed once is the next rep's too.
          distance: last?.distance ?? "",
          unit: last?.unit ?? (readIn === "mi" ? "mi" : "m"),
          duration: "",
          averageHeartRate: "",
          maxHeartRate: "",
          asked: last?.asked,
        },
      ];
    });
  }
  function layOut() {
    setRows(
      planned.slice(0, LAP_LIMIT).map((lap) => ({
        key: nextKey(),
        phase: lap.phase,
        distance: "",
        unit: "distanceUnit" in lap.asked ? lap.asked.distanceUnit : readIn === "mi" ? "mi" : "m",
        duration: "",
        averageHeartRate: "",
        maxHeartRate: "",
        asked: lap.asked,
      })),
    );
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="more-details"
      data-field-error={error ? "true" : undefined}
    >
      <summary className="more-details-summary">
        <Glyph name={open ? "minus" : "plus"} className="glyph-20" />
        Laps and intervals
        {rows.length > 0 && <span className="laps-count">{rows.length}</span>}
      </summary>
      <input type="hidden" name="laps" value={rows.length > 0 ? JSON.stringify(postedRows) : ""} />
      <div className="space-y-3 pt-1 pb-2">
        <p className="type-caption text-ink-2">
          From your watch: each lap or rep as a distance, a time or both. Leave out what it did not
          record.
        </p>
        {rows.length === 0 && planned.length > 0 && (
          <Button variant="secondary" onClick={layOut}>
            Lay out the plan’s {planned.length} laps
          </Button>
        )}
        {rows.length > 0 && (
          <ol className="laps" aria-describedby={error ? `${id}-error` : undefined}>
            {rows.map((row, index) => {
              const problem = rowProblem(row);
              const pace = lapPace(postedRows[index]!, readIn);
              return (
                <li key={row.key} className="lap-row">
                  <div className="lap-row-head">
                    <span className="lap-row-number">Lap {index + 1}</span>
                    <Select
                      aria-label={`Lap ${index + 1} kind`}
                      value={row.phase}
                      onChange={(event) =>
                        change(row.key, { phase: event.target.value as StepPhase | "" })
                      }
                      className="lap-row-phase"
                    >
                      <option value="">Lap</option>
                      {STEP_PHASES.map((phase) => (
                        <option key={phase} value={phase}>
                          {PHASE_LABELS[phase]}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove lap ${index + 1}`}
                      onClick={() =>
                        setRows((current) => current.filter((entry) => entry.key !== row.key))
                      }
                    >
                      <Glyph name="close" className="glyph-20" />
                    </button>
                  </div>
                  <div className="lap-row-fields">
                    <Field label="Distance">
                      <Input
                        inputMode="decimal"
                        value={row.distance}
                        placeholder={askedDistance(row.asked) ?? "—"}
                        onChange={(event) => change(row.key, { distance: event.target.value })}
                      />
                    </Field>
                    <Field label="Unit">
                      <Select
                        value={row.unit}
                        onChange={(event) =>
                          change(row.key, { unit: event.target.value as LapUnit })
                        }
                      >
                        <option value="m">m</option>
                        <option value="km">km</option>
                        <option value="mi">mi</option>
                      </Select>
                    </Field>
                    <Field label="Time">
                      <Input
                        inputMode="numeric"
                        value={row.duration}
                        placeholder={askedTime(row.asked) ?? "0:00"}
                        onChange={(event) =>
                          change(row.key, { duration: clockEntry(event.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Avg HR">
                      <Input
                        inputMode="numeric"
                        value={row.averageHeartRate}
                        placeholder="—"
                        onChange={(event) =>
                          change(row.key, { averageHeartRate: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Max HR">
                      <Input
                        inputMode="numeric"
                        value={row.maxHeartRate}
                        placeholder="—"
                        onChange={(event) => change(row.key, { maxHeartRate: event.target.value })}
                      />
                    </Field>
                  </div>
                  {(problem || pace) && (
                    <p
                      className={problem ? "type-meta-small font-semibold" : "lap-row-pace"}
                      role={problem ? "alert" : undefined}
                    >
                      {problem ?? `Pace ${pace}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {summary && (
          <p role="status" className="type-meta text-ink-2 tabular-nums">
            {summary}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} role="alert" className="type-meta-small font-semibold">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={add} disabled={rows.length >= LAP_LIMIT}>
            Add lap
          </Button>
          {rows.length > 0 && (
            <Button variant="ghost" onClick={() => setRows([])}>
              Clear laps
            </Button>
          )}
        </div>
      </div>
    </details>
  );
}
