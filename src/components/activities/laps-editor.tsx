"use client";

import { useId, useState, type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Glyph } from "@/components/ui/glyphs";
import { Select } from "@/components/ui/select";
import { STEP_PHASES, type StepPhase } from "@/domain/activity-prescription";
import { LAP_LIMIT } from "@/domain/activity-limits";
import { formatPaceSeconds, pacePerUnit, paceSecondsPerKm } from "@/domain/activity-metrics";
import { toMetres, type DistanceUnit } from "@/lib/distance-units";
import {
  LAP_KIND_LABELS,
  readPostedLaps,
  STANDING,
  type LapUnit,
  type PlannedLap,
  type PostedLap,
} from "@/lib/run-laps";

import { clockEntry, formatDuration, parseDuration } from "./activity-form-fields";

/**
 * A run's laps (ADR 0059), as a watch lists them (owner, 21 October 2026): every part of the
 * session is a lap with a kind — a warm-up, a rep, the recovery after it, a cool-down — typed in
 * from the watch. Each lap is a distance, a time, or both, with its heart rate if the watch had
 * one; a recovery may be a time alone, a rest standing still, and its distance reads Standing.
 *
 * "+ Rep" copies the last rep's distance and unit, which is how 6 × 800 m is typed once and
 * timed six times; "+ Recovery" copies the last recovery's time, the rest a session repeats.
 *
 * A planned session can lay its steps out as empty laps, each with what the plan asked for shown
 * in its fields as a placeholder and never as a value: the plan is not what happened (ACTUAL-01).
 *
 * The rows are the run form's: what they add up to, and whether they make intervals, is read
 * there as they are typed (PRODUCT.md, principle 7).
 */

