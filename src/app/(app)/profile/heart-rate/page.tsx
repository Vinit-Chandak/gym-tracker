import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import {
  estimatedMaxHeartRate,
  maxBasisLabel,
  maxZones,
  ZONE_FEEL,
  type ResolvedHeartRate,
} from "@/domain/heart-rate";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readHeartRate } from "@/server/repositories/heart-rate";

import { HeartRateForm } from "./heart-rate-form";
import { UseRunMaximum } from "./use-run-maximum";

export const metadata: Metadata = { title: "Heart rate zones" };

const METHOD_LINE: Record<ResolvedHeartRate["method"], string> = {
  max: "Shares of your maximum",
  reserve: "Shares of your heart-rate reserve",
  custom: "Your own zones",
};

/**
 * Heart rate zones (ADR 0059): the maximum in use and where it came from, the five zones it
 * makes, then what they are made from. A plan's "zone 2" and a run's average read against
 * these, so they are shown in beats, the way a watch shows them.
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
            <ol className="heart-rate-zones" aria-label={METHOD_LINE[resolved.method]}>
              {resolved.zones.map((zone) => (
                <li key={zone.zone} className="heart-rate-zone" data-zone={zone.zone}>
                  <span className="heart-rate-zone-name">
                    Zone {zone.zone} <span className="text-ink-2">· {zone.name}</span>
                  </span>
                  <span className="heart-rate-zone-beats tabular-nums">
                    {zone.low}–{zone.high}
                  </span>
                  <span className="heart-rate-zone-feel">{ZONE_FEEL[zone.zone]}</span>
                </li>
              ))}
            </ol>
            <p className="type-caption text-ink-2">{METHOD_LINE[resolved.method]}</p>
          </Card>
        ) : (
          <Card>
            <h2 className="type-meta font-bold">No maximum yet</h2>
            <p className="type-meta text-ink-2">
              Enter your maximum heart rate below, add your date of birth to your profile, or log a
              run with its heart rate, and your zones appear here.
            </p>
          </Card>
        )}

        {offerRun && highest && (
          <UseRunMaximum bpm={highest.bpm} on={formatIsoDate(highest.on, year)} />
        )}

        <Section title="Settings">
          <Card>
            <HeartRateForm
              inUse={settings.maxHeartRate === null ? (resolved?.max ?? null) : null}
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
          </Card>
        </Section>

        <Disclosure summary="How your zones are worked out" variant="footer">
          <div className="space-y-2 text-sm text-ink-2">
            <p>
              Your maximum is the best evidence there is: a number you enter, otherwise the highest
              heart rate a run of yours recorded this past year, otherwise an estimate from your age
              (208 − 0.7 × age, Tanaka 2001
              {estimate !== null ? `: ${estimate} for you` : ""}). An age estimate is often ten
              beats out either way, so a hard race or hill session tells you more.
            </p>
            <p>
              Zones start at 50, 60, 70, 80 and 90 per cent of your maximum. With a resting heart
              rate they can be taken of your heart-rate reserve instead (resting + share × (maximum
              − resting)), which follows effort more closely and is what the American College of
              Sports Medicine recommends. Zones from a lab or threshold test can be entered as your
              own.
            </p>
            <p>
              A wrist sensor sometimes reads your cadence instead of your heart. Readings above 230
              are never taken as a maximum; if a run raised yours by mistake, enter your own.
            </p>
          </div>
        </Disclosure>
      </PageContent>
    </>
  );
}
