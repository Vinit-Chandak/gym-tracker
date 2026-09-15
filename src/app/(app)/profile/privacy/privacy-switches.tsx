"use client";

import { useOptimistic, useState, useTransition } from "react";

import { List, Row } from "@/components/ui/link-row";
import { Switch } from "@/components/ui/switch";
import { attempted } from "@/lib/offline-submit";
import { setPrivacyAction } from "@/server/actions/privacy";
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
          <PrivacySwitch {...row} enabled={values[row.setting]} />
        </li>
      ))}
    </List>
  );
}

function PrivacySwitch({
  setting,
  label,
  effect,
  enabled,
}: {
  setting: PrivacyKey;
  label: string;
  effect: string;
  enabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(enabled);
  const [error, setError] = useState<string | null>(null);
  const change = (next: boolean) =>
    startTransition(async () => {
      show(next);
      setError(null);
      const outcome = await attempted(
        () => setPrivacyAction(setting, next),
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
