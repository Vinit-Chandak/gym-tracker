"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { CoachNote } from "@/components/ui/coach-note";
import { FormError } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Input } from "@/components/ui/input";
import { REQUEST_TIMEOUT_MINUTES } from "@/domain/coach-request";
import type { GymKind } from "@/domain/types";
import { requestCoachPlanAction } from "@/server/actions/coach";
import { startWaitingCoachJobAction } from "@/server/actions/coaching-workflow";
import { coachingAction } from "@/components/coaching/client-action";
import { FACT_SEPARATOR } from "@/lib/facts";
import { attempted } from "@/lib/offline-submit";

import { GymRows } from "./gym-rows";

export type CoachGym = { id: string; name: string; isDefault: boolean; kind?: GymKind };

/** How often Today re-reads while the coach is planning, and for how long. */
const POLL_MS = 15_000;

/**
 * One line under the day's action while the coach is planning: for which gym, and since when
 * ("Preparing for Anytime Fitness · since 04:00"), the dial turning beside it. It re-reads the
 * page on a timer until the plan lands or the request times out on the server, so the athlete
 * can leave the app open and come back to a plan, and says nothing about doing so.
 */
export function CoachPending({
  startedAt,
  startedAtLabel,
  gymName,
  workflow = false,
  flat = false,
}: {
  /** When the request was made, for the polling deadline. */
  startedAt: string;
  /** The same moment in the athlete's own time zone, formatted on the server as everywhere else. */
  startedAtLabel: string;
  gymName: string;
  workflow?: boolean;
  /** Inside a card: a passage of it, not a box of its own. */
  flat?: boolean;
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
    <CoachNote tone="planning" role="status" small flat={flat}>
      Preparing for {gymName}
      {FACT_SEPARATOR}since {startedAtLabel}
    </CoachNote>
  );
}

/**
 * The line in place of "Preparing for …" when nothing is: the session's preparation is queued,
 * but it failed, or the run meant to reach it never did, and the next nightly run is the next to
 * try. Saying it was planning, since four in the morning, told the athlete to wait for something
 * that was not coming; this says what stands, in one line, and starts it on a tap.
 */
export function CoachWaiting({
  jobId,
  attempted,
  hasPlan,
  flat = false,
}: {
  jobId: string;
  /** The coach tried and could not finish, rather than never reaching it. */
  attempted: boolean;
  /** An earlier plan for this session is on screen. */
  hasPlan: boolean;
  /** Inside a card: a passage of it, not a box of its own. */
  flat?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setError(null);
    const result = await coachingAction(() => startWaitingCoachJobAction(jobId));
    if (!result.ok) setError(result.error ?? "Could not start the coach. Please retry.");
    setBusy(false);
  };
  return (
    <CoachNote
      tone={attempted ? "failed" : "note"}
      role="status"
      small
      flat={flat}
      action={
        <>
          <Button
            variant="tonal"
            className={flat ? "flex w-full" : "flex w-full bg-ground"}
            disabled={busy}
            onClick={start}
          >
            {busy ? "Starting…" : "Prepare now"}
          </Button>
          {error && <FormError message={error} />}
        </>
      }
    >
      {attempted ? "Preparation failed" : hasPlan ? "Not prepared again yet" : "Not prepared yet"}
      {hasPlan ? ": the earlier preparation applies." : ": programme targets apply."}
    </CoachNote>
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
      <GymRows gyms={gyms} chosenId={gymId || null} onChoose={setGymId} disabled={pending} />
      <Field label="Note for the coach" aside="Optional">
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={200}
          placeholder="Short on time, knee is sore, …"
        />
      </Field>
      {error && <FormError message={error} />}
      <Button size="lg" className="w-full" disabled={pending || !gymId} onClick={submit}>
        {pending ? "Asking…" : workflow ? "Prepare for this gym" : "Ask the coach"}
      </Button>
      <p className="flex items-center gap-1 type-meta-small text-ink-2">
        <span className="min-w-0 [overflow-wrap:break-word]">
          {requestsLeft} {requestsLeft === 1 ? "request" : "requests"} left today
        </span>
        <InfoTip label="About requests">
          {workflow
            ? "Shared with new programmes. They reset at midnight in your time zone."
            : "They reset at midnight in your time zone."}
        </InfoTip>
      </p>
      <Button variant="text" className="w-full" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}
