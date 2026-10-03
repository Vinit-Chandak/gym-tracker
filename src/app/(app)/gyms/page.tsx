import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Glyph, gymKindGlyph } from "@/components/ui/glyphs";
import { NavRow } from "@/components/ui/nav-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { equipmentCountLabel, GYM_KIND_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { listGyms, type GymListItem } from "@/server/repositories/gyms";

export const metadata: Metadata = { title: "Gyms" };

function GymRows({ gyms }: { gyms: GymListItem[] }) {
  return gyms.map((gym) => (
    <NavRow
      key={gym.id}
      href={`/gyms/${gym.id}`}
      lead={
        <Glyph
          name={gymKindGlyph(gym.kind)}
          label={GYM_KIND_LABELS[gym.kind]}
          className="glyph-22"
        />
      }
      label={gym.name}
      sub={equipmentCountLabel(gym.equipmentCount)}
      tag={gym.isDefault ? "Default" : undefined}
    />
  ));
}

/**
 * The places you train (board Gyms): each as its kind's glyph, its name and how much is
 * registered there, the default marked; Add gym ends the list.
 */
export default async function GymsPage() {
  const user = await requireUser();
  const gyms = await withUser(getDb(), user.id, (tx) => listGyms(tx, user.id), { readOnly: true });
  const active = gyms.filter((gym) => gym.isActive);
  const archived = gyms.filter((gym) => !gym.isActive);

  return (
    <>
      <PageHeader title="Gyms" backHref="/profile" />
      <div className="page-width pb-8">
        {active.length === 0 && (
          <p className="mt-2 type-meta text-ink-2">No gyms yet. Add the gyms you train at.</p>
        )}
        <ul className="mt-2.5">
          <GymRows gyms={active} />
          <li>
            <Link href="/gyms/new" className="add-row">
              <span className="mark-cell">
                <Glyph name="plus" className="glyph-20" />
              </span>
              Add gym
            </Link>
          </li>
        </ul>
        {active.length > 0 && !active.some((gym) => gym.isDefault) && (
          <p className="mt-2 type-meta-small text-ink-2">
            No default gym. Open one and make it the default.
          </p>
        )}
        {/* Archived gyms are kept, not deleted: history refers to them. */}
        {archived.length > 0 && (
          <details className="disclosure mt-4">
            <summary className="disclosure-summary">
              <span className="min-w-0 flex-1 font-bold">Archived</span>
              <span className="type-meta text-ink-2 tabular-nums">{archived.length}</span>
              <Glyph name="chevronDown" className="disclosure-chevron glyph-18 shrink-0" />
            </summary>
            <ul>
              <GymRows gyms={archived} />
            </ul>
          </details>
        )}
      </div>
    </>
  );
}
