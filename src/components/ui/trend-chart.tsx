import type { Point } from "@/domain/analytics";

/** Small SVG plus an accessible data table. Null observations break the line. */
export function TrendChart({
  title,
  points,
  unit,
}: {
  title: string;
  points: Point[];
  unit: string;
}) {
  const known = points.filter((p): p is Point & { value: number } => p.value !== null);
  if (!known.length)
    return (
      <p className="text-sm text-ink-muted">No {title.toLowerCase()} measurements in this range.</p>
    );
  const max = Math.max(1, ...known.map((p) => p.value));
  const minDate = Date.parse(points[0]!.date),
    maxDate = Date.parse(points[points.length - 1]!.date);
  const x = (date: string) =>
    maxDate === minDate ? 180 : 38 + ((Date.parse(date) - minDate) / (maxDate - minDate)) * 288;
  const y = (value: number) => 122 - (value / max) * 94;
  const path = points
    .map((p, i) =>
      p.value === null
        ? ""
        : `${i > 0 && points[i - 1]?.value !== null ? "L" : "M"}${x(p.date)},${y(p.value)}`,
    )
    .join(" ");
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">
        {title} <span className="text-ink-muted">({unit})</span>
      </figcaption>
      <svg
        viewBox="0 0 360 156"
        role="img"
        aria-label={`${title}, ${known.length} observations. Values available below.`}
        className="w-full overflow-visible"
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1="38" y1={y(max * t)} x2="326" y2={y(max * t)} stroke="var(--color-line)" />
            <text
              x="31"
              y={y(max * t) + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--color-ink-muted)"
            >
              {Math.round(max * t * 10) / 10}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" />
        {known.map((p, i) => (
          <circle
            key={`${p.date}:${i}`}
            cx={x(p.date)}
            cy={y(p.value)}
            r="3.5"
            fill="var(--color-accent)"
          >
            <title>
              {p.date}: {p.value} {unit}
            </title>
          </circle>
        ))}
        <text x="38" y="146" fontSize="10" fill="var(--color-ink-muted)">
          {points[0]!.date.slice(5)}
        </text>
        <text x="326" y="146" textAnchor="end" fontSize="10" fill="var(--color-ink-muted)">
          {points[points.length - 1]!.date.slice(5)}
        </text>
      </svg>
      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer py-2">View values</summary>
        <table className="w-full text-left tabular-nums">
          <thead>
            <tr>
              <th>Date</th>
              <th className="text-right">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={`${p.date}:${i}`}>
                <td className="py-1">{p.date}</td>
                <td className="text-right">{p.value ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
