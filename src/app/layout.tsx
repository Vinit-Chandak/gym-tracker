import type { Metadata, Viewport } from "next";
import "./globals.css";

const APP_NAME = "Training Tracker";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description:
    "Private, iPhone-first training log for strength, hypertrophy, running and recovery.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Training",
  },
  formatDetection: { telephone: false, email: false, address: false },
  // Private single-user app: keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0e1013",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // App-like behaviour: no accidental pinch-zoom with sweaty hands between sets.
  maximumScale: 1,
  userScalable: false,
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
