import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { multisportRollout } from "@/lib/multisport-rollout";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Training" };

/**
 * Where training is entered and managed (plan §2.3).
 *
 * Not a second history and not a second Today: this is the page you come to in order to log
 * something, schedule something, or open the programme. History owns what actually happened;
 * Today owns what is scheduled for today.
 */
export default async function TrainingPage() {
  if (!multisportRollout().sharedNavigation) notFound();
  await requireUser();
  return (
    <>
      <PageHeader title="Training" />
      <PageContent>
        <Section title="Log an activity">
          <Card>
            <p className="text-sm text-ink-muted">
              Record something you have done. Ad hoc work stays ad hoc: it is never matched to a
              planned session.
            </p>
            <LinkButton href="/training/new?sport=running" className="w-full">
              Log a run
            </LinkButton>
          </Card>
        </Section>
      </PageContent>
    </>
  );
}
