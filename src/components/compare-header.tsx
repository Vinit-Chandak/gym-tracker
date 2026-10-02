import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Side } from "@/domain/compare";

export type ComparePerson = { username: string; displayName: string | null };

/**
 * Head to head (plan §3.10): two large avatars with "vs" between them in the data voice and
 * the names under each, the viewer always on the left, on a ruled block. Each name carries
 * the dot of the series colour the radar, the table and the trend chart give that person.
 * The exercise screen adds a Stronger badge under whoever leads on the movement's primary
 * metric; the overall screen never does, since "more active" is not a contest anyone asked
 * to enter.
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
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 py-4 rule-bottom rule-top">
      <Person person={a} series="var(--color-series-1)" stronger={stronger === "a"} />
      <span
        className="self-center font-data text-lg font-semibold text-ink-subtle tabular-nums"
        aria-hidden
      >
        vs
      </span>
      <Person person={b} series="var(--color-series-2)" stronger={stronger === "b"} />
    </div>
  );
}

function Person({
  person,
  series,
  stronger,
}: {
  person: ComparePerson;
  series: string;
  stronger: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <Avatar username={person.username} displayName={person.displayName} size="compare" />
      <p className="max-w-full min-w-0">
        <span className="block font-medium [overflow-wrap:anywhere]">
          {/* Inline with the first word, so a name that wraps keeps its dot on its first line. */}
          <span
            className="mr-1.5 inline-block size-2 rounded-full align-middle"
            style={{ background: series }}
            aria-hidden
          />
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