export type LapRow = {
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

/** The rows a form opens on: a draft's, a refused save's or a saved run's posted laps. */
export function lapRowsFrom(posted: string | undefined): LapRow[] {
  return readPostedLaps(posted).map(rowFromPosted);
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

/** What a row posts: the figures read from what was typed. */
export function postedLap(row: LapRow): PostedLap {
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

/** What a typed lap cannot be read as, said under it as it is typed rather than refused at Save. */
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

/**
 * "3 reps, average 1:58": how many reps there were and their average time, from the reps with a
 * time; the laps of a run with no reps, its splits, the same way. Their pace is the form's, in
 * its totals, and is not said again here.
 */
function lapSummary(laps: readonly PostedLap[]): string | null {
  const reps = laps.some((lap) => lap.phase === "work");
  const counted = reps ? laps.filter((lap) => lap.phase === "work") : laps;
  const timed = counted.filter((lap) => lap.durationMs !== null);
  if (timed.length < 2) return null;
  const totalMs = timed.reduce((sum, lap) => sum + lap.durationMs!, 0);
  return `${counted.length} ${reps ? "reps" : "laps"}, average ${formatDuration(
    Math.round(totalMs / timed.length / 1000),
  )}`;
}

function askedDistance(asked: PlannedLap["asked"] | undefined): string | undefined {
  return asked && "distanceValue" in asked ? String(asked.distanceValue) : undefined;
}

function askedTime(asked: PlannedLap["asked"] | undefined): string | undefined {
  return asked && "durationMs" in asked ? formatDuration(asked.durationMs / 1000) : undefined;
}

const LAP_PROBLEM = /^laps\.(\d+)(?:\.([A-Za-z]+))?$/;

/**
 * A refusal's sentences about each lap, by the row each was said of: the server names a lap by
 * where it stood when it was sent (`laps.2.time`), and `submitted` is the rows' keys at that
 * moment, so a lap removed or added since does not take another lap's sentence.
 */
function lapProblems(
  errors: Record<string, string> | undefined,
  submitted: readonly string[],
): Map<string, Record<string, string>> {
  const byRow = new Map<string, Record<string, string>>();
  for (const [field, message] of Object.entries(errors ?? {})) {
    const match = LAP_PROBLEM.exec(field);
    const key = match ? submitted[Number(match[1])] : undefined;
    if (!match || !key) continue;
    byRow.set(key, { ...byRow.get(key), [match[2] ?? "lap"]: message });
  }
  return byRow;
}

export function LapsEditor({
  rows,
  onRowsChange: setRows,
  planned,
  readIn,
  errors,
  submitted = [],
}: {
  rows: LapRow[];
  onRowsChange: Dispatch<SetStateAction<LapRow[]>>;
  /** The planned session's steps, offered as empty laps; none for an unplanned run. */
  planned: readonly PlannedLap[];
  readIn: DistanceUnit;
  /** The form's refused fields: the list's own (`laps`) and each lap's (`laps.2.time`). */
  errors?: Record<string, string>;
  /** The rows' keys when the refused save was sent, which its lap sentences are read against. */
  submitted?: readonly string[];
}) {
  const id = useId();
  const listError = errors?.laps;
  const problems = lapProblems(errors, submitted);
  const refused = Boolean(listError) || problems.size > 0;
  const [open, setOpen] = useState(() => rows.length > 0 || refused);
  // A refusal about a lap opens the laps on the render that first says it, as MoreDetails does.
  const [wasRefused, setWasRefused] = useState(refused);
  if (refused !== wasRefused) {
    setWasRefused(refused);
    if (refused) setOpen(true);
  }
  const postedRows = rows.map(postedLap);
  const summary = lapSummary(postedRows);
  const fallbackUnit: LapUnit = readIn === "mi" ? "mi" : "m";

  function change(key: string, patch: Partial<LapRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  const lastOf = (current: readonly LapRow[], phase: StepPhase) =>
    [...current].reverse().find((row) => row.phase === phase);
  function addRep() {
    setRows((current) => {
      const rep = lastOf(current, "work");
      return [
        ...current,
        {
          key: nextKey(),
          phase: "work",
          // The athlete's own distance, carried forward: a rep typed once is the next rep's too.
          distance: rep?.distance ?? "",
          unit: rep?.unit ?? current.at(-1)?.unit ?? fallbackUnit,
          duration: "",
          averageHeartRate: "",
          maxHeartRate: "",
          asked: rep?.asked,
        },
      ];
    });
  }
  function addRecovery() {
    setRows((current) => {
      const recovery = lastOf(current, "recovery");
      return [
        ...current,
        {
          key: nextKey(),
          phase: "recovery",
          // A rest is its time; its distance stays blank, read as Standing until one is typed.
          distance: "",
          unit: recovery?.unit ?? current.at(-1)?.unit ?? fallbackUnit,
          duration: recovery?.duration ?? "",
          averageHeartRate: "",
          maxHeartRate: "",
          asked: recovery?.asked,
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
        unit: "distanceUnit" in lap.asked ? lap.asked.distanceUnit : fallbackUnit,
        duration: "",
        averageHeartRate: "",
        maxHeartRate: "",
        asked: lap.asked,
      })),
    );
  }

  // What the plan asked of a lap still left empty: on a track, 800 m was 800 m.
  const fillable = rows.some(
    (row) =>
      row.asked !== undefined &&
      ("distanceValue" in row.asked ? row.distance : row.duration) === "",
  );
  /**
   * The plan's figure written into each lap that has none, at the athlete's word: they tap it
   * when they ran the laps as planned, and add what the watch says beside it. Nothing is filled
   * in without that tap (ACTUAL-01).
   */
  function fillPlanned() {
    setRows((current) =>
      current.map((row) => {
        if (!row.asked) return row;
        if ("distanceValue" in row.asked)
          return row.distance === ""
            ? { ...row, distance: String(row.asked.distanceValue), unit: row.asked.distanceUnit }
            : row;
        return row.duration === ""
          ? { ...row, duration: formatDuration(row.asked.durationMs / 1000) }
          : row;
      }),
    );
  }
  const full = rows.length >= LAP_LIMIT;

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="more-details"
      data-field-error={refused ? "true" : undefined}
    >
      <summary className="more-details-summary">
        <span className="min-w-0 flex-1">Laps and intervals</span>
        {rows.length > 0 && <span className="laps-count">{rows.length}</span>}
        <Glyph name="chevronDown" className="more-details-chevron glyph-20 shrink-0" />
      </summary>
      <input type="hidden" name="laps" value={rows.length > 0 ? JSON.stringify(postedRows) : ""} />
      {/* Each lap's fields say what they take, and the plan's figures show in them while they
          are empty; nothing here explains the watch. */}
      <div className="space-y-3 pt-1 pb-2">
        {rows.length === 0 && planned.length > 0 && (
          <Button variant="secondary" onClick={layOut}>
            Lay out the plan’s {planned.length} laps
          </Button>
        )}
        {fillable && (
          <Button variant="secondary" onClick={fillPlanned}>
            Fill in the planned distances and times
          </Button>
        )}
        {rows.length > 0 && (
          <ol className="laps" aria-describedby={listError ? `${id}-error` : undefined}>
            {rows.map((row, index) => {
              const number = index + 1;
              const problem = rowProblem(row);
              const refusedHere = problems.get(row.key) ?? {};
              // The whole lap (no distance and no time) marks both of its measures.
              const invalid = (part: string, also?: string) =>
                part in refusedHere || (also !== undefined && also in refusedHere)
                  ? true
                  : undefined;
              const said = [...new Set(Object.values(refusedHere))];
              const sayId = `${id}-lap-${row.key}`;
              const describedBy = problem || said.length > 0 ? sayId : undefined;
              const pace = lapPace(postedRows[index]!, readIn);
              return (
                <li key={row.key} className="lap-row" data-phase={row.phase || undefined}>
                  <div className="lap-row-head">
                    <span className="lap-row-number">Lap {number}</span>
                    <Select
                      aria-label={`Lap ${number} kind`}
                      value={row.phase}
                      onChange={(event) =>
                        change(row.key, { phase: event.target.value as StepPhase | "" })
                      }
                      className="lap-row-phase"
                    >
                      {/* Every lap has a kind; one from before laps had one stays a Lap. */}
                      {row.phase === "" && <option value="">Lap</option>}
                      {STEP_PHASES.map((phase) => (
                        <option key={phase} value={phase}>
                          {LAP_KIND_LABELS[phase]}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove lap ${number}`}
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
                        placeholder={
                          askedDistance(row.asked) ?? (row.phase === "recovery" ? STANDING : "—")
                        }
                        aria-invalid={invalid("distance", "lap")}
                        aria-describedby={describedBy}
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
                        aria-invalid={invalid("time", "lap")}
                        aria-describedby={describedBy}
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
                        aria-invalid={invalid("averageHeartRate")}
                        aria-describedby={describedBy}
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
                        aria-invalid={invalid("maxHeartRate")}
                        aria-describedby={describedBy}
                        onChange={(event) => change(row.key, { maxHeartRate: event.target.value })}
                      />
                    </Field>
                  </div>
                  {(problem || said.length > 0) && (
                    <p id={sayId} role="alert" className="type-meta-small font-semibold">
                      {[problem, ...said].filter(Boolean).join(" ")}
                    </p>
                  )}
                  {pace && !problem && said.length === 0 && (
                    <p className="lap-row-pace">Pace {pace}</p>
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
        {listError && (
          <p id={`${id}-error`} role="alert" className="type-meta-small font-semibold">
            {listError}
          </p>
        )}
        {/* At the foot, under the last lap, where the next one goes (DESIGN.md). */}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={addRep} disabled={full}>
            + Rep
          </Button>
          <Button variant="secondary" onClick={addRecovery} disabled={full}>
            + Recovery
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
