"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { Field, Textarea } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";

export type CoachAnswer = { question: string; answer: string };

/**
 * Ask for changes on a programme the coach wrote (ADR 0063): an answer to each question the
 * coach asked, each optional, and anything else in the athlete's own words. Sending closes the
 * draft and the coach writes it again, which is said once, where the action is.
 */
export function AskForChangesSheet({
  open,
  onClose,
  questions,
  busy,
  error,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  questions: readonly string[];
  busy: boolean;
  error: string | null;
  onSend: (notes: string, answers: CoachAnswer[]) => void;
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [notes, setNotes] = useState("");
  const said = notes.trim() !== "" || answers.some((answer) => answer.trim() !== "");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="What should change?"
      dismissible={!busy}
      footer={
        <div className="space-y-2">
          <FormError message={error ?? undefined} />
          {/* What sending does cannot be undone, so it is said where the action is. */}
          <p className="text-[length:var(--ov-type-caption)] font-medium text-ink-2">
            The coach writes it again, and this draft closes.
          </p>
          <Button
            size="lg"
            className="w-full"
            disabled={busy || !said}
            onClick={() =>
              onSend(
                notes.trim(),
                questions
                  .map((question, index) => ({ question, answer: answers[index]!.trim() }))
                  .filter((entry) => entry.answer !== ""),
              )
            }
          >
            {busy ? "Sending…" : "Send to the coach"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {questions.map((question, index) => (
          <Field key={question} label={question} aside="Optional">
            <Textarea
              rows={2}
              maxLength={2000}
              value={answers[index] ?? ""}
              onChange={(event) =>
                setAnswers((current) =>
                  current.map((answer, at) => (at === index ? event.target.value : answer)),
                )
              }
            />
          </Field>
        ))}
        <Field
          label={questions.length > 0 ? "Anything else?" : "What should change?"}
          aside={questions.length > 0 ? "Optional" : undefined}
          // Without questions the sheet's title asks it, and the field keeps the name.
          labelHidden={questions.length === 0}
        >
          <Textarea
            rows={4}
            maxLength={2000}
            placeholder="Fewer days, a shorter long run…"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}
