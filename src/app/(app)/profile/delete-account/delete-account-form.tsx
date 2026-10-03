"use client";

import { useActionState, useState } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { Field, Input } from "@/components/ui/input";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { keepsErrorOnDisconnect } from "@/lib/offline-submit";
import { deleteAccountAction, type DeleteAccountState } from "@/server/actions/account";

const INITIAL: DeleteAccountState = {};

/**
 * A word to type and one button (board Delete account): the button's outline stays grey until
 * the word is typed, then turns ink. The server still checks the word.
 */
export function DeleteAccountForm() {
  const [state, formAction] = useActionState(keepsErrorOnDisconnect(deleteAccountAction), INITIAL);
  const [typed, setTyped] = useState("");

  return (
    <form action={formAction} className="mt-5">
      <Field label="Type DELETE to confirm">
        <Input
          name="confirm"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          required
        />
      </Field>
      <PinnedActions stack>
        <FormError message={state.error} />
        <SubmitButton variant="danger" pendingLabel="Deleting…" disabled={typed !== "DELETE"}>
          <Glyph name="trash" className="glyph-20" />
          Delete everything
        </SubmitButton>
      </PinnedActions>
    </form>
  );
}
