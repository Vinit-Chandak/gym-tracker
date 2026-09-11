/** Reuse Intl's expensive locale setup across chart points and history rows. */
const formatters = new Map<string, Intl.DateTimeFormat>();
const MAX_FORMATTERS = 64;

export function dateTimeFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = JSON.stringify([
    locale,
    Object.entries(options).sort(([a], [b]) => a.localeCompare(b)),
  ]);
  const cached = formatters.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, options);
  // Time zones are account-specific. Bound the process-wide cache as accounts come and go.
  if (formatters.size >= MAX_FORMATTERS) formatters.delete(formatters.keys().next().value!);
  formatters.set(key, formatter);
  return formatter;
}
