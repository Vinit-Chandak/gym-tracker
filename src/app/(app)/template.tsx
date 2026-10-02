import { ViewTransition, type ReactNode } from "react";

/**
 * Turning the sheet. A template remounts on every navigation inside the app, so one
 * <ViewTransition> here animates each route change without every page carrying its own.
 * The animation follows the type the link carried (globals.css draws them): a tab change
 * crosses to the next sheet, a row into a detail slides it in from the right, a direct link
 * back slides it out again, and anything untyped (the browser's own back, a refresh) swaps
 * at once. Reduced motion turns all of it off in CSS.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
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
