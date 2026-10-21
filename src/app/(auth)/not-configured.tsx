/**
 * Shown on every auth screen when the Supabase environment variables are missing: to whoever runs
 * the deployment, on the ground at the gutter as every auth screen is (DESIGN.md, Shapes).
 */
export function NotConfigured() {
  return (
    <section aria-labelledby="not-configured" className="space-y-4">
      <h2 id="not-configured" className="type-sheet-title">
        Not configured yet
      </h2>
      <p className="type-meta text-ink-2">
        Supabase environment variables are missing, so nobody can sign in or sign up. Follow{" "}
        <code className="rounded bg-surface-raised px-1 py-0.5 text-xs">SETUP.md</code> in the
        repository, then redeploy.
      </p>
    </section>
  );
}
