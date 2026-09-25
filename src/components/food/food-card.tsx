import Link from "@/components/ui/app-link";
import { ChevronRight } from "@/components/ui/icons";
import type { FoodTotals, MacroTargets } from "@/domain/nutrition";
import { formatFoodAmount } from "@/lib/format";

import { FoodSummary } from "./food-summary";

/**
 * Today's food, as one box that opens the Food screen (ADR 0032). Only on Today when food
 * tracking is switched on for the account; before a target is set it asks for one.
 */
export function FoodCard({ eaten, target }: { eaten: FoodTotals; target: MacroTargets | null }) {
  const chevron = <ChevronRight className="text-ink-subtle" aria-hidden />;
  return (
    <Link
      href="/today/food"
      className="block box panel-padding transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
    >
      {target ? (
        <FoodSummary eyebrow="Food" eaten={eaten} target={target} trailing={chevron} />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xs font-medium tracking-wide text-ink-muted uppercase">Food</h2>
            <p className="mt-1 text-lg font-medium">Set a daily target</p>
            {eaten.kcal > 0 && (
              <p className="mt-1.5 text-sm text-ink-muted tabular-nums">
                {formatFoodAmount(eaten.kcal)} kcal logged today
              </p>
            )}
          </div>
          {chevron}
        </div>
      )}
    </Link>
  );
}
