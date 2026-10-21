import { Disclosure } from "@/components/ui/disclosure";
import type { CoachIntake } from "@/domain/coaching-workflow";

/**
 * The coach's questions on an earlier request, each with the answer given where it was asked.
 * They travel with the answers to every later request, so whichever sport's questions are open
 * says what they are. A question is as long as a sentence, so it gets a line of its own rather
 * than a label column.
 */
export function CoachAsked({ clarifications }: { clarifications: CoachIntake["clarifications"] }) {
  if (clarifications.length === 0) return null;
  return (
    <Disclosure
      summary="What the coach asked"
      meta={`${clarifications.length} answered`}
      variant="inline"
    >
      <dl className="text-sm ruled-list">
        {clarifications.map((entry) => (
          <div key={entry.question} className="space-y-0.5 py-2">
            <dt className="[overflow-wrap:break-word] text-ink-muted">{entry.question}</dt>
            <dd className="break-words whitespace-pre-wrap">{entry.answer}</dd>
          </div>
        ))}
      </dl>
    </Disclosure>
  );
}
