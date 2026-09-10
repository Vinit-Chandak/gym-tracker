"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { requestCoachPlanAction } from "@/server/actions/coach";

export type CoachGym = { id: string; name: string; isDefault: boolean };

/** How often Today re-reads while the coach is planning, and for how long. */
const POLL_MS = 15_000;
const POLL_FOR_MS = 12 * 60_000;

/**
 * "The coach is planning": re-reads the page on a timer until the plan lands or the request
 * times out on the server, so the athlete can leave the app open and come back to a plan.
 */
export function CoachPending({ startedAt, gymName }: { startedAt: string; gymName: string }) {
  const router = useRouter();
  useEffect(() => {
    const until = Date.now() + POLL_FOR_MS;
    const timer = setInterval(() => {
      if (Date.now() > until) clearInterval(timer);
      else router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [router]);
  const time = new Date(startedAt);
  return (
    <p role="status" className="text-sm text-ink-muted">
      Coach is planning for {gymName}, since{" "}
      {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Usually a few minutes;
      this screen updates itself.
    </p>
  );
}

/**
 * Ask the coach for a plan, at a gym of your choosing. The gym decides which machines and
 * which machine history the coach plans with, so it is the one thing the sheet asks.
 */
export function CoachRequestButton({
  gyms,
  label,
  variant = "secondary",
  requestsLeft,
}: {
  gyms: CoachGym[];
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  requestsLeft: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gymId, setGymId] = useState(gyms.find((g) => g.isDefault)?.id ?? gyms[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const exhausted = requestsLeft <= 0;

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
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <div className="space-y-1">
        <Button
          variant={variant}
          className="w-full"
          disabled={exhausted || gyms.length === 0}
          onClick={() => setOpen(true)}
        >
          {label}
        </Button>
        {exhausted && (
          <p className="text-xs text-ink-subtle">
            No more coach requests today. It plans overnight.
          </p>
        )}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Plan with the coach">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            The coach plans for the gym you pick, with that gym&apos;s machines and their history.
          </p>
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
                      "flex min-h-12 w-full items-center justify-between gap-3 rounded-control border px-4 text-left font-medium",
                      chosen
                        ? "border-accent bg-accent-soft text-ink"
                        : "border-line-strong bg-surface text-ink active:bg-surface-raised",
                    )}
                  >
                    <span className="min-w-0 truncate">{gym.name}</span>
                    {chosen && <Check className="size-5 shrink-0 text-accent" aria-hidden />}
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
            {requestsLeft} {requestsLeft === 1 ? "request" : "requests"} left today.
          </p>
        </div>
      </Sheet>
    </>
  );
}
