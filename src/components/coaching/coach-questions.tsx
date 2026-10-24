import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * What the coach asks the athlete to confirm before a programme starts (ADR 0063): its own
 * list, in view beside the decision, apart from what it is unsure about, which folds. Answered
 * with Ask for changes, each answer goes back to the coach beside its question.
 */
export function CoachQuestions({
  questions,
  className,
}: {
  questions: readonly string[];
  className?: string;
}) {
  const id = useId();
  if (questions.length === 0) return null;
  return (
    <section aria-labelledby={id} className={cn("min-w-0 space-y-1.5", className)}>
      <h3 id={id} className="text-sm font-bold">
        The coach asks
      </h3>
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        {questions.map((question, index) => (
          <li key={index} className="[overflow-wrap:break-word]">
            {question}
          </li>
        ))}
      </ul>
    </section>
  );
}
