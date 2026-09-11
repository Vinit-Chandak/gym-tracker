"use client";

import { Check } from "@/components/ui/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { REQUEST_TIMEOUT_MINUTES } from "@/domain/coach-request";
import { cn } from "@/lib/utils";
import { requestCoachPlanAction } from "@/server/actions/coach";

export type CoachGym = { id: string; name: string; isDefault: boolean };

/** How often Today re-reads while the coach is planning, and for how long. */
const POLL_MS = 15_000;

/**
 * One line under the day's action while the coach is planning. It re-reads the page on a
 * timer until the plan lands or the request times out on the server, so the athlete can
 * leave the app open and come back to a plan.
 */
export function CoachPending({ startedAt, gymName }: { startedAt: string; gymName: string }) {
  const router = useRouter();
  useEffect(() => {
    const until = new Date(startedAt).getTime() + REQUEST_TIMEOUT_MINUTES * 60_000;
    let finished = false;
    let lastRefreshAt = Date.now();
    const refresh = () => {
      if (finished || document.visibilityState !== "visible" || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastRefreshAt < 1000) return;
      lastRefreshAt = now;
      router.refresh();
      // One final visible/online read lets the server reconcile an expired request.
      if (now >= until) {
        finished = true;
        clearInterval(timer);
      }
    };
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [router, startedAt]);
  const time = new Date(startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <p role="status" className="text-sm text-ink-muted">
      Coach is planning for {gymName}, since {time}. This screen updates itself.
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
}: {
  gyms: CoachGym[];
  requestsLeft: number;
  onDone: () => void;
  onBack: () => void;
}) {
  const [gymId, setGymId] = useState(gyms.find((g) => g.isDefault)?.id ?? gyms[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await requestCoachPlanAction(gymId, reason);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } catch {
        setError("Connection lost. Try again when connected.");
        return;
      }
      onDone();
    });

  return (
    <div className="space-y-4">
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
        {pending ? "Asking…" : "Ask the coach"}
      </Button>
      <p className="text-xs text-ink-subtle">
        {requestsLeft} {requestsLeft === 1 ? "request" : "requests"} left today. The plan arrives in
        a few minutes.
      </p>
      <Button variant="ghost" className="w-full" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}
