/**
 * Time zones as the app keeps them: a place's IANA name ("Asia/Kolkata", "America/New_York"), or
 * UTC.
 *
 * Abbreviations and offsets are refused even where a browser can read them. "IST" is India to
 * the browser and Israel to Postgres; Postgres reads "+05:30" with its sign the other way round;
 * "EST" never moves for summer. Each would put the same workout on one day on Today and the
 * calendar, which the browser and the server date, and on another in the graphs, which Postgres
 * dates. A place's name means the same zone to all of them, all year.
 */

/** "Area/Place", "Area/Region/Place": letters, digits and `_ + -`, as the zone database writes. */
const PLACE = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$/;

let listed: readonly string[] | null = null;

/** Every zone this platform names, as it spells them; none where it cannot list them. */
export function supportedTimeZones(): readonly string[] {
  if (listed === null) {
    try {
      listed = Intl.supportedValuesOf("timeZone");
    } catch {
      listed = [];
    }
  }
  return listed;
}

export type TimeZoneCheck =
  | { zone: string; problem?: never }
  /** `unknown`: no clock here can read it. `not_a_place`: an abbreviation or an offset. */
  | { zone?: never; problem: "unknown" | "not_a_place" };

/**
 * A zone as typed, checked, and spelt the way this platform spells it, so "asia/kolkata" is kept
 * as "Asia/Kolkata" where the platform lists it. A name the platform reads but files under
 * another (Asia/Kolkata under Asia/Calcutta) keeps its own: both are the same place's.
 */
export function checkTimeZone(input: string): TimeZoneCheck {
  const zone = input.trim();
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return { problem: "unknown" };
  }
  // Every name UTC goes by is UTC.
  if (resolved === "UTC" || resolved === "Etc/UTC") return { zone: "UTC" };
  // Etc/GMT+5 is an offset under a name, and five hours west of Greenwich, not east.
  if (!PLACE.test(zone) || /^etc\//i.test(zone)) return { problem: "not_a_place" };
  const lower = zone.toLowerCase();
  const spelt =
    supportedTimeZones().find((name) => name.toLowerCase() === lower) ??
    (resolved.toLowerCase() === lower ? resolved : zone);
  return { zone: spelt };
}

/** The region a zone is filed under in a list of them: "America", "Asia", "Indian". */
export function timeZoneArea(zone: string): string {
  return zone.includes("/") ? zone.slice(0, zone.indexOf("/")).replaceAll("_", " ") : zone;
}

/**
 * A zone's place, as a list under its region names it: "Kolkata", "New York", "Buenos Aires,
 * Argentina" for America/Argentina/Buenos_Aires.
 */
export function timeZonePlace(zone: string): string {
  const parts = zone.split("/");
  if (parts.length < 2) return zone;
  return parts.slice(1).reverse().join(", ").replaceAll("_", " ");
}
