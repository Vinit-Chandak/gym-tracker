import type { Metadata } from "next";

import { PeopleSearch } from "@/components/people-search";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Find people" };

/** Find people (ADR 0027): the search cell, already focused, and its results as ruled rows. */
export default function FindPeoplePage() {
  return (
    <>
      <PageHeader title="Find people" backHref="/profile/friends" />
      <PageContent>
        <PeopleSearch autoFocus labelHidden />
      </PageContent>
    </>
  );
}
