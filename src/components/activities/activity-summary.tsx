import { HeroCard } from "@/components/ui/hero-card";
import { SPORT_ICON } from "@/components/ui/sport-chip";
import { sportOfLegacy } from "@/domain/activity";
import { formatDuration, formatPace } from "@/domain/pace";
import { SPORT_LABELS } from "@/domain/sport-scope";
import type { BodyLoadUnit } from "@/domain/types";
import { formatIsoDate, formatRunKm, formatSharedLoad } from "@/lib/format";
import { SPORT_TONE } from "@/lib/sport-tone";
import type { SharedActivityDetail } from "@/server/repositories/shared-stats";

/**
 * What a follower sees of one session (plan §9.2).
 *
 * The shape of this component is the privacy rule made visible: it takes a shared row and
 * nothing else. There is no activity here to accidentally read a note, an effort, a heart
 * rate, a pool or a named bike from — those never left the owner's account, and a component
 * that cannot reach them cannot leak them (AT-PRIV-02).
 *
 * Cycling and swimming deliberately show less than running. A ride's pace depends on whether
 * the bike was assisted and whether the ride was indoors; a swim's depends on a time basis
 * nobody else can see. Publishing either as a bare number would invite a comparison the data
 * does not support, so it is not published at all this release.
 *
 * It is drawn as the owner's own record is: in the sport's colour, led by the one figure the
 * session is remembered by, with the rest of what was shared under it.
 */
export function ActivitySummary({
  activity,
  unit,
}: {
  activity: SharedActivityDetail;
  unit: BodyLoadUnit;
}) {
  const sport = sportOfLegacy(activity.sport);
  const Icon = SPORT_ICON[sport];
  const [lead, ...rest] = figures(activity, unit);
  return (
    <HeroCard tone={SPORT_TONE[sport]}>
      <p className="flex min-h-7 items-center gap-2 text-sm font-semibold text-ink-muted tabular-nums">
        <Icon aria-hidden />
        {SPORT_LABELS[activity.sport]}, {formatIsoDate(activity.occurredOn)}
      </p>
      <div>
        <h2 className="text-headline font-semibold [overflow-wrap:anywhere]">{activity.title}</h2>
        {lead && (
          <p className="mt-1 tabular-nums">
            <span className="font-display text-display-xl font-extrabold">{lead.value}</span>
            {lead.unit && (
              <>
                {" "}
                <span className="text-xl font-semibold">{lead.unit}</span>
              </>
            )}
          </p>
        )}
      </div>
      {rest.length > 0 && (
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-x-4 gap-y-3 border-t border-line pt-4">
          {rest.map((figure) => (
            <div key={figure.label} className="min-w-0">
              <dt className="text-sm font-semibold text-ink-muted">{figure.label}</dt>
              <dd className="mt-0.5 tabular-nums">
                <span className="font-display text-display-s font-extrabold">{figure.value}</span>
                {figure.unit && (
                  <>
                    {" "}
                    <span className="text-sm font-semibold">{figure.unit}</span>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </HeroCard>
  );
}

type Figure = { label: string; value: string; unit?: string };

/** "6,240 kg" as its figure and its unit, so the figure can be set large. */
function split(label: string, text: string): Figure {
  const [value, ...unit] = text.split(" ");
  return { label, value: value ?? text, unit: unit.join(" ") || undefined };
}

/**
 * What was shared, the figure the session is remembered by first: a run's, a ride's or a
 * swim's distance, a workout's working sets, or else its time. Anything not recorded is left
 * out rather than shown as nothing.
 */
function figures(activity: SharedActivityDetail, unit: BodyLoadUnit): Figure[] {
  const time: Figure | null =
    activity.durationSeconds > 0
      ? { label: "Time", value: formatDuration(activity.durationSeconds) }
      : null;
  const distance: Figure | null =
    activity.distanceMeters === null
      ? null
      : { label: "Distance", value: formatRunKm(activity.distanceMeters), unit: "km" };
  const list: (Figure | null)[] = (() => {
    switch (activity.sport) {
      case "workout":
        return [
          activity.workingSets > 0
            ? {
                label: "Working sets",
                value: String(activity.workingSets),
                unit: activity.workingSets === 1 ? "set" : "sets",
              }
            : null,
          time,
          activity.volumeKg > 0 ? split("Volume", formatSharedLoad(activity.volumeKg, unit)) : null,
        ];
      case "run":
        return [
          distance,
          time,
          activity.paceSecondsPerKm === null
            ? null
            : { label: "Average pace", value: formatPace(activity.paceSecondsPerKm), unit: "/km" },
        ];
      case "cycle":
      case "swim":
        return [distance, time];
    }
  })();
  return list.filter((figure): figure is Figure => figure !== null);
}
