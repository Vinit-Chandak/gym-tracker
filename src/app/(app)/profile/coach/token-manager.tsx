"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormError, useKeptForm } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SavedNotice } from "@/components/ui/saved-notice";
import { attempted, keepsErrorOnDisconnect } from "@/lib/offline-submit";
import {
  createCoachTokenAction,
  revokeCoachTokenAction,
  type TokenState,
} from "@/server/actions/coach-tokens";

function Revoke({ id }: { id: string }) {
  const [pending, startTransition] = useTransition(),
    [error, setError] = useState<string>();
  return (
    <div>
      <FormError message={error} />
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await attempted(
              () => revokeCoachTokenAction(id),
              "Connection lost. Retry revoking.",
            );
            setError(outcome.ok ? outcome.value.error : outcome.message);
          })
        }
      >
        {pending ? "Revoking…" : "Revoke"}
      </Button>
    </div>
  );
}

export function TokenManager({
  tokens,
}: {
  tokens: {
    id: string;
    name: string;
    createdAt: string;
    expiresAt: string;
    /** When it stops working, in the account's time zone: "Sat 9 Jan 2027, 19:00". */
    expires: string;
    revokedAt: string | null;
    expired: boolean;
  }[];
}) {
  // A refused token keeps its name and expiry (PRODUCT.md, principle 8); a token made empties
  // them for the next, because its fields are keyed on it below.
  const form = useKeptForm();
  const [state, action, pending] = useActionState(
    keepsErrorOnDisconnect(createCoachTokenAction),
    {} as TokenState,
  );
  // Which token was copied, not merely that one was: a second token replaces the first in this
  // panel, and a "Copied" left over from the first would vouch for a secret shown only once.
  const [copiedToken, setCopiedToken] = useState<string | null>(null),
    [copyFailed, setCopyFailed] = useState(false),
    [hidden, setHidden] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="flex items-center gap-1 text-base font-medium">
          New token
          <InfoTip label="About coach tokens">
            Read-only access to your workouts, runs, recovery and current programme. A token can
            never change your training data.
          </InfoTip>
        </h2>
        <form ref={form} action={action} className="space-y-3">
          <Field label="Name">
            <Input
              key={state.token ?? "new"}
              name="name"
              required
              maxLength={80}
              placeholder="My coach"
            />
          </Field>
          <Field label="Expires after">
            <Select key={state.token ?? "new"} name="days" defaultValue="90">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </Select>
          </Field>
          <FormError message={state.error} />
          <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
            {pending ? "Creating…" : "Create token"}
          </Button>
        </form>
        {state.token && hidden !== state.token && (
          <div className="space-y-3 rounded-control border border-accent p-3">
            <SavedNotice key={state.token}>Coach token created.</SavedNotice>
            <p className="text-sm font-medium">Copy it now; it is shown only once.</p>
            <textarea
              readOnly
              aria-label="New coach token"
              value={state.token}
              className="min-h-24 w-full rounded-control bg-canvas p-[calc(8*var(--ov-u))] font-mono text-sm break-all"
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(state.token!);
                    setCopiedToken(state.token!);
                    setCopyFailed(false);
                  } catch {
                    setCopiedToken(null);
                    setCopyFailed(true);
                  }
                }}
              >
                {copiedToken === state.token ? "Copied" : "Copy token"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setHidden(state.token!);
                  setCopiedToken(null);
                  setCopyFailed(false);
                }}
              >
                Hide token
              </Button>
            </div>
            <FormError
              message={
                copyFailed
                  ? "Could not copy it. Select the token above and copy it by hand."
                  : undefined
              }
            />
          </div>
        )}
      </Card>
      <Card>
        <h2 className="text-base font-medium">Your tokens</h2>
        {tokens.length ? (
          <ul className="divide-y divide-line">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-ink-muted">
                    {t.revokedAt ? "Revoked" : t.expired ? "Expired" : `Expires ${t.expires}`}
                  </p>
                </div>
                {!t.revokedAt && !t.expired && <Revoke id={t.id} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">No tokens yet.</p>
        )}
      </Card>
    </div>
  );
}
