"use client";

import { useMemo, useState } from "react";

import { Search } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { LinkRow, List } from "@/components/ui/link-row";
import { EQUIPMENT_CATEGORIES } from "@/domain/types";
import { EQUIPMENT_CATEGORY_LABELS, LOAD_UNIT_LABELS, RESISTANCE_MODE_LABELS } from "@/lib/labels";
import type { EquipmentListItem } from "@/server/repositories/equipment";

/** What a row says under the machine's name: its type when the name is not it, and how it loads. */
function subtitle(item: EquipmentListItem): string {
  // Machines are usually named after their type, so only add it when it differs.
  return item.typeName === item.name
    ? RESISTANCE_MODE_LABELS[item.resistanceMode]
    : `${item.typeName}, ${RESISTANCE_MODE_LABELS[item.resistanceMode].toLowerCase()}`;
}

export function EquipmentRows({
  gymId,
  items,
  plain = false,
}: {
  gymId: string;
  items: readonly EquipmentListItem[];
  plain?: boolean;
}) {
  return (
    <List plain={plain}>
      {items.map((item) => (
        <li key={item.id}>
          <LinkRow
            prefetch="intent"
            href={`/gyms/${gymId}/equipment/${item.id}`}
            title={item.name}
            subtitle={subtitle(item)}
            // A bare unit on every row is noise; the step is the part worth showing.
            meta={
              item.loadIncrement !== null
                ? `+${item.loadIncrement} ${LOAD_UNIT_LABELS[item.unit]}`
                : undefined
            }
          />
        </li>
      ))}
    </List>
  );
}

/**
 * A gym's machines, search first: a big gym registers ninety of them, and the one you came for
 * is found by typing a word of its name, not by scrolling. Grouped by kind while nothing
 * narrows them, in the library's own order, so the long list has landmarks.
 */
export function EquipmentList({
  gymId,
  items,
}: {
  gymId: string;
  items: readonly EquipmentListItem[];
}) {
  const [query, setQuery] = useState("");
  const present = EQUIPMENT_CATEGORIES.filter((kind) =>
    items.some((item) => item.typeCategory === kind),
  );
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((item) =>
      words.every((word) =>
        `${item.name} ${item.typeName} ${item.manufacturer ?? ""} ${item.model ?? ""}`
          .toLowerCase()
          .includes(word),
      ),
    );
  }, [items, query]);
  const groups = present
    .map((kind) => ({ kind, items: shown.filter((item) => item.typeCategory === kind) }))
    .filter((group) => group.items.length > 0);
  // Grouping only helps the long, unfiltered list; a search is already short.
  const grouped = query.trim() === "" && present.length > 1;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search this gym's machines"
          aria-label="Search machines"
          className="pl-9"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="search"
        />
      </div>
      {shown.length === 0 ? (
        <p className="px-1 text-sm text-ink-muted">No machines match “{query}”.</p>
      ) : grouped ? (
        groups.map((group) => (
          <section key={group.kind} className="space-y-2">
            <h3 className="px-1 pt-2 text-sm font-semibold text-ink-muted">
              {EQUIPMENT_CATEGORY_LABELS[group.kind]}
            </h3>
            <EquipmentRows gymId={gymId} items={group.items} />
          </section>
        ))
      ) : (
        <EquipmentRows gymId={gymId} items={shown} />
      )}
    </div>
  );
}
