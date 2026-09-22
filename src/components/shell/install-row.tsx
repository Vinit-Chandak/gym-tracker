"use client";

import { ChevronRight, Download } from "@/components/ui/icons";
import { useEffect, useState } from "react";
import { useInstallPrompt } from "@/components/shell/pwa-provider";

import { List, PRESSABLE_ROW_CLASS, RowIcon } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { Sheet } from "@/components/ui/sheet";
import { APP_NAME } from "@/lib/app";

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

/**
 * The App group of Profile: one row that installs, shown only in a browser tab — never
 * inside the installed app. Where the browser has no prompt to offer, the row opens the
 * two-line instructions in a sheet instead of printing them on the page.
 */
export function InstallSection() {
  const standalone = useStandalone();
  const { install, available, installed } = useInstallPrompt();
  const [open, setOpen] = useState(false);
  if (standalone !== false || installed) return null;

  return (
    <Section title="App">
      <List>
        <li>
          <button
            type="button"
            onClick={async () => {
              if (!available || !(await install())) setOpen(true);
            }}
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
              <dt className="font-medium">iPhone and iPad</dt>
              <dd className="text-ink-muted">Safari Share → Add to Home Screen</dd>
            </div>
          </dl>
        </Sheet>
      )}
    </Section>
  );
}
