"use client";

import { useActionState, useId, useState, type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { FormError, SubmitButton } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { EnduranceSport } from "@/domain/activity";
import { TEXT_LIMITS } from "@/domain/activity-limits";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { SPORT_TONE } from "@/lib/sport-tone";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

import { SportChips } from "./sport-chips";

/**
 * Writing what a session asks for (plan §5.1).
 *
 * Two ways to say it, and no third: an overall target — thirty minutes easy, five kilometres
 * — or one repeated block, which is how "8 × 50 m with 20 seconds between" is written. That
 * is the whole structure the release supports, so the editor offers exactly that and does not
 * imply an interval timer nobody built.
 *
 * Everything here is a target. There is no field for a result on this page.
 */

export type TemplateFormValues = Record<string, string>;

const DISTANCE_UNITS: Record<EnduranceSport, { value: string; label: string }[]> = {
  running: [
    { value: "km", label: "km" },
    { value: "mi", label: "mi" },
  ],
  cycling: [
    { value: "km", label: "km" },
    { value: "mi", label: "mi" },
  ],
  swimming: [
    { value: "m", label: "m" },
    { value: "yd", label: "yd" },
  ],
};

const STEP_KINDS = [
  { value: "none", label: "No block" },
  { value: "distance", label: "By distance" },
  { value: "duration", label: "By time" },
];

type End = {
  name: string;
  /** What a screen reader calls the box: "Minutes from". */
  label: string;
  defaultValue: string;
  placeholder: string;
  inputMode: "numeric" | "decimal";
  error?: string;
};

/**
 * A target written as a range, "30 to 35", on one line under its name. The two boxes keep
 * their own names for a screen reader; on screen the word between them says the rest. A unit
 * the range is written in is chosen beside the name.
 */
function RangeField({
  label,
  hint,
  info,
  unit,
  from,
  to,
}: {
  label: string;
  hint?: string;
  info?: ReactNode;
  unit?: ReactNode;
  from: End;
  to: End;
}) {
  const id = useId();
  const errors = [from.error, to.error].filter(Boolean);
  const feedbackId = `${id}-feedback`;
  const described = errors.length > 0 || hint ? feedbackId : undefined;
  const box = (end: End) => (
    <Input
      name={end.name}
      aria-label={end.label}
      inputMode={end.inputMode}
      defaultValue={end.defaultValue}
      placeholder={end.placeholder}
      aria-invalid={end.error ? true : undefined}
      aria-describedby={described}
      className="text-center tabular-nums"
    />
  );
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-ink-muted">
          <span id={`${id}-label`} className="min-w-0 [overflow-wrap:anywhere]">
            {label}
          </span>
          {info && <InfoTip label={`About ${label.toLowerCase()}`}>{info}</InfoTip>}
        </span>
        {unit && <div className="w-32 max-w-full shrink-0">{unit}</div>}
      </div>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"
      >
        {box(from)}
        <span aria-hidden className="text-sm text-ink-muted">
          to
        </span>
        {box(to)}
      </div>
      {(errors.length > 0 || hint) && (
        <span id={feedbackId} className="block space-y-0.5">
          {errors.length > 0 ? (
            errors.map((error) => (
              <span key={error} role="alert" className="block text-sm text-danger">
                {error}
              </span>
            ))
          ) : (
            <span className="block text-xs text-ink-subtle">{hint}</span>
          )}
        </span>
      )}
    </div>
  );
}

