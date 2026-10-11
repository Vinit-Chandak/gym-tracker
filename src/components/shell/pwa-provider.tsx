"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<unknown> };
type RelatedAppsNavigator = Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
const InstallContext = createContext({
  available: false,
  installed: false,
  install: async () => false,
});

/** The browser can offer installation on any entry screen, before Profile is visited. */
export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const complete = () => {
      setPrompt(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    // Installed earlier, the app is opened again in a tab: Chrome offers no prompt for an app
    // it has installed, and appinstalled has long since fired. It can still say whether the
    // app is installed, because the manifest names the app as related to itself. Other
    // browsers cannot, and keep offering the instructions.
    let live = true;
    void (navigator as RelatedAppsNavigator)
      .getInstalledRelatedApps?.()
      .then((apps) => {
        if (live && apps.length > 0) setInstalled(true);
      })
      .catch(() => {});
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
        // Installation and online use remain available if storage is unavailable.
      });
    }
    return () => {
      live = false;
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);

  async function install() {
    if (!prompt) return false;
    setPrompt(null); // A browser prompt is single-use, including after dismissal.
    try {
      await prompt.prompt();
      return true;
    } catch {
      return false;
    }
  }
  return (
    <InstallContext.Provider value={{ available: prompt !== null, installed, install }}>
      {children}
    </InstallContext.Provider>
  );
}

export const useInstallPrompt = () => useContext(InstallContext);
