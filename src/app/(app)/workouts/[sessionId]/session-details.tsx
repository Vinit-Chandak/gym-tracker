"use client";

import Link from "@/components/ui/app-link";
import { Figures } from "@/components/ui/figures";
import { Glyph } from "@/components/ui/glyphs";
import { Sheet } from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/format";
import { formatBodyWeight } from "@/lib/units";

import type { SessionVM } from "./view-model";

export const CHECK_IN_LABELS: [keyof SessionVM, string][] = [
  ["sleepHours", "Sleep (h)"],
  ["sleepQuality", "Sleep quality"],
  ["energy", "Energy"],
  ["fatigue", "Fatigue"],
  ["soreness", "Soreness"],
];

/** One fact: its name in ink 2 at the gutter, what it is in ink at the end, on a hair rule. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-hair py-1.5">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-right font-semibold [overflow-wrap:anywhere] tabular-nums">
        <Figures>{value}</Figures>
      </dd>
    </div>
  );
}

/**
 * Session-level facts, in one place. The workout overview and the logger are about the
 * training; where and when it happened, the programme it belongs to and the readings taken
 * before it belong here, said once.
 */
export function SessionDetails({
  open,
  onClose,
  session,
  readOnly,
}: {
  open: boolean;
  onClose: () => void;
  session: SessionVM;
  readOnly: boolean;
}) {
  const readings = CHECK_IN_LABELS.map(([key, label]) => [label, session[key]] as const).filter(
    ([, value]) => value !== null && value !== undefined,
  );
  const durationMinutes = session.completedAt
    ? Math.round(
        (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000,
      )
    : null;

  return (
    <Sheet open={open} onClose={onClose} title="Session details">
      <dl className="type-meta">
        <Row label="Gym" value={session.gym.name} />
        <Row label="Started" value={formatDateTime(session.startedAt, session.timeZone)} />
        {durationMinutes !== null && <Row label="Duration" value={`${durationMinutes} min`} />}
        {session.day && <Row label="Programme day" value={session.day.name} />}
        {/* "Cycle 1 of 8", as everywhere else the cycle is said. */}
        {session.cycleIndex !== null && (
          <Row
            label="Cycle"
            value={
              session.cycles
                ? `${session.cycleIndex} of ${session.cycles}`
                : String(session.cycleIndex)
            }
          />
        )}
        {session.bodyWeightKg !== null && (
          <Row
            label="Body weight"
            value={formatBodyWeight(session.bodyWeightKg, session.preferredUnit)}
          />
        )}
      </dl>

      {session.notes && (
        <section className="mt-4">
          <h3 className="caption-head">Notes</h3>
          <p className="mt-1 type-meta whitespace-pre-line">{session.notes}</p>
        </section>
      )}

      <section className="mt-4">
        <h3 className="caption-head">Check-in</h3>
        {readings.length === 0 ? (
          <p className="mt-1 type-meta text-ink-2">Nothing recorded before this session.</p>
        ) : (
          <dl className="mt-1 type-meta">
            {readings.map(([label, value]) => (
              <Row key={label} label={label} value={String(value)} />
            ))}
          </dl>
        )}
        {/* A way to another screen: a row that ends in its chevron, not words that look read. */}
        {!readOnly && (
          <Link
            href={`/workouts/${session.id}/check-in`}
            className="flex min-h-[calc(52px+var(--ov-grow))] items-center justify-between gap-3 font-bold"
          >
            {readings.length === 0 ? "Add a check-in" : "Edit the check-in"}
            <Glyph name="chevronRight" className="glyph-20 shrink-0 text-ink-2" />
          </Link>
        )}
      </section>
    </Sheet>
  );
}
