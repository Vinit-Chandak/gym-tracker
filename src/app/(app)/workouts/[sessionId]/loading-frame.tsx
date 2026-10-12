"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { ORIGIN_PARAM, parseOrigin } from "@/lib/nav";

/**
 * The workout's loading screen, framed for what is loading (NAV-03). A workout a tab opens names
 * that tab in its link and is a finished one, a page under that tab, which stays lit. One whose
 * link names nothing is all but always the open workout (Resume, the strip, Training's card, a
 * reload): the session's layer over the tabs, so the tabs go at once, rather than History's
 * lighting, a finished record's default, until the layer comes. The summary Finish lands on
 * names Today, but is still the session's, with no tabs either.
 */
export function WorkoutLoadingFrame({ children }: { children: ReactNode }) {
  const search = useSearchParams();
  const layer =
    parseOrigin(search.get(ORIGIN_PARAM) ?? undefined) === null || search.get("finished") === "1";
  return layer ? <div className="session-page">{children}</div> : children;
}
