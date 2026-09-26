import { expect, it } from "vitest";
import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";

import nextConfig from "../next.config";

/**
 * The Settings tab became Profile (ADR 0026), Food took History's tab and History moved into
 * Progress (ADR 0034). Every old path — bookmarks, the coach documentation, emailed links — has
 * to land on its new one, permanently. Order matters: the edit form, the one route that did not
 * move one-for-one, must be matched before the catch-all.
 */
it("redirects every moved path to where it went", async () => {
  expect((await nextConfig.redirects!()).filter((rule) => rule.permanent)).toEqual([
    { source: "/settings", destination: "/profile", permanent: true },
    { source: "/settings/profile", destination: "/profile/edit", permanent: true },
    { source: "/settings/:path*", destination: "/profile/:path*", permanent: true },
    { source: "/history", destination: "/progress/history", permanent: true },
    { source: "/today/food/:path*", destination: "/food/:path*", permanent: true },
  ]);
});

it.each([
  ["/runs", "/training"],
  ["/runs?from=2026-09-01&to=2026-09-26", "/training?from=2026-09-01&to=2026-09-26"],
  ["/runs/new", "/training/new?sport=running"],
])("redirects %s before rendering an intermediate app shell", async (path, destination) => {
  const response = await unstable_getResponseFromNextConfig({
    url: `http://localhost:3101${path}`,
    nextConfig,
  });
  expect(response.status).toBe(307);
  expect(getRedirectUrl(response)).toBe(`http://localhost:3101${destination}`);
});

it.each([
  "/runs/new?planned=11111111-1111-4111-8111-111111111111",
  "/runs/new?planned=unavailable",
  "/runs/11111111-1111-4111-8111-111111111111",
  "/runs/11111111-1111-4111-8111-111111111111/edit",
])("leaves %s to its authenticated legacy identifier lookup", async (path) => {
  const response = await unstable_getResponseFromNextConfig({
    url: `http://localhost:3101${path}`,
    nextConfig,
  });
  expect(getRedirectUrl(response)).toBeNull();
});
