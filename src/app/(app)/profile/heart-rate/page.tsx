import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { FigureText } from "@/components/ui/figure-text";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import {
  estimatedMaxHeartRate,
  maxBasisLabel,
  maxZones,
  ZONE_FEEL,
  ZONE_METHOD_LABELS,
  ZONE_NUMBERS,
} from "@/domain/heart-rate";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readHeartRate } from "@/server/repositories/heart-rate";

import { HeartRateForm } from "./heart-rate-form";
import { UseRunMaximum } from "./use-run-maximum";

/** The method in use, at the end of the Settings row: what the zones are shares of. */
const METHOD_META: Record<keyof typeof ZONE_METHOD_LABELS, string> = {
  max: "% of maximum",
  reserve: "% of reserve",
  custom: "Your own zones",
};

export const metadata: Metadata = { title: "Heart rate zones" };

/**
 * Heart rate zones (ADR 0059): the maximum in use and where it came from, and the five zones it
 * makes, with what each is for folded under them; then what they are made from, folded under
 * Settings, the method in use at its end, and open while there is no maximum to show. A plan's
 * "zone 2" and a run's average read against these, so they are shown in beats, the way a watch
 * shows them.
 */
export default async function HeartRatePage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const { settings, resolved, highest, age } = await withUser(
    getDb(),
    user.id,
    (tx) => readHeartRate(tx, profile, today),
    { readOnly: true },
  );
  const year = today.slice(0, 4);
  // A higher reading than the maximum in use is worth one tap; one the maximum already is, not.
  const offerRun = highest !== null && (resolved === null || highest.bpm > resolved.max);
  const estimate = age === null ? null : estimatedMaxHeartRate(age);

  return (
    <>
      <PageHeader title="Heart rate zones" backHref="/profile" />
      <PageContent>
        {resolved ? (
          <Card aria-labelledby="heart-rate-max">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 id="heart-rate-max" className="type-meta font-bold">
                Maximum heart rate
              </h2>
              <p className="type-meta-small text-ink-2">
                {maxBasisLabel(resolved.basis)}
                {resolved.on ? ` · ${formatIsoDate(resolved.on, year)}` : ""}
              </p>
            </div>
            <p>
              <span className="type-figure-l">{resolved.max}</span>{" "}
              <span className="type-meta text-ink-2">bpm</span>
            </p>
            <ol className="heart-rate-zones" aria-label="Zones">
              {resolved.zones.map((zone) => (
                <li key={zone.zone} className="heart-rate-zone" data-zone={zone.zone}>
                  <span className="heart-rate-zone-name">
                    Zone {zone.zone} <span className="text-ink-2">· {zone.name}</span>
                  </span>
                  {/* Jost's figures, Atkinson's en dash (DESIGN.md, The Two Voices Rule). */}
                  <span className="heart-rate-zone-beats tabular-nums">
                    <FigureText>{`${zone.low}–${zone.high}`}</FigureText>
                  </span>
                </li>
              ))}
            </ol>
            {/* Five lines, too long for an ⓘ: a fold at the card's foot, closed. */}
            <Disclosure summary="What each zone is for" variant="footer">
              <ul className="space-y-1 type-meta-small text-ink-2">
                {ZONE_NUMBERS.map((zone) => (
                  <li key={zone}>
                    <span className="font-bold text-ink">Zone {zone}</span> · {ZONE_FEEL[zone]}
                  </li>
                ))}
              </ul>
            </Disclosure>
          </Card>
        ) : (
          <Card>
            <h2 className="type-meta font-bold">No maximum yet</h2>
            <p className="type-meta text-ink-2">
              Enter it below, add your date of birth, or log a run with heart rate.
            </p>
          </Card>
        )}

        {offerRun && highest && (
          <UseRunMaximum bpm={highest.bpm} on={formatIsoDate(highest.on, year)} />
        )}

        {/* The settings, said once: "Maximum heart rate" heads the zones and is not said again
            until they are opened. The method in use stands at the fold's end, which is how a
            method chosen but not usable (Of reserve, with no resting rate) reads as it is. */}
        <Disclosure
          summary="Settings"
          meta={resolved ? METHOD_META[resolved.method] : undefined}
          defaultOpen={!resolved}
        >
          <HeartRateForm
            inUse={settings.maxHeartRate === null ? (resolved?.max ?? null) : null}
            estimate={estimate}
            values={{
              maxHeartRate: settings.maxHeartRate,
              restingHeartRate: settings.restingHeartRate,
              zoneMethod: settings.zoneMethod,
              maxHeartRateAuto: settings.maxHeartRateAuto,
              floors:
                settings.customZoneFloors ??
                (resolved ?? { zones: maxZones(estimate ?? 190) }).zones.map((zone) => zone.low),
            }}
          />
        </Disclosure>
      </PageContent>
    </>
  );
}
