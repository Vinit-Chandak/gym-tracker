import type { Metadata } from "next";

import { PeopleSearch } from "@/components/people-search";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Find people" };

/**
 * Find people (ADR 0027): the search field, already focused, and its results under it. The
 * field is the page, so it sits on the canvas rather than in a box of its own.
 */
export default function FindPeoplePage() {
  return (
    <>
      <PageHeader title="Find people" backHref="/profile/friends" backLabel="Friends" />
      <PageContent>
        <PeopleSearch autoFocus labelHidden />
      </PageContent>
    </>
  );
}
