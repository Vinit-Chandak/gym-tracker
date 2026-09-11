import type { Metadata, Viewport } from "next";

import { APP_DESCRIPTION, APP_NAME } from "@/lib/app";
import { APPEARANCE_INIT_SCRIPT, CANVAS_DARK, CANVAS_LIGHT } from "@/lib/appearance";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    /*
     * Not `black-translucent`, which iOS is deprecating and which cost the installed app the
     * bottom of the screen: it lifts the web view under the status bar without making it any
     * taller, so a 402x874 iPhone ran the whole app in 402x812 and left the navigation island
     * floating 62px — one status bar — clear of the bottom edge, over a strip of manifest
     * colour no page could reach. It also paints the clock white whatever is under it, which
     * on Form's light canvas is white on cream. `default` hands the status bar back to iOS,
     * which tints it with the theme-colour this app already keeps in step with the palette.
     */
    statusBarStyle: "default",
    title: APP_NAME,
  },
  // Next renders only the standard `mobile-web-app-capable`, but iOS still reads the
  // Apple-prefixed tag, and without it an installed app opens in a browser view instead.
  other: { "apple-mobile-web-app-capable": "yes" },
  formatDetection: { telephone: false, email: false, address: false },
  // Private single-user app: keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // One colour per scheme covers System without any script. An explicit Light/Dark choice
  // is the OS preference's exception, so the client overrides these; see lib/appearance.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: CANVAS_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: CANVAS_DARK },
  ],
  width: "device-width",
  initialScale: 1,
  // Zoom stays available: blocking it fails WCAG 1.4.4, and the 16px input text already
  // stops iOS from zooming in on focus, which was the only reason to lock the scale.
  // Lets the layout extend under the notch/home indicator; safe-area utilities pad it back.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The initializer writes data-overload-mode before React hydrates. Suppression is
    // scoped to this element so a real mismatch anywhere else still surfaces.
    <html
      lang="en"
      className="h-full"
      data-overload-design="form"
      suppressHydrationWarning
      // color-scheme now comes from the theme files, per mode, so native controls follow.
    >
      <body className="flex min-h-full flex-col">
        {/* First thing in the body: it runs while the rest is still being parsed, so an
            explicit Light or Dark choice is in place before anything is painted. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
