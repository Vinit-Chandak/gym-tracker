import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // The local audit can run beside the normal app without replacing its build.
  distDir: process.env.AUDIT_BUILD === "true" ? ".next-audit" : ".next",
  typescript: {
    tsconfigPath: process.env.AUDIT_BUILD === "true" ? "tsconfig.audit.json" : "tsconfig.json",
  },
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  outputFileTracingIncludes: {
    "/api/coach/mcp": ["./docs/coach-workflow.md"],
  },
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
      // Training became Plan (ADR 0058): programmes moved under it, the strength programme
      // left Profile for Plan, and a bookmark or the coach's notes still say the old paths.
      { source: "/training", destination: "/plan", permanent: true },
      { source: "/training/programmes/new", destination: "/plan/new", permanent: true },
      { source: "/training/programmes/archived", destination: "/plan/past", permanent: true },
      {
        source: "/training/programmes/:sport/edit",
        destination: "/plan/:sport/edit",
        permanent: true,
      },
      { source: "/training/programmes/:sport", destination: "/plan/:sport", permanent: true },
      { source: "/profile/programme", destination: "/plan/strength", permanent: true },
      // Set aside for now (ADR 0058): sessions are planned by a programme or logged unplanned,
      // with no templates, routines or one-off scheduling between. Their data is kept.
      { source: "/training/schedule", destination: "/plan", permanent: false },
      { source: "/training/scheduled", destination: "/plan", permanent: false },
      { source: "/training/templates/:path*", destination: "/plan", permanent: false },
      { source: "/training/templates", destination: "/plan", permanent: false },
      // The planned runs list became the running programme's weeks, under Plan.
      { source: "/training/programme", destination: "/plan", permanent: false },
      { source: "/profile/routines", destination: "/today", permanent: false },
      // Setup no longer offers a ready-made programme to follow (owner, 20 October 2026).
      {
        source: "/welcome/programme/template",
        destination: "/welcome/programme",
        permanent: false,
      },
      // Logging anything Today's cards do not offer is Today's Log now (ADR 0058).
      { source: "/training/log", destination: "/today/log", permanent: true },
      { source: "/today/choose", destination: "/today/log?sport=strength", permanent: true },
      // Resolve simple run aliases before the app shell streams. A client-side streamed
      // redirect can race that shell's navigation prefetches in WebKit. Planned links and
      // legacy run IDs still need the authenticated identifier lookup in their pages.
      { source: "/runs", destination: "/plan", permanent: false },
      {
        source: "/runs/new",
        missing: [{ type: "query", key: "planned" }],
        destination: "/training/new?sport=running",
        permanent: false,
      },
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
