"use client";

import { useActionState, useRef, useState } from "react";

import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import {
  EQUIPMENT_CATEGORIES,
  LOAD_UNITS,
  RESISTANCE_MODES,
  type BodyLoadUnit,
  type LoadUnit,
  type ResistanceMode,
} from "@/domain/types";
import { EQUIPMENT_CATEGORY_LABELS, LOAD_UNIT_LABELS, RESISTANCE_MODE_LABELS } from "@/lib/labels";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import type { EquipmentTypeOption } from "@/server/repositories/equipment";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

export type EquipmentFormValues = {
  name: string;
  equipmentTypeId: string;
  manufacturer: string;
  model: string;
  resistanceMode: ResistanceMode;
  unit: LoadUnit;
  loadIncrement: string;
  pulleyRatio: string;
  angleDegrees: string;
  notes: string;
};

type EquipmentFormProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  types: EquipmentTypeOption[];
  initial?: EquipmentFormValues;
  submitLabel: string;
  /** The account's unit, used wherever the catalogue would otherwise say kilograms. */
  preferredUnit: BodyLoadUnit;
};

const MODE_OPTIONS = RESISTANCE_MODES.map((mode) => ({
  value: mode,
  label: RESISTANCE_MODE_LABELS[mode],
}));
const UNIT_OPTIONS = LOAD_UNITS.map((unit) => ({ value: unit, label: LOAD_UNIT_LABELS[unit] }));

function asMode(value: string | undefined): ResistanceMode | undefined {
  return (RESISTANCE_MODES as readonly string[]).includes(value ?? "")
    ? (value as ResistanceMode)
    : undefined;
}

function asUnit(value: string | undefined): LoadUnit | undefined {
  return (LOAD_UNITS as readonly string[]).includes(value ?? "") ? (value as LoadUnit) : undefined;
}

export function EquipmentForm({
  action,
  types,
  initial,
  submitLabel,
  preferredUnit,
}: EquipmentFormProps) {
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const value = (key: keyof EquipmentFormValues): string =>
    state.values?.[key] ?? initial?.[key] ?? "";

  // Type, name, load mode and unit are controlled so choosing a type can prefill the rest.
  const [typeId, setTypeId] = useState(() => value("equipmentTypeId"));
  const [name, setName] = useState(() => value("name"));
  const [mode, setMode] = useState<ResistanceMode>(
    () => asMode(value("resistanceMode")) ?? "selectorized",
  );
  const [unit, setUnit] = useState<LoadUnit>(() => asUnit(value("unit")) ?? preferredUnit);
  const touched = useRef({
    name: Boolean(initial),
    mode: Boolean(initial),
    unit: Boolean(initial),
  });

  function handleTypeChange(nextTypeId: string): void {
    setTypeId(nextTypeId);
    const type = types.find((t) => t.id === nextTypeId);
    if (!type) return;
    if (!touched.current.mode) setMode(type.defaultResistanceMode);
    // The catalogue is written in kilograms; a pounds account gets pounds by default.
    if (!touched.current.unit)
      setUnit(type.defaultUnit === "kg" ? preferredUnit : type.defaultUnit);
    if (!touched.current.name || name.trim() === "") setName(type.name);
  }

  const grouped = EQUIPMENT_CATEGORIES.map((category) => ({
    category,
    items: types.filter((t) => t.category === category),
  })).filter((group) => group.items.length > 0);

  // Manufacturer, model, angle and pulley ratio are worth recording and rarely edited;
  // folding them away keeps the four fields that decide progression in view. They open on
  // their own when one already holds a value or has just been rejected.
  const detailKeys = ["manufacturer", "model", "angleDegrees", "pulleyRatio"] as const;
  const detailError = detailKeys.some((key) => state.fieldErrors?.[key]);
  const hasDetail = detailKeys.some((key) => value(key).trim() !== "");

  return (
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className="space-y-[var(--section-gap)]"
    >
      <Section title="What it is">
        <Card>
          <Field label="Equipment type" error={state.fieldErrors?.equipmentTypeId}>
            <Select
              name="equipmentTypeId"
              value={typeId}
              onChange={(event) => handleTypeChange(event.target.value)}
              required
            >
              <option value="">Choose a type…</option>
              {grouped.map((group) => (
                <optgroup key={group.category} label={EQUIPMENT_CATEGORY_LABELS[group.category]}>
                  {group.items.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>

          <Field label="Name" error={state.fieldErrors?.name}>
            <Input
              name="name"
              value={name}
              onChange={(event) => {
                touched.current.name = true;
                setName(event.target.value);
              }}
              maxLength={80}
              autoComplete="off"
              required
            />
          </Field>

          <Field group label="Load" error={state.fieldErrors?.resistanceMode}>
            <SegmentedControl
              name="resistanceMode"
              options={MODE_OPTIONS}
              value={mode}
              onChange={(next) => {
                touched.current.mode = true;
                setMode(next);
              }}
              columns={3}
            />
          </Field>

          <Field group label="Unit" error={state.fieldErrors?.unit}>
            <SegmentedControl
              name="unit"
              options={UNIT_OPTIONS}
              value={unit}
              onChange={(next) => {
                touched.current.unit = true;
                setUnit(next);
              }}
              columns={5}
            />
          </Field>

          <Field
            label="Smallest load jump"
            info="In the unit above: 2.5 for a pair of 1.25 kg plates, or one stack step. Progression suggestions move by this amount."
            htmlFor="load-increment"
            error={state.fieldErrors?.loadIncrement}
          >
            <Input
              id="load-increment"
              name="loadIncrement"
              inputMode="decimal"
              defaultValue={value("loadIncrement")}
              placeholder="2.5"
            />
          </Field>
        </Card>
      </Section>

      <Disclosure summary="Additional details" defaultOpen={detailError || hasDetail}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Manufacturer" hint="Optional" error={state.fieldErrors?.manufacturer}>
              <Input name="manufacturer" defaultValue={value("manufacturer")} maxLength={80} />
            </Field>
            <Field label="Model" hint="Optional" error={state.fieldErrors?.model}>
              <Input name="model" defaultValue={value("model")} maxLength={80} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Angle (°)" hint="Optional" error={state.fieldErrors?.angleDegrees}>
              <Input name="angleDegrees" inputMode="decimal" defaultValue={value("angleDegrees")} />
            </Field>
            <Field label="Pulley ratio" hint="Optional" error={state.fieldErrors?.pulleyRatio}>
              <Input
                name="pulleyRatio"
                defaultValue={value("pulleyRatio")}
                placeholder="1:2"
                maxLength={40}
              />
            </Field>
          </div>

          <Field label="Notes" hint="Optional" error={state.fieldErrors?.notes}>
            <Textarea name="notes" defaultValue={value("notes")} maxLength={1000} />
          </Field>
        </div>
      </Disclosure>

      <div className="space-y-2">
        <FormError message={state.formError} />
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
