"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              setError((await revokeCoachTokenAction(id)).error);
            } catch {
              setError("Connection lost. Retry revoking.");
            }
          })
        }
      >
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
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
    revokedAt: string | null;
    expired: boolean;
  }[];
}) {
  const [state, action, pending] = useActionState(createCoachTokenAction, {} as TokenState);
  const [copied, setCopied] = useState(false),
    [hidden, setHidden] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold">Create read-only token</h2>
        <p className="text-sm text-ink-muted">
          Access to your workouts, runs, recovery and current programme. Tokens cannot change your
          training data.
        </p>
        <form action={action} className="space-y-3">
          <Field label="Name">
            <Input name="name" required maxLength={80} placeholder="My coach" />
          </Field>
          <Field label="Expires after">
            <Select name="days" defaultValue="90">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </Select>
          </Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating…" : "Create token"}
          </Button>
        </form>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.token && hidden !== state.token && (
          <div className="space-y-3 rounded-control border border-accent/40 p-3">
            <p className="text-sm font-medium">Copy now. This token is shown only here.</p>
            <textarea
              readOnly
              aria-label="New coach token"
              value={state.token}
              className="min-h-24 w-full rounded-control bg-canvas p-2 font-mono text-sm break-all"
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(state.token!);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "Copied" : "Copy token"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setHidden(state.token!);
                  setCopied(false);
                }}
              >
                Hide token
              </Button>
            </div>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="font-semibold">Your tokens</h2>
        {tokens.length ? (
          <ul className="divide-y divide-line">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-ink-muted">
                    {t.revokedAt
                      ? "Revoked"
                      : t.expired
                        ? "Expired"
                        : `Expires ${t.expiresAt.slice(0, 10)}`}
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
