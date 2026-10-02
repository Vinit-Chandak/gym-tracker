import type { ReactNode } from "react";

import { Wordmark } from "@/components/shell/wordmark";
import { APP_TAGLINE } from "@/lib/app";

/**
 * The sheet before there is an account on it: the app's own name set large at the top, its
 * one line under it, and then the page's panel — the form standing off the page — with the
 * way to the other auth screen under that in the pen.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-8 pt-safe pb-safe">
      <div className="w-full max-w-sm space-y-6">
        <header className="text-center">
          <h1 className="text-3xl leading-none">
            <Wordmark mark />
          </h1>
          <p className="mt-4 text-balance text-ink-muted">{APP_TAGLINE}</p>
        </header>
        {children}
      </div>
    </div>
  );
}
