import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/server/auth";

import { Steps } from "../steps";
import { SkipLink } from "../skip-link";
import { FirstGymForm } from "./first-gym-form";

export const metadata: Metadata = { title: "Add your gym" };

export default async function WelcomeGymPage() {
  await requireUser();

  return (
    <PageContent>
      <Steps current="gym" />
      <Card>
        <div>
          <h1 className="text-xl font-medium">Where do you train?</h1>
          <p className="text-sm text-ink-muted">
            Each gym keeps its own machine list, so a stack number from one place is never compared
            with another. Add more later.
          </p>
        </div>
        <FirstGymForm />
      </Card>
      <SkipLink />
    </PageContent>
  );
}
