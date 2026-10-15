import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { coachOAuthRedirect, readCoachConnectorConsent } from "@/server/coach-connector-consent";

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

  async function decide(approve: boolean) {
    "use server";
    const { supabase, data, id: authorizationId } = await readCoachConnectorConsent(id!);
    if ("redirect_url" in data) redirect(coachOAuthRedirect(data.redirect_url));
    const result = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (result.error || !result.data)
      throw new Error("The connection could not be saved. Please retry.");
    redirect(coachOAuthRedirect(result.data.redirect_url));
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-5 py-12">
      <h1 className="text-2xl font-bold">Connect the coach backup</h1>
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
      <div className="flex flex-wrap gap-3">
        <form action={decide.bind(null, true)}>
          <Button type="submit">Connect ChatGPT backup</Button>
        </form>
        <form action={decide.bind(null, false)}>
          <Button type="submit" variant="outline">
            Decline
          </Button>
        </form>
      </div>
    </main>
  );
}
