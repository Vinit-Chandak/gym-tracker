"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { InfoTip } from "@/components/ui/info-tip";
import { Field } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import type { ActivitySport } from "@/domain/activity";
import type { MeasureUnits } from "@/lib/setup-path";
import { withWeight, zoneCity, zoneLine, zoneOffset } from "@/lib/setup-path";
import {
  listedTimeZones,
  preferredTimeZone,
  sameTimeZone,
  supportedTimeZones,
} from "@/lib/time-zones";

const WEIGHT = [
  { value: "kg", label: "kg" },
  { value: "lb", label: "lb" },
] as const;
const DISTANCE = [
  { value: "km", label: "km" },
  { value: "mi", label: "mi" },
] as const;
const POOL = [
  { value: "m", label: "Metres" },
  { value: "yd", label: "Yards" },
] as const;

/**
 * Runs and rides go by the road's unit, swims by the pool's; lifting by weight, and a carry by
 * the road's unit too, which follows the weight for an athlete who is not asked (ADR 0055).
 */
function distanceMatters(sports: readonly ActivitySport[]): boolean {
  return sports.includes("running") || sports.includes("cycling");
}

/**
 * The units and the zone as one quiet line under the answers ("kg · km · London time"), each
 * named only where a chosen sport uses it, with Change at its end.
 */
export function UnitsLine({
  units,
  zone,
  sports,
  error,
  onChange,
}: {
  units: MeasureUnits;
  zone: string;
  sports: readonly ActivitySport[];
  error?: string;
  onChange: () => void;
}) {
  const parts = [
    units.weight,
    distanceMatters(sports) ? (units.distance === "mi" ? "miles" : "km") : null,
    sports.includes("swimming") ? (units.pool === "yd" ? "yard pools" : "metre pools") : null,
    // Named as the zone database names the place now: Kolkata, not a saved Calcutta.
    zoneLine(preferredTimeZone(zone)),
  ].filter(Boolean);
  return (
    <div className="units-line-wrap">
      <div className="units-line">
        <Glyph name="globe" className="glyph-20 shrink-0 text-ink-2" />
        <p className="units-line-text">{parts.join(" · ")}</p>
        <button
          type="button"
          aria-label="Change units and time zone"
          aria-haspopup="dialog"
          onClick={onChange}
          className="units-line-change"
        >
          Change
        </button>
      </div>
      {error && (
        <p role="alert" className="you-error">
          <Glyph name="warn" className="mt-px glyph-18 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Every zone this device knows, by region, each with its city and its offset now. A place the
 * browser still lists by an old name (Calcutta, Asmera, Godthab) is listed once, by its current
 * one; the zone already chosen stands under the name it was saved by, so it is never a second
 * place.
 */
function useZoneOptions(open: boolean, current: string) {
  return useMemo(() => {
    if (!open) return [] as { region: string; zones: { value: string; label: string }[] }[];
    let zones = listedTimeZones(supportedTimeZones(), current);
    if (!zones.includes(current)) zones = [current, ...zones];
    const now = new Date();
    const byRegion = new Map<string, { value: string; label: string }[]>();
    for (const value of zones) {
      const region = value.includes("/") ? value.split("/")[0]! : "Other";
      const offset = zoneOffset(value, now);
      const city = zoneCity(preferredTimeZone(value));
      const label = offset ? `${city} · ${offset}` : city;
      byRegion.set(region, [...(byRegion.get(region) ?? []), { value, label }]);
    }
    return [...byRegion.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([region, entries]) => ({
        region,
        zones: entries.sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }, [open, current]);
}

/**
 * Board Units and time zone: taken from the phone, changed here or later in Profile › Units and
 * time zone, which checks them as setup does (`unitsInputSchema`). Weight; the road's distance
 * where runs or rides were chosen; the pool where swims were; and the zone. What a distance
 * covers and what the zone decides are their ⓘ.
 */
export function UnitsSheet({
  open,
  onClose,
  units,
  zone,
  phoneZone,
  sports,
  onUnits,
  onZone,
}: {
  open: boolean;
  onClose: () => void;
  units: MeasureUnits;
  zone: string;
  phoneZone: string | null;
  sports: readonly ActivitySport[];
  onUnits: (units: MeasureUnits) => void;
  onZone: (zone: string) => void;
}) {
  const regions = useZoneOptions(open, zone);
  // The phone's zone is the one chosen when they are one place under two names (a saved
  // Asia/Calcutta, a phone's Asia/Kolkata), so the list never says the phone is elsewhere.
  const phone = phoneZone !== null && sameTimeZone(phoneZone, zone) ? zone : phoneZone;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Units and time zone"
      footer={
        <Button size="lg" className="w-full" onClick={onClose}>
          Done
        </Button>
      }
    >
      {open && (
        <div className="space-y-5 pb-1">
          <div className="units-row">
            <span id="units-weight" className="units-row-label">
              Weight
            </span>
            <div className="units-row-control">
              <SegmentedControl
                name="sheet-weight"
                aria-labelledby="units-weight"
                options={WEIGHT}
                value={units.weight}
                onChange={(weight) => onUnits(withWeight(units, weight))}
                columns={2}
              />
            </div>
          </div>
          {distanceMatters(sports) && (
            <div className="units-row">
              <span className="units-row-label">
                <span className="flex items-center gap-1">
                  <span id="units-distance">Distance</span>
                  <InfoTip label="About distance">For runs, rides and carries.</InfoTip>
                </span>
              </span>
              <div className="units-row-control">
                <SegmentedControl
                  name="sheet-distance"
                  aria-labelledby="units-distance"
                  options={DISTANCE}
                  value={units.distance}
                  onChange={(distance) => onUnits({ ...units, distance })}
                  columns={2}
                />
              </div>
            </div>
          )}
          {sports.includes("swimming") && (
            <div className="units-row">
              <span id="units-pool" className="units-row-label">
                Pools
              </span>
              <div className="units-row-control">
                <SegmentedControl
                  name="sheet-pool"
                  aria-labelledby="units-pool"
                  options={POOL}
                  value={units.pool}
                  onChange={(pool) => onUnits({ ...units, pool })}
                  columns={2}
                />
              </div>
            </div>
          )}
          <Field label="Time zone" info="Decides which day a workout counts for.">
            <Select id="units-zone" value={zone} onChange={(event) => onZone(event.target.value)}>
              {phone && (
                <optgroup label="This phone">
                  <option value={phone}>
                    {zoneCity(preferredTimeZone(phone))}
                    {zoneOffset(phone) ? ` · ${zoneOffset(phone)}` : ""}
                  </option>
                </optgroup>
              )}
              {regions.map((group) => (
                <optgroup key={group.region} label={group.region}>
                  {group.zones.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </Sheet>
  );
}
