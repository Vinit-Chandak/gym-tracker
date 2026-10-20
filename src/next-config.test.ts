import { expect, it } from "vitest";
import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";

import nextConfig from "../next.config";

/**
 * The Settings tab became Profile (ADR 0026), Food took History's tab and History moved into
 * Progress (ADR 0034), and Training became Plan (ADR 0058). Every old path — bookmarks, the coach
 * documentation, emailed links — has to land on its new one, permanently. Order matters: a route
 * that did not move one-for-one must be matched before the catch-all.
 */
it("redirects every moved path to where it went", async () => {
  expect((await nextConfig.redirects!()).filter((rule) => rule.permanent)).toEqual([
    { source: "/settings", destination: "/profile", permanent: true },
    { source: "/settings/profile", destination: "/profile/edit", permanent: true },
    { source: "/settings/:path*", destination: "/profile/:path*", permanent: true },
    { source: "/history", destination: "/progress/history", permanent: true },
    { source: "/today/food/:path*", destination: "/food/:path*", permanent: true },
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
    { source: "/training/log", destination: "/today/log", permanent: true },
    { source: "/today/choose", destination: "/today/log?sport=strength", permanent: true },
  ]);
});

it.each([
  ["/training", "/plan", 308],
  ["/training/programmes/running", "/plan/running", 308],
  ["/training/programmes/swimming/edit?draft=abc", "/plan/swimming/edit?draft=abc", 308],
  ["/training/programmes/archived", "/plan/past", 308],
  ["/profile/programme?view=changes", "/plan/strength?view=changes", 308],
  ["/training/log?sport=cycling", "/today/log?sport=cycling", 308],
  ["/today/choose", "/today/log?sport=strength", 308],
  // Set aside for now, so not for good: they may come back.
  ["/training/scheduled", "/plan", 307],
  ["/training/templates/abc/edit", "/plan", 307],
  ["/profile/routines", "/today", 307],
])("sends %s to Plan's or Today's page for it", async (path, destination, status) => {
  const response = await unstable_getResponseFromNextConfig({
    url: `http://localhost:3101${path}`,
    nextConfig,
  });
  expect(response.status).toBe(status);
  expect(getRedirectUrl(response)).toBe(`http://localhost:3101${destination}`);
});

it.each([
  ["/runs", "/plan"],
  ["/runs?from=2026-09-01&to=2026-09-26", "/plan?from=2026-09-01&to=2026-09-26"],
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
