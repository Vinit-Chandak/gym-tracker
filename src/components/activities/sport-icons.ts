import { Bicycle, Dumbbell, Run, Waves, type AppIcon } from "@/components/ui/icons";
import type { ActivitySport, EnduranceSport } from "@/domain/activity";

/** One glyph per sport, the same wherever a session or a log is listed. */
export const SPORT_ICONS: Record<ActivitySport, AppIcon> = {
  strength: Dumbbell,
  running: Run,
  cycling: Bicycle,
  swimming: Waves,
};

/** The thing you did, as a word: "Log a run", "the ride scheduled for Tuesday". */
export const SPORT_NOUNS: Record<ActivitySport, string> = {
  strength: "session",
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

export function sportNoun(sport: EnduranceSport): string {
  return SPORT_NOUNS[sport];
}
