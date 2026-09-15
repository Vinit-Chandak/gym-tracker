import { expect, it } from "vitest";

import nextConfig from "../next.config";

/**
 * The Settings tab became Profile (ADR 0026). Every old path — bookmarks, the coach
 * documentation, emailed links — has to land on its new one, permanently. Order matters: the
 * edit form, the one route that did not move one-for-one, must be matched before the catch-all.
 */
it("redirects every /settings path to its /profile counterpart", async () => {
  expect(await nextConfig.redirects!()).toEqual([
    { source: "/settings", destination: "/profile", permanent: true },
    { source: "/settings/profile", destination: "/profile/edit", permanent: true },
    { source: "/settings/:path*", destination: "/profile/:path*", permanent: true },
  ]);
});
