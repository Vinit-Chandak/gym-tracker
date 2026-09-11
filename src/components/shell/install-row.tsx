"use client";

import { ChevronRight, Download } from "@/components/ui/icons";
import { useEffect, useState } from "react";

import { List, PRESSABLE_ROW_CLASS, RowIcon } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { Sheet } from "@/components/ui/sheet";
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

/**
 * The App group of Settings: one row that installs, shown only in a browser tab — never
 * inside the installed app. Where the browser has no prompt to offer, the row opens the
 * two-line instructions in a sheet instead of printing them on the page.
 */
export function InstallSection() {
  const standalone = useStandalone();
  const { install, available } = useInstallPrompt();
  const [open, setOpen] = useState(false);
  if (standalone !== false) return null;

  return (
    <Section title="App">
      <List>
        <li>
          <button
            type="button"
            onClick={available ? install : () => setOpen(true)}
            aria-haspopup={available ? undefined : "dialog"}
            className={PRESSABLE_ROW_CLASS}
          >
            <RowIcon icon={Download} />
            <span className="min-w-0 flex-1 font-medium">Install {APP_NAME}</span>
            <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
          </button>
        </li>
      </List>
      {!available && (
        <Sheet open={open} onClose={() => setOpen(false)} title={`Install ${APP_NAME}`}>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium">Android</dt>
              <dd className="text-ink-muted">Chrome menu ⋮ → Add to Home screen</dd>
            </div>
            <div>
              <dt className="font-medium">iPhone</dt>
              <dd className="text-ink-muted">Safari Share → Add to Home Screen</dd>
            </div>
          </dl>
        </Sheet>
      )}
    </Section>
  );
}
