import { Glyph } from "@/components/ui/glyphs";
import { InfoTip } from "@/components/ui/info-tip";
import { Select } from "@/components/ui/select";
import { setMachineAlsoUsedForAction } from "@/server/actions/equipment";
import type { EquipmentTypeOption } from "@/server/repositories/equipment";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/labels";
import { EQUIPMENT_CATEGORIES } from "@/domain/types";

/**
 * "Also used for" (owner decision: combination machines): the other kinds of machine this one
 * is, such as the low row on a lat pulldown. Each is a row with Remove; the app's select (a
 * native one, drawn as every other) adds one. The machine's own type is changed from the form above, never here, and its history
 * stays its own however its uses change.
 */
export function AlsoUsedFor({
  gymId,
  equipmentId,
  ownTypeId,
  typeIds,
  types,
}: {
  gymId: string;
  equipmentId: string;
  ownTypeId: string;
  /** Every type the machine is, its own included. */
  typeIds: string[];
  types: EquipmentTypeOption[];
}) {
  const extra = types.filter((type) => typeIds.includes(type.id) && type.id !== ownTypeId);
  const addable = types.filter((type) => !typeIds.includes(type.id) && type.slug !== "bodyweight");
  return (
    <section aria-labelledby="also-used-for">
      {/* The tip sits beside the heading, not in it, so the heading's name is its words. */}
      <div className="heading-row">
        <div className="flex items-center gap-1">
          <h2 id="also-used-for" className="caption-head">
            Also used for
          </h2>
          <InfoTip label="About Also used for">
            A machine that does another kind&apos;s work too, such as a lat pulldown with a low row.
            That kind&apos;s exercises can then use it.
          </InfoTip>
        </div>
      </div>
      {/* Nothing else yet: the list is empty, and the select under it adds. */}
      {extra.length > 0 && (
        <ul className="ov-panel ov-panel-list mb-3">
          {extra.map((type) => (
            <li key={type.id} className="also-row">
              <span className="min-w-0 flex-1 [overflow-wrap:break-word]">{type.name}</span>
              <form action={setMachineAlsoUsedForAction.bind(null, gymId, equipmentId, false)}>
                <input type="hidden" name="equipmentTypeId" value={type.id} />
                <button type="submit" aria-label={`Remove ${type.name}`} className="review-remove">
                  <Glyph name="close" className="glyph-20" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form
        action={setMachineAlsoUsedForAction.bind(null, gymId, equipmentId, true)}
        className="also-add"
      >
        <label htmlFor="also-type" className="sr-only">
          Another use
        </label>
        <Select
          id="also-type"
          name="equipmentTypeId"
          required
          wrapperClassName="also-select"
          defaultValue=""
        >
          <option value="" disabled>
            Add another use…
          </option>
          {EQUIPMENT_CATEGORIES.map((category) => {
            const items = addable.filter((type) => type.category === category);
            return items.length === 0 ? null : (
              <optgroup key={category} label={EQUIPMENT_CATEGORY_LABELS[category]}>
                {items.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </Select>
        <button type="submit" className="also-submit">
          Add
        </button>
      </form>
    </section>
  );
}
