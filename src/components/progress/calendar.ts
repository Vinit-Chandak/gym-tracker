import type { CalendarEntry } from "@/components/art/art";
import type { PrintPart, Sport, StrengthColumn } from "@/components/art/geometry";
import type { ActivitySport } from "@/domain/activity";

/** What the calendar needs of an activity: its sport, its day and what it measured. */
export type DayActivity = {
  sport: ActivitySport;
  /** The local date it happened on, "2026-09-25". */
  occurredOn: string;
  durationMs: number | null;
  distanceMetres: number | null;
  /** "treadmill", "indoor", "pool", "open_water"; null where the sport has none. */
  environment: string | null;
};

/** Each sport as the art draws it: lifting a block, a run a runner, a ride a wheel, a swim a wave. */
export const ART_SPORT: Record<ActivitySport, Sport> = {
  strength: "strength",
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

const km = (metres: number) => `${Math.round(metres / 100) / 10} km`;

/**
 * An activity as a calendar's day is read out (DESIGN.md, The month: "every past day is a link
 * named with what it holds"): "lifting 42 min", "run 3 km indoors", "ride 25 km",
 * "swim 1,500 m".
 */
export function saidOf(activity: DayActivity): string {
  const minutes = activity.durationMs === null ? null : Math.round(activity.durationMs / 60_000);
  const indoors =
    activity.environment === "treadmill" || activity.environment === "indoor" ? " indoors" : "";
  switch (activity.sport) {
    case "strength":
      return `lifting${minutes ? ` ${minutes} min` : ""}`;
    case "running":
      return `run${activity.distanceMetres ? ` ${km(activity.distanceMetres)}` : ""}${indoors}`;
    case "cycling":
      return `ride${
        activity.distanceMetres
          ? ` ${km(activity.distanceMetres)}`
          : minutes
            ? ` ${minutes} min`
            : ""
      }${indoors}`;
    case "swimming":
      return `swim${
        activity.distanceMetres
          ? ` ${Math.round(activity.distanceMetres).toLocaleString("en-GB")} m`
          : ""
      }`;
  }
}

/** A month's days, each with its activities as marks, in the order they were done. */
export function monthDays(
  activities: readonly DayActivity[],
  month: string,
): Record<number, CalendarEntry[]> {
  const days: Record<number, CalendarEntry[]> = {};
  for (const activity of activities) {
    if (activity.occurredOn.slice(0, 7) !== month) continue;
    const day = Number(activity.occurredOn.slice(8, 10));
    (days[day] ??= []).push({ sport: ART_SPORT[activity.sport], said: saidOf(activity) });
  }
  return days;
}

export type SportTally = {
  sport: ActivitySport;
  count: number;
  /** Metres, for the sports that measure one; null for lifting or where none was recorded. */
  metres: number | null;
};

/** How many of each sport, and how far, in the order the calendar's legend names them. */
export function tally(activities: readonly DayActivity[]): SportTally[] {
  const order: ActivitySport[] = ["strength", "running", "cycling", "swimming"];
  return order.flatMap((sport) => {
    const own = activities.filter((activity) => activity.sport === sport);
    if (own.length === 0) return [];
    const measured = own.filter((activity) => activity.distanceMetres !== null);
    return [
      {
        sport,
        count: own.length,
        metres:
          sport === "strength" || measured.length === 0
            ? null
            : measured.reduce((sum, activity) => sum + activity.distanceMetres!, 0),
      },
    ];
  });
}

/** "Lifting", "Runs", "Rides", "Swims": what a tally is of. */
export function tallyName(sport: ActivitySport, count: number): string {
  const one = count === 1;
  switch (sport) {
    case "strength":
      return "Lifting";
    case "running":
      return one ? "Run" : "Runs";
    case "cycling":
      return one ? "Ride" : "Rides";
    case "swimming":
      return one ? "Swim" : "Swims";
  }
}

/** "30.8 km": a month's distance, to a tenth. */
export function tallyDistance(metres: number): string {
  return km(metres);
}

/** The months from `first` to `last`, as "2026-08", oldest first. */
export function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7));
  const endYear = Number(last.slice(0, 4));
  const endMonth = Number(last.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** The last day of a month, "2026-09-30". */
export function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

/** One thing done on a day, as its print draws it. */
export type DayPiece =
  | { sport: Exclude<ActivitySport, "strength"> }
  | { sport: "strength"; columns: readonly StrengthColumn[] };

/**
 * A day's record as a print (DESIGN.md, Prints: a record's print draws what was done), its parts
 * in the day's order. A day with two workouts draws their exercises as one block of columns, in
 * the first one's place: a print has one strength part.
 */
export function dayParts(pieces: readonly DayPiece[]): PrintPart[] {
  const parts: PrintPart[] = [];
  let strength: StrengthColumn[] | null = null;
  for (const piece of pieces) {
    if (piece.sport === "strength") {
      if (strength) strength.push(...piece.columns);
      else {
        strength = [...piece.columns];
        parts.push({ kind: "strength", columns: strength });
      }
      continue;
    }
    parts.push({ kind: ART_SPORT[piece.sport] as "run" | "ride" | "swim", state: "done" });
  }
  return parts.filter((part) => part.kind !== "strength" || part.columns.length > 0);
}
