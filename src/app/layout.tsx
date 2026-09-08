import type { Metadata, Viewport } from "next";

import { APP_DESCRIPTION, APP_NAME, THEME_COLOR } from "@/lib/app";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  // Next renders only the standard `mobile-web-app-capable`, but iOS still reads the
  // Apple-prefixed tag, and without it the translucent status bar style is ignored.
  other: { "apple-mobile-web-app-capable": "yes" },
  formatDetection: { telephone: false, email: false, address: false },
  // Private single-user app: keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Zoom stays available: blocking it fails WCAG 1.4.4, and the 16px input text already
  // stops iOS from zooming in on focus, which was the only reason to lock the scale.
  // Lets the layout extend under the notch/home indicator; safe-area utilities pad it back.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
