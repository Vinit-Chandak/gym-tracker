import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Side } from "@/domain/compare";

export type ComparePerson = { username: string; displayName: string | null };

/**
 * Head to head (plan §3.10): two large avatars with "VS" between and a name under each, the
 * viewer always on the left as "You", as the legend and the table beneath head their side; the
 * other by the name the back link gives them. The exercise screen adds a Stronger badge under
 * whoever leads on the movement's primary metric; the overall screen never does, since "more
 * active" is not a contest anyone asked to enter. Where the two halves cannot hold a name's
 * longest word beside "VS" (large text), "VS" gives its column up (people.css).
 */
export function CompareHeader({
  a,
  b,
  stronger,
}: {
  a: ComparePerson;
  b: ComparePerson;
  stronger?: Side | null;
}) {
  return (
    <Card className="compare-head">
      <div className="compare-head-people">
        <Person person={a} name="You" stronger={stronger === "a"} />
        <span
          className="compare-head-vs self-center pt-1 text-sm font-medium tracking-wide text-ink-subtle"
          aria-hidden
        >
          VS
        </span>
        <Person person={b} name={b.displayName || b.username} stronger={stronger === "b"} />
      </div>
    </Card>
  );
}

function Person({
  person,
  name,
  stronger,
}: {
  person: ComparePerson;
  name: string;
  stronger: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <Avatar username={person.username} displayName={person.displayName} size="compare" />
      <p className="max-w-full min-w-0 font-medium [overflow-wrap:break-word]">{name}</p>
      {stronger && <Badge>Stronger</Badge>}
    </div>
  );
}
