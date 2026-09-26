"use client";

import { useActionState, useState } from "react";

import Link from "@/components/ui/app-link";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DEFAULT_PROTEIN_PER_KG,
  MACRO_SPLITS,
  macroTargets,
  NUTRITION_LIMITS,
  type MacroSplit,
  type NutritionTargets,
} from "@/domain/nutrition";
import { sanitizeNumberEntry } from "@/domain/sets";
import type { BodyLoadUnit } from "@/domain/types";
import { formatFoodAmount } from "@/lib/format";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { formatBodyWeight } from "@/lib/units";
import { saveTargetsAction } from "@/server/actions/nutrition";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

/** Non-breaking, so the three numbers never part company at the end of a line. */
const FIXED_SPLIT_LABEL = "55\u00a0/\u00a025\u00a0/\u00a020";

const SPLIT_OPTIONS: readonly { value: MacroSplit; label: string }[] = [
  { value: "body_weight", label: "By body weight" },
  { value: "fixed_55_25_20", label: FIXED_SPLIT_LABEL },
];

function asSplit(value: string | undefined): MacroSplit | null {
  return (MACRO_SPLITS as readonly string[]).includes(value ?? "") ? (value as MacroSplit) : null;
}

/** A field's number, when it holds one. */
function numberIn(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return value.trim() === "" || !Number.isFinite(parsed) ? null : parsed;
}

/**
 * The day's target, how it is split, and protein per kilogram (ADR 0032). The grams it comes to
 * are worked out as it is typed, by the same rule the screens use, so what Save will set is on
 * the form before it is saved.
 */
export function TargetsForm({
  targets,
  bodyWeightKg,
  unit,
  submitLabel,
}: {
  targets: NutritionTargets | null;
  /** The newest reading, which protein is worked out from. */
  bodyWeightKg: number | null;
  unit: BodyLoadUnit;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(saveTargetsAction),
    INITIAL_FORM_STATE,
  );
  const [dailyKcal, setDailyKcal] = useState(
    state.values?.dailyKcal ?? (targets ? String(targets.dailyKcal) : ""),
  );
  const [split, setSplit] = useState<MacroSplit>(
    asSplit(state.values?.split) ?? targets?.split ?? "body_weight",
  );
  const [proteinPerKg, setProteinPerKg] = useState(
    state.values?.proteinPerKg ?? String(targets?.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG),
  );

  const kcal = numberIn(dailyKcal);
  const perKg = numberIn(proteinPerKg);
  const savedPerKg = Math.round((perKg ?? DEFAULT_PROTEIN_PER_KG) * 10) / 10;
  const preview =
    kcal !== null &&
    kcal >= NUTRITION_LIMITS.dailyKcal.min &&
    kcal <= NUTRITION_LIMITS.dailyKcal.max &&
    (split === "fixed_55_25_20" ||
      (perKg !== null &&
        perKg >= NUTRITION_LIMITS.proteinPerKg.min &&
        perKg <= NUTRITION_LIMITS.proteinPerKg.max))
      ? macroTargets(
          {
            dailyKcal: Math.round(kcal),
            proteinPerKg: savedPerKg,
            split,
          },
          bodyWeightKg,
        )
      : null;
  const noWeight = split === "body_weight" && bodyWeightKg === null;

  return (
    // After a save the form goes on showing what was saved, rather than being reset around it.
    <form action={formAction} onReset={(event) => event.preventDefault()} className="space-y-4">
      <Field label="Daily target, kcal" error={state.fieldErrors?.dailyKcal}>
        <Input
          name="dailyKcal"
          inputMode="numeric"
          autoComplete="off"
          placeholder="2400"
          value={dailyKcal}
          onChange={(event) =>
            setDailyKcal(
              sanitizeNumberEntry(event.target.value, "numeric", NUTRITION_LIMITS.dailyKcal.max),
            )
          }
        />
      </Field>
      <Field
        group
        label="Split"
        error={state.fieldErrors?.split}
        info="By body weight: protein from what you weigh, fat a quarter of the target, and carbs the rest. 55 / 25 / 20: carbs, fat and protein as shares of the target."
      >
        <SegmentedControl name="split" options={SPLIT_OPTIONS} value={split} onChange={setSplit} />
      </Field>
      {split === "body_weight" ? (
        <Field
          label="Protein, g per kg of body weight"
          error={state.fieldErrors?.proteinPerKg}
          hint={
            bodyWeightKg !== null && perKg !== null
              ? `${formatFoodAmount(savedPerKg * bodyWeightKg)} g at ${formatBodyWeight(bodyWeightKg, unit)}`
              : undefined
          }
        >
          <Input
            name="proteinPerKg"
            inputMode="decimal"
            autoComplete="off"
            value={proteinPerKg}
            onChange={(event) =>
              setProteinPerKg(
                sanitizeNumberEntry(
                  event.target.value,
                  "decimal",
                  NUTRITION_LIMITS.proteinPerKg.max,
                ),
              )
            }
          />
        </Field>
      ) : (
        // Kept as it was left, so switching back to body weight finds it unchanged.
        <input type="hidden" name="proteinPerKg" value={proteinPerKg} />
      )}
      {noWeight && (
        <p className="text-sm text-ink-muted">
          There is no body weight on your profile yet, so {FIXED_SPLIT_LABEL} applies until there
          is.{" "}
          <Link href="/profile/edit" className="text-accent underline underline-offset-2">
            Add it in your profile
          </Link>
        </p>
      )}
      {preview && (
        <p className="text-sm tabular-nums">
          Carbs {formatFoodAmount(preview.carbsG)} g · Fat {formatFoodAmount(preview.fatG)} g ·
          Protein {formatFoodAmount(preview.proteinG)} g
        </p>
      )}
      {preview?.overBudget && (
        <p className="text-sm text-warning">
          Protein and fat alone come to more than {formatFoodAmount(preview.kcal)} kcal, so there is
          nothing left for carbs.
        </p>
      )}
      <FormError message={state.formError} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
