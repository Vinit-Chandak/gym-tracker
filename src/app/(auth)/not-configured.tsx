import { Card } from "@/components/ui/card";

import { AUTH_HEADING } from "./auth-link";

/** Shown on every auth screen when the Supabase environment variables are missing. */
export function NotConfigured() {
  return (
    <Card>
      <h2 className={AUTH_HEADING}>Not configured yet</h2>
      <p className="text-sm text-ink-muted">
        Supabase environment variables are missing, so nobody can sign in or sign up. Follow{" "}
        <code className="rounded bg-surface-raised px-1 py-0.5 text-xs">SETUP.md</code> in the
        repository, then redeploy.
      </p>
    </Card>
  );
}
