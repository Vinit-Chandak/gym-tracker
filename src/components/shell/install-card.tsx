"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";

type IosNavigator = Navigator & { standalone?: boolean };

/**
 * Whether the app was launched from the home screen. `null` until measured, because the
 * server cannot know: rendering either answer during SSR would be a hydration mismatch.
 */
function useStandalone(): boolean | null {
  const [standalone, setStandalone] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(display-mode: standalone)");
    // iOS Safari predates display-mode and reports the home-screen launch its own way.
    const read = () =>
      setStandalone(query.matches || (navigator as IosNavigator).standalone === true);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);
  return standalone;
}

/** How to install, shown only in a browser tab — never inside the installed app. */
export function InstallCard() {
  const standalone = useStandalone();
  if (standalone !== false) return null;
  return (
    <Card>
      <h2 className="text-base font-semibold">Install on iPhone</h2>
      <p className="text-sm text-ink-muted">
        Open this site in Safari, tap Share, then “Add to Home Screen”. It launches full-screen like
        a native app.
      </p>
    </Card>
  );
}
