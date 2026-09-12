"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import {
  BODY_LOAD_UNITS,
  SEXES,
  TRAINING_GOALS,
  type BodyLoadUnit,
  type Sex,
  type TrainingGoal,
} from "@/domain/types";
import { LOAD_UNIT_LABELS, SEX_LABELS, TRAINING_GOAL_LABELS } from "@/lib/labels";
import {
  fromKilograms,
  heightUnitFor,
  toCentimetres,
  toFeetAndInches,
  toKilograms,
} from "@/lib/units";

export type ProfileFieldValues = {
  displayName: string;
  timeZone: string;
  preferredUnit: BodyLoadUnit;
  /** Stored in kilograms and centimetres; shown in whichever units the account uses. */
  bodyWeightKg: number | null;
  heightCm: number | null;
  dateOfBirth: string | null;
  sex: Sex | null;
  trainingGoal: TrainingGoal | null;
};

const UNIT_OPTIONS = BODY_LOAD_UNITS.map((unit) => ({
  value: unit as string,
  label: `${LOAD_UNIT_LABELS[unit]} (${unit === "kg" ? "kilograms" : "pounds"})`,
}));

/** Saying nothing is the fourth answer, and the one the control starts on. */
const SEX_OPTIONS = [
  ...SEXES.map((sex) => ({ value: sex as string, label: SEX_LABELS[sex] })),
  { value: "", label: "Prefer not to say" },
];

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

/** What the user typed, as a number, or null when it is blank or not one. */
function typedNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

const text = (value: number | null): string => (value === null ? "" : String(value));

