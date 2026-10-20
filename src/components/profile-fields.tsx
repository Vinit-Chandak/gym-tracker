"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { TimeZoneSelect } from "@/components/time-zone-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { UsernameField } from "@/components/username-field";
import {
  BODY_LOAD_UNITS,
  SEXES,
  TRAINING_GOALS,
  type BodyLoadUnit,
  type Sex,
  type TrainingGoal,
} from "@/domain/types";
import {
  followsWeight,
  followWeight,
  type DistanceUnit,
  type PoolUnit,
  type SportUnits,
} from "@/lib/distance-units";
import { LOAD_UNIT_LABELS, SEX_LABELS, TRAINING_GOAL_LABELS } from "@/lib/labels";
import {
  checkTimeZone,
  deviceTimeZone,
  preferredTimeZone,
  sameTimeZone,
  timeZonePlace,
} from "@/lib/time-zones";
import {
  fromKilograms,
  heightUnitFor,
  toCentimetres,
  toFeetAndInches,
  toKilograms,
} from "@/lib/units";

export type ProfileFieldValues = {
  displayName: string;
  username: string;
  timeZone: string;
  preferredUnit: BodyLoadUnit;
  /** As the account reads them now: chosen, or the weight unit's (ADR 0055). */
  distanceUnit: DistanceUnit;
  poolUnit: PoolUnit;
  /** Whether the account swims, which is when it is asked about pools. */
  swims: boolean;
  /** Stored in kilograms and centimetres; shown in whichever units the account uses. */
  bodyWeightKg: number | null;
  heightCm: number | null;
  dateOfBirth: string | null;
  sex: Sex | null;
  trainingGoal: TrainingGoal | null;
};

/** Each choice in setup's words (board Units and time zone): one vocabulary for one choice. */
const UNIT_OPTIONS = BODY_LOAD_UNITS.map((unit) => ({
  value: unit as string,
  label: LOAD_UNIT_LABELS[unit],
}));

const DISTANCE_OPTIONS = [
  { value: "km", label: "km" },
  { value: "mi", label: "mi" },
] as const;

const POOL_OPTIONS = [
  { value: "m", label: "Metres" },
  { value: "yd", label: "Yards" },
] as const;

/** Saying nothing is the fourth answer, and the one the control starts on. */
const SEX_OPTIONS = [
  ...SEXES.map((sex) => ({ value: sex as string, label: SEX_LABELS[sex] })),
  { value: "", label: "Prefer not to say" },
];

/** A device's zone does not change while a form is open, so there is nothing to subscribe to. */
function noSubscription(): () => void {
  return () => {};
}

/**
 * The zone the browser is in, by its place's current name, or null on the server, where it is
 * unknowable. Read through `useSyncExternalStore` so the server and the first client render agree
 * and hydration is clean.
 */
