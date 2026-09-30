import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HeroCard } from "@/components/ui/hero-card";
import type { Side } from "@/domain/compare";
import type { Tone } from "@/lib/sport-tone";
import { cn } from "@/lib/utils";

export type ComparePerson = { username: string; displayName: string | null };

/** The one figure a comparison leads with: what it is, and each side's reading of it. */
export type CompareScore = { label: string; a: string; b: string };

/**
 * Head to head (plan §3.10): the two of you side by side, the viewer always on the left.
 *
 * With a `score` it is the screen's one hero, filled with the sport's colour and read like a
 * scoreboard: the figure the comparison leads with under each avatar, in the display face,
 * and what that figure is above both. Without one — while their training is hidden — it is
 * a plain card with the two people and nothing to read between them.
 *
 * The exercise screen adds a Stronger badge under whoever leads on the movement's primary
 * metric; the overall screen never does, since "more active" is not a contest anyone asked
 * to enter, so its two figures are set alike whoever is ahead.
 */
export function CompareHeader({
  a,
  b,
  stronger,
  score,
  tone = "lift",
}: {
  a: ComparePerson;
  b: ComparePerson;
  stronger?: Side | null;
  score?: CompareScore;
  /** The sport being compared, whose colour the scoreboard takes. */
  tone?: Tone;
}) {
  const people = (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
      <Person person={a} you figure={score?.a} long={isLong(score)} stronger={stronger === "a"} />
      {/* Level with the avatars' centres: the two faces are what it stands between. */}
      <span aria-hidden className="mt-4 font-display text-display-s text-ink-muted">
        vs
      </span>
      <Person person={b} figure={score?.b} long={isLong(score)} stronger={stronger === "b"} />
    </div>
  );
  if (!score) return <Card>{people}</Card>;
  return (
    <HeroCard tone={tone}>
      <p className="text-center text-sm font-semibold text-ink-muted tabular-nums">{score.label}</p>
      {people}
    </HeroCard>
  );
}

/** A load like "157.5 kg" needs the smaller display size to sit in half the card. */
function isLong(score: CompareScore | undefined): boolean {
  return score ? Math.max(score.a.length, score.b.length) > 5 : false;
}

function Person({
  person,
  you = false,
  figure,
  long,
  stronger,
}: {
  person: ComparePerson;
  you?: boolean;
  figure?: string;
  long: boolean;
  stronger: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <Avatar username={person.username} displayName={person.displayName} size="header" />
      {figure !== undefined && (
        <p
          className={cn(
            "max-w-full font-display [overflow-wrap:anywhere] tabular-nums",
            long ? "text-display-m" : "text-display-l",
          )}
        >
          {figure}
        </p>
      )}
      <p className="max-w-full min-w-0">
        <span className="block font-semibold [overflow-wrap:anywhere]">
          {you ? "You" : person.displayName || person.username}
        </span>
        <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted">
          @{person.username}
        </span>
      </p>
      {stronger && <Badge tone="success">Stronger</Badge>}
    </div>
  );
}
