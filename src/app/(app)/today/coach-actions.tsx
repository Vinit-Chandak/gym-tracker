"use client";

import { Check } from "@/components/ui/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { REQUEST_TIMEOUT_MINUTES } from "@/domain/coach-request";
import { cn } from "@/lib/utils";
import { requestCoachPlanAction } from "@/server/actions/coach";
import { attempted } from "@/lib/offline-submit";

export type CoachGym = { id: string; name: string; isDefault: boolean };

/** How often Today re-reads while the coach is planning, and for how long. */
const POLL_MS = 15_000;

/**
 * One line under the day's action while the coach is planning. It re-reads the page on a
 * timer until the plan lands or the request times out on the server, so the athlete can
 * leave the app open and come back to a plan.
 */
export function CoachPending({
  startedAt,
  startedAtLabel,
  gymName,
  workflow = false,
}: {
  /** When the request was made, for the polling deadline. */
  startedAt: string;
  /** The same moment in the athlete's own time zone, formatted on the server as everywhere else. */
  startedAtLabel: string;
  gymName: string;
  workflow?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    const until = new Date(startedAt).getTime() + REQUEST_TIMEOUT_MINUTES * 60_000;
    let finished = false;
    let lastRefreshAt = Date.now();
    let delay = POLL_MS;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      if (finished || document.visibilityState !== "visible" || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastRefreshAt < 1000) return;
      lastRefreshAt = now;
      router.refresh();
      // One final visible/online read lets the server reconcile an expired request.
      if (!workflow && now >= until) {
        finished = true;
        clearTimeout(timer);
      }
    };
    const schedule = () => {
      timer = setTimeout(() => {
        refresh();
        if (workflow) delay = Math.min(60_000, delay * 2);
        if (!finished) schedule();
      }, delay);
    };
    schedule();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [router, startedAt, workflow]);
  return (
    <p role="status" className="text-sm text-ink-muted">
      Coach is planning for {gymName}, since {startedAtLabel}. This screen updates itself.
    </p>
  );
}

/**
 * The More options sheet's contents while asking the coach: the gym, which decides the
 * machines and the machine history the plan is built from, and a line for the coach.
 */
export function CoachRequestPanel({
  gyms,
  requestsLeft,
  onDone,
  onBack,
  workflow = false,
}: {
  gyms: CoachGym[];
  requestsLeft: number;
  onDone: () => void;
  onBack: () => void;
  workflow?: boolean;
}) {
  const [gymId, setGymId] = useState(gyms.find((g) => g.isDefault)?.id ?? gyms[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const outcome = await attempted(
        () => requestCoachPlanAction(gymId, reason),
        "Connection lost. Try again when connected.",
      );
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      if (!outcome.value.ok) {
        setError(outcome.value.error);
        return;
      }
      onDone();
    });

  return (
    <div className="space-y-4">
      {workflow && (
        <p className="text-sm text-ink-muted">
          Daily preparation is automatic. Use this when you are training at a different gym for your
          next session.
        </p>
      )}
      <ul className="space-y-2" aria-label="Gym">
        {gyms.map((gym) => {
          const chosen = gym.id === gymId;
          return (
            <li key={gym.id}>
              <button
                type="button"
                onClick={() => setGymId(gym.id)}
                aria-pressed={chosen}
                className={cn(
                  "flex min-h-14 w-full items-center justify-between gap-3 rounded-control border px-4 text-left text-base font-medium",
                  chosen
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-transparent bg-surface-raised text-ink active:bg-accent-soft",
                )}
              >
                <span className="min-w-0 truncate">{gym.name}</span>
                {chosen && <Check className="shrink-0 text-accent" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      <Field label="Anything the coach should know" hint="Optional">
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={200}
          placeholder="Short on time, knee is sore, …"
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button size="lg" className="w-full" disabled={pending || !gymId} onClick={submit}>
        {pending ? "Asking…" : workflow ? "Prepare for this gym" : "Ask the coach"}
      </Button>
      <p className="text-xs text-ink-subtle">
        {requestsLeft} {requestsLeft === 1 ? "request" : "requests"} left today.
        {workflow
          ? " Shared with programme creation; resets at midnight in your time zone. You can leave while the coach prepares it."
          : " The plan arrives in a few minutes."}
      </p>
      <Button variant="ghost" className="w-full" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}