function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(noSubscription, deviceTimeZone, () => null);
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
 * numbers are about: everything setup asked, so nothing asked there is impossible to change
 * afterwards.
 *
 * Units are a live choice rather than a saved one: switching to pounds re-labels the weight
 * and re-states the height in feet and inches, carrying whatever is in the fields across, so
 * a half-filled form survives changing your mind. It takes miles and yards along with it too,
 * unless the distances were set apart from the weight unit.
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
  // A zone saved before the field was a list can be an abbreviation or an offset ("EST",
  // "+05:30"), which the app no longer keeps: the field then asks for a place instead.
  const saved = checkTimeZone(values.timeZone);
  const timeZone = editedZone ?? (suggest ? detected : (saved.zone ?? ""));
  // What the field needs now: a place for a zone saved as something else, or a word that the
  // device is somewhere other than the zone chosen, said by its place.
  const zoneHint =
    timeZone === "" && saved.problem
      ? `Choose a place: “${values.timeZone}” ${
          saved.problem === "unknown" ? "is not a known zone." : "can mean more than one zone."
        }`
      : detected && !sameTimeZone(detected, timeZone)
        ? `This device: ${timeZonePlace(preferredTimeZone(detected))}`
        : undefined;

  const [unit, setUnit] = useState<BodyLoadUnit>(values.preferredUnit);
  const imperial = heightUnitFor(unit) === "ftin";
  const [distances, setDistances] = useState<SportUnits>({
    distanceUnit: values.distanceUnit,
    poolUnit: values.poolUnit,
  });
  // Which distances go with the weight unit: those never set apart from it, as saved, until one
  // is chosen here. A choice the weight unit would give goes with it again (ADR 0055).
  const [follows, setFollows] = useState(() => followsWeight(values.preferredUnit, distances));
  function chooseDistance<K extends keyof SportUnits>(key: K, value: SportUnits[K]) {
    const next = { ...distances, [key]: value };
    setDistances(next);
    setFollows({ ...follows, [key]: followsWeight(unit, next)[key] });
  }

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

  /**
   * Re-states everything already typed in the units just chosen, and carries along a distance
   * that was following the weight unit (ADR 0055); one set apart from it stays.
   */
  function changeUnit(next: BodyLoadUnit) {
    if (next === unit) return;
    setDistances(followWeight(distances, next, follows));
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

      <UsernameField
        defaultValue={values.username}
        current={values.username}
        error={errors?.username}
      />

      {/* A place from a list, never typed: every day the app names is dated in it, and an
          abbreviation or an offset can mean one zone here and another in the graphs. */}
      <Field label="Time zone" error={errors?.timeZone} hint={zoneHint}>
        <TimeZoneSelect
          name="timeZone"
          value={timeZone}
          detected={detected}
          onChange={(event) => setEditedZone(event.target.value)}
          required
        />
      </Field>

      {/* The units, each a choice of two, with what it decides in its ⓘ. Weight leads, and the
          distances start from it: a distance nobody set apart moves with it (ADR 0055). */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1 text-[length:var(--ov-type-meta-small)] font-bold text-ink">
          <span id="profile-weight-unit">Weight</span>
          <InfoTip label="About weight">
            Loads and body weight, and height with them: centimetres with kg, feet and inches with
            lb.
          </InfoTip>
        </div>
        <SegmentedControl
          name="preferredUnit"
          aria-labelledby="profile-weight-unit"
          options={UNIT_OPTIONS}
          value={unit}
          onChange={(next) => changeUnit(next as BodyLoadUnit)}
          columns={2}
        />
        {errors?.preferredUnit && (
          <span role="alert" className="block type-meta-small font-semibold">
            {errors.preferredUnit}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1 text-[length:var(--ov-type-meta-small)] font-bold text-ink">
          <span id="profile-distance-unit">Distance</span>
          <InfoTip label="About distance">
            Runs and rides. Carries and sleds go in metres with km, in yards with miles.
          </InfoTip>
        </div>
        <SegmentedControl
          name="distanceUnit"
          aria-labelledby="profile-distance-unit"
          options={DISTANCE_OPTIONS}
          value={distances.distanceUnit}
          onChange={(distanceUnit) => chooseDistance("distanceUnit", distanceUnit)}
          columns={2}
        />
        {errors?.distanceUnit && (
          <span role="alert" className="block type-meta-small font-semibold">
            {errors.distanceUnit}
          </span>
        )}
      </div>

      {/* Pools are asked of a swimmer only, as setup asks them; anyone else's goes on as it is,
          following the weight unit unless it was set apart. */}
      {values.swims ? (
        <div className="space-y-1.5">
          <span
            id="profile-pool-unit"
            className="block text-[length:var(--ov-type-meta-small)] font-bold text-ink"
          >
            Pools
          </span>
          <SegmentedControl
            name="poolUnit"
            aria-labelledby="profile-pool-unit"
            options={POOL_OPTIONS}
            value={distances.poolUnit}
            onChange={(poolUnit) => chooseDistance("poolUnit", poolUnit)}
            columns={2}
          />
          {errors?.poolUnit && (
            <span role="alert" className="block type-meta-small font-semibold">
              {errors.poolUnit}
            </span>
          )}
        </div>
      ) : (
        <input type="hidden" name="poolUnit" value={distances.poolUnit} />
      )}

      {/* Metric, the two figures share a row (board Edit profile); feet and inches need one
          of their own. */}
      <div
        className={
          imperial
            ? "space-y-4"
            : "grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start gap-3"
        }
      >
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
            <span className="block text-[length:var(--ov-type-meta-small)] font-bold text-ink">
              Height
            </span>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Feet" error={errors?.heightFeet}>
                <Input
                  type="text"
                  name="heightFeet"
                  inputMode="numeric"
                  value={feet}
                  onChange={(event) => setFeet(event.target.value)}
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
      </div>

      <Field
        label="Date of birth"
        error={errors?.dateOfBirth}
        info="For your heart-rate zones and the coach."
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
        <span className="block text-[length:var(--ov-type-meta-small)] font-bold text-ink">
          Sex
        </span>
        <SegmentedControl
          name="sex"
          aria-label="Sex"
          options={SEX_OPTIONS}
          value={sex}
          onChange={setSex}
          columns={2}
        />
        {errors?.sex && (
          <span role="alert" className="block type-meta-small font-semibold">
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
