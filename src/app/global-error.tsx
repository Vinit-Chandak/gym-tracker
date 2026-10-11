"use client";

import { AppearanceSync } from "@/components/shell/appearance-sync";
import { useOnline } from "@/components/shell/connectivity";
import { Button } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { APP_NAME } from "@/lib/app";
import { APPEARANCE_INIT_SCRIPT } from "@/lib/appearance";
import { PLATFORM_INIT_SCRIPT } from "@/lib/platform";

import "./globals.css";

/**
 * The last resort, for a failure in the root layout itself, which `error.tsx` sits inside and
 * cannot catch. It replaces the whole document, so it brings what the root layout would have
 * given it: the stylesheet, and the appearance and platform set before the first paint. Its
 * ways out do not lean on the app having started: Reload loads everything afresh, and Back to
 * Today is a plain link, a whole page load rather than the router's.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const online = useOnline();
  return (
    <html lang="en" data-overload-design="form-v2" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <script
          dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT + PLATFORM_INIT_SCRIPT }}
        />
        <title>{`Something went wrong · ${APP_NAME}`}</title>
        <AppearanceSync />
        <main className="error-page page-width pt-safe">
          <div className="error-page-body">
            <span className="error-page-glyph">
              <Glyph name={online ? "warn" : "offline"} className="glyph-30" />
            </span>
            <h1 className="error-page-title">Something went wrong</h1>
            <p className="error-page-text">
              {online
                ? "The app could not start. Reload to try again."
                : "You’re offline. Reconnect and reload."}
            </p>
            {error.digest && (
              <p className="type-caption font-medium text-ink-2">Reference: {error.digest}</p>
            )}
          </div>
          <PinnedActions stack>
            <Button
              disabled={!online}
              onClick={() => window.location.reload()}
              variant="secondary"
              size="lg"
              className="w-full"
            >
              Reload
            </Button>
            <a href="/today" className="text-action">
              Back to Today
            </a>
          </PinnedActions>
        </main>
      </body>
    </html>
  );
}
