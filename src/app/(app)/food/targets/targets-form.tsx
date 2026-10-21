"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import Link from "@/components/ui/app-link";
import { buttonClassName } from "@/components/ui/button";
import { Figures } from "@/components/ui/figures";
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
import { joinFacts } from "@/lib/facts";
import { formatFoodAmount, formatMacros, formatSplit } from "@/lib/format";
import { TRAINING_GOAL_LABELS } from "@/lib/labels";
import { previousAppPage } from "@/lib/navigation-history";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { formatBodyWeight, LB_PER_KG } from "@/lib/units";
import { useFoodActions } from "@/components/food/food-actions";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

/** A field's number, when it holds one inside the bounds; otherwise null. */
function numberIn(value: string, bounds: { min: number; max: number }): number | null {
  const parsed = Number(value.replace(",", "."));
  if (value.trim() === "" || !Number.isFinite(parsed)) return null;
  return parsed >= bounds.min && parsed <= bounds.max ? parsed : null;
}

/** "0.82": grams per kilogram, to the tenth it is kept to, read per pound of body weight. */
function perPound(perKg: number): string {
  return (Math.round(((Math.round(perKg * 10) / 10) * 100) / LB_PER_KG) / 100).toLocaleString(
    "en-GB",
    { maximumFractionDigits: 2 },
  );
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
  const { saveTargetsAction } = useFoodActions();
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
      <div className="space-y-5">
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
          <p className="text-[length:var(--ov-type-meta-small)] font-bold">Goal</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* The goal's split named under it: a bare "55 / 25 / 20" said none of which was
                which, and "Use 45 / 25 / 30" was read as the split already set. */}
            <div className="min-w-0">
              <p className={goal ? "font-semibold" : "text-ink-2"}>
                {goal ? TRAINING_GOAL_LABELS[goal] : "Not set"}
              </p>
              <p id="goal-split" className="type-meta-small text-ink-2 tabular-nums">
                <Figures>{formatSplit(split)}</Figures>
              </p>
            </div>
            {offerSplit && fromSplit && (
              <button
                type="button"
                aria-describedby="goal-split"
                className={buttonClassName("secondary", "sm")}
                onClick={() => {
                  if (fromSplit.proteinPerKg !== null) {
                    setProteinPerKg(String(fromSplit.proteinPerKg));
                  }
                  setFatPercent(String(fromSplit.fatPercent));
                }}
              >
                Use this split
              </button>
            )}
          </div>
        </div>

        {/* Typed and kept per kilogram, which the label says as the field's unit, as "Daily
            target, kcal" does, rather than "per kg of body weight" as though the body were
            weighed in kilograms; someone who weighs in pounds reads the ratio per pound under
            it, and what a gram per pound comes to in its ⓘ. The unit is one phrase:
            a label that wraps takes it whole to the next line, never "g" / "per kg". */}
        <Field
          label={"Protein per body weight, g\u00a0per\u00a0kg"}
          error={state.fieldErrors?.proteinPerKg}
          hint={
            perKg !== null && (weighed || unit === "lb")
              ? joinFacts([
                  unit === "lb" ? `${perPound(perKg)} g per lb` : null,
                  weighed
                    ? `${formatFoodAmount((Math.round(perKg * 10) / 10) * bodyWeightKg)} g at ${formatBodyWeight(bodyWeightKg, unit)}`
                    : null,
                ])
              : undefined
          }
          info={
            unit === "lb" ? `1 g per lb is ${Math.round(LB_PER_KG * 10) / 10} g per kg.` : undefined
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
          <p className="type-meta-small text-ink-2">
            No body weight yet: protein is {Math.round(split.protein * 100)}% of the target.{" "}
            {/* Logged where every reading is (IA audit M8); saved, it comes back here. */}
            <Link href="/today/log/body-weight" className="font-bold underline underline-offset-2">
              Log body weight
            </Link>
          </p>
        )}
        {preview && (
          <p className="type-meta-small font-semibold tabular-nums">
            <Figures>{formatMacros(preview)}</Figures>
          </p>
        )}
        {preview?.overBudget && (
          <p className="type-meta-small font-semibold">
            Protein and fat alone pass {formatFoodAmount(preview.kcal)} kcal: nothing left for
            carbs.
          </p>
        )}
      </div>
      <FormError message={state.formError} />
      <SubmitButton>{targets ? "Save targets" : "Set target"}</SubmitButton>
    </form>
  );
}
