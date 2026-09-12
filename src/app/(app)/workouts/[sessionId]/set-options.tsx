"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { SET_LIMITS } from "@/domain/sets";
import type { PrescriptionType, SetType } from "@/domain/types";
import { MEASURE_COLUMN_LABELS, SET_TYPE_LABELS } from "@/lib/labels";
import type { DraftValueField } from "@/lib/workout-drafts";

import type { Ghost, RowState } from "./use-set-rows";

type SetOptionsProps = {
  row: RowState | null;
  ghost: Ghost;
  unitLabel: string;
  weightStep: number;
  measure: PrescriptionType;
  onEdit: (row: RowState, patch: Partial<RowState>, touch?: DraftValueField) => void;
  onDelete: (row: RowState) => void;
  onClose: () => void;
};

/**
 * Everything a set needs occasionally: its type, roomy fields with steppers, and deletion.
 *
 * The steppers live here rather than in the row. Keeping them in the grid would mean three
 * two-storey controls per set, which is what pushed the numbers themselves off the screen.
 * Nothing in here touches any other row.
 */
export function SetOptions({
  row,
  ghost,
  unitLabel,
  weightStep,
  measure,
  onEdit,
  onDelete,
  onClose,
}: SetOptionsProps) {
  // One field, whichever the exercise is counted in. The step matches the measure: a rep at
  // a time, five seconds, five metres.
  const counted = {
    reps: { field: "reps", step: 1, max: SET_LIMITS.reps },
    duration: { field: "duration", step: 5, max: SET_LIMITS.durationSeconds },
    distance: { field: "distance", step: 5, max: SET_LIMITS.distanceMeters },
  }[measure] as { field: "reps" | "duration" | "distance"; step: number; max: number };
  return (
    <Sheet open={row !== null} onClose={onClose} title={row ? `Set ${row.setIndex}` : "Set"}>
      {row && (
        <div className="space-y-4">
          <Field label="Type">
            <Select
              value={row.setType}
              disabled={row.saving}
              aria-label={`Set ${row.setIndex} type`}
              // A type change is not a value, so it marks nothing as edited: an untouched
              // load still takes its suggestion when the set is saved.
              onChange={(event) => onEdit(row, { setType: event.target.value as SetType })}
            >
              {(Object.keys(SET_TYPE_LABELS) as SetType[]).map((type) => (
                <option key={type} value={type}>
                  {SET_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <NumberField
              label={unitLabel}
              value={row.weight}
              ghost={ghost.weight}
              onChange={(value) => onEdit(row, { weight: value }, "weight")}
              step={weightStep}
              max={SET_LIMITS.weight}
              disabled={row.saving}
            />
            <NumberField
              label={MEASURE_COLUMN_LABELS[measure]}
              value={row[counted.field]}
              ghost={ghost[counted.field]}
              onChange={(value) => onEdit(row, { [counted.field]: value }, counted.field)}
              step={counted.step}
              max={counted.max}
              inputMode={measure === "distance" ? "decimal" : "numeric"}
              disabled={row.saving}
            />
            <NumberField
              label="RIR"
              value={row.rir}
              ghost={ghost.rir}
              onChange={(value) => onEdit(row, { rir: value }, "rir")}
              step={1}
              max={SET_LIMITS.rir}
              disabled={row.saving}
            />
          </div>

          <Button
            variant="danger"
            className="w-full"
            disabled={row.saving}
            onClick={() => {
              onDelete(row);
              onClose();
            }}
            aria-label={`Remove set ${row.setIndex}`}
          >
            {row.logged ? "Delete this set" : "Remove this row"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
