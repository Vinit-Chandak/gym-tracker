import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    // The tabs are fully prefetched (bottom-nav.tsx); `static` is how long such a copy may be
    // shown. A minute matches the tabs' own `unstable_dynamicStaleTime`, so a prefetched tab is
    // never older than a revisited one. It is also how long a prefetched loading screen is kept.
    staleTimes: { static: 60 },
  },
  // The Settings tab became Profile (ADR 0026). Bookmarks, the coach documentation and any
  // emailed link still say /settings; permanent redirects keep every one of them working.
  // The edit form is the one path that did not move one-for-one. Food took History's tab and
  // History moved into Progress (ADR 0034), so their old paths are kept the same way; a query,
  // such as History's dates and filters, comes along.
  async redirects() {
    return [
      { source: "/settings", destination: "/profile", permanent: true },
      { source: "/settings/profile", destination: "/profile/edit", permanent: true },
      { source: "/settings/:path*", destination: "/profile/:path*", permanent: true },
      { source: "/history", destination: "/progress/history", permanent: true },
      { source: "/today/food/:path*", destination: "/food/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
