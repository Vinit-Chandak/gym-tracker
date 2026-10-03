"use client";

import { Download } from "@/components/ui/icons";
import { useEffect, useState } from "react";
import { useInstallPrompt } from "@/components/shell/pwa-provider";

import { Glyph } from "@/components/ui/glyphs";
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
    <section aria-labelledby="profile-app">
      <h2 id="profile-app" className="caption-head mt-4.5">
        App
      </h2>
      <ul>
        <li className="nav-row-item">
          <button
            type="button"
            onClick={async () => {
              if (!available || !(await install())) setOpen(true);
            }}
            aria-haspopup={available ? undefined : "dialog"}
            className="nav-row w-full text-left"
          >
            <span className="mark-cell">
              <Download
                scale="row"
                style={{ width: "calc(10px + 0.625rem)", height: "calc(10px + 0.625rem)" }}
              />
            </span>
            <span className="nav-row-label">Install {APP_NAME}</span>
            <Glyph name="chevronRight" className="nav-row-chevron glyph-20 shrink-0" />
          </button>
        </li>
      </ul>
      {!available && (
        <Sheet open={open} onClose={() => setOpen(false)} title={`Install ${APP_NAME}`}>
          <dl className="space-y-3 type-meta">
            <div>
              <dt className="font-bold">Android</dt>
              <dd className="text-ink-2">Chrome menu ⋮ → Add to Home screen</dd>
            </div>
            <div>
              <dt className="font-bold">iPhone and iPad</dt>
              <dd className="text-ink-2">Safari Share → Add to Home Screen</dd>
            </div>
          </dl>
        </Sheet>
      )}
    </section>
  );
}
