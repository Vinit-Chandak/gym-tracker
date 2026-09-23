import type { Metadata } from "next";

import { PeopleSearch } from "@/components/people-search";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Find people" };

/** Find people (ADR 0027): the search field, already focused, and its results. */
export default function FindPeoplePage() {
  return (
    <>
      <PageHeader title="Find people" backHref="/profile/friends" />
      <PageContent>
        <Card>
          <PeopleSearch autoFocus labelHidden />
        </Card>
      </PageContent>
    </>
  );
}
