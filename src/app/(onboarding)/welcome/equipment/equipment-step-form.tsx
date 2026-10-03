"use client";

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import type { EquipmentCategory } from "@/domain/types";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/labels";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { addStarterEquipmentAction } from "@/server/actions/onboarding";
import type { EquipmentTypeOption } from "@/server/repositories/equipment";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

import { SkipLink } from "../skip-link";

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

  // Board Machines: the search, Select all and Clear all with the count, then the catalogue as
  // ticks, two to a row, grouped; Add and continue, or skip, pinned.
  return (
    <form action={formAction}>
      <input type="hidden" name="gymId" value={gymId} />

      <div className="search-box mt-0.5" data-filled={query ? "true" : undefined}>
        <Glyph name="search" className="glyph-20" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a machine"
          aria-label="Find a machine"
          className="search-box-input"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="search"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          disabled={selectable.length === 0 || selected.size === selectable.length}
          onClick={() => setSelected(new Set(selectable.map((type) => type.id)))}
        >
          Select all machines
        </Button>
        <Button
          variant="text"
          size="sm"
          disabled={selected.size === 0}
          onClick={() => setSelected(new Set())}
        >
          Clear all
        </Button>
        <span className="ml-auto type-meta-small font-bold tabular-nums" role="status">
          {selected.size} selected
        </span>
      </div>
      {groups.length === 0 ? (
        <p className="mt-3 type-meta text-ink-2">Nothing matches “{query.trim()}”.</p>
      ) : (
        groups.map((group) => (
          <fieldset key={group.category}>
            <legend className="caption-head mt-3">
              {EQUIPMENT_CATEGORY_LABELS[group.category]}
            </legend>
            <ul className="tick-grid">
              {group.items.map((type) => (
                <li key={type.id}>
                  <label className="tick-tile">
                    <input
                      type="checkbox"
                      name="equipmentTypeIds"
                      value={type.id}
                      checked={selected.has(type.id)}
                      onChange={() => toggle(type.id)}
                      className="peer sr-only"
                    />
                    <span aria-hidden className="tick-box">
                      <Glyph name="check" className="glyph-15" />
                    </span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">{type.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))
      )}

      <PinnedActions stack>
        <FormError message={state.formError} />
        <SubmitButton pendingLabel="Adding…">
          {selected.size === 0 ? "Continue without machines" : "Add and continue"}
        </SubmitButton>
        <SkipLink href="/welcome/programme" />
      </PinnedActions>
    </form>
  );
}
