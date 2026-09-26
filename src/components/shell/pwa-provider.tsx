"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<unknown> };
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
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
        // Installation and online use remain available if storage is unavailable.
      });
    }
    return () => {
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
