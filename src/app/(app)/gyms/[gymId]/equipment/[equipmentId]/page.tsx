import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { setEquipmentActiveAction, updateEquipmentAction } from "@/server/actions/equipment";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getEquipment, listEquipmentTypes } from "@/server/repositories/equipment";
import { requireUuid } from "@/server/validation/params";

import { EquipmentForm } from "../../../equipment-form";

export const metadata: Metadata = { title: "Machine" };

export default async function EquipmentPage(
  props: PageProps<"/gyms/[gymId]/equipment/[equipmentId]">,
) {
  const { gymId, equipmentId } = await props.params;
  requireUuid(gymId);
  requireUuid(equipmentId);
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  const data = await withUser(getDb(), user.id, async (tx) => {
    const [equipment, types] = await Promise.all([
      getEquipment(tx, user.id, equipmentId),
      listEquipmentTypes(tx),
    ]);
    if (!equipment || equipment.gymId !== gymId) return null;
    const profile = requestProfile;
    return {
      equipment,
      types,
      preferredUnit: profile.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const),
    };
  });
  if (!data) notFound();
  const { equipment, types, preferredUnit } = data;

  return (
    <>
      <PageHeader title={equipment.name} backHref={`/gyms/${gymId}`} />
      <PageContent>
        {!equipment.isActive && (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <Badge tone="danger">Archived</Badge>
              <form action={setEquipmentActiveAction.bind(null, gymId, equipment.id, true)}>
                <SubmitButton variant="secondary" size="sm">
                  Restore
                </SubmitButton>
              </form>
            </div>
          </Card>
        )}
        <Card>
          <EquipmentForm
            action={updateEquipmentAction.bind(null, equipment.id)}
            types={types}
            preferredUnit={preferredUnit}
            initial={{
              name: equipment.name,
              equipmentTypeId: equipment.equipmentTypeId,
              manufacturer: equipment.manufacturer ?? "",
              model: equipment.model ?? "",
              resistanceMode: equipment.resistanceMode,
              unit: equipment.unit,
              loadIncrement:
                equipment.loadIncrement === null ? "" : String(equipment.loadIncrement),
              pulleyRatio: equipment.pulleyRatio ?? "",
              angleDegrees: equipment.angleDegrees === null ? "" : String(equipment.angleDegrees),
              notes: equipment.notes ?? "",
            }}
            submitLabel="Save changes"
          />
        </Card>
        {equipment.isActive && (
          <Card>
            <h2 className="text-base font-semibold">Archive this machine</h2>
            <p className="text-sm text-ink-muted">
              Hides it when you plan a session at {equipment.gymName}. Sets you logged on it stay in
              your history.
            </p>
            <form action={setEquipmentActiveAction.bind(null, gymId, equipment.id, false)}>
              <SubmitButton variant="danger" className="w-full">
                Archive machine
              </SubmitButton>
            </form>
          </Card>
        )}
      </PageContent>
    </>
  );
}
