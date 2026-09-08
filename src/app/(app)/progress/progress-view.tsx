"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/input";
import { TrendChart } from "@/components/ui/trend-chart";
import type { liftingAdherence, trainingAnalytics } from "@/domain/analytics";
import type { MuscleGroup } from "@/domain/types";
import { LOAD_UNIT_LABELS, MUSCLE_LABELS } from "@/lib/labels";

type Analytics = ReturnType<typeof trainingAnalytics>;
export function ProgressView({
  data,
  adherence,
}: {
  data: Analytics;
  adherence: ReturnType<typeof liftingAdherence>;
}) {
  const [selected, setSelected] = useState(data.series[0]?.id ?? "");
  const series = data.series.find((s) => s.id === selected) ?? data.series[0];
  const muscles = [
    ...new Set(data.weeks.flatMap((w) => Object.keys(w.muscles))),
  ].sort() as MuscleGroup[];
  const [muscle, setMuscle] = useState<string>(muscles[0] ?? "chest");
  const [recovery, setRecovery] = useState<"sleep" | "back" | "leftShin" | "rightShin">("sleep");
  const [paceMode, setPaceMode] = useState("outdoor");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Workouts", data.workouts],
          ["Runs", data.runs],
          ["Active days", data.trainingDays],
        ].map(([label, value]) => (
          <Card key={label} className="gap-1 p-3 text-center">
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-ink-muted">{label}</p>
          </Card>
        ))}
      </div>
      {data.truncated && (
        <p role="status" className="text-sm text-warning">
          This range exceeds 500 workouts or runs. Narrow the dates for complete totals and charts.
        </p>
      )}
      {adherence && (
        <Card>
          <h2 className="font-semibold">Programme adherence</h2>
          <p className="text-sm text-ink-muted">{adherence.name} · whole programme</p>
          <p className="text-lg font-semibold">
            {adherence.completed} / {adherence.total} lifting sessions complete
          </p>
          <progress
            value={adherence.completed}
            max={Math.max(1, adherence.total)}
            className="h-2 w-full accent-accent"
            aria-label="Programme completion"
          />
          <p className="text-sm text-ink-muted">
            {adherence.skipped} skipped · {adherence.remaining} pending
            {adherence.completionRate !== null
              ? ` · ${adherence.completionRate}% of resolved sessions completed`
              : ""}
          </p>
          <p className="text-xs text-ink-subtle">
            Rest days are excluded. Pending sessions shift with your sequence.
          </p>
        </Card>
      )}
      <Card>
        <h2 className="font-semibold">Exercise performance</h2>
        {series ? (
          <>
            <Field label="Exercise and machine">
              <Select value={series.id} onChange={(e) => setSelected(e.target.value)}>
                {data.series.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.machine} · {LOAD_UNIT_LABELS[s.unit]}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-ink-muted">
              {series.machine}. Warm-ups excluded; each point is one exercise performance.
            </p>
            <TrendChart
              title="Highest load"
              points={series.load}
              unit={LOAD_UNIT_LABELS[series.unit]}
            />
            <TrendChart title="Most reps in a set" points={series.reps} unit="reps" />
            <TrendChart
              title="Load × reps volume"
              points={series.volume}
              unit={`${LOAD_UNIT_LABELS[series.unit]} × reps`}
            />
            <TrendChart title="Average RIR" points={series.rir} unit="RIR" />
            {series.estimated1RM.some((p) => p.value !== null) && (
              <>
                <TrendChart
                  title="Estimated 1RM"
                  points={series.estimated1RM}
                  unit={LOAD_UNIT_LABELS[series.unit]}
                />
                <p className="text-xs text-ink-subtle">
                  Epley estimate from loaded barbell sets of 1–10 reps. This is an estimate, not a
                  tested maximum.
                </p>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            Finish a workout with logged sets to see performance trends. Machines and units are kept
            separate.
          </p>
        )}
      </Card>
      <Card>
        <h2 className="font-semibold">Weekly training</h2>
        <TrendChart
          title="Lifting sessions"
          unit="sessions"
          points={data.weeks.map((w) => ({ date: w.date, value: w.workouts }))}
        />
        {muscles.length > 0 && (
          <>
            <Field label="Primary muscle">
              <Select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
                {muscles.map((m) => (
                  <option key={m} value={m}>
                    {MUSCLE_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <TrendChart
              title="Working sets"
              unit="sets"
              points={data.weeks.map((w) => ({ date: w.date, value: w.muscles[muscle] ?? 0 }))}
            />
          </>
        )}
        <p className="text-xs text-ink-subtle">
          Monday–Sunday in your time zone. Range-edge weeks may be partial. Every non-warm-up set
          counts once for each primary muscle; secondary muscles are excluded.
        </p>
      </Card>
      <Card>
        <h2 className="font-semibold">Running</h2>
        <TrendChart
          title="Weekly distance"
          unit="km"
          points={data.weeks.map((w) => ({ date: w.date, value: w.runKm }))}
        />
        <TrendChart
          title="Weekly duration"
          unit="min"
          points={data.weeks.map((w) => ({ date: w.date, value: w.runMinutes }))}
        />
        <Field label="Pace context">
          <Select value={paceMode} onChange={(e) => setPaceMode(e.target.value)}>
            <option value="outdoor">Outdoor</option>
            <option value="treadmill">Treadmill</option>
          </Select>
        </Field>
        <TrendChart
          title="Pace"
          unit="min/km"
          points={data.pace.filter((p) => p.mode === paceMode)}
        />
        <p className="text-xs text-ink-subtle">
          Lower pace values mean faster runs. Decimal minutes: 6.5 = 6:30/km.
        </p>
      </Card>
      <Card>
        <h2 className="font-semibold">Recovery and symptoms</h2>
        <Field label="Measurement">
          <Select value={recovery} onChange={(e) => setRecovery(e.target.value as typeof recovery)}>
            <option value="sleep">Sleep</option>
            <option value="back">Lower back</option>
            <option value="leftShin">Left shin</option>
            <option value="rightShin">Right shin</option>
          </Select>
        </Field>
        <TrendChart
          title={
            recovery === "sleep"
              ? "Sleep"
              : recovery === "back"
                ? "Lower back"
                : recovery === "leftShin"
                  ? "Left shin"
                  : "Right shin"
          }
          unit={recovery === "sleep" ? "hours" : "0–10"}
          points={data.recovery.map((r) => ({ date: r.date, value: r[recovery] }))}
        />
        <p className="text-xs text-ink-subtle">
          Workout check-ins, daily recovery and after-run shin scores. Missing readings stay blank.
        </p>
        {data.recovery.length > 0 && (
          <details className="text-xs text-ink-muted">
            <summary className="cursor-pointer py-2">Reading sources</summary>
            <ul>
              {data.recovery.map((r, i) => (
                <li key={i} className="py-1">
                  {r.date} · {r.source}: {r[recovery] ?? "—"}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </div>
  );
}
