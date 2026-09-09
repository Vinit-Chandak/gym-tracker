"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { APP_NAME } from "@/lib/app";

type IosNavigator = Navigator & { standalone?: boolean };

/** The event Chromium fires when a site is installable; not in the DOM lib. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

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

/**
 * Chromium (Android, desktop) offers a real install prompt, which has to be captured when the
 * browser fires it and replayed from a user gesture. Safari fires nothing, so iOS gets
 * instructions instead.
 */
function useInstallPrompt(): { install: () => void; available: boolean } {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const capture = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const installed = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return {
    available: event !== null,
    install: () => {
      if (!event) return;
      void event.prompt().then(() => setEvent(null));
    },
  };
}

/** How to install, shown only in a browser tab — never inside the installed app. */
export function InstallCard() {
  const standalone = useStandalone();
  const { install, available } = useInstallPrompt();
  if (standalone !== false) return null;

  return (
    <Card>
      <h2 className="text-base font-semibold">Install {APP_NAME}</h2>
      {available ? (
        <>
          <p className="text-sm text-ink-muted">
            Add it to your home screen and it launches full-screen, like a native app.
          </p>
          <Button variant="secondary" className="w-full" onClick={install}>
            Install app
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            <span className="font-medium text-ink">Android (Chrome):</span> menu ⋮ → “Add to Home
            screen”.
          </p>
          <p className="text-sm text-ink-muted">
            <span className="font-medium text-ink">iPhone (Safari):</span> Share → “Add to Home
            Screen”.
          </p>
        </>
      )}
    </Card>
  );
}
