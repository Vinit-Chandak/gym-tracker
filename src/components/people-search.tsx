"use client";

import { useEffect, useId, useState } from "react";
import { unstable_rethrow } from "next/navigation";

import { FollowButton } from "@/components/follow-button";
import { PersonRow } from "@/components/person-row";
import { Search } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { List } from "@/components/ui/link-row";
import { searchPeopleAction, type PersonResult } from "@/server/actions/people";

/** How long typing has to pause before people are looked up. */
export const PEOPLE_SEARCH_DELAY_MS = 350;

/**
 * Find people (plan §3.4): one search field, and the matches beneath it as rows with the
 * follow button in the state that applies. A query with `@` is an exact email; anything else
 * is the start of a username or of a word in a name. Results are an action's reply, kept here.
 *
 * The label is its own element rather than a `Field`'s, because the field carries a search
 * glass inside it and a `Field` would hand the input's name to the box holding the two.
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
  const [answer, setAnswer] = useState<{
    query: string;
    people: PersonResult[];
    failed?: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const id = useId();
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed === "") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const people = await searchPeopleAction(trimmed);
        if (!cancelled) setAnswer({ query: trimmed, people });
      } catch (error) {
        unstable_rethrow(error);
        if (!cancelled) setAnswer({ query: trimmed, people: [], failed: true });
      }
    }, PEOPLE_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, attempt]);

  const searching = trimmed !== "" && answer?.query !== trimmed;
  const failed = trimmed !== "" && answer?.query === trimmed && answer.failed;
  const results = trimmed !== "" && answer?.query === trimmed && !failed ? answer.people : null;

  return (
    <div className="space-y-3">
      <div className="min-w-0 space-y-1.5">
        <label
          htmlFor={id}
          className={labelHidden ? "sr-only" : "block text-sm font-semibold text-ink-muted"}
        >
          Find people
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            id={id}
            type="search"
            name="query"
            placeholder="Username or email"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus={autoFocus}
            className="pl-10"
          />
        </div>
      </div>
      <p className="sr-only" role="status">
        {searching ? "Searching" : results ? `${results.length} found` : ""}
      </p>
      {failed && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-danger">
            Could not load people. Please try again.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setAnswer(null);
              setAttempt((value) => value + 1);
            }}
          >
            Retry search
          </Button>
        </div>
      )}
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
