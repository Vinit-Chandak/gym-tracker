import { dateTimeFormatter } from "@/lib/date-time-format";

/**
 * The words a tab's root says a day or a week in (DESIGN.md, Layout: Tab roots), read as the
 * calendar date it names: no time zone moves it off its day. Months are said whole there, as
 * the headline's Meta has the room: "Wednesday", then "21 October".
 */
function parts(isoDate: string, options: Intl.DateTimeFormatOptions) {
  const out: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of dateTimeFormatter("en-GB", { timeZone: "UTC", ...options }).formatToParts(
    new Date(`${isoDate}T00:00:00Z`),
  ))
    out[part.type] = part.value;
  return out;
}

/** "Wednesday": the day a tab's root opens on. */
export function weekdayName(isoDate: string): string {
  return parts(isoDate, { weekday: "long" }).weekday ?? isoDate;
}

/**
 * "21 October", or "21 October 2025" outside `currentYear`: the date under the weekday. Held
 * whole, so a line breaks before or after it, never inside it.
 */
export function dayAndMonth(isoDate: string, currentYear?: string): string {
  const on = parts(isoDate, { day: "numeric", month: "long", year: "numeric" });
  const held = [on.day, on.month, isoDate.slice(0, 4) === currentYear ? null : on.year];
  return held.filter(Boolean).join("\u00a0");
}

/**
 * A week's dates as its title's second tone (owner, 28 October 2026): "19 – 25 Oct", "26 Oct –
 * 1 Nov", the year after the last date outside `currentYear`, and after each where the week
 * crosses New Year. Months are short, so the dates keep one line beside the week's steps.
 */
export function weekRange(from: string, to: string, currentYear?: string): string {
  const first = parts(from, { day: "numeric", month: "short", year: "numeric" });
  const last = parts(to, { day: "numeric", month: "short", year: "numeric" });
  const crossesYear = first.year !== last.year;
  const lastYear = crossesYear || to.slice(0, 4) !== currentYear ? last.year : null;
  const start =
    first.month === last.month && !crossesYear
      ? first.day
      : [first.day, first.month, crossesYear ? first.year : null].filter(Boolean).join("\u00a0");
  const end = [last.day, last.month, lastYear].filter(Boolean).join("\u00a0");
  return `${start} – ${end}`;
}

/**
 * A week's dates under its headline: "19 to 25 October", "28 September to 4 October", the year
 * after the last date outside `currentYear`, and after each where the week crosses New Year.
 */
export function weekDates(from: string, to: string, currentYear?: string): string {
  const first = parts(from, { day: "numeric", month: "long", year: "numeric" });
  const last = parts(to, { day: "numeric", month: "long", year: "numeric" });
  const crossesYear = first.year !== last.year;
  const lastYear = crossesYear || to.slice(0, 4) !== currentYear ? last.year : null;
  const start =
    first.month === last.month && !crossesYear
      ? first.day
      : [first.day, first.month, crossesYear ? first.year : null].filter(Boolean).join("\u00a0");
  const end = [last.day, last.month, lastYear].filter(Boolean).join("\u00a0");
  return `${start} to ${end}`;
}
