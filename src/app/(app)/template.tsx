"use client";

import { usePathname } from "next/navigation";
import { ViewTransition, type ReactNode } from "react";

/**
 * Turning the sheet. One <ViewTransition> for every route change inside the app, keyed by the
 * pathname so it remounts at any depth (a template alone remounts only when the top-level
 * segment changes, which left a row into a deeper page without its slide). The animation
 * follows the type the link carried (globals.css draws them): a tab change crosses to the next
 * sheet, a row into a detail slides it in from the right, a direct link back slides it out,
 * and anything untyped (the browser's own back, a refresh, a query change) swaps at once.
 * Reduced motion turns all of it off in CSS.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition
      key={pathname}
      default="none"
      enter={{
        "nav-tab": "sheet-cross",
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "none",
      }}
      exit={{
        "nav-tab": "sheet-cross",
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "none",
      }}
    >
      {children}
    </ViewTransition>
  );
}
