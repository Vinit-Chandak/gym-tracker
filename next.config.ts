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
  // The Settings tab became Profile (ADR 0026). Bookmarks, the coach documentation and any
  // emailed link still say /settings; permanent redirects keep every one of them working.
  // The edit form is the one path that did not move one-for-one.
  async redirects() {
    return [
      { source: "/settings", destination: "/profile", permanent: true },
      { source: "/settings/profile", destination: "/profile/edit", permanent: true },
      { source: "/settings/:path*", destination: "/profile/:path*", permanent: true },
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
