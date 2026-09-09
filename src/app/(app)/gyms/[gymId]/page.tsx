import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { listAbsentEquipment } from "@/server/repositories/absent-equipment";
import { gymAvailability } from "@/server/repositories/availability";
import { listEquipmentForGym, listEquipmentTypes } from "@/server/repositories/equipment";
import { getGym } from "@/server/repositories/gyms";
import { requireUuid } from "@/server/validation/params";
import { GymDetails } from "./gym-details";

export const metadata: Metadata = { title: "Gym" };
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
  return <GymDetails data={data} />;
}
