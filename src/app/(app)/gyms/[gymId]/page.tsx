import { Dumbbell } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkRow, List } from "@/components/ui/link-row";
import { SectionHeading } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { GYM_KIND_LABELS, LOAD_UNIT_LABELS, RESISTANCE_MODE_LABELS } from "@/lib/labels";
import { setDefaultGymAction, setGymActiveAction } from "@/server/actions/gyms";
import { requireUser } from "@/server/auth";
import { listEquipmentForGym, type EquipmentListItem } from "@/server/repositories/equipment";
import { getGym } from "@/server/repositories/gyms";

export const metadata: Metadata = { title: "Gym" };

function EquipmentRows({ gymId, items }: { gymId: string; items: EquipmentListItem[] }) {
  return (
    <List>
      {items.map((item) => (
        <li key={item.id}>
          <LinkRow
            href={`/gyms/${gymId}/equipment/${item.id}`}
            title={item.name}
            subtitle={`${item.typeName} · ${RESISTANCE_MODE_LABELS[item.resistanceMode]}`}
            meta={
              item.loadIncrement !== null
                ? `+${item.loadIncrement} ${LOAD_UNIT_LABELS[item.unit]}`
                : LOAD_UNIT_LABELS[item.unit]
            }
          />
        </li>
      ))}
    </List>
  );
}

export default async function GymPage(props: PageProps<"/gyms/[gymId]">) {
  const { gymId } = await props.params;
  const user = await requireUser();
  const data = await withUser(getDb(), user.id, async (tx) => {
    const gym = await getGym(tx, user.id, gymId);
    if (!gym) return null;
    return { gym, equipment: await listEquipmentForGym(tx, user.id, gymId) };
  });
  if (!data) notFound();
  const { gym, equipment } = data;
  const activeEquipment = equipment.filter((item) => item.isActive);
  const archivedEquipment = equipment.filter((item) => !item.isActive);

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
              <Button type="submit" variant="secondary" className="w-full">
                Make default gym
              </Button>
            </form>
          )}
          {!gym.isActive && (
            <form action={setGymActiveAction.bind(null, gym.id, true)}>
              <Button type="submit" variant="secondary" className="w-full">
                Restore gym
              </Button>
            </form>
          )}
        </Card>

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

        {gym.isActive && (
          <Card>
            <h2 className="text-base font-semibold">Archive this gym</h2>
            <p className="text-sm text-ink-muted">
              Hides it from gym pickers. Past sessions keep pointing at it, and you can restore it
              any time.
            </p>
            <form action={setGymActiveAction.bind(null, gym.id, false)}>
              <Button type="submit" variant="danger" className="w-full">
                Archive gym
              </Button>
            </form>
          </Card>
        )}
      </PageContent>
    </>
  );
}
