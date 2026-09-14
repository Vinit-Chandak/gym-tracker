"use client";

import { useEffect, useState } from "react";

import { Field, Input } from "@/components/ui/input";
import { normaliseUsername, USERNAME_MAX_LENGTH, usernameProblem } from "@/domain/username";
import { checkUsernameAction, type UsernameCheck } from "@/server/actions/people";

/** How long typing has to pause before the server is asked whether the name is free. */
export const USERNAME_CHECK_DELAY_MS = 400;

const RULES_HINT = "3 to 20 characters: lowercase letters, digits, dots and underscores.";

type LiveState =
  | { kind: "idle" }
  | { kind: "yours" }
  | { kind: "invalid"; message: string }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" };

/**
 * The username field the signup form, Welcome step 1 and the profile edit form share. The
 * rules are checked as you type; a pause then asks the server whether the name is free, so a
 * taken name is found out before the form is sent rather than after. The unique index still
 * has the last word on save, and that refusal arrives as `error`.
 */
export function UsernameField({
  defaultValue = "",
  current,
  error,
  hint = RULES_HINT,
  label = "Username",
  required = true,
}: {
  defaultValue?: string;
  /** The account's own username, which is not "taken" when typed back unchanged. */
  current?: string;
  /** What the server said on submit; shown until the field is edited again. */
  error?: string;
  hint?: string;
  label?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [edited, setEdited] = useState(false);
  /** The server's last answer, remembered with the name it was about. */
  const [answer, setAnswer] = useState<{ candidate: string; result: UsernameCheck } | null>(null);
  // A fresh refusal from the server outranks whatever the live check last said, until the
  // field is touched again.
  const [seenError, setSeenError] = useState(error);
  if (error !== seenError) {
    setSeenError(error);
    setEdited(false);
  }

  const candidate = normaliseUsername(value);
  const problem = candidate === "" ? null : usernameProblem(candidate);
  const askServer = candidate !== "" && candidate !== current && problem === null;

  useEffect(() => {
    if (!askServer) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await checkUsernameAction(candidate);
      if (!cancelled) setAnswer({ candidate, result });
    }, USERNAME_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [askServer, candidate]);

  const live: LiveState =
    candidate === "" || (!edited && candidate === current)
      ? { kind: "idle" }
      : candidate === current
        ? { kind: "yours" }
        : problem !== null
          ? { kind: "invalid", message: problem }
          : answer?.candidate !== candidate
            ? { kind: "checking" }
            : answer.result === "available"
              ? { kind: "available" }
              : { kind: "taken" };

  const feedback = edited || !error ? liveFeedback(live, hint) : { error };

  return (
    <Field label={label} error={feedback.error} hint={feedback.hint}>
      <Input
        type="text"
        name="username"
        autoComplete="username"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        maxLength={USERNAME_MAX_LENGTH + 1}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setEdited(true);
        }}
        required={required}
      />
    </Field>
  );
}

function liveFeedback(live: LiveState, hint: string): { error?: string; hint?: string } {
  switch (live.kind) {
    case "idle":
      return { hint };
    case "yours":
      return { hint: "This is your current username." };
    case "invalid":
      return { hint: live.message };
    case "checking":
      return { hint: "Checking…" };
    case "available":
      return { hint: "Available." };
    case "taken":
      return { error: "That username is taken." };
  }
}
