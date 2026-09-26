import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { readLibrary } from "@/server/repositories/nutrition";

import { MyFoodsView } from "./my-foods-view";

export const metadata: Metadata = { title: "My foods" };

/** My foods, on a screen of its own under Food (ADR 0035). */
export default async function MyFoodsPage() {
  const user = await requireUser();
  const library = await withUser(getDb(), user.id, (tx) => readLibrary(tx, user.id), {
    readOnly: true,
  });
  return (
    <>
      <PageHeader title="My foods" backHref="/food" />
      <PageContent>
        <MyFoodsView library={library} />
      </PageContent>
    </>
  );
}
