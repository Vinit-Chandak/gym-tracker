"use client";

import { useActionState, useState } from "react";

import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { Section } from "@/components/ui/section";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { formatPace, paceSecondsPerKm } from "@/domain/pace";
import { rangeLabel, WEEKDAY_SHORT } from "@/lib/labels";
import type { PlannedRunStatus } from "@/server/repositories/runs";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

const RPE = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

// "" is outdoor and "on" is treadmill: the same two values the checkbox submitted, so the
// action's parsing is unchanged while the control now names both modes.
const MODES: { value: string; label: string }[] = [
  { value: "", label: "Outdoor" },
  { value: "on", label: "Treadmill" },
];

export type RunFormValues = {
  startedAt: string;
  treadmill: boolean;
  distanceKm: string;
  durationMinutes: string;
  durationSeconds: string;
  rpe: string;
  shinLeftPre: string;
  shinRightPre: string;
  shinLeftDuring: string;
  shinRightDuring: string;
  shinLeftPost: string;
  shinRightPost: string;
  programRunId: string;
  notes: string;
};

type ShinKey =
  | "shinLeftPre"
  | "shinRightPre"
  | "shinLeftDuring"
  | "shinRightDuring"
  | "shinLeftPost"
  | "shinRightPost";

const SHIN_KEYS: ShinKey[] = [
  "shinLeftPre",
  "shinRightPre",
  "shinLeftDuring",
  "shinRightDuring",
  "shinLeftPost",
  "shinRightPost",
];

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initial: RunFormValues;
  /** The current cycle's planned runs, for linking the run to the programme. */
  planned: PlannedRunStatus[];
  /** The run being edited, so its own planned link is not shown as taken. */
  runId: string | null;
  submitLabel: string;
};

export function plannedRunLabel(run: {
  weekIndex: number;
  dayOfWeek: number;
  durationMinMinutes: number;
  durationMaxMinutes: number;
}): string {
  return `Week ${run.weekIndex} · ${WEEKDAY_SHORT[run.dayOfWeek] ?? "Run"} · ${rangeLabel(run.durationMinMinutes, run.durationMaxMinutes, " min")}`;
}

