"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { applyProposalAction, rejectProposalAction } from "@/server/actions/coach";
import { attempted } from "@/lib/offline-submit";

export type ProposalCard = {
  id: string;
  summary: string;
  rationale: string | null;
  lines: string[];
  createdAt: string;
  fromCoach: boolean;
};

/**
 * A change the coach wants to make to the programme itself, waiting on the athlete.
 *
 * Approving writes the next version of the programme: the same sequence, the same position,
 * with this change in it. Everything already logged keeps the prescription it was given.
 */
function Proposal({ proposal }: { proposal: ProposalCard }) {
  const [pending, startTransition] = useTransition();
  const [operation, setOperation] = useState<"apply" | "reject">("apply");
  const [error, setError] = useState<string | null>(null);

  /**
   * Which button is working has to be set here, in the click itself. Setting it inside the
   * transition leaves the first pending render with the previous value, so dismissing a change
   * lit up "Applying…" on the button beside it — the one the athlete did not press.
   */
  const act = (kind: "apply" | "reject") => {
    setOperation(kind);
    setError(null);
    const action = kind === "reject" ? rejectProposalAction : applyProposalAction;
    startTransition(async () => {
      const outcome = await attempted(
        () => action(proposal.id),
        "Connection lost. Try again when connected.",
      );
      if (!outcome.ok) setError(outcome.message);
      else if (!outcome.value.ok) setError(outcome.value.error);
    });
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-medium [overflow-wrap:anywhere]">{proposal.summary}</p>
        {proposal.fromCoach && <Badge tone="accent">Coach</Badge>}
      </div>
      <ul className="space-y-1.5">
        {proposal.lines.map((line, index) => (
          <li key={index} className="text-sm [overflow-wrap:anywhere] text-ink-muted">
            {line}
          </li>
        ))}
      </ul>
      {proposal.rationale && (
        <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-line">{proposal.rationale}</p>
      )}
      <p className="text-xs text-ink-muted tabular-nums">{proposal.createdAt}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="action-row">
        <Button
          variant="secondary"
          className="w-full"
          disabled={pending}
          onClick={() => act("reject")}
        >
          {pending && operation === "reject" ? "Dismissing…" : "No thanks"}
        </Button>
        <Button className="w-full" disabled={pending} onClick={() => act("apply")}>
          {pending && operation === "apply" ? "Applying…" : "Apply"}
        </Button>
      </div>
    </Card>
  );
}

export function Proposals({ proposals }: { proposals: ProposalCard[] }) {
  return (
    <ul className="space-y-3">
      {proposals.map((proposal) => (
        <li key={proposal.id}>
          <Proposal proposal={proposal} />
        </li>
      ))}
    </ul>
  );
}
