import { FoodSummary } from "@/components/food/food-summary";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { addUp, macroTargets } from "@/domain/nutrition";
import type { BodyLoadUnit } from "@/domain/types";
import { formatFoodAmount, formatIsoWeekdayDay } from "@/lib/format";
import type { FoodScreen } from "@/server/repositories/nutrition";

import { MealsPanel } from "./meals-panel";
import { StarredMeals } from "./starred-meals";
import { TargetsForm } from "./targets-form";

export type FoodViewProps = {
  today: string;
  screen: FoodScreen;
  /** The newest body weight reading, which the protein target is worked out from. */
  bodyWeightKg: number | null;
  unit: BodyLoadUnit;
  /** The name a new meal starts with. */
  suggestedName: string;
};

/**
 * The Food screen (ADR 0032): the day against its targets, the starred meals, the day's meals and
 * the way to add one, then the targets themselves. Until there is a target, setting one is what
 * the screen opens with.
 */
export function FoodView({ today, screen, bodyWeightKg, unit, suggestedName }: FoodViewProps) {
  const target = screen.targets ? macroTargets(screen.targets, bodyWeightKg) : null;
  const eaten = addUp(screen.meals.flatMap((meal) => meal.items));
  // Targets that are not doing what they were set to do open themselves, so the reason is on
  // the screen: protein by body weight with no weight to go on, or a target too small to hold it.
  const needsAttention =
    target !== null && (target.overBudget || target.split !== screen.targets?.split);
  const targetsForm = (
    <TargetsForm
      targets={screen.targets}
      bodyWeightKg={bodyWeightKg}
      unit={unit}
      submitLabel={screen.targets ? "Save targets" : "Set target"}
    />
  );

  return (
    <>
      <PageHeader title="Food" meta={formatIsoWeekdayDay(today)} backHref="/today" />
      <PageContent>
        {target ? (
          <Card>
            <FoodSummary eaten={eaten} target={target} detail />
          </Card>
        ) : (
          <Card>
            <h2 className="text-lg font-medium">Set a daily target</h2>
            {targetsForm}
          </Card>
        )}

        {screen.savedMeals.length > 0 && (
          <StarredMeals
            meals={screen.savedMeals.map(({ id, name, totals }) => ({
              id,
              name,
              kcal: totals.kcal,
            }))}
          />
        )}

        {/* Until there is a target, setting one is the screen's one primary action. */}
        <MealsPanel meals={screen.meals} suggestedName={suggestedName} primary={target !== null} />

        {target && (
          <Disclosure
            summary="Targets"
            meta={`${formatFoodAmount(target.kcal)} kcal`}
            defaultOpen={needsAttention}
          >
            {targetsForm}
          </Disclosure>
        )}
      </PageContent>
    </>
  );
}
