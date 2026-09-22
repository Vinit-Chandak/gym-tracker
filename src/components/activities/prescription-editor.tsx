"use client";

import { useActionState, useState } from "react";

import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ACTIVITY_SPORT_LABELS, type EnduranceSport } from "@/domain/activity";
import { TEXT_LIMITS } from "@/domain/activity-limits";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

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

  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      {sports.length === 0 && <input type="hidden" name="sport" value={sport} />}

      <Section title="The session">
        <Card>
          {sports.length > 0 && (
            <Field group label="Sport" error={state.fieldErrors?.sport}>
              <SegmentedControl
                name="sport"
                aria-label="Sport"
                options={sports.map((item) => ({
                  value: item,
                  label: ACTIVITY_SPORT_LABELS[item],
                }))}
                value={selectedSport}
                onChange={setSelectedSport}
                columns={sports.length}
              />
            </Field>
          )}
          <Field label="Name" error={state.fieldErrors?.name}>
            <Input
              name="name"
              defaultValue={value("name")}
              maxLength={TEXT_LIMITS.title}
              placeholder="Easy 5k"
              required
            />
          </Field>
        </Card>
      </Section>

      <Section title="Overall target">
        <Card>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Minutes from" error={state.fieldErrors?.durationMinMinutes}>
              <Input
                name="durationMinMinutes"
                inputMode="numeric"
                defaultValue={value("durationMinMinutes")}
                placeholder="30"
              />
            </Field>
            <Field label="Minutes to" error={state.fieldErrors?.durationMaxMinutes}>
              <Input
                name="durationMaxMinutes"
                inputMode="numeric"
                defaultValue={value("durationMaxMinutes")}
                placeholder="35"
              />
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Field label="Distance from" error={state.fieldErrors?.distanceMin}>
              <Input
                name="distanceMin"
                inputMode="decimal"
                defaultValue={value("distanceMin")}
                placeholder="5"
              />
            </Field>
            <Field label="Distance to" error={state.fieldErrors?.distanceMax}>
              <Input
                name="distanceMax"
                inputMode="decimal"
                defaultValue={value("distanceMax")}
                placeholder="5"
              />
            </Field>
            <Field group label="Unit">
              <SegmentedControl
                key={`distance-${selectedSport}`}
                name="distanceUnit"
                aria-label="Distance unit"
                options={units}
                defaultValue={initialUnit("distanceUnit")}
                columns={units.length}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Effort from" hint="Optional" error={state.fieldErrors?.effortMin}>
              <Input
                name="effortMin"
                inputMode="decimal"
                defaultValue={value("effortMin")}
                placeholder="3"
              />
            </Field>
            <Field label="Effort to" hint="Optional" error={state.fieldErrors?.effortMax}>
              <Input
                name="effortMax"
                inputMode="decimal"
                defaultValue={value("effortMax")}
                placeholder="5"
              />
            </Field>
          </div>
          <p className="text-sm text-ink-muted">
            Give a time, a distance, or both. Leave the other blank and nothing is invented for it.
          </p>
        </Card>
      </Section>

      <Section title="Repeats">
        <Disclosure summary="One repeated block" meta="Optional" defaultOpen={stepKind !== "none"}>
          <div className="space-y-3">
            <Field group label="How the block is measured">
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
                  <Field label="Repetitions" error={state.fieldErrors?.repetitions}>
                    <Input
                      name="repetitions"
                      inputMode="numeric"
                      defaultValue={value("repetitions")}
                      placeholder="8"
                    />
                  </Field>
                  <Field
                    label="Rest between, seconds"
                    error={state.fieldErrors?.restBetweenSeconds}
                  >
                    <Input
                      name="restBetweenSeconds"
                      inputMode="numeric"
                      defaultValue={value("restBetweenSeconds")}
                      placeholder="20"
                    />
                  </Field>
                </div>
                {stepKind === "distance" ? (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Field label="Each repetition" error={state.fieldErrors?.stepDistance}>
                      <Input
                        name="stepDistance"
                        inputMode="decimal"
                        defaultValue={value("stepDistance")}
                        placeholder="50"
                      />
                    </Field>
                    <Field group label="Unit">
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
                ) : (
                  <Field
                    label="Each repetition, seconds"
                    error={state.fieldErrors?.stepDurationSeconds}
                  >
                    <Input
                      name="stepDurationSeconds"
                      inputMode="numeric"
                      defaultValue={value("stepDurationSeconds")}
                      placeholder="120"
                    />
                  </Field>
                )}
                <p className="text-sm text-ink-muted">
                  Rest happens between repetitions, so eight of them have seven rests.
                </p>
              </>
            )}
          </div>
        </Disclosure>
      </Section>

      <Section title="Notes">
        <Card>
          <Field label="Notes" hint="Optional" error={state.fieldErrors?.notes}>
            <Textarea
              name="notes"
              defaultValue={value("notes")}
              maxLength={TEXT_LIMITS.prescriptionNotes}
              placeholder="What this session is for…"
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
