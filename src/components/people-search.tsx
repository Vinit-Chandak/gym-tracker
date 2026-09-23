"use client";

import { useEffect, useState } from "react";

import { FollowButton } from "@/components/follow-button";
import { PersonRow } from "@/components/person-row";
import { Field, Input } from "@/components/ui/input";
import { List } from "@/components/ui/link-row";
import { searchPeopleAction, type PersonResult } from "@/server/actions/people";

/** How long typing has to pause before people are looked up. */
export const PEOPLE_SEARCH_DELAY_MS = 350;

/**
 * Find people (plan §3.4): one field, and the matches beneath it as rows with the follow
 * button in the state that applies. A query with `@` is an exact email; anything else is the
 * start of a username or of a word in a name. Results are an action's reply, kept here.
 */
export function PeopleSearch({
  autoFocus = false,
  labelHidden = false,
}: {
  autoFocus?: boolean;
  /** For a page whose title already says "Find people". */
  labelHidden?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<{ query: string; people: PersonResult[] } | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed === "") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const people = await searchPeopleAction(trimmed);
      if (!cancelled) setAnswer({ query: trimmed, people });
    }, PEOPLE_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const searching = trimmed !== "" && answer?.query !== trimmed;
  const results = trimmed !== "" && answer?.query === trimmed ? answer.people : null;

  return (
    <div className="space-y-3">
      <Field label="Find people" hint="Username or email." labelHidden={labelHidden}>
        <Input
          type="search"
          name="query"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus={autoFocus}
        />
      </Field>
      <p className="sr-only" role="status">
        {searching ? "Searching" : results ? `${results.length} found` : ""}
      </p>
      {results && results.length === 0 && (
        <p className="px-1 text-sm text-ink-muted">
          Nobody called that.
          {trimmed.includes("@") ? " An email has to match exactly." : ""}
        </p>
      )}
      {results && results.length > 0 && (
        <List>
          {results.map((person) => (
            <li key={person.id}>
              <PersonRow person={person}>
                <FollowButton
                  personId={person.id}
                  username={person.username}
                  relation={person.relation}
                />
              </PersonRow>
            </li>
          ))}
        </List>
      )}
    </div>
  );
}
