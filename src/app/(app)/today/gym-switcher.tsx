"use client";

import { useState, useTransition } from "react";

import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { Sheet } from "@/components/ui/sheet";
import type { GymKind } from "@/domain/types";
import { GYM_KIND_LABELS } from "@/lib/labels";
import { attempted } from "@/lib/offline-submit";
import { requestCoachPlanAction } from "@/server/actions/coach";
import { setDefaultGymAction } from "@/server/actions/gyms";

export type SwitcherGym = { id: string; name: string; kind: GymKind; isDefault: boolean };

/**
 * Where the next session is trained, as the first fact of the day's meta line (DESIGN.md,
 * Today): a pin and the gym's name. It is a choice only when there is more than one gym to
 * choose from; then a tap opens the gyms in a sheet.
 */
export function GymChoice({
  gyms,
  workflow = false,
  selectedGymId,
}: {
  gyms: SwitcherGym[];
  workflow?: boolean;
  selectedGymId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current = gyms.find((gym) => (selectedGymId ? gym.id === selectedGymId : gym.isDefault));
  const name = current ? current.name : "No default gym";

  function choose(gymId: string): void {
    startTransition(async () => {
      setError(null);
      const outcome = await attempted(async () => {
        if (workflow) {
          if (gymId !== current?.id) {
            return requestCoachPlanAction(gymId, "");
          }
        } else await setDefaultGymAction(gymId);
        return { ok: true as const };
      }, "Could not change gym. Check your connection and try again.");
      if (!outcome.ok) setError(outcome.message);
      else if (!outcome.value.ok) setError(outcome.value.error);
      else {
        setOpen(false);
      }
    });
  }

  if (gyms.length < 2 && current)
    return (
      <span className="meta-fact">
        <Glyph name="pin" label="Gym" className="glyph-16" />
        <span className="truncate">{name}</span>
      </span>
    );

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Gym: ${name}. Change`}
        onClick={() => setOpen(true)}
        className="gym-choice"
      >
        <Glyph name="pin" className="glyph-16" />
        <span className="truncate">{name}</span>
        <Glyph name="chevronDown" className="glyph-14" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Choose gym">
        {workflow && (
          <p className="mt-1 type-meta text-ink-2">
            Choose the gym for your next session. A changed gym asks the coach to prepare for its
            equipment.
          </p>
        )}
        {pending && (
          <p role="status" className="mt-2 type-meta text-ink-2">
            Changing gym…
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 flex items-start gap-2 type-meta font-semibold">
            <Glyph name="warn" className="mt-px glyph-18" />
            {error}
          </p>
        )}
        <ul className="mt-1">
          {gyms.map((gym, index) => (
            <li key={gym.id} className={index < gyms.length - 1 ? "border-b border-hair" : ""}>
              <button
                type="button"
                onClick={() => choose(gym.id)}
                disabled={pending}
                aria-pressed={gym.id === current?.id}
                className="flex min-h-[calc(56px+var(--ov-grow))] w-full items-center gap-3 text-left disabled:text-ink-2"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[length:var(--ov-type-button)] font-semibold">
                    {gym.name}
                  </span>
                  <span className="type-meta-small text-ink-2">{GYM_KIND_LABELS[gym.kind]}</span>
                </span>
                {gym.id === current?.id && (
                  <Glyph name="check" label="Chosen" className="glyph-20" />
                )}
              </button>
            </li>
          ))}
        </ul>
        <Link
          href="/gyms"
          className="mt-2 flex min-h-[calc(52px+var(--ov-grow))] items-center justify-between border-t border-hair font-bold"
        >
          Manage gyms
          <Glyph name="chevronRight" className="glyph-20" />
        </Link>
      </Sheet>
    </>
  );
}
