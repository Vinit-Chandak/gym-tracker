"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, INPUT_CLASS } from "@/components/ui/input";
import { saveReviewWeekdayAction } from "@/server/actions/coaching-workflow";
import { WEEKDAYS } from "./intake-form";
export function WeeklyReviewSettings({
  weekday,
  next,
}: {
  weekday: number | null;
  next: string | null;
}) {
  const router = useRouter();
  const [day, setDay] = useState(weekday ?? 0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Field
        label="Weekly programme review"
        hint="Choose your rest day. Your first review waits at least seven days after enabling coaching. Later changes take effect at least seven days after the previous scheduled review."
      >
        <select
          className={INPUT_CLASS}
          value={day || ""}
          onChange={(e) => setDay(Number(e.target.value))}
        >
          <option value="">Choose a rest day</option>
          {WEEKDAYS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      {next && <p className="text-sm text-ink-muted">Next review: {next}, at 04:00 India time.</p>}
      <Button
        variant="secondary"
        disabled={busy || !day || day === weekday}
        onClick={async () => {
          setBusy(true);
          const result = await saveReviewWeekdayAction(day);
          if (result.ok) {
            setError(null);
            router.refresh();
          } else setError(result.error);
          setBusy(false);
        }}
      >
        Save review day
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
