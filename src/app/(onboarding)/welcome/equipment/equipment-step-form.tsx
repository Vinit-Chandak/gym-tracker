"use client";

import { Search } from "@/components/ui/icons";
import { useActionState, useMemo, useState } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { EquipmentCategory } from "@/domain/types";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/labels";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { addStarterEquipmentAction } from "@/server/actions/onboarding";
import type { EquipmentTypeOption } from "@/server/repositories/equipment";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

/** Free weights and bodyweight need no machine registered, so ticking them would be noise. */
const ASSUMED: ReadonlySet<EquipmentCategory> = new Set(["free_weight", "bodyweight"]);

const CATEGORY_ORDER: readonly EquipmentCategory[] = ["machine", "cable", "cardio", "accessory"];

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
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="gymId" value={gymId} />

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

      {groups.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing matches “{query.trim()}”.</p>
      ) : (
        groups.map((group) => (
          <fieldset key={group.category} className="space-y-2">
            <legend className="pb-1 text-xs font-medium tracking-wide text-ink-muted uppercase">
              {EQUIPMENT_CATEGORY_LABELS[group.category]}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.items.map((type) => (
                <label
                  key={type.id}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-transparent bg-surface-raised px-3 py-2 has-checked:border-accent has-checked:bg-accent-soft"
                >
                  <input
                    type="checkbox"
                    name="equipmentTypeIds"
                    value={type.id}
                    checked={selected.has(type.id)}
                    onChange={() => toggle(type.id)}
                    className="size-5 shrink-0 accent-[var(--ov-accent)]"
                  />
                  <span className="min-w-0 text-sm">{type.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))
      )}

      <FormError message={state.formError} />
      <p className="text-sm text-ink-muted" aria-live="polite">
        {selected.size === 0
          ? "Nothing ticked yet."
          : `${selected.size} ${selected.size === 1 ? "machine" : "machines"} selected.`}
      </p>
      <SubmitButton pendingLabel="Adding…">
        {selected.size === 0 ? "Continue without machines" : "Add and continue"}
      </SubmitButton>
    </form>
  );
}
