"use client";

import { useSyncExternalStore, type ComponentProps } from "react";

import { Select } from "@/components/ui/select";
import {
  listedTimeZones,
  preferredTimeZone,
  sameTimeZone,
  supportedTimeZones,
  timeZoneArea,
  timeZonePlace,
} from "@/lib/time-zones";

/** The list of zones does not change while a form is open, so there is nothing to subscribe to. */
function noSubscription(): () => void {
  return () => {};
}

const NONE: readonly string[] = [];

/**
 * The time zone, chosen from the places this browser lists (`Intl.supportedValuesOf`), each
 * under its region and named by its place: "Kolkata" under Asia. A place the browser still lists
 * by an old name (Calcutta, Asmera, Godthab) is listed once, by its current one. A native
 * select, as every long list here is: iOS and Android open their own picker, and a desktop jumps
 * to a place as it is typed. The device's own zone and UTC come first, and so does the zone
 * already chosen when this browser files it under another name, so it is never shown as
 * something else.
 *
 * The list is read in the browser, never on the server, whose list could differ: the server
 * draws the first few choices alone and the browser adds the rest once the page is live.
 */
export function TimeZoneSelect({
  value,
  detected,
  ...props
}: Omit<ComponentProps<typeof Select>, "children" | "value"> & {
  /** The zone chosen, or "" when one still has to be. */
  value: string;
  /** The zone this device is in, or null where that is not known. */
  detected: string | null;
}) {
  const platform = useSyncExternalStore(noSubscription, supportedTimeZones, () => NONE);
  // Each place once, by its current name: Kolkata, never Calcutta beside it.
  const zones = listedTimeZones(platform, value);
  // The device's zone is the one chosen when they are the same place under two names, so the
  // field never offers it twice or says the device is somewhere else.
  const device = detected !== null && value && sameTimeZone(detected, value) ? value : detected;
  const first = [
    ...new Set([device, value, "UTC"].filter((zone): zone is string => !!zone)),
  ].filter((zone) => zone === "UTC" || zone === device || !zones.includes(zone));
  const areas = new Map<string, string[]>();
  for (const zone of zones) {
    if (first.includes(zone)) continue;
    const area = timeZoneArea(zone);
    areas.set(area, [...(areas.get(area) ?? []), zone]);
  }
  const place = (zone: string) => timeZonePlace(preferredTimeZone(zone));
  const byPlace = (a: string, b: string) => place(a).localeCompare(place(b));

  return (
    <Select value={value} {...props}>
      {value === "" && (
        <option value="" disabled>
          Choose a time zone
        </option>
      )}
      <optgroup label="Suggested">
        {first.map((zone) => (
          <option key={zone} value={zone}>
            {zone === device
              ? `${place(zone)} (this device)`
              : // UTC, or a zone chosen before that this list files under another name.
                zone.replaceAll("_", " ")}
          </option>
        ))}
      </optgroup>
      {[...areas.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([area, list]) => (
          <optgroup key={area} label={area}>
            {list.sort(byPlace).map((zone) => (
              <option key={zone} value={zone}>
                {place(zone)}
              </option>
            ))}
          </optgroup>
        ))}
    </Select>
  );
}
