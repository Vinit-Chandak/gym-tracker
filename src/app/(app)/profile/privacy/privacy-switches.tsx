"use client";

import { useOptimistic, useState, useTransition } from "react";

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
    // Running has no switch of its own (SOCIAL-02 kept it with lifting), so this one says so.
    effect:
      "Your lifting and running; rides and swims also need their own switch. Off means followers see your profile card only: no stats, no records, not on their leaderboards.",
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
    <ul>
      {SWITCHES.map((row) => (
        <SavedSwitch
          key={row.setting}
          {...row}
          enabled={values[row.setting]}
          save={(next) => setPrivacyAction(row.setting, next)}
        />
      ))}
    </ul>
  );
}

/** What one shared session of each additional sport is called. */
const SESSION_NOUN = { cycling: "ride", swimming: "swim" } as const;

/**
 * Additional sports require explicit consent as well as the global training switch (board
 * Privacy): a switch each, and what they share said once under them. Only the sports given
 * have one: the page gives those you do, and any you still share, so a switch to stop sharing
 * is never hidden with the sport. With none, nothing is drawn.
 */
export function SportSharingSwitches({
  values,
}: {
  values: Partial<Record<"cycling" | "swimming", boolean>>;
}) {
  const sports = (["cycling", "swimming"] as const).filter((sport) => values[sport] !== undefined);
  if (sports.length === 0) return null;
  return (
    <>
      <ul>
        {sports.map((sport) => (
          <SavedSwitch
            key={sport}
            label={`Share ${sport} with followers`}
            enabled={values[sport]!}
            save={(next) => setSportSharingAction(sport, next)}
          />
        ))}
      </ul>
      <p className="mt-0.5 type-meta-small leading-[1.35] text-ink-2">
        A shared {sports.map((sport) => SESSION_NOUN[sport]).join(" or ")} says its date, duration
        and known distance. Share training with followers must also be on.
      </p>
    </>
  );
}

function SavedSwitch({
  label,
  effect,
  enabled,
  save,
}: {
  label: string;
  effect?: string;
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
      // After an await, React no longer counts an update as the transition's own. Marking the
      // error as one keeps it in the same render as the switch going back, not a frame ahead
      // of it, so the message never sits beside a switch showing what was not saved.
      if (!outcome.ok) startTransition(() => setError(outcome.message));
    });
  return (
    <li className="switch-row">
      <div className="switch-row-main">
        <span className="switch-row-text">
          <span className="switch-row-label">{label}</span>
          {effect && <span className="switch-row-effect">{effect}</span>}
        </span>
        <Switch label={label} checked={shown} onChange={change} disabled={pending} />
      </div>
      {error && (
        <p role="alert" className="pb-1 type-meta-small font-semibold">
          {error}
        </p>
      )}
    </li>
  );
}
