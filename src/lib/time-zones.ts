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

/**
 * Places the zone database has renamed, under the old name ICU still lists them by and reports a
 * device in: Chrome and Node say Asia/Calcutta for India, Africa/Asmera for Eritrea and
 * America/Godthab for Greenland. Each is the same zone as the name it maps to, which is the one
 * Postgres keeps and the one a list should show.
 */
const RENAMED: Readonly<Record<string, string>> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Coral_Harbour": "America/Atikokan",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

const readable = new Map<string, boolean>();

/** Whether this platform's clock can read a zone by that name. */
function canRead(zone: string): boolean {
  let known = readable.get(zone);
  if (known === undefined) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      known = true;
    } catch {
      known = false;
    }
    readable.set(zone, known);
  }
  return known;
}

/**
 * A zone by the name the zone database gives its place now: "Asia/Kolkata" for "Asia/Calcutta".
 * A platform too old to read the new name keeps the old one, which is the same zone to it.
 */
export function preferredTimeZone(zone: string): string {
  const renamed = RENAMED[zone];
  return renamed !== undefined && canRead(renamed) ? renamed : zone;
}

/**
 * The one name a zone goes by however it was spelt: the platform's own reading of it, renamed as
 * the zone database names the place now. "Asia/Kolkata" and "Asia/Calcutta" are one zone.
 */
function zoneKey(zone: string): string {
  let resolved = zone;
  try {
    resolved = new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    // A zone no clock here reads is only ever itself.
  }
  return preferredTimeZone(resolved);
}

/** Whether two names are the same zone: a device's Asia/Calcutta is a saved Asia/Kolkata. */
export function sameTimeZone(a: string, b: string): boolean {
  return a === b || zoneKey(a) === zoneKey(b);
}

/**
 * The zone this device is in, by its place's current name, or null where the platform will not
 * say: the zone a new account starts in, and the one Edit profile offers as this device's.
 */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone ? preferredTimeZone(zone) : null;
  } catch {
    return null;
  }
}

/**
 * The zones a list offers, each place once, by its current name. The zone already chosen stands
 * under the name it was saved by, so the list holds it as itself and not as a second place.
 */
export function listedTimeZones(zones: readonly string[], chosen: string): string[] {
  const key = chosen ? zoneKey(chosen) : null;
  return [
    ...new Set(
      zones.map((zone) => {
        const named = preferredTimeZone(zone);
        return named === key ? chosen : named;
      }),
    ),
  ];
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
