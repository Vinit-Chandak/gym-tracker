"use client";

import type { Route } from "next";

import { MyFoodsView } from "@/app/(app)/food/my-foods/my-foods-view";
import type { Library } from "@/server/repositories/nutrition";

/**
 * My foods with its links led to the preview's own pages. A link that is worked out per meal is
 * a function, which cannot cross from the server's page to the client's view, so it is made here.
 */
export function MyFoodsPreview({ library }: { library: Library }) {
  return (
    <MyFoodsView
      library={library}
      links={{
        newMeal: "/preview/food?page=meal&state=new" as Route,
        meal: () => "/preview/food?page=meal" as Route,
      }}
    />
  );
}
