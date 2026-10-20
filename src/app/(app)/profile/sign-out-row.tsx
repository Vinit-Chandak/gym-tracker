"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Glyph } from "@/components/ui/glyphs";
import { clearAccountDrafts, readDrafts } from "@/lib/activity-drafts";
import { attempted } from "@/lib/offline-submit";
import { signOutAction } from "@/server/actions/auth";

function SubmitRow({ unsaved }: { unsaved: number }) {
  const { pending } = useFormStatus();
  const label = pending ? "Signing out…" : unsaved > 0 ? "Sign out anyway" : "Sign out";
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="nav-row w-full text-left disabled:opacity-60"
    >
      <span className="mark-cell">
        <Glyph name="exit" className="glyph-20" />
      </span>
      {unsaved > 0 ? (
        // The second line is the reason the row asks twice (NavRow's two-line row).
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="nav-row-label nav-row-label-bold">{label}</span>
          <span role="status" className="nav-row-sub">
            {unsaved === 1
              ? "An activity you have not saved is kept on this device. Signing out deletes it."
              : `${unsaved} activities you have not saved are kept on this device. Signing out deletes them.`}
          </span>
        </span>
      ) : (
        <span className="nav-row-label">{label}</span>
      )}
    </button>
  );
}

/** How many unsaved activities this account keeps on this device; none when storage is shut. */
function unsavedCount(userId: string): number {
  try {
    return readDrafts(localStorage, userId).drafts.length;
  } catch {
    return 0;
  }
}

/**
 * Signing out is a row like its neighbours, without a chevron: the whole row submits.
 *
 * It takes this account's unsaved activities off the device with it, so the next person to
 * sign in here cannot read them (plan §5.3). When there are some, the first tap says so and
 * the second signs out — they are the only copy of what was typed, so it asks, as deleting does.
 */
export function SignOutRow({ userId }: { userId: string }) {
  const router = useRouter();
  const [unsaved, setUnsaved] = useState(0);
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="nav-row-item">
      <form
        action={async () => {
          setError(null);
          const outcome = await attempted(
            signOutAction,
            "Could not sign out. Check your connection and try again.",
          );
          const failure = outcome.ok ? outcome.value.error : outcome.message;
          if (failure) {
            setError(failure);
            return;
          }
          try {
            clearAccountDrafts(localStorage, userId);
          } catch {
            // A store that cannot be read holds nothing to clear.
          }
          router.replace("/login");
        }}
        onSubmit={(event) => {
          const count = unsavedCount(userId);
          if (count > 0 && unsaved === 0) {
            event.preventDefault();
            setUnsaved(count);
            return;
          }
        }}
      >
        <SubmitRow unsaved={unsaved} />
        {error && (
          <p role="alert" className="pb-2 type-meta-small font-semibold">
            {error}
          </p>
        )}
      </form>
    </li>
  );
}
