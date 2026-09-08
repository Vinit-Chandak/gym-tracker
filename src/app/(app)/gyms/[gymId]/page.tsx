import { SubmitButton } from "@/components/ui/form";
import { Dumbbell } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkRow, List } from "@/components/ui/link-row";
import { SectionHeading } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { Select } from "@/components/ui/select";
import {
  AVAILABILITY_LABELS,
  EQUIPMENT_CATEGORY_LABELS,
  GYM_KIND_LABELS,
  LOAD_UNIT_LABELS,
  RESISTANCE_MODE_LABELS,
} from "@/lib/labels";
import {
  markEquipmentAbsentFromFormAction,
  unmarkEquipmentAbsentAction,
} from "@/server/actions/availability";
import { setDefaultGymAction, setGymActiveAction } from "@/server/actions/gyms";
import { requireUser } from "@/server/auth";
import { listAbsentEquipment } from "@/server/repositories/absent-equipment";
import { gymAvailability } from "@/server/repositories/availability";
import {
  listEquipmentForGym,
  listEquipmentTypes,
  type EquipmentListItem,
} from "@/server/repositories/equipment";
import { getGym } from "@/server/repositories/gyms";
import { requireUuid } from "@/server/validation/params";
import { EQUIPMENT_CATEGORIES } from "@/domain/types";

export const metadata: Metadata = { title: "Gym" };

function EquipmentRows({ gymId, items }: { gymId: string; items: EquipmentListItem[] }) {
  return (
    <List>
      {items.map((item) => (
        <li key={item.id}>
          <LinkRow
            href={`/gyms/${gymId}/equipment/${item.id}`}
            title={item.name}
            // Machines are usually named after their type, so only add it when it differs.
            subtitle={
              item.typeName === item.name
                ? RESISTANCE_MODE_LABELS[item.resistanceMode]
                : `${item.typeName} · ${RESISTANCE_MODE_LABELS[item.resistanceMode]}`
            }
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

export default async function GymPage(props: PageProps<"/gyms/[gymId]">) {
  const { gymId } = await props.params;
  requireUuid(gymId);
  const user = await requireUser();
  const data = await withUser(getDb(), user.id, async (tx) => {
    const gym = await getGym(tx, user.id, gymId);
    if (!gym) return null;
    const [equipment, absent, types, availability] = await Promise.all([
      listEquipmentForGym(tx, user.id, gymId),
      listAbsentEquipment(tx, user.id, gymId),
      listEquipmentTypes(tx),
      gymAvailability(tx, user.id, gymId),
    ]);
    return { gym, equipment, absent, types, availability };
  });
  if (!data) notFound();
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
  const registeredTypeIds = new Set(activeEquipment.map((item) => item.typeId));
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
          <LinkButton href={`/gyms/${gym.id}/edit`} variant="secondary" size="sm">
            Edit
          </LinkButton>
        }
      />
      <PageContent>
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{GYM_KIND_LABELS[gym.kind]}</Badge>
            {gym.isDefault && <Badge tone="accent">Default gym</Badge>}
            {!gym.isActive && <Badge tone="danger">Archived</Badge>}
          </div>
          {gym.address && <p className="text-sm text-ink-muted">{gym.address}</p>}
          {gym.notes && <p className="text-sm whitespace-pre-line">{gym.notes}</p>}
          {gym.isActive && !gym.isDefault && (
            <form action={setDefaultGymAction.bind(null, gym.id)}>
              <SubmitButton variant="secondary" className="w-full">
                Make default gym
              </SubmitButton>
            </form>
          )}
          {!gym.isActive && (
            <form action={setGymActiveAction.bind(null, gym.id, true)}>
              <SubmitButton variant="secondary" className="w-full">
                Restore gym
              </SubmitButton>
            </form>
          )}
        </Card>

        <List>
          <li>
            <LinkRow href={`/gyms/${gym.id}/programme`} title="Programme fit" subtitle={fitLabel} />
          </li>
        </List>

        <SectionHeading
          title="Equipment"
          action={
            gym.isActive ? (
              <LinkButton href={`/gyms/${gym.id}/equipment/new`} size="sm">
                Add machine
              </LinkButton>
            ) : undefined
          }
        />
        {activeEquipment.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No machines yet"
            description="Add each machine or cable station you use here. Barbells, dumbbells and bodyweight moves count as available at every gym."
          />
        ) : (
          <EquipmentRows gymId={gym.id} items={activeEquipment} />
        )}
        {archivedEquipment.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer px-1 py-2 text-sm font-medium text-ink-muted select-none">
              Archived machines ({archivedEquipment.length})
            </summary>
            <div className="mt-2">
              <EquipmentRows gymId={gym.id} items={archivedEquipment} />
            </div>
          </details>
        )}

        {gym.kind === "gym" && (
          <Card>
            <h2 className="text-base font-semibold">Not available here</h2>
            <p className="text-sm text-ink-muted">
              Equipment this gym does not have. Exercises that need it show as unavailable instead
              of unknown.
            </p>
            {absent.length > 0 && (
              <ul className="divide-y divide-line">
                {absent.map((item) => (
                  <li
                    key={item.equipmentTypeId}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="text-sm">{item.typeName}</span>
                    <form
                      action={unmarkEquipmentAbsentAction.bind(null, gym.id, item.equipmentTypeId)}
                    >
                      <SubmitButton variant="ghost" size="sm">
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
                className="space-y-1.5"
              >
                <label
                  htmlFor="absent-equipment"
                  className="block text-sm font-medium text-ink-muted"
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
                    className="min-w-0 flex-1"
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
          </Card>
        )}

        {gym.isActive && (
          <Card>
            <h2 className="text-base font-semibold">Archive this gym</h2>
            <p className="text-sm text-ink-muted">
              Hides it from gym pickers. Past sessions keep pointing at it, and you can restore it
              any time.
            </p>
            <form action={setGymActiveAction.bind(null, gym.id, false)}>
              <SubmitButton variant="danger" className="w-full">
                Archive gym
              </SubmitButton>
            </form>
          </Card>
        )}
      </PageContent>
    </>
  );
}
