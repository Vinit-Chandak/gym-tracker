import { Dumbbell, Ride, Run, Swim, type AppIcon } from "@/components/ui/icons";
import type { ActivitySport } from "@/domain/activity";
import { SPORT_TONE, TONE_SOFT } from "@/lib/sport-tone";
import { cn } from "@/lib/utils";

export const SPORT_ICON: Record<ActivitySport, AppIcon> = {
  strength: Dumbbell,
  running: Run,
  cycling: Ride,
  swimming: Swim,
};

/**
 * A sport's figure on its own soft wash: how a card or a row says which sport it is before
 * a word is read. Decorative, so whatever sits beside it still has to name the sport.
 */
export function SportChip({
  sport,
  size = "md",
  className,
}: {
  sport: ActivitySport;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = SPORT_ICON[sport];
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "md" ? "size-11 rounded-control" : "size-9 rounded-control",
        TONE_SOFT[SPORT_TONE[sport]],
        className,
      )}
    >
      <Icon />
    </span>
  );
}
