import { legacySportOf, sportFromParam } from "@/domain/activity";
import { TRAINING_SPORTS, type TrainingSport } from "@/domain/sport-scope";

/**
 * The `sport` search parameter, or lifting: an unknown value is not an error (plan §3.10).
 *
 * The social screens speak the shared-stats vocabulary and the rest of the app speaks the
 * canonical one, so `?sport=running` and `?sport=run` both arrive here and mean the same
 * thing. Accepting only one of them made the other silently show lifting, which reads as
 * the wrong data rather than as a rejected parameter.
 */
export function parseSport(value: string | string[] | undefined): TrainingSport {
  const one = typeof value === "string" ? value : undefined;
  const legacy = TRAINING_SPORTS.find((sport) => sport === one);
  if (legacy) return legacy;
  const canonical = sportFromParam(one);
  return canonical ? legacySportOf(canonical) : "workout";
}
