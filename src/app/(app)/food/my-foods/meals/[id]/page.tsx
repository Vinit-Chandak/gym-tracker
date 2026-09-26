import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { readLibrary, readSavedMeal } from "@/server/repositories/nutrition";

import { MealBuilder } from "../meal-builder";

export const metadata: Metadata = { title: "Meal" };

/** A saved meal in My foods, to change or delete (ADR 0035). */
export default async function SavedMealPage(props: PageProps<"/food/my-foods/meals/[id]">) {
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const [saved, { foods }] = await withUser(
    getDb(),
    user.id,
    (tx) => Promise.all([readSavedMeal(tx, user.id, id), readLibrary(tx, user.id)]),
    { readOnly: true },
  );
  if (!saved) notFound();
  return (
    <>
      <PageHeader title={saved.name} backHref="/food/my-foods" />
      <PageContent>
        <MealBuilder saved={saved} foods={foods} />
      </PageContent>
    </>
  );
}
