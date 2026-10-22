"use client";

import { FormError } from "@/components/ui/form";
import { useOptimistic, useState, useTransition } from "react";

import { Switch } from "@/components/ui/switch";
import { attempted } from "@/lib/offline-submit";
import { setPrivacyAction } from "@/server/actions/privacy";
import { setSportSharingAction } from "@/server/actions/sport-preferences";
import type { PrivacyKey } from "@/server/validation/privacy";

export type PrivacyValues = Record<PrivacyKey, boolean>;

/** The sports shared under a switch of their own, below the four. */
type SeparateSport = "cycling" | "swimming";

/**
 * The four switches (plan §3.7): a label, saved on change, and under it, in eight words at most,
 * only what On or Off exposes or hides that the label does not say. What each shares in full is
 * behind What a follower can see.
 */
const SWITCHES: readonly { setting: PrivacyKey; label: string; effect: string }[] = [
  {
    setting: "followApproval",
    label: "Approve follow requests",
    effect: "Off: anyone can follow you.",
  },
  {
    setting: "shareTraining",
    label: "Share training with followers",
    // Running has no switch of its own (SOCIAL-02 kept it with lifting), so this one says so.
    effect: "Lifting and running. Off: just your profile card.",
  },
  {
    setting: "shareBodyWeight",
    label: "Share body weight for relative strength",
    effect: "On: followers who share theirs see your weight.",
  },
  {
    setting: "discoverableByEmail",
    label: "Let people find me by email",
    effect: "Off: only username search finds you.",
  },
];

/**
 * The privacy switches (board Privacy): the four, then a switch for each additional sport given.
 * A ride or a swim is shared only while training is too, so while Share training is off their
 * switches are dimmed and say so, rather than a sentence explaining it from either side. They
 * still work while dimmed: a ride can be kept private before training is shared, never after.
 * Only the sports given have one: the page gives those you do, any you still share and any you
 * have logged, so a switch to stop sharing is never hidden with the sport, nor the rides logged
 * before it went off left without one.
 */
export function PrivacySwitches({
  values,
  sports = {},
}: {
  values: PrivacyValues;
  /** Whether each additional sport is shared, for the sports whose switch the page draws. */
  sports?: Partial<Record<SeparateSport, boolean>>;
}) {
  // What the training switch shows, saving or saved, which the sports' switches are held by;
  // a value saved elsewhere, arriving with the page, is taken as it is.
  const [training, setTraining] = useState(values.shareTraining);
  const [saved, setSaved] = useState(values.shareTraining);
  if (saved !== values.shareTraining) {
    setSaved(values.shareTraining);
    setTraining(values.shareTraining);
  }
  const separate = (["cycling", "swimming"] as const).filter(
    (sport) => sports[sport] !== undefined,
  );
  return (
    <>
      <ul>
        {SWITCHES.map((row) => (
          <SavedSwitch
            key={row.setting}
            label={row.label}
            effect={row.effect}
            enabled={values[row.setting]}
            save={(next) => setPrivacyAction(row.setting, next)}
            onShow={row.setting === "shareTraining" ? setTraining : undefined}
          />
        ))}
      </ul>
      {separate.length > 0 && (
        <ul className="mt-3.5">
          {separate.map((sport) => (
            <SavedSwitch
              key={sport}
              label={`Share ${sport} with followers`}
              effect={training ? undefined : "Needs Share training"}
              held={!training}
              enabled={sports[sport]!}
              save={(next) => setSportSharingAction(sport, next)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function SavedSwitch({
  label,
  effect,
  held = false,
  enabled,
  save,
  onShow,
}: {
  label: string;
  effect?: string;
  /** Saved, but with no effect until another switch is on: dimmed, never disabled. */
  held?: boolean;
  enabled: boolean;
  save: (next: boolean) => Promise<void>;
  /** Told what the switch shows: the value tapped, and the old one back if it did not save. */
  onShow?: (shown: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(enabled);
  const [error, setError] = useState<string | null>(null);
  const change = (next: boolean) =>
    startTransition(async () => {
      show(next);
      onShow?.(next);
      setError(null);
      const outcome = await attempted(
        () => save(next),
        "Could not save. Check your connection and try again.",
      );
      // After an await, React no longer counts an update as the transition's own. Marking the
      // error as one keeps it in the same render as the switch going back, not a frame ahead
      // of it, so the message never sits beside a switch showing what was not saved.
      if (!outcome.ok)
        startTransition(() => {
          setError(outcome.message);
          onShow?.(!next);
        });
    });
  return (
    <li className="switch-row">
      <div className="switch-row-main">
        <span className="switch-row-text">
          <span className="switch-row-label">{label}</span>
          {effect && <span className="switch-row-effect">{effect}</span>}
        </span>
        <span className={held ? "shrink-0 opacity-50" : "shrink-0"}>
          <Switch label={label} checked={shown} onChange={change} disabled={pending} />
        </span>
      </div>
      {error && <FormError message={error ?? undefined} />}
    </li>
  );
}
