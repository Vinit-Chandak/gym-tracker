import { notFound, redirect } from "next/navigation";
import { coachOAuthRedirect, readCoachConnectorConsent } from "@/server/coach-connector-consent";

import { ConsentActions, type ConsentState } from "./consent-actions";

export const metadata = { title: "Connect the coach backup" };

export default async function CoachConnectorConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: id } = await searchParams;
  if (!id) notFound();
  const { data } = await readCoachConnectorConsent(id);
  if ("redirect_url" in data) redirect(coachOAuthRedirect(data.redirect_url));

  async function decide(_state: ConsentState, form: FormData): Promise<ConsentState> {
    "use server";
    const decision = form.get("decision");
    if (decision !== "approve" && decision !== "decline")
      return { error: "Choose whether to connect or decline." };
    const { supabase, data, id: authorizationId } = await readCoachConnectorConsent(id!);
    if ("redirect_url" in data) redirect(coachOAuthRedirect(data.redirect_url));
    const result =
      decision === "approve"
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          });
    if (result.error || !result.data)
      return { error: "The connection could not be saved. Please retry." };
    redirect(coachOAuthRedirect(result.data.redirect_url));
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-5 py-12">
      <h1 className="type-display">Connect the coach backup</h1>
      <p>
        <strong>{data.client.name}</strong> is requesting access as the house coach.
      </p>
      <p>
        ChatGPT may read coaching evidence and retained reports for athletes who have coaching
        enabled, and submit programme drafts, session plans, reviews and request decisions.
      </p>
      <p>
        The backup takes over after Claude fails or stops reporting progress for ten minutes.
        Existing athlete approvals, workout locks and coaching limits still apply.
      </p>
      <p>
        You can revoke this connection in your Supabase OAuth grants or disable the backup on the
        server.
      </p>
      <ConsentActions action={decide} />
    </main>
  );
}
