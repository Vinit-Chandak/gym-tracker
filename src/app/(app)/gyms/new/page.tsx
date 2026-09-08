import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { createGymAction } from "@/server/actions/gyms";
import { requireUser } from "@/server/auth";

import { GymForm } from "../gym-form";

export const metadata: Metadata = { title: "New gym" };

export default async function NewGymPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="New gym" backHref="/gyms" />
      <PageContent>
        <Card>
          <GymForm action={createGymAction} submitLabel="Create gym" />
        </Card>
      </PageContent>
    </>
  );
}
