"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import Link from "@/components/ui/app-link";
import { buttonClassName } from "@/components/ui/button";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import {
  DEFAULT_PROTEIN_PER_KG,
  macroTargets,
  matchesSplit,
  NUTRITION_LIMITS,
  splitFor,
  splitTargets,
  type NutritionTargets,
} from "@/domain/nutrition";
import { sanitizeNumberEntry } from "@/domain/sets";
import type { BodyLoadUnit, TrainingGoal } from "@/domain/types";
import { formatFoodAmount, formatSplit } from "@/lib/format";
import { TRAINING_GOAL_LABELS } from "@/lib/labels";
import { previousAppPage } from "@/lib/navigation-history";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { formatBodyWeight } from "@/lib/units";
import { saveTargetsAction } from "@/server/actions/nutrition";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

/** A field's number, when it holds one inside the bounds; otherwise null. */
function numberIn(value: string, bounds: { min: number; max: number }): number | null {
  const parsed = Number(value.replace(",", "."));
  if (value.trim() === "" || !Number.isFinite(parsed)) return null;
  return parsed >= bounds.min && parsed <= bounds.max ? parsed : null;
}

/**
 * The day's target, protein per kilogram and fat's share of the target (ADR 0035). Carbohydrate
 * is whatever energy is left, so the three always add up, and the grams they come to are worked
 * out as they are typed, by the same rule the screens use.
 *
 * The profile's training goal chooses the split a first set of targets starts from: protein and
 * fat follow it as the target is typed, until either is changed. Afterwards the split is offered,
 * in one button, only while the targets differ from it.
 */
export function TargetsForm({
  targets,
  bodyWeightKg,
  unit,
  goal,
  leaveTo = "/food",
}: {
  targets: NutritionTargets | null;
  /** The newest reading, which protein is worked out from. */
  bodyWeightKg: number | null;
  unit: BodyLoadUnit;
  goal: TrainingGoal | null;
  /** Where a save returns to when there is no page to go back to. */
  leaveTo?: Route;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(saveTargetsAction),
    INITIAL_FORM_STATE,
  );
  const split = splitFor(goal);
  const weighed = bodyWeightKg !== null && bodyWeightKg > 0;
  const splitFat = String(Math.round(split.fat * 100));
  const [dailyKcal, setDailyKcal] = useState(
    state.values?.dailyKcal ?? (targets ? String(targets.dailyKcal) : ""),
  );
  const [proteinPerKg, setProteinPerKg] = useState(
    state.values?.proteinPerKg ??
      (targets ? String(targets.proteinPerKg) : weighed ? "" : String(DEFAULT_PROTEIN_PER_KG)),
  );
  const [fatPercent, setFatPercent] = useState(
    state.values?.fatPercent ?? (targets ? String(targets.fatPercent) : splitFat),
  );
  // A first set of targets follows the goal's split until protein or fat is changed by hand.
  const [following, setFollowing] = useState(targets === null && !state.values);

  const kcal = numberIn(dailyKcal, NUTRITION_LIMITS.dailyKcal);
  const fromSplit = kcal !== null ? splitTargets(split, Math.round(kcal), bodyWeightKg) : null;
  const shownProtein = following && weighed ? String(fromSplit?.proteinPerKg ?? "") : proteinPerKg;
  const shownFat = following ? splitFat : fatPercent;
  const perKg = numberIn(shownProtein, NUTRITION_LIMITS.proteinPerKg);
  const fat = numberIn(shownFat, NUTRITION_LIMITS.fatPercent);
  const typed =
    kcal !== null && (perKg !== null || !weighed) && fat !== null
      ? {
          dailyKcal: Math.round(kcal),
          proteinPerKg: Math.round((perKg ?? DEFAULT_PROTEIN_PER_KG) * 10) / 10,
          fatPercent: Math.round(fat),
        }
      : null;
  const preview = typed ? macroTargets(typed, bodyWeightKg, goal) : null;
  const offerSplit = !following && typed !== null && !matchesSplit(typed, split, bodyWeightKg);

  /** Protein or fat changed by hand: both keep what they show, and stop following the split. */
  const stopFollowing = () => {
    if (!following) return;
    setProteinPerKg(shownProtein);
    setFatPercent(shownFat);
    setFollowing(false);
  };

  const saved =
    state !== INITIAL_FORM_STATE &&
    state.fieldErrors === undefined &&
    state.formError === undefined &&
    state.values === undefined;
  useEffect(() => {
    if (!saved) return;
    // Back to wherever the targets were opened from, so Back does not return to the form.
    if (previousAppPage()) router.back();
    else router.replace(leaveTo);
  }, [saved, router, leaveTo]);

  return (
    // After a failed save the form goes on showing what was typed, rather than being reset.
    <form action={formAction} onReset={(event) => event.preventDefault()} className="space-y-4">
      <div className="box space-y-4 panel-padding">
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

        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-medium text-ink-muted">Goal</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={goal ? undefined : "text-ink-muted"}>
              {goal ? TRAINING_GOAL_LABELS[goal] : "Not set"}
            </p>
            {offerSplit && fromSplit && (
              <button
                type="button"
                className={buttonClassName("secondary", "sm", "tabular-nums")}
                onClick={() => {
                  if (fromSplit.proteinPerKg !== null) {
                    setProteinPerKg(String(fromSplit.proteinPerKg));
                  }
                  setFatPercent(String(fromSplit.fatPercent));
                }}
              >
                Use {formatSplit(split)}
              </button>
            )}
          </div>
        </div>

        <Field
          label="Protein, g per kg of body weight"
          error={state.fieldErrors?.proteinPerKg}
          hint={
            weighed && perKg !== null
              ? `${formatFoodAmount((Math.round(perKg * 10) / 10) * bodyWeightKg)} g at ${formatBodyWeight(bodyWeightKg, unit)}`
              : undefined
          }
        >
          <Input
            name="proteinPerKg"
            inputMode="decimal"
            autoComplete="off"
            value={shownProtein}
            onChange={(event) => {
              stopFollowing();
              setProteinPerKg(
                sanitizeNumberEntry(
                  event.target.value,
                  "decimal",
                  NUTRITION_LIMITS.proteinPerKg.max,
                ),
              );
            }}
          />
        </Field>

        <Field label="Fat, % of daily target" error={state.fieldErrors?.fatPercent}>
          <Input
            name="fatPercent"
            inputMode="numeric"
            autoComplete="off"
            value={shownFat}
            onChange={(event) => {
              stopFollowing();
              setFatPercent(
                sanitizeNumberEntry(event.target.value, "numeric", NUTRITION_LIMITS.fatPercent.max),
              );
            }}
          />
        </Field>

        {!weighed && (
          <p className="text-sm text-ink-muted">
            There is no body weight on your profile yet, so protein is{" "}
            {Math.round(split.protein * 100)}% of the target until there is.{" "}
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
            Protein and fat alone come to more than {formatFoodAmount(preview.kcal)} kcal, so there
            is nothing left for carbs.
          </p>
        )}
      </div>
      <FormError message={state.formError} />
      <SubmitButton>{targets ? "Save targets" : "Set target"}</SubmitButton>
    </form>
  );
}
