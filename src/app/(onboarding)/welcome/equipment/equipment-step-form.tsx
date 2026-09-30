"use client";

import { Check, Search } from "@/components/ui/icons";
import { useActionState, useMemo, useState } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { EquipmentCategory } from "@/domain/types";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/labels";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { addStarterEquipmentAction } from "@/server/actions/onboarding";
import type { EquipmentTypeOption } from "@/server/repositories/equipment";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

/** Free weights and bodyweight need no machine registered, so ticking them would be noise. */
const ASSUMED: ReadonlySet<EquipmentCategory> = new Set(["free_weight", "bodyweight"]);

const CATEGORY_ORDER: readonly EquipmentCategory[] = ["machine", "cable", "cardio", "accessory"];

/**
 * Ticking what a gym has: a search, the machines in a box of rows per kind, and the way on
 * pinned to the bottom of the screen, since the list runs to nearly a hundred rows and the
 * button at its end is the whole point of the step. A ticked row takes lifting's wash: a
 * machine is a lifting thing.
 */
export function EquipmentStepForm({
  gymId,
  types,
}: {
  gymId: string;
  types: EquipmentTypeOption[];
}) {
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(addStarterEquipmentAction),
    INITIAL_FORM_STATE,
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const selectable = types.filter(
    (type) => CATEGORY_ORDER.includes(type.category) && !ASSUMED.has(type.category),
  );

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: types.filter(
        (type) =>
          type.category === category &&
          !ASSUMED.has(type.category) &&
          // A ticked machine stays visible, so filtering can never hide a choice already made.
          (needle === "" || type.name.toLowerCase().includes(needle) || selected.has(type.id)),
      ),
    })).filter((group) => group.items.length > 0);
  }, [types, query, selected]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="gymId" value={gymId} />

      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a machine"
            aria-label="Find a machine"
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={selectable.length === 0 || selected.size === selectable.length}
            onClick={() => setSelected(new Set(selectable.map((type) => type.id)))}
          >
            Select all machines
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={selected.size === 0}
            onClick={() => setSelected(new Set())}
          >
            Clear all
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="px-1 text-sm text-ink-muted">Nothing matches “{query.trim()}”.</p>
      ) : (
        groups.map((group) => (
          <fieldset key={group.category} className="min-w-0">
            <legend className="px-1 pb-2 text-headline font-semibold">
              {EQUIPMENT_CATEGORY_LABELS[group.category]}
            </legend>
            <ul className="box-rows">
              {group.items.map((type) => (
                <li key={type.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors duration-[var(--ov-duration-feedback)] has-checked:bg-lift-soft has-checked:text-lift-ink">
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{type.name}</span>
                    {/* Still a real checkbox, drawn as the round tick the rest of the app
                        uses for "this one": empty ring, then lifting's fill with a tick. */}
                    <span className="relative flex size-7 shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        name="equipmentTypeIds"
                        value={type.id}
                        checked={selected.has(type.id)}
                        onChange={() => toggle(type.id)}
                        className="peer size-7 cursor-pointer appearance-none rounded-full border-2 border-line-strong transition-colors duration-[var(--ov-duration-feedback)] checked:border-lift checked:bg-lift"
                      />
                      <Check
                        aria-hidden
                        className="pointer-events-none absolute text-on-lift opacity-0 peer-checked:opacity-100"
                      />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))
      )}

      <FormError message={state.formError} />
      <div className="sticky-actions space-y-2">
        <p className="text-center text-sm text-ink-muted tabular-nums" aria-live="polite">
          {selected.size === 0
            ? "Nothing ticked yet"
            : `${selected.size} ${selected.size === 1 ? "machine" : "machines"} ticked`}
        </p>
        <SubmitButton pendingLabel="Adding…">
          {selected.size === 0 ? "Continue without machines" : "Add and continue"}
        </SubmitButton>
      </div>
    </form>
  );
}
