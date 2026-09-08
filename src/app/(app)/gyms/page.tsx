import { MapPin } from "lucide-react";
import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkRow, List } from "@/components/ui/link-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { equipmentCountLabel, GYM_KIND_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { listGyms, type GymListItem } from "@/server/repositories/gyms";

export const metadata: Metadata = { title: "Gyms" };

function GymRows({ gyms }: { gyms: GymListItem[] }) {
  return (
    <List>
      {gyms.map((gym) => (
        <li key={gym.id}>
          <LinkRow
            href={`/gyms/${gym.id}`}
            title={gym.name}
            subtitle={`${GYM_KIND_LABELS[gym.kind]} · ${equipmentCountLabel(gym.equipmentCount)}`}
            badge={gym.isDefault ? <Badge tone="accent">Default</Badge> : undefined}
          />
        </li>
      ))}
    </List>
  );
}

export default async function GymsPage() {
  const user = await requireUser();
  const gyms = await withUser(getDb(), user.id, (tx) => listGyms(tx, user.id));
  const active = gyms.filter((gym) => gym.isActive);
  const archived = gyms.filter((gym) => !gym.isActive);

  return (
    <>
      <PageHeader
        title="Gyms"
        action={
          <LinkButton href="/gyms/new" size="sm">
            Add gym
          </LinkButton>
        }
      />
      <PageContent>
        {active.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No gyms yet"
            description="Add the gyms you train at. Each gym keeps its own machine list, so history never mixes stack numbers between locations."
          />
        ) : (
          <GymRows gyms={active} />
        )}
        {active.length > 0 && !active.some((gym) => gym.isDefault) && (
          <p className="px-1 text-sm text-ink-muted">
            No default gym yet. Open a gym and tap “Make default gym”.
          </p>
        )}
        {archived.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer px-1 py-2 text-sm font-medium text-ink-muted select-none">
              Archived ({archived.length})
            </summary>
            <div className="mt-2">
              <GymRows gyms={archived} />
            </div>
          </details>
        )}
      </PageContent>
    </>
  );
}
