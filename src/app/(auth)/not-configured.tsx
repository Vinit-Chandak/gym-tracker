import { EmptyState } from "@/components/ui/empty-state";
import { Warning } from "@/components/ui/icons";

/** Shown on every auth screen when the Supabase environment variables are missing. */
export function NotConfigured() {
  return (
    <EmptyState
      icon={Warning}
      title="Not configured yet"
      description="Supabase environment variables are missing, so nobody can sign in or sign up. Follow SETUP.md in the repository, then redeploy."
    />
  );
}
