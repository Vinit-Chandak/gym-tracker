import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { SubmitButton } from "@/components/ui/form";
import { Glyph, gymKindGlyph, type GlyphName } from "@/components/ui/glyphs";
import { InfoTip } from "@/components/ui/info-tip";
import { NavRow } from "@/components/ui/nav-row";
import { Select } from "@/components/ui/select";
import {
  AVAILABILITY_LABELS,
  EQUIPMENT_CATEGORY_LABELS,
  equipmentCountLabel,
  GYM_KIND_LABELS,
  RESISTANCE_MODE_LABELS,
} from "@/lib/labels";
import {
  markEquipmentAbsentFromFormAction,
  unmarkEquipmentAbsentAction,
} from "@/server/actions/availability";
import { setDefaultGymAction, setGymActiveAction } from "@/server/actions/gyms";
import { listAbsentEquipment } from "@/server/repositories/absent-equipment";
import { gymAvailability } from "@/server/repositories/availability";
import {
  listEquipmentForGym,
  listEquipmentTypes,
  type EquipmentListItem,
} from "@/server/repositories/equipment";
import { getGym } from "@/server/repositories/gyms";
import { EQUIPMENT_CATEGORIES } from "@/domain/types";

export type GymDetailData = {
  gym: NonNullable<Awaited<ReturnType<typeof getGym>>>;
  equipment: Awaited<ReturnType<typeof listEquipmentForGym>>;
  absent: Awaited<ReturnType<typeof listAbsentEquipment>>;
  types: Awaited<ReturnType<typeof listEquipmentTypes>>;
  availability: Awaited<ReturnType<typeof gymAvailability>>;
};
/** A machine's glyph: a cable station its cable; otherwise what loads it. */
function machineGlyph(item: EquipmentListItem): GlyphName {
  if (item.typeCategory === "cable") return "cable";
  switch (item.resistanceMode) {
    case "plate_loaded":
    case "selectorized":
      return "machine";
    case "bodyweight":
      return "bodyweight";
    case "cardio":
      return "trainer";
    default:
      return "dumbbell";
  }
}

