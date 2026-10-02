"use client";

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormError, SubmitButton } from "@/components/ui/form";
import { CheckSquare, Search, Square } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import type { EquipmentCategory } from "@/domain/types";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/labels";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { cn } from "@/lib/utils";
import { addStarterEquipmentAction } from "@/server/actions/onboarding";
import type { EquipmentTypeOption } from "@/server/repositories/equipment";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

/** Free weights and bodyweight need no machine registered, so ticking them would be noise. */
const ASSUMED: ReadonlySet<EquipmentCategory> = new Set(["free_weight", "bodyweight"]);

const CATEGORY_ORDER: readonly EquipmentCategory[] = ["machine", "cable", "cardio", "accessory"];

/**
 * The tick list of a gym's machines: a search cell, the two bulk actions with the running
 * count beside them in the data voice, then the machines by category as ruled rows, each a
 * square that is ticked in ink once chosen. The one highlighter is the submit, and it says
 * what it will do with what is ticked.
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
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="gymId" value={gymId} />

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
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
        <span className="font-data text-sm text-ink-muted tabular-nums" aria-live="polite">
          {selected.size} selected
        </span>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing matches “{query.trim()}”.</p>
      ) : (
        groups.map((group) => (
          <fieldset key={group.category} className="min-w-0">
            <legend className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
              {EQUIPMENT_CATEGORY_LABELS[group.category]}
            </legend>
            <ul className="mt-1 ruled-list">
              {group.items.map((type) => {
                const on = selected.has(type.id);
                return (
                  <li key={type.id}>
                    <label
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center gap-3 py-2 transition-colors duration-[var(--ov-duration-feedback)] has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-focus",
                        on ? "text-ink" : "text-ink-muted",
                      )}
                    >
                      {/* A real checkbox, read by the form and by assistive tech; the square
                          beside the name is how it is drawn. */}
                      <input
                        type="checkbox"
                        name="equipmentTypeIds"
                        value={type.id}
                        checked={on}
                        onChange={() => toggle(type.id)}
                        className="sr-only"
                      />
                      {on ? (
                        <CheckSquare scale="row" className="shrink-0 text-ink" aria-hidden />
                      ) : (
                        <Square scale="row" className="shrink-0 text-ink-subtle" aria-hidden />
                      )}
                      <span className={cn("min-w-0 [overflow-wrap:anywhere]", on && "font-medium")}>
                        {type.name}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
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
