import { notFound } from "next/navigation";
import { z } from "zod";
import { getCoachBackup } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "./auth";

/** The approved connector returns only to ChatGPT's documented OAuth callback. */
export function coachOAuthRedirect(value: string): `https://${string}` {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "chatgpt.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    (url.pathname !== "/connector_platform_oauth_redirect" &&
      !url.pathname.startsWith("/connector/oauth/"))
  )
    throw new Error("Unexpected coach connector callback.");
  return url.href as `https://${string}`;
}

/** Supabase owns OAuth validation, codes, PKCE, refresh and revocation. We allow one owner/client. */
export async function readCoachConnectorConsent(authorizationId: string) {
  const user = await requireUser(),
    backup = getCoachBackup();
  if (!backup || user.id !== backup.ownerId) notFound();
  const id = z.string().min(1).max(200).parse(authorizationId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) notFound();
  if (
    "authorization_id" in data &&
    (data.client.id !== backup.clientId || data.user.id !== backup.ownerId)
  )
    notFound();
  return { supabase, data, id };
}
