import { PHASE_WORDS } from "@/components/activities/prescription-lines";
import { Section } from "@/components/ui/section";
import {
  formatPaceSeconds,
  lapPaceSecondsPerKm,
  pacePerUnit,
  type RunningLap,
} from "@/domain/activity-metrics";
import { zoneOf, zoneTimeFromLaps, ZONE_NAMES, type ResolvedHeartRate } from "@/domain/heart-rate";
import { formatDuration } from "@/domain/pace";
import { formatSportDistance, type SportUnits } from "@/lib/distance-units";

/**
 * A run's laps, as its watch listed them (ADR 0059): what each was for, how far and how long,
 * the pace where both were recorded, and the heart rate against the athlete's zones. A lap
 * missing a distance or a time shows a dash, never a figure worked out from the plan.
 *
 * Five columns fit a phone: the pace's unit is said once, in its heading, and a lap's highest
 * heart rate shows beside its average where there is room for it.
 *
 * Time in zones, under them, is read from each lap's average: an approximation, and said to be.
 */
export function RunLaps({
  laps,
  units,
  heartRate,
}: {
  laps: readonly RunningLap[];
  units: SportUnits;
  heartRate: ResolvedHeartRate | null;
}) {
  if (laps.length === 0) return null;
  const zoneTimes = heartRate ? zoneTimeFromLaps(laps, heartRate.zones) : [];
  const timed = zoneTimes.reduce((sum, entry) => sum + entry.ms, 0);
  return (
    <Section title="Laps" className="mt-5">
      <div className="run-laps-scroll">
        <table className="run-laps">
          <thead>
            <tr>
              <th scope="col">Lap</th>
              <th scope="col">Distance</th>
              <th scope="col">Time</th>
              <th scope="col">Pace /{units.distanceUnit}</th>
              <th scope="col">
                <abbr title="Heart rate">HR</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {laps.map((lap, index) => {
              const pace = lapPaceSecondsPerKm(lap);
              const zone =
                heartRate && lap.averageHeartRate !== null
                  ? zoneOf(lap.averageHeartRate, heartRate.zones)
                  : null;
              return (
                <tr key={index} data-phase={lap.phase ?? undefined}>
                  <th scope="row">
                    <span className="run-laps-number">{index + 1}</span>
                    {lap.phase && <span className="run-laps-phase">{PHASE_WORDS[lap.phase]}</span>}
                  </th>
                  <td>
                    {lap.distance
                      ? formatSportDistance(lap.distance.metres, "running", units)
                      : "—"}
                  </td>
                  <td>{lap.durationMs === null ? "—" : formatDuration(lap.durationMs / 1000)}</td>
                  <td>
                    {pace === null ? "—" : formatPaceSeconds(pacePerUnit(pace, units.distanceUnit))}
                  </td>
                  <td>
                    {lap.averageHeartRate === null ? (
                      "—"
                    ) : (
                      <>
                        {lap.averageHeartRate}
                        {lap.maxHeartRate !== null && (
                          <span className="run-laps-max text-ink-2">/{lap.maxHeartRate}</span>
                        )}
                        {zone !== null && zone > 0 && (
                          <span className="run-laps-zone">
                            {" "}
                            <abbr title={`Zone ${zone}`}>Z{zone}</abbr>
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {timed > 0 && (
        <div className="space-y-1.5">
          <p className="type-caption text-ink-2">Time in zones, from each lap’s average</p>
          <ul className="run-zone-times">
            {zoneTimes.map((entry) => (
              <li key={entry.zone} data-zone={entry.zone}>
                <span className="run-zone-times-name">
                  {entry.zone === 0
                    ? "Below zone 1"
                    : `Zone ${entry.zone} · ${ZONE_NAMES[entry.zone]}`}
                </span>
                <span className="run-zone-times-bar" aria-hidden>
                  <span style={{ width: `${Math.max(2, (entry.ms / timed) * 100)}%` }} />
                </span>
                <span className="run-zone-times-time tabular-nums">
                  {formatDuration(entry.ms / 1000)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