export function PrescriptionEditor({
  action,
  sport,
  sports,
  initial,
  submitLabel,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  sport: EnduranceSport;
  /** Empty when the sport is fixed, as it is when an existing template is edited. */
  sports: readonly EnduranceSport[];
  initial: TemplateFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const value = (key: string): string => state.values?.[key] ?? initial[key] ?? "";
  const [stepKind, setStepKind] = useState(() => value("stepTargetKind") || "none");
  const [selectedSport, setSelectedSport] = useState(sport);
  const units = DISTANCE_UNITS[selectedSport];
  const initialUnit = (key: string) =>
    units.some((unit) => unit.value === value(key)) ? value(key) : units[0]!.value;
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      {sports.length === 0 && <input type="hidden" name="sport" value={sport} />}

      <Card>
        {sports.length > 0 && (
          <Field group labelHidden label="Sport" error={errors?.sport}>
            <SportChips sports={sports} value={selectedSport} onChange={setSelectedSport} />
          </Field>
        )}
        <Field label="Name" error={errors?.name}>
          <Input
            name="name"
            defaultValue={value("name")}
            maxLength={TEXT_LIMITS.title}
            placeholder="Easy 5k"
            required
          />
        </Field>
      </Card>

      <Section
        title="Overall target"
        info="Give a time, a distance, or both. Leave the other blank and nothing is invented for it."
      >
        <Card className="space-y-4">
          <RangeField
            label="Time in minutes"
            from={{
              name: "durationMinMinutes",
              label: "Minutes from",
              defaultValue: value("durationMinMinutes"),
              placeholder: "30",
              inputMode: "numeric",
              error: errors?.durationMinMinutes,
            }}
            to={{
              name: "durationMaxMinutes",
              label: "Minutes to",
              defaultValue: value("durationMaxMinutes"),
              placeholder: "35",
              inputMode: "numeric",
              error: errors?.durationMaxMinutes,
            }}
          />
          <RangeField
            label="Distance"
            unit={
              <SegmentedControl
                key={`distance-${selectedSport}`}
                name="distanceUnit"
                aria-label="Distance unit"
                options={units}
                defaultValue={initialUnit("distanceUnit")}
                columns={units.length}
              />
            }
            from={{
              name: "distanceMin",
              label: "Distance from",
              defaultValue: value("distanceMin"),
              placeholder: "5",
              inputMode: "decimal",
              error: errors?.distanceMin,
            }}
            to={{
              name: "distanceMax",
              label: "Distance to",
              defaultValue: value("distanceMax"),
              placeholder: "5",
              inputMode: "decimal",
              error: errors?.distanceMax,
            }}
          />
          <RangeField
            label="Effort"
            hint="Optional"
            info="How hard it should feel, 1 very easy to 5 maximal."
            from={{
              name: "effortMin",
              label: "Effort from",
              defaultValue: value("effortMin"),
              placeholder: "3",
              inputMode: "decimal",
              error: errors?.effortMin,
            }}
            to={{
              name: "effortMax",
              label: "Effort to",
              defaultValue: value("effortMax"),
              placeholder: "5",
              inputMode: "decimal",
              error: errors?.effortMax,
            }}
          />
        </Card>
      </Section>

      <Disclosure summary="One repeated block" meta="Optional" defaultOpen={stepKind !== "none"}>
        <div className="space-y-3">
          <Field
            group
            label="How the block is measured"
            info="Rest happens between repetitions, so eight of them have seven rests."
          >
            <SegmentedControl
              name="stepTargetKind"
              aria-label="Block target"
              options={STEP_KINDS}
              value={stepKind}
              onChange={setStepKind}
              columns={3}
            />
          </Field>
          {stepKind !== "none" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Repetitions" error={errors?.repetitions}>
                  <Input
                    name="repetitions"
                    inputMode="numeric"
                    defaultValue={value("repetitions")}
                    placeholder="8"
                  />
                </Field>
                <Field label="Rest between, seconds" error={errors?.restBetweenSeconds}>
                  <Input
                    name="restBetweenSeconds"
                    inputMode="numeric"
                    defaultValue={value("restBetweenSeconds")}
                    placeholder="20"
                  />
                </Field>
              </div>
              {stepKind === "distance" ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1 basis-32">
                    <Field label="Each repetition" error={errors?.stepDistance}>
                      <Input
                        name="stepDistance"
                        inputMode="decimal"
                        defaultValue={value("stepDistance")}
                        placeholder="50"
                      />
                    </Field>
                  </div>
                  <div className="w-32 max-w-full">
                    <Field group labelHidden label="Unit">
                      <SegmentedControl
                        key={`step-${selectedSport}`}
                        name="stepDistanceUnit"
                        aria-label="Repetition unit"
                        options={units}
                        defaultValue={initialUnit("stepDistanceUnit")}
                        columns={units.length}
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <Field label="Each repetition, seconds" error={errors?.stepDurationSeconds}>
                  <Input
                    name="stepDurationSeconds"
                    inputMode="numeric"
                    defaultValue={value("stepDurationSeconds")}
                    placeholder="120"
                  />
                </Field>
              )}
            </>
          )}
        </div>
      </Disclosure>

      <Card>
        <Field label="Notes" hint="Optional" error={errors?.notes}>
          <Textarea
            name="notes"
            defaultValue={value("notes")}
            maxLength={TEXT_LIMITS.prescriptionNotes}
            placeholder="What this session is for…"
          />
        </Field>
      </Card>

      <div className="space-y-2">
        <FormError message={state.formError} />
        <SubmitButton tone={SPORT_TONE[selectedSport]} pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