export function RunForm({ action, initial, planned, runId, submitLabel }: Props) {
  const [state, formAction] = useActionState(action, INITIAL_FORM_STATE);
  const value = (key: keyof RunFormValues): string => {
    const submitted = state.values?.[key];
    if (submitted !== undefined) return submitted;
    const original = initial[key];
    return typeof original === "boolean" ? (original ? "on" : "") : original;
  };
  const [distance, setDistance] = useState(() => value("distanceKm"));
  const [minutes, setMinutes] = useState(() => value("durationMinutes"));
  const [seconds, setSeconds] = useState(() => value("durationSeconds"));
  const [shin, setShin] = useState<Record<ShinKey, string>>(() => ({
    shinLeftPre: value("shinLeftPre"),
    shinRightPre: value("shinRightPre"),
    shinLeftDuring: value("shinLeftDuring"),
    shinRightDuring: value("shinRightDuring"),
    shinLeftPost: value("shinLeftPost"),
    shinRightPost: value("shinRightPost"),
  }));

  const totalSeconds = Number(minutes || 0) * 60 + Number(seconds || 0);
  const pace = paceSecondsPerKm(Number(distance.replace(",", ".")) * 1000, totalSeconds);
  const shinError = SHIN_KEYS.some((key) => state.fieldErrors?.[key]);
  const hasShinReading = SHIN_KEYS.some((key) => shin[key].trim() !== "");

  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      <Section title="The run">
        <Card>
          <Field label="When" error={state.fieldErrors?.startedAt}>
            <Input
              name="startedAt"
              type="datetime-local"
              defaultValue={value("startedAt")}
              required
            />
          </Field>

          <Field label="Where">
            <SegmentedControl
              name="treadmill"
              aria-label="Run mode"
              options={MODES}
              defaultValue={value("treadmill")}
              columns={2}
            />
          </Field>

          {/* Units are on the labels, once; the fields themselves are only numbers. */}
          <div className="grid grid-cols-3 gap-2">
            <Field label="Distance km" error={state.fieldErrors?.distanceKm}>
              <Input
                name="distanceKm"
                inputMode="decimal"
                value={distance}
                onChange={(event) => setDistance(event.target.value)}
                placeholder="4.2"
              />
            </Field>
            <Field label="Minutes" error={state.fieldErrors?.durationMinutes}>
              <Input
                name="durationMinutes"
                inputMode="numeric"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                placeholder="25"
              />
            </Field>
            <Field label="Seconds" error={state.fieldErrors?.durationSeconds}>
              <Input
                name="durationSeconds"
                inputMode="numeric"
                value={seconds}
                onChange={(event) => setSeconds(event.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
          {pace !== null && (
            <p role="status" className="text-sm text-ink-muted tabular-nums">
              Pace {formatPace(pace)} /km
            </p>
          )}
        </Card>
      </Section>

      <Section title="Effort and plan">
        <Card>
          <Field label="RPE" hint="Optional" error={state.fieldErrors?.rpe}>
            <SegmentedControl name="rpe" options={RPE} defaultValue={value("rpe")} columns={5} />
          </Field>

          <Field label="Planned run" error={state.fieldErrors?.programRunId}>
            <Select name="programRunId" defaultValue={value("programRunId")}>
              <option value="">Unplanned run</option>
              {planned.map((run) => (
                <option key={run.id} value={run.id}>
                  {plannedRunLabel(run)}
                  {/* The run being edited keeps its own link; it is not "already taken". */}
                  {run.loggedRunId && run.loggedRunId !== runId ? " (already logged)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      </Section>

      {/*
        Six optional readings, folded away by default. It opens on its own when one of them
        is invalid or already filled in, so a rejected value is never hidden behind a summary
        the user has no reason to open.
      */}
      <Disclosure
        summary="Shin readings"
        meta="0–10, optional"
        defaultOpen={shinError || hasShinReading}
      >
        <div className="space-y-2">
          {(
            [
              ["Left", "shinLeftPre", "shinLeftDuring", "shinLeftPost"],
              ["Right", "shinRightPre", "shinRightDuring", "shinRightPost"],
            ] as const
          ).map(([side, before, during, after]) => (
            <div key={side} className="grid grid-cols-[2.5rem_1fr_1fr_1fr] items-end gap-2">
              <span className="pb-3.5 text-sm">{side}</span>
              <NumberField
                label="Before"
                value={shin[before]}
                onChange={(next) => setShin((current) => ({ ...current, [before]: next }))}
                step={1}
                max={10}
                inputMode="numeric"
              />
              <NumberField
                label="During"
                value={shin[during]}
                onChange={(next) => setShin((current) => ({ ...current, [during]: next }))}
                step={1}
                max={10}
                inputMode="numeric"
              />
              <NumberField
                label="After"
                value={shin[after]}
                onChange={(next) => setShin((current) => ({ ...current, [after]: next }))}
                step={1}
                max={10}
                inputMode="numeric"
              />
            </div>
          ))}
          {SHIN_KEYS.map((key) => (
            <input key={key} type="hidden" name={key} value={shin[key]} />
          ))}
          {shinError && (
            <p role="alert" className="text-sm text-danger">
              Shin scores are whole numbers from 0 to 10.
            </p>
          )}
        </div>
      </Disclosure>

      <Section title="Notes">
        <Card>
          <Field label="Notes" hint="Optional" error={state.fieldErrors?.notes}>
            <Textarea
              name="notes"
              defaultValue={value("notes")}
              maxLength={1000}
              placeholder="Route, surface, how it felt…"
            />
          </Field>
        </Card>
      </Section>

      <div className="space-y-2">
        <FormError message={state.formError} />
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
