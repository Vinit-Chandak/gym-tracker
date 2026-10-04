"use client";

import { Glyph } from "@/components/ui/glyphs";
import type { GymKind } from "@/domain/types";
import { GYM_KIND_LABELS } from "@/lib/labels";

/**
 * The gyms to choose between, one ruled row each (Choose gym, and the coach's gym): the name,
 * whole on as many lines as it needs, its kind under it where the name does not already say it
 * ("Home", not "Home / Home"), and a check on the chosen one. One chooser wherever a gym is
 * chosen, so choosing reads the same in both places.
 */
export function GymRows({
  gyms,
  chosenId,
  onChoose,
  disabled = false,
}: {
  gyms: readonly { id: string; name: string; kind?: GymKind }[];
  chosenId: string | null;
  onChoose: (gymId: string) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="mt-1" aria-label="Gym">
      {gyms.map((gym, index) => {
        const kind = gym.kind ? GYM_KIND_LABELS[gym.kind] : null;
        const said = kind !== null && kind.trim().toLowerCase() !== gym.name.trim().toLowerCase();
        const chosen = gym.id === chosenId;
        return (
          <li key={gym.id} className={index < gyms.length - 1 ? "border-b border-hair" : ""}>
            <button
              type="button"
              onClick={() => onChoose(gym.id)}
              disabled={disabled}
              aria-pressed={chosen}
              className="flex min-h-[calc(56px+var(--ov-grow))] w-full items-center gap-3 py-1.5 text-left disabled:text-ink-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[length:var(--ov-type-button)] font-semibold [overflow-wrap:break-word]">
                  {gym.name}
                </span>
                {said && <span className="type-meta-small text-ink-2">{kind}</span>}
              </span>
              {chosen && <Glyph name="check" label="Chosen" className="glyph-20 shrink-0" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
