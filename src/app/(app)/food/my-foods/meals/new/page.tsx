import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { readLibrary } from "@/server/repositories/nutrition";

import { MealBuilder } from "../meal-builder";

export const metadata: Metadata = { title: "New meal" };

/** A new meal in My foods, built from its foods (ADR 0035). */
export default async function NewMealPage() {
  const user = await requireUser();
  const { foods } = await withUser(getDb(), user.id, (tx) => readLibrary(tx, user.id), {
    readOnly: true,
  });
  return (
    <>
      <PageHeader title="New meal" backHref="/food/my-foods" />
      <PageContent>
        <MealBuilder saved={null} foods={foods} />
      </PageContent>
    </>
  );
}
