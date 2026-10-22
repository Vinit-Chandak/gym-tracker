"use client";

import { Download } from "@/components/ui/icons";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useInstallPrompt } from "@/components/shell/pwa-provider";

import { Glyph } from "@/components/ui/glyphs";
import { Sheet } from "@/components/ui/sheet";
import { APP_NAME } from "@/lib/app";
import { PLATFORM_ATTRIBUTE } from "@/lib/platform";

type IosNavigator = Navigator & { standalone?: boolean };
type Platform = "android" | "ios" | "other";

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
 * Which steps to give: Android's, from the attribute set before the first paint (lib/platform),
 * or an iPhone's or iPad's, which an iPad asking for desktop sites reports as a Mac with a
 * touch screen. Anywhere else, both.
 */
function readPlatform(): Platform {
  if (document.documentElement.getAttribute(PLATFORM_ATTRIBUTE) === "android") return "android";
  const agent = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "other";
}
const unchanging = () => () => {};
/** `null` on the server, which cannot know, as above. */
const usePlatform = () =>
  useSyncExternalStore<Platform | null>(unchanging, readPlatform, () => null);

/**
 * The App group of Profile: one row that installs, shown only in a browser tab — never
 * inside the installed app, nor once the browser says the app is installed. Where the
 * browser has no prompt to offer, the row opens the instructions for this phone in a sheet
 * instead of printing them on the page.
 */
export function InstallSection() {
  const standalone = useStandalone();
  const platform = usePlatform();
  const { install, available, installed } = useInstallPrompt();
  const [open, setOpen] = useState(false);
  if (standalone !== false || installed) return null;

  return (
    <section aria-labelledby="profile-app">
      <h2 id="profile-app" className="caption-head mt-4.5">
        App
      </h2>
      <ul className="ov-panel ov-panel-list">
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
            {platform !== "ios" && (
              <div>
                <dt className="font-bold">Android</dt>
                <dd className="text-ink-2">Chrome menu ⋮ → Add to Home screen</dd>
              </div>
            )}
            {platform !== "android" && (
              <div>
                <dt className="font-bold">iPhone and iPad</dt>
                {/* Safari 26 keeps Share in the ••• menu in its standard layout. */}
                <dd className="text-ink-2">
                  Safari menu ••• → Share → Add to Home Screen, with Open as Web App on
                </dd>
              </div>
            )}
          </dl>
        </Sheet>
      )}
    </section>
  );
}
