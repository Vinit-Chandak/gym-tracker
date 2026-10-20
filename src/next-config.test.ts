import { expect, it } from "vitest";
import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";

import nextConfig from "../next.config";

const ID = "11111111-1111-4111-8111-111111111111";

/**
 * The Settings tab became Profile (ADR 0026), Food took History's tab and History moved into
 * Progress (ADR 0034), Training became Plan (ADR 0058), and each page moved under the tab that
 * owns it (owner, 20 October 2026). Every old path — bookmarks, the coach's notes and
 * documentation, emailed links — has to land on its new one, permanently, its query with it.
 * Order matters: a route that did not move one-for-one must be matched before the catch-all.
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
    {
      source: "/training/programme/occurrences/:occurrenceId",
      destination: "/plan/sessions/:occurrenceId",
      permanent: true,
    },
    {
      source: "/training/days/:dayId",
      destination: "/plan/strength/days/:dayId",
      permanent: true,
    },
    { source: "/profile/programme/manual", destination: "/plan/strength/edit", permanent: true },
    { source: "/profile/programme/drafts/:id", destination: "/plan/drafts/:id", permanent: true },
    {
      source: "/profile/programme/drafts/:id/programme",
      destination: "/plan/drafts/:id/programme",
      permanent: true,
    },
    { source: "/profile/programme/jobs/:id", destination: "/plan/requests/:id", permanent: true },
    { source: "/profile/programme/history", destination: "/plan/history", permanent: true },
    { source: "/training/new", destination: "/today/log/new", permanent: true },
    {
      source: "/training/activities/:activityId",
      destination: "/progress/activities/:activityId",
      permanent: true,
    },
    {
      source: "/training/activities/:activityId/edit",
      destination: "/progress/activities/:activityId/edit",
      permanent: true,
    },
    {
      source: "/training/activities/:activityId/counts-as",
      destination: "/progress/activities/:activityId/counts-as",
      permanent: true,
    },
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
  // Each page under the tab that owns it, whatever the old link asked of it.
  [`/training/programme/occurrences/${ID}`, `/plan/sessions/${ID}`, 308],
  [`/training/days/${ID}`, `/plan/strength/days/${ID}`, 308],
  ["/profile/programme/manual", "/plan/strength/edit", 308],
  [`/profile/programme/manual?draft=${ID}`, `/plan/strength/edit?draft=${ID}`, 308],
  ["/profile/programme/manual?mode=progressive", "/plan/strength/edit?mode=progressive", 308],
  [`/profile/programme/drafts/${ID}`, `/plan/drafts/${ID}`, 308],
  [`/profile/programme/drafts/${ID}/programme`, `/plan/drafts/${ID}/programme`, 308],
  [`/profile/programme/jobs/${ID}`, `/plan/requests/${ID}`, 308],
  ["/profile/programme/history", "/plan/history", 308],
  ["/training/new?sport=running", "/today/log/new?sport=running", 308],
  [
    `/training/new?occurrence=${ID}&date=2026-10-17&from=plan`,
    `/today/log/new?occurrence=${ID}&date=2026-10-17&from=plan`,
    308,
  ],
  [`/training/activities/${ID}?from=today`, `/progress/activities/${ID}?from=today`, 308],
  [
    `/training/activities/${ID}/edit?from=history`,
    `/progress/activities/${ID}/edit?from=history`,
    308,
  ],
  [`/training/activities/${ID}/counts-as`, `/progress/activities/${ID}/counts-as`, 308],
  // Set aside for now, so not for good: they may come back.
  ["/training/scheduled", "/plan", 307],
  ["/training/templates/abc/edit", "/plan", 307],
  ["/profile/routines", "/today", 307],
  ["/welcome/programme/template", "/welcome/programme", 307],
])("sends %s to the page that has it now", async (path, destination, status) => {
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
  ["/runs/new", "/today/log?sport=running"],
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
