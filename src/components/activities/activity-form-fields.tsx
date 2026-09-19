"use client";

import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TEXT_LIMITS } from "@/domain/activity-limits";
import type { FormState } from "@/server/validation/form";

/**
 * The parts every endurance form shares (plan §4.1).
 *
 * Only the mechanics are shared: when it happened, how hard it felt, what the athlete wants
 * to remember, and the way optional detail is folded away. The measurements themselves are
 * each sport's own, because a pool length is not a cadence and a run has no assistance.
 *
 * Nothing here prefills a performance. Opening a plan shows what was asked for beside the
 * form, never inside the boxes that are about to record what actually happened (ACTUAL-01).
 */

export type ActivityFormValues = Record<string, string>;

export function useFormValues(state: FormState, initial: ActivityFormValues) {
  return (key: string): string => state.values?.[key] ?? initial[key] ?? "";
}

/** 1 to 10, or the answer that says the athlete does not know. */
const EFFORT_OPTIONS = [
  ...Array.from({ length: 10 }, (_, index) => ({
    value: String(index + 1),
    label: String(index + 1),
  })),
  { value: "unsure", label: "Not sure" },
];

/** A distance and the unit it was entered in. Both are stored; neither is re-derived. */
export function DistanceField({
  value,
  unit,
  onValueChange,
  onUnitChange,
  units,
  error,
  label = "Distance",
  hint,
}: {
  value: string;
  unit: string;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: string) => void;
  units: readonly { value: string; label: string }[];
  error?: string;
  label?: string;
  hint?: string;
}) {
  return (
    <Field group label={label} hint={hint} error={error}>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input
          name="distanceValue"
          inputMode="decimal"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="5"
          aria-label={label}
        />
        <SegmentedControl
          name="distanceUnit"
          aria-label="Distance unit"
          options={units}
          value={unit}
          onChange={onUnitChange}
          columns={units.length}
        />
      </div>
    </Field>
  );
}

export function EffortField({ value, error }: { value: string; error?: string }) {
  return (
    <Field
      group
      label="Effort"
      hint="How hard it actually felt, 1 very easy to 10 maximal. Not sure is an answer."
      error={error}
    >
      <SegmentedControl
        name="effort"
        aria-label="Effort"
        options={EFFORT_OPTIONS}
        defaultValue={value}
        columns={6}
      />
    </Field>
  );
}

export function NotesFields({
  values,
  errors,
}: {
  values: (key: string) => string;
  errors?: Record<string, string>;
}) {
  return (
    <Section title="Notes">
      <Card>
        <Field label="Title" hint="Optional" error={errors?.title}>
          <Input
            name="title"
            defaultValue={values("title")}
            maxLength={TEXT_LIMITS.title}
            placeholder="Morning loop"
          />
        </Field>
        <Field label="Notes" hint="Optional and private" error={errors?.notes}>
          <Textarea
            name="notes"
            defaultValue={values("notes")}
            maxLength={TEXT_LIMITS.notes}
            placeholder="How it felt, the route, anything worth remembering…"
          />
        </Field>
      </Card>
    </Section>
  );
}

/** Optional summary metrics, folded away. A beginner never has to open this. */
export function MoreDetails({ children }: { children: ReactNode }) {
  return (
    <Disclosure summary="More details" meta="Optional">
      <div className="space-y-3">{children}</div>
    </Disclosure>
  );
}

export function HeartRateFields({
  values,
  errors,
}: {
  values: (key: string) => string;
  errors?: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Average heart rate" error={errors?.averageHeartRate}>
        <Input
          name="averageHeartRate"
          inputMode="numeric"
          defaultValue={values("averageHeartRate")}
          placeholder="—"
        />
      </Field>
      <Field label="Maximum heart rate" error={errors?.maxHeartRate}>
        <Input
          name="maxHeartRate"
          inputMode="numeric"
          defaultValue={values("maxHeartRate")}
          placeholder="—"
        />
      </Field>
    </div>
  );
}

/**
 * What the plan asked for, shown beside the form and never inside it.
 *
 * A target is not a result: it stays here, in its own box, so nothing on the page can be
 * mistaken for a measurement of what actually happened.
 */
export function TargetCard({ title, lines }: { title: string; lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <Section title={title}>
      <Card>
        {lines.map((line, index) => (
          <p key={index} className="text-sm [overflow-wrap:anywhere] text-ink-muted">
            {line}
          </p>
        ))}
      </Card>
    </Section>
  );
}

/** The hidden fields that carry identity: the submission key, the occurrence, the version. */
export function ActivityIdentityFields({
  submissionKey,
  occurrence,
  expectedRevision,
}: {
  submissionKey: string;
  occurrence: { id: string; revisionId: string; planId?: string | null } | null;
  expectedRevision?: number | null;
}) {
  return (
    <>
      <input type="hidden" name="submissionKey" value={submissionKey} />
      {occurrence && (
        <>
          <input type="hidden" name="occurrenceId" value={occurrence.id} />
          <input type="hidden" name="revisionId" value={occurrence.revisionId} />
          {occurrence.planId && <input type="hidden" name="planId" value={occurrence.planId} />}
        </>
      )}
      {expectedRevision !== null && expectedRevision !== undefined && (
        <input type="hidden" name="expectedRevision" value={String(expectedRevision)} />
      )}
    </>
  );
}

/**
 * The answer to "is that right?" for an unusually large entry.
 *
 * It appears only once the server has asked, and it confirms rather than corrects: what was
 * typed is what gets saved (§4.6).
 */
export function LargeEntryConfirmation({ message }: { message?: string }) {
  const asking = Boolean(message && /Confirm the/.test(message));
  if (!asking) return null;
  return (
    <Card>
      <p className="text-sm text-warning">{message}</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirmLarge" value="on" className="size-4" />
        Yes, that is right.
      </label>
    </Card>
  );
}
