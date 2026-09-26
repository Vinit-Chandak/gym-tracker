"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { Tabs } from "@/components/ui/tabs";

import type { ProgrammeView } from "./programme-views";

/**
 * Cycle and Changes, the programme's two questions.
 *
 * "What am I training?" is the whole programme, and it has one home. "What is different?" is
 * a review, and it shows only what differs. They were previously the same screen, which is
 * why a review printed the programme twice before showing anything that had actually changed.
 *
 * The choice is in the URL so a refresh, a back gesture and a link from Today all land on the
 * tab the athlete meant.
 */
export function ProgrammeTabs({
  view,
  waiting,
}: {
  view: ProgrammeView;
  /** How many changes are waiting on the athlete, shown on the tab so it is not hidden. */
  waiting: number;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useOptimistic<ProgrammeView>(view);
  const [, startNavigation] = useTransition();
  return (
    <Tabs
      name="programme"
      label="Programme"
      value={chosen}
      onChange={(next) => {
        startNavigation(() => {
          setChosen(next);
          router.replace(
            next === "changes"
              ? "/profile/programme?view=changes"
              : "/profile/programme?view=cycle",
            { scroll: false },
          );
        });
      }}
      options={[
        { value: "cycle", label: "Cycle" },
        { value: "changes", label: waiting > 0 ? `Changes (${waiting})` : "Changes" },
      ]}
    />
  );
}
