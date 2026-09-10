/**
 * Label over value, one block per entry.
 *
 * Not a two-column table: a label on the left with its value pushed right reads well only
 * while every value is short, and one long sentence then squeezes itself into a third of
 * the width. Stacked, each entry is the same shape and the values keep the full line.
 * Entries without a value are dropped, so callers can list everything that might be there.
 */
export function DetailList({
  entries,
}: {
  entries: readonly (readonly [string, string | null | undefined])[];
}) {
  const shown = entries.filter(([, value]) => value);
  if (shown.length === 0) return null;
  return (
    <dl className="space-y-2.5">
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-ink-muted">{label}</dt>
          <dd className="mt-0.5 text-sm [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
