"use client";

import { useActionState } from "react";
import { MEMORY_LIMITS, memoryWordCount, type MemoryItem } from "@/domain/coach-memory";
import { saveMemoryItemAction } from "@/server/actions/coach";
import { INITIAL_FORM_STATE } from "@/server/validation/form";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormError, SubmitButton } from "@/components/ui/form";

function MemoryForm({
  item,
  revision,
  needsReview,
}: {
  item?: MemoryItem;
  revision: number;
  needsReview?: boolean;
}) {
  const [state, action] = useActionState(
    keepsFormOnDisconnect(saveMemoryItemAction),
    INITIAL_FORM_STATE,
  );
  return (
    <Card>
      <form action={action} className="space-y-3">
        <input type="hidden" name="itemId" value={item?.id ?? ""} />
        <input type="hidden" name="memoryRevision" value={revision} />
        <Field label={item ? "Memo category" : "Add something to remember"}>
          <Select
            name="category"
            defaultValue={state.values?.category ?? item?.category ?? "preference"}
          >
            <option value="preference">Preference</option>
            <option value="trend">Trend</option>
            <option value="observation">Exercise observation</option>
            <option value="experiment">Current experiment</option>
            <option value="decision">Previous decision</option>
          </Select>
        </Field>
        <Field label="Memo text">
          <Textarea
            name="text"
            maxLength={MEMORY_LIMITS.itemCharacters}
            defaultValue={state.values?.text ?? item?.text ?? ""}
            placeholder="For example: I prefer shorter sessions and dumbbell rows."
          />
        </Field>
        {item && (
          <p className="text-xs text-ink-muted">
            {item.origin === "athlete"
              ? "Confirmed by you"
              : `${item.status} · ${item.sourceIds.length} supporting records`}
            {item.reviewAfter ? ` · Review after ${item.reviewAfter}` : ""}
          </p>
        )}
        {needsReview && (
          <p className="text-sm text-warning">
            Needs review: its reassessment date has arrived or a supporting record was removed. The
            coach is not using this as an active memo item.
          </p>
        )}
        <FormError message={state.formError} />
        <div className="flex flex-wrap gap-2">
          <SubmitButton variant="secondary" name="operation" value="save">
            {item ? "Save correction" : "Add memo item"}
          </SubmitButton>
          {item && (
            <SubmitButton variant="danger" name="operation" value="remove">
              Remove item
            </SubmitButton>
          )}
        </div>
      </form>
    </Card>
  );
}

export function MemoryEditor({
  items,
  revision,
  reviewDueIds = [],
}: {
  items: MemoryItem[];
  revision: number;
  reviewDueIds?: string[];
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Your corrections stay confirmed until you change them. Training numbers are calculated from
        your logs. Keep each item concise. The memo can hold up to 3,000 words.
      </p>
      <p className="text-xs text-ink-muted">
        {memoryWordCount(items).toLocaleString("en-US")} /{" "}
        {MEMORY_LIMITS.words.toLocaleString("en-US")} words
        {" · "}
        {items.length} / {MEMORY_LIMITS.items} items
      </p>
      {items.map((item) => (
        <MemoryForm
          key={`${item.id}:${revision}`}
          item={item}
          revision={revision}
          needsReview={reviewDueIds.includes(item.id)}
        />
      ))}
      {items.length < MEMORY_LIMITS.items && (
        <MemoryForm key={`new:${revision}`} revision={revision} />
      )}
    </div>
  );
}
