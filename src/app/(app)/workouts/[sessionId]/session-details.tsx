"use client";

import Link from "@/components/ui/app-link";
import { Sheet } from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/format";
import { formatBodyWeight } from "@/lib/units";

import type { SessionVM } from "./view-model";

const CHECK_IN_LABELS: [keyof SessionVM, string][] = [
  ["sleepHours", "Sleep (h)"],
  ["sleepQuality", "Sleep quality"],
  ["energy", "Energy"],
  ["fatigue", "Fatigue"],
  ["soreness", "Soreness"],
  ["backPainPre", "Lower back"],
  ["shinLeftPre", "Left shin"],
  ["shinRightPre", "Right shin"],
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right [overflow-wrap:anywhere] tabular-nums">{value}</dd>
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
      <dl className="text-sm">
        <Row label="Gym" value={session.gym.name} />
        <Row label="Started" value={formatDateTime(session.startedAt, session.timeZone)} />
        {durationMinutes !== null && <Row label="Duration" value={`${durationMinutes} min`} />}
        {session.day && <Row label="Programme day" value={session.day.name} />}
        {session.cycleIndex !== null && <Row label="Cycle" value={String(session.cycleIndex)} />}
        {session.bodyWeightKg !== null && (
          <Row
            label="Body weight"
            value={formatBodyWeight(session.bodyWeightKg, session.preferredUnit)}
          />
        )}
      </dl>

      {session.notes && (
        <div className="mt-4">
          <h3 className="text-sm font-medium">Notes</h3>
          <p className="mt-1 text-sm whitespace-pre-line text-ink-muted">{session.notes}</p>
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-sm font-medium">Check-in</h3>
        {readings.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">Nothing recorded before this session.</p>
        ) : (
          <dl className="mt-1 text-sm">
            {readings.map(([label, value]) => (
              <Row key={label} label={label} value={String(value)} />
            ))}
          </dl>
        )}
        {!readOnly && (
          <Link
            href={`/workouts/${session.id}/check-in`}
            className="flex min-h-11 items-center text-sm font-medium text-accent"
          >
            {readings.length === 0 ? "Add a check-in" : "Edit the check-in"}
          </Link>
        )}
      </div>
    </Sheet>
  );
}
