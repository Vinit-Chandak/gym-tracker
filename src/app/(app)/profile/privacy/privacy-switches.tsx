"use client";

import { useOptimistic, useState, useTransition } from "react";

import { List, Row } from "@/components/ui/link-row";
import { Switch } from "@/components/ui/switch";
import { attempted } from "@/lib/offline-submit";
import { setPrivacyAction } from "@/server/actions/privacy";
import { setSportSharingAction } from "@/server/actions/sport-preferences";
import type { PrivacyKey } from "@/server/validation/privacy";

export type PrivacyValues = Record<PrivacyKey, boolean>;

/** The four switches (plan §3.7): a label, one sentence, saved on change. */
const SWITCHES: readonly { setting: PrivacyKey; label: string; effect: string }[] = [
  {
    setting: "followApproval",
    label: "Approve follow requests",
    effect: "Off means anyone in the app can follow you without asking.",
  },
  {
    setting: "shareTraining",
    label: "Share training with followers",
    effect:
      "Off means followers see your profile card only: no stats, no records, not on their leaderboards.",
  },
  {
    setting: "shareBodyWeight",
    label: "Share body weight for relative strength",
    effect:
      "On means followers who also share theirs see “per kg of body weight” rows and rankings.",
  },
  {
    setting: "discoverableByEmail",
    label: "Let people find me by email",
    effect: "Off means the exact-email lookup does not return you; username search still does.",
  },
];

export function PrivacySwitches({ values }: { values: PrivacyValues }) {
  return (
    <List>
      {SWITCHES.map((row) => (
        <li key={row.setting}>
          <SavedSwitch
            {...row}
            enabled={values[row.setting]}
            save={(next) => setPrivacyAction(row.setting, next)}
          />
        </li>
      ))}
    </List>
  );
}

/** Additional sports require explicit consent as well as the global training switch. */
export function SportSharingSwitches({
  values,
}: {
  values: Record<"cycling" | "swimming", boolean>;
}) {
  return (
    <List>
      {(["cycling", "swimming"] as const).map((sport) => (
        <li key={sport}>
          <SavedSwitch
            label={`Share ${sport} with followers`}
            effect="Share the date, duration and known distance. Share training with followers must also be on."
            enabled={values[sport]}
            save={(next) => setSportSharingAction(sport, next)}
          />
        </li>
      ))}
    </List>
  );
}

function SavedSwitch({
  label,
  effect,
  enabled,
  save,
}: {
  label: string;
  effect: string;
  enabled: boolean;
  save: (next: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(enabled);
  const [error, setError] = useState<string | null>(null);
  const change = (next: boolean) =>
    startTransition(async () => {
      show(next);
      setError(null);
      const outcome = await attempted(
        () => save(next),
        "Could not save. Check your connection and try again.",
      );
      if (!outcome.ok) setError(outcome.message);
    });
  return (
    <div>
      <Row title={label} subtitle={effect}>
        <Switch label={label} checked={shown} onChange={change} disabled={pending} />
      </Row>
      {error && (
        <p role="alert" className="px-4 pb-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
