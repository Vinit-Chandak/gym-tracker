import { headers } from "next/headers";

/**
 * Absolute origin of the running app, for the links Supabase puts in emails.
 *
 * `NEXT_PUBLIC_SITE_URL` wins when set, so production emails never point at a preview
 * deployment. Otherwise the request's own host is used, which keeps local development and
 * previews working without configuration.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? vercel;
  if (!host) return "http://localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
