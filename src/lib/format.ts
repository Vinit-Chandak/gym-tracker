/** "Tue 8 Sep, 18:30" in the given IANA time zone. */
export function formatDateTime(value: string | Date, timeZone: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "8 Sep" in the given time zone. */
export function formatDay(value: string | Date, timeZone: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" }).format(
    date,
  );
}

/** "Tue 8 Sep 2026" for an ISO date string. */
export function formatIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "1 h 12 min" / "48 min". */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** Kilograms per pound, for turning the library's kg defaults into the reader's unit. */
const LB_PER_KG = 2.2046226218;

/**
 * A load stored in kilograms, written in the unit the reader prefers: "2.5 kg" or "5.5 lb".
 * Only for the shared library's own defaults — logged sets keep the unit they were logged in.
 */
export function formatKilograms(kilograms: number, unit: "kg" | "lb"): string {
  if (unit === "kg") return `${kilograms} kg`;
  return `${Math.round(kilograms * LB_PER_KG * 10) / 10} lb`;
}