/**
 * The fields that make the app yours: who you are, how you measure things, and the body the
 * numbers are about. Shared by the onboarding step and the Settings screen, so the two can
 * never drift apart — and so nothing asked during setup is impossible to change afterwards.
 *
 * Units are a live choice rather than a saved one: switching to pounds re-labels the weight
 * and re-states the height in feet and inches, carrying whatever is in the fields across, so
 * a half-filled form survives changing your mind.
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
  const [editedZone, setEditedZone] = useState<string | null>(null);
  // Only fill in for an account still on the server default; never overwrite a real choice.
  const suggest =
    detectTimeZone && values.timeZone === "UTC" && detected !== null && detected !== "UTC";
  const timeZone = editedZone ?? (suggest ? detected : values.timeZone);

  const [unit, setUnit] = useState<BodyLoadUnit>(values.preferredUnit);
  const imperial = heightUnitFor(unit) === "ftin";

  const initialHeight = values.heightCm === null ? null : toFeetAndInches(values.heightCm);
  const [weight, setWeight] = useState(() =>
    text(values.bodyWeightKg === null ? null : fromKilograms(values.bodyWeightKg, unit)),
  );
  const [heightCm, setHeightCm] = useState(() => text(values.heightCm));
  // Held here, like the fields above, because React clears an uncontrolled field when a form
  // action returns: a refused profile would otherwise lose the date, the sex and the goal
  // while complaining about something else, and all three are asked for again before it saves.
  const [dateOfBirth, setDateOfBirth] = useState(values.dateOfBirth ?? "");
  const [sex, setSex] = useState<string>(values.sex ?? "");
  const [trainingGoal, setTrainingGoal] = useState<string>(values.trainingGoal ?? "");
  const [feet, setFeet] = useState(() => text(initialHeight?.feet ?? null));
  const [inches, setInches] = useState(() => text(initialHeight?.inches ?? null));

  /** Re-states everything already typed in the units just chosen. */
  function changeUnit(next: BodyLoadUnit) {
    if (next === unit) return;
    const typedWeight = typedNumber(weight);
    if (typedWeight !== null) {
      setWeight(String(fromKilograms(toKilograms(typedWeight, unit), next)));
    }
    if (heightUnitFor(next) === "ftin") {
      const centimetres = typedNumber(heightCm);
      if (centimetres !== null) {
        const converted = toFeetAndInches(centimetres);
        setFeet(String(converted.feet));
        setInches(String(converted.inches));
      }
    } else if (typedNumber(feet) !== null || typedNumber(inches) !== null) {
      setHeightCm(String(toCentimetres(typedNumber(feet) ?? 0, typedNumber(inches) ?? 0)));
    }
    setUnit(next);
  }

  /**
   * Holds the form together when a server action returns.
   *
   * React clears the fields of a form whose action has run, so that a form which saved cleanly
   * is ready for the next entry. These fields are not: a refused profile comes back with the
   * answers still in them, because the athlete is being asked to correct one of them, not to
   * type the other six again. Everything here is held in state above, so there is nothing for a
   * reset to restore — and it is cancelled rather than re-applied, since React does not write a
   * controlled value back over a select or a radio the browser has just cleared.
   */
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const keep = (event: Event) => event.preventDefault();
    form.addEventListener("reset", keep);
    return () => form.removeEventListener("reset", keep);
  }, []);

  return (
    <>
      <span ref={anchor} hidden />
      <Field label="Name" error={errors?.displayName}>
        <Input
          type="text"
          name="displayName"
          autoComplete="name"
          maxLength={80}
          defaultValue={values.displayName}
          required
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
          onChange={(event) => setEditedZone(event.target.value)}
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
          value={unit}
          onChange={(next) => changeUnit(next as BodyLoadUnit)}
          columns={2}
        />
        <span className="block text-xs text-ink-subtle">
          {imperial ? "Height in feet and inches." : "Height in centimetres."}
        </span>
        {errors?.preferredUnit && (
          <span role="alert" className="block text-sm text-danger">
            {errors.preferredUnit}
          </span>
        )}
      </div>

      <Field label={`Body weight (${unit})`} error={errors?.bodyWeight}>
        <Input
          type="text"
          name="bodyWeight"
          inputMode="decimal"
          value={weight}
          onChange={(event) => setWeight(event.target.value)}
          placeholder={unit === "kg" ? "74.5" : "164.2"}
          required
        />
      </Field>

      {imperial ? (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-ink-muted">Height</span>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Feet" error={errors?.heightFeet}>
              <Input
                type="text"
                name="heightFeet"
                inputMode="numeric"
                value={feet}
                onChange={(event) => setFeet(event.target.value)}
                placeholder="5"
                required
              />
            </Field>
            {/* Inches may be left blank: a height of exactly five feet is five feet. */}
            <Field label="Inches" error={errors?.heightInches}>
              <Input
                type="text"
                name="heightInches"
                inputMode="numeric"
                value={inches}
                onChange={(event) => setInches(event.target.value)}
                placeholder="10"
              />
            </Field>
          </div>
        </div>
      ) : (
        <Field label="Height (cm)" error={errors?.heightCm}>
          <Input
            type="text"
            name="heightCm"
            inputMode="decimal"
            value={heightCm}
            onChange={(event) => setHeightCm(event.target.value)}
            placeholder="178"
            required
          />
        </Field>
      )}

      <Field
        label="Date of birth"
        error={errors?.dateOfBirth}
        hint="So training load can be read against your age"
      >
        <Input
          type="date"
          name="dateOfBirth"
          autoComplete="bday"
          value={dateOfBirth}
          onChange={(event) => setDateOfBirth(event.target.value)}
          required
        />
      </Field>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink-muted">Sex</span>
        <SegmentedControl
          name="sex"
          aria-label="Sex"
          options={SEX_OPTIONS}
          value={sex}
          onChange={setSex}
          columns={2}
        />
        {errors?.sex && (
          <span role="alert" className="block text-sm text-danger">
            {errors.sex}
          </span>
        )}
      </div>

      <Field label="Training goal" error={errors?.trainingGoal}>
        <Select
          name="trainingGoal"
          value={trainingGoal}
          onChange={(event) => setTrainingGoal(event.target.value)}
          required
        >
          <option value="" disabled>
            Choose a goal
          </option>
          {TRAINING_GOALS.map((goal) => (
            <option key={goal} value={goal}>
              {TRAINING_GOAL_LABELS[goal]}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
