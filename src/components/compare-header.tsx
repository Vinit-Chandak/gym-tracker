import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Side } from "@/domain/compare";

export type ComparePerson = { username: string; displayName: string | null };

/**
 * Head to head (plan §3.10): two large avatars with "VS" between and the names under each,
 * the viewer always on the left. The exercise screen adds a Stronger badge under whoever
 * leads on the movement's primary metric; the overall screen never does, since "more
 * active" is not a contest anyone asked to enter.
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
    <Card>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        <Person person={a} stronger={stronger === "a"} />
        <span
          className="self-center pt-1 text-sm font-medium tracking-wide text-ink-subtle"
          aria-hidden
        >
          VS
        </span>
        <Person person={b} stronger={stronger === "b"} />
      </div>
    </Card>
  );
}

function Person({ person, stronger }: { person: ComparePerson; stronger: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <Avatar username={person.username} displayName={person.displayName} size="compare" />
      <p className="max-w-full min-w-0">
        <span className="block font-medium [overflow-wrap:anywhere]">
          {person.displayName || person.username}
        </span>
        <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted">
          @{person.username}
        </span>
      </p>
      {stronger && <Badge tone="success">Stronger</Badge>}
    </div>
  );
}
