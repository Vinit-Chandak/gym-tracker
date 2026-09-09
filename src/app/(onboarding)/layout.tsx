import type { ReactNode } from "react";

/** First-run flow: no bottom navigation, because there is nothing to navigate to yet. */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col pt-safe pb-safe">{children}</div>;
}
