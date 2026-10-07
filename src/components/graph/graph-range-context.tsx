"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { createContext, useContext, useOptimistic, useTransition, type ReactNode } from "react";

import type { RangePreset } from "@/domain/graph-range";
import { chooseGraphRangeAction } from "@/server/actions/graph-range";

type GraphRangeValue = {
  /** The span every graph is drawn over; null while dates chosen by hand hold. */
  preset: RangePreset | null;
  choose: (preset: RangePreset) => void;
  /** A new span is being read: graphs keep their frame, dimmed, until it arrives. */
  pending: boolean;
};

const GraphRangeContext = createContext<GraphRangeValue | null>(null);

/**
 * The one span every graph under it shares (ADR 0042). Choosing a span on any graph remembers
 * it for every graph in the app: the server keeps it in a cookie, and setting that cookie
 * drops the pages the browser was holding, so a section opened next is drawn in the new span
 * rather than from a copy made in the old one. Dates chosen by hand live in the URL and go when
 * a span is chosen.
 */
export function GraphRangeProvider({
  preset,
  children,
}: {
  preset: RangePreset | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(preset);

  const choose = (next: RangePreset) => {
    startTransition(async () => {
      setShown(next);
      await chooseGraphRangeAction(next);
      if (params.has("from") || params.has("to")) {
        const query = new URLSearchParams(params.toString());
        query.delete("from");
        query.delete("to");
        const search = query.toString();
        router.replace((search ? `${pathname}?${search}` : pathname) as Route, { scroll: false });
      }
    });
  };

  return (
    <GraphRangeContext.Provider value={{ preset: shown, choose, pending }}>
      {children}
    </GraphRangeContext.Provider>
  );
}

/** The shared span, or null outside a provider (a graph with no span to change). */
export function useGraphRange(): GraphRangeValue | null {
  return useContext(GraphRangeContext);
}
