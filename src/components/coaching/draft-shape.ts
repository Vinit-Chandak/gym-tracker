import { cycleLayout, inferCycleRepeat } from "@/domain/cycle-repeat";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { joinFacts } from "@/lib/facts";

/**
 * "6 weeks · 4 days per cycle · 91 sets a cycle", counting one of anything as one — with the
 * cycle said the way it repeats: "3 days a week", or "11 cycles of 4 days".
 */
export function draftShape(blueprint: ProgramBlueprint): string {
  if (blueprint.sport && blueprint.sport !== "strength")
    return `${blueprint.weeks} weeks · ${blueprint.enduranceSessions?.length ?? 0} sessions`;
  const sets = blueprint.days.reduce(
    (total, day) => total + day.exercises.reduce((sum, e) => sum + e.sets, 0),
    0,
  );
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  // A first programme that has not chosen takes the repeat its days suggest when it starts.
  const plan = { ...blueprint, repeats: blueprint.repeats ?? inferCycleRepeat(blueprint.days) };
  const { cycles, byWeekday } = cycleLayout(plan);
  if (blueprint.repeats === "once")
    return `${blueprint.weeks} weeks · ${blueprint.days.length} days · Progressive`;
  const days = plural(blueprint.days.length, "day");
  const cycle =
    blueprint.days.length === 7
      ? `${days} per cycle`
      : byWeekday
        ? `${days} a week`
        : `${plural(cycles, "cycle")} of ${days}`;
  return joinFacts([plural(blueprint.weeks, "week"), cycle, `${plural(sets, "set")} a cycle`]);
}
