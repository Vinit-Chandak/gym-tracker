import { TRAINING_SPORTS, type TrainingSport } from "@/domain/sport-scope";

/** The `sport` search parameter, or lifting: an unknown value is not an error (plan §3.10). */
export function parseSport(value: string | string[] | undefined): TrainingSport {
  return TRAINING_SPORTS.find((sport) => sport === value) ?? "workout";
}
