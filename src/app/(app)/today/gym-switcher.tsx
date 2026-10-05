"use client";

import { useState, useTransition } from "react";

import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { Sheet } from "@/components/ui/sheet";
import type { GymKind } from "@/domain/types";
import { attempted } from "@/lib/offline-submit";
import { requestCoachPlanAction } from "@/server/actions/coach";
import { setDefaultGymAction } from "@/server/actions/gyms";

import { GymRows } from "./gym-rows";

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
  // With the coach preparing sessions, a changed gym is a request (one of the day's few), so a
  // tap only picks it and Prepare sends it: a mis-tap costs nothing.
  const [picked, setPicked] = useState<string | null>(null);
  const chosenId = picked ?? current?.id ?? null;
  const name = current ? current.name : "No default gym";
  const pickedGym = gyms.find((gym) => gym.id === picked && gym.id !== current?.id) ?? null;

  function close(): void {
    setOpen(false);
    setPicked(null);
    setError(null);
  }

  function choose(gymId: string): void {
    if (workflow) {
      setPicked(gymId);
      return;
    }
    startTransition(async () => {
      setError(null);
      const outcome = await attempted(
        () => setDefaultGymAction(gymId).then(() => ({ ok: true as const })),
        "Could not change gym. Check your connection and try again.",
      );
      if (!outcome.ok) setError(outcome.message);
      else close();
    });
  }

  function prepare(gymId: string): void {
    startTransition(async () => {
      setError(null);
      const outcome = await attempted(
        () => requestCoachPlanAction(gymId, ""),
        "Could not change gym. Check your connection and try again.",
      );
      if (!outcome.ok) setError(outcome.message);
      else if (!outcome.value.ok) setError(outcome.value.error);
      else close();
    });
  }

  if (gyms.length < 2 && current)
    return (
      <span className="meta-fact">
        <Glyph name="pin" label="Gym" className="glyph-16" />
        <span className="[overflow-wrap:anywhere]">{name}</span>
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
        <span className="gym-choice-name">{name}</span>
        <Glyph name="chevronDown" className="glyph-16" />
      </button>

      <Sheet open={open} onClose={close} title="Choose gym">
        {workflow && (
          <p className="mt-1 type-meta text-ink-2">
            Choose the gym for your next session. A changed gym asks the coach to prepare for its
            equipment.
          </p>
        )}
        {pending && (
          <p role="status" className="mt-2 type-meta text-ink-2">
            {workflow ? "Asking the coach…" : "Changing gym…"}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 flex items-start gap-2 type-meta font-semibold">
            <Glyph name="warn" className="mt-px glyph-18" />
            {error}
          </p>
        )}
        <GymRows gyms={gyms} chosenId={chosenId} onChoose={choose} disabled={pending} />
        {pickedGym && (
          <Button
            size="lg"
            className="mt-3 w-full"
            disabled={pending}
            onClick={() => prepare(pickedGym.id)}
          >
            {pending ? "Asking…" : `Prepare for ${pickedGym.name}`}
          </Button>
        )}
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
