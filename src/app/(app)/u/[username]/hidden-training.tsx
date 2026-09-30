import { Card } from "@/components/ui/card";
import { Lock } from "@/components/ui/icons";
import { InfoTip } from "@/components/ui/info-tip";
import { RowIcon } from "@/components/ui/link-row";

/**
 * The one line a person's page or a comparison says when their training cannot be shown
 * (plan §3.14), in a card of its own so it reads as the answer rather than as a caption,
 * with the rule behind it one tap away.
 */
export function HiddenTraining({ line }: { line: string }) {
  return (
    <Card className="flex items-center gap-3 space-y-0">
      <RowIcon icon={Lock} />
      <p className="flex min-w-0 flex-1 items-center gap-1 text-callout leading-snug">
        <span className="min-w-0">{line}</span>
        <InfoTip label="About seeing someone's training" className="-my-2">
          Their training appears once they have accepted you as a follower, and only while they
          share it. With sharing off, their name and counts are all a follower sees.
        </InfoTip>
      </p>
    </Card>
  );
}