function EquipmentRows({ gymId, items }: { gymId: string; items: EquipmentListItem[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="nav-row-item">
          <Link
            prefetch="intent"
            href={`/gyms/${gymId}/equipment/${item.id}`}
            className="nav-row machine-row"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="nav-row-label nav-row-label-bold">{item.name}</span>
              <span className="meta-line">
                <span className="meta-fact">
                  <Glyph name={machineGlyph(item)} className="glyph-16" />
                  {/* Machines are usually named after their type, so only add it when it
                      differs. */}
                  {item.typeName === item.name
                    ? RESISTANCE_MODE_LABELS[item.resistanceMode]
                    : `${item.typeName} · ${RESISTANCE_MODE_LABELS[item.resistanceMode]}`}
                </span>
              </span>
            </span>
            <Glyph name="chevronRight" className="nav-row-chevron glyph-20 shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * A gym (board Gym): its name, its kind and whether it is the default; how the programme fits
 * it; then its machines, each with its glyph and how it is loaded, Add machine beside the count.
 * Below what the board draws: what the gym lacks, and archiving it.
 */
export function GymDetails({ data }: { data: GymDetailData }) {
  const { gym, equipment, absent, types, availability } = data;
  const activeEquipment = equipment.filter((item) => item.isActive);
  const archivedEquipment = equipment.filter((item) => !item.isActive);
  const summary = availability?.summary;
  const fitLabel = summary
    ? (["direct", "fallback", "unknown", "unavailable"] as const)
        .filter((status) => summary[status] > 0)
        .map((status) => `${summary[status]} ${AVAILABILITY_LABELS[status].toLowerCase()}`)
        .join(" · ")
    : "No active programme";
  // A combination machine is each of its types, so none of them is offered as missing.
  const registeredTypeIds = new Set(activeEquipment.flatMap((item) => item.typeIds));
  const absentTypeIds = new Set(absent.map((item) => item.equipmentTypeId));
  const absentCandidates = EQUIPMENT_CATEGORIES.map((category) => ({
    category,
    items: types.filter(
      (type) =>
        type.category === category &&
        !registeredTypeIds.has(type.id) &&
        !absentTypeIds.has(type.id),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <PageHeader
        title={gym.name}
        backHref="/gyms"
        action={
          <Link href={`/gyms/${gym.id}/edit`} className="header-text-action">
            Edit
          </Link>
        }
        meta={
          <>
            <span className="meta-fact">
              <Glyph name={gymKindGlyph(gym.kind)} className="glyph-16" />
              {GYM_KIND_LABELS[gym.kind]}
            </span>
            {gym.isDefault && (
              <span className="meta-fact">
                <Glyph name="check" className="glyph-16" />
                Default gym
              </span>
            )}
            {!gym.isActive && <span className="meta-fact">Archived</span>}
          </>
        }
      />
      <div className="page-width pb-8">
        {gym.address && <p className="mt-1 type-meta text-ink-2">{gym.address}</p>}
        {gym.notes && <p className="mt-1 type-meta whitespace-pre-line">{gym.notes}</p>}
        {gym.isActive && !gym.isDefault && (
          <form action={setDefaultGymAction.bind(null, gym.id)} className="mt-3">
            <SubmitButton variant="secondary" className="w-full">
              Make default gym
            </SubmitButton>
          </form>
        )}
        {!gym.isActive && (
          <form action={setGymActiveAction.bind(null, gym.id, true)} className="mt-3">
            <SubmitButton variant="secondary" className="w-full">
              Restore gym
            </SubmitButton>
          </form>
        )}

        <ul className="mt-2.5 border-b border-hair">
          <NavRow
            href={`/gyms/${gym.id}/programme`}
            glyph="table"
            label="Programme fit"
            sub={fitLabel}
          />
        </ul>

        <section aria-labelledby="gym-machines">
          <div className="list-head">
            <h2 id="gym-machines" className="caption-head mb-0 flex items-center gap-1">
              {equipmentCountLabel(activeEquipment.length)}
              <InfoTip label="About machines">
                {gym.kind === "gym"
                  ? "A gym's basics (free weights, benches, racks and the common machines) count as here until you say otherwise. Register anything else it has, and each machine is confirmed the first time you use it."
                  : "Nothing is assumed here: register what this place has, and anything else is asked about when an exercise needs it."}
              </InfoTip>
            </h2>
            {gym.isActive && (
              <Link href={`/gyms/${gym.id}/equipment/new`} className="list-head-action">
                <Glyph name="plus" className="glyph-20" />
                Add machine
              </Link>
            )}
          </div>
          {activeEquipment.length === 0 ? (
            <p className="mt-1 type-meta text-ink-2">
              No machines yet. Add each machine or cable station you use here.
            </p>
          ) : (
            <EquipmentRows gymId={gym.id} items={activeEquipment} />
          )}
          {/* Archived machines stay out of new logging but remain in the record. */}
          {archivedEquipment.length > 0 && (
            <details className="disclosure mt-2">
              <summary className="disclosure-summary">
                <span className="min-w-0 flex-1 font-bold">Archived machines</span>
                <span className="type-meta text-ink-2 tabular-nums">
                  {archivedEquipment.length}
                </span>
                <Glyph name="chevronDown" className="disclosure-chevron glyph-18 shrink-0" />
              </summary>
              <EquipmentRows gymId={gym.id} items={archivedEquipment} />
            </details>
          )}
        </section>

        {/* Known absence matters everywhere now: unanswered equipment is unknown at home and
            outdoors too, and saying it is not here stops the question (ADR 0004, amended). */}
        {(gym.kind === "gym" || absent.length > 0 || absentCandidates.length > 0) && (
          <section aria-labelledby="gym-unavailable">
            <h2 id="gym-unavailable" className="caption-head mt-4.5 flex items-center gap-1">
              Unavailable equipment
              <InfoTip label="About unavailable equipment">
                Mark what this place lacks so the programme suggests alternatives instead of asking.
              </InfoTip>
            </h2>
            {absent.length === 0 && absentCandidates.length === 0 && (
              <p className="type-meta text-ink-2">Nothing marked unavailable.</p>
            )}
            {absent.length > 0 && (
              <ul>
                {absent.map((item) => (
                  <li
                    key={item.equipmentTypeId}
                    className="flex min-h-[var(--ov-target)] items-center justify-between gap-3 border-b border-hair"
                  >
                    <span className="type-meta font-semibold">{item.typeName}</span>
                    <form
                      className="shrink-0"
                      action={unmarkEquipmentAbsentAction.bind(null, gym.id, item.equipmentTypeId)}
                    >
                      <SubmitButton variant="text" size="sm" className="w-auto">
                        Remove
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {gym.isActive && absentCandidates.length > 0 && (
              <form
                action={markEquipmentAbsentFromFormAction.bind(null, gym.id)}
                className="mt-2 space-y-1.5"
              >
                <label
                  htmlFor="absent-equipment"
                  className="block text-[length:var(--ov-type-meta-small)] font-bold"
                >
                  Mark equipment unavailable
                </label>
                {/* The select carries the long equipment names, so it takes the row. */}
                <div className="flex items-center gap-2">
                  <Select
                    id="absent-equipment"
                    name="equipmentTypeId"
                    required
                    defaultValue=""
                    wrapperClassName="min-w-0 flex-1"
                  >
                    <option value="">Choose equipment…</option>
                    {absentCandidates.map((group) => (
                      <optgroup
                        key={group.category}
                        label={EQUIPMENT_CATEGORY_LABELS[group.category]}
                      >
                        {group.items.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                  <SubmitButton variant="secondary" size="md" className="w-auto shrink-0">
                    Add
                  </SubmitButton>
                </div>
              </form>
            )}
          </section>
        )}

        {gym.isActive && (
          <details className="disclosure mt-4">
            <summary className="disclosure-summary">
              <span className="min-w-0 flex-1 font-bold">Gym options</span>
              <Glyph name="chevronDown" className="disclosure-chevron glyph-18 shrink-0" />
            </summary>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
              <p className="flex items-center gap-1 type-meta">
                Archive gym
                <InfoTip label="About archiving">
                  Hides it from pickers. History stays, and it can be restored any time.
                </InfoTip>
              </p>
              <form action={setGymActiveAction.bind(null, gym.id, false)}>
                <SubmitButton variant="danger" size="sm" className="w-auto">
                  Archive
                </SubmitButton>
              </form>
            </div>
          </details>
        )}
      </div>
    </>
  );
}
