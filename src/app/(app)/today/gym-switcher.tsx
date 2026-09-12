"use client";

import { Check, MapPin } from "@/components/ui/icons";
import Link from "@/components/ui/app-link";
import { useState, useTransition } from "react";

import { Button, LinkButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { GymKind } from "@/domain/types";
import { GYM_KIND_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { setDefaultGymAction } from "@/server/actions/gyms";
import { attempted } from "@/lib/offline-submit";

export type SwitcherGym = { id: string; name: string; kind: GymKind; isDefault: boolean };

/** One-tap gym selection: shows the default gym and opens a sheet to change it. */
export function GymSwitcher({ gyms }: { gyms: SwitcherGym[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current = gyms.find((gym) => gym.isDefault);

  function choose(gymId: string): void {
    startTransition(async () => {
      setError(null);
      const outcome = await attempted(
        () => setDefaultGymAction(gymId),
        "Could not change gym. Check your connection and try again.",
      );
      if (outcome.ok) setOpen(false);
      else setError(outcome.message);
    });
  }

  return (
    <>
      {/* One line: the pin says what the name is, so nothing has to caption it. */}
      <section aria-label="Current gym" className="flex box items-center gap-2 py-1 pr-1 pl-3">
        <MapPin className="shrink-0 text-ink-muted" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {current ? current.name : gyms.length > 0 ? "No default gym" : "No gyms yet"}
        </p>
        {gyms.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            Change
          </Button>
        ) : (
          <LinkButton href="/gyms/new" size="sm">
            Add gym
          </LinkButton>
        )}
      </section>

      <Sheet open={open} onClose={() => setOpen(false)} title="Choose gym">
        {pending && (
          <p role="status" className="text-sm text-ink-muted">
            Changing gym…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <ul className="space-y-2">
          {gyms.map((gym) => (
            <li key={gym.id}>
              <button
                type="button"
                onClick={() => choose(gym.id)}
                disabled={pending}
                aria-pressed={gym.isDefault}
                className={cn(
                  "flex min-h-14 w-full items-center justify-between gap-3 rounded-control border px-4 text-left text-base font-medium",
                  gym.isDefault
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-transparent bg-surface-raised text-ink active:bg-accent-soft",
                  pending && "opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{gym.name}</span>
                  <span className="block text-xs font-normal text-ink-muted">
                    {GYM_KIND_LABELS[gym.kind]}
                  </span>
                </span>
                {gym.isDefault && <Check className="shrink-0 text-accent" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        <Link
          href="/gyms"
          className="mt-3 block py-3 text-center text-sm font-medium text-ink-muted"
        >
          Manage gyms
        </Link>
      </Sheet>
    </>
  );
}
