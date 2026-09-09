"use client";

import { useState, useSyncExternalStore } from "react";

import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { BODY_LOAD_UNITS, type BodyLoadUnit } from "@/domain/types";
import { LOAD_UNIT_LABELS } from "@/lib/labels";

export type ProfileFieldValues = {
  displayName: string;
  timeZone: string;
  preferredUnit: BodyLoadUnit;
  bodyWeightKg: number | null;
};

const UNIT_OPTIONS = BODY_LOAD_UNITS.map((unit) => ({
  value: unit,
  label: `${LOAD_UNIT_LABELS[unit]} (${unit === "kg" ? "kilograms" : "pounds"})`,
}));

/** A device's zone does not change while a form is open, so there is nothing to subscribe to. */
function noSubscription(): () => void {
  return () => {};
}

function readBrowserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * The zone the browser is in, or null on the server, where it is unknowable. Read through
 * `useSyncExternalStore` so the server and the first client render agree and hydration is clean.
 */
function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(noSubscription, readBrowserTimeZone, () => null);
}

/**
 * The fields that make the app yours: name, time zone, units and body weight. Shared by the
 * onboarding step and the Settings screen, so the two can never drift apart.
 */
export function ProfileFields({
  values,
  errors,
  /** Offer the browser's zone when the account has never chosen one. */
  detectTimeZone = false,
}: {
  values: ProfileFieldValues;
  errors?: Record<string, string>;
  detectTimeZone?: boolean;
}) {
  const detected = useBrowserTimeZone();
  const [edited, setEdited] = useState<string | null>(null);
  // Only fill in for an account still on the server default; never overwrite a real choice.
  const suggest =
    detectTimeZone && values.timeZone === "UTC" && detected !== null && detected !== "UTC";
  const timeZone = edited ?? (suggest ? detected : values.timeZone);

  return (
    <>
      <Field label="Name" error={errors?.displayName}>
        <Input
          type="text"
          name="displayName"
          autoComplete="name"
          maxLength={80}
          defaultValue={values.displayName}
        />
      </Field>

      <Field
        label="Time zone"
        error={errors?.timeZone}
        hint={detected && detected !== timeZone ? `This device says ${detected}` : undefined}
      >
        <Input
          type="text"
          name="timeZone"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          list="time-zone-suggestions"
          value={timeZone}
          onChange={(event) => setEdited(event.target.value)}
          required
        />
      </Field>
      {detected && (
        <datalist id="time-zone-suggestions">
          <option value={detected} />
          <option value="UTC" />
        </datalist>
      )}

      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink-muted">Units</span>
        <SegmentedControl
          name="preferredUnit"
          aria-label="Units"
          options={UNIT_OPTIONS}
          defaultValue={values.preferredUnit}
          columns={2}
        />
        {errors?.preferredUnit && (
          <span role="alert" className="block text-sm text-danger">
            {errors.preferredUnit}
          </span>
        )}
      </div>

      <Field label="Body weight (kg)" error={errors?.bodyWeightKg} hint="Optional">
        <Input
          type="text"
          name="bodyWeightKg"
          inputMode="decimal"
          defaultValue={values.bodyWeightKg === null ? "" : String(values.bodyWeightKg)}
          placeholder="74.5"
        />
      </Field>
    </>
  );
}
