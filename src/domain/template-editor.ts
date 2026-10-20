import type { EndurancePrescription } from "./activity-prescription";

/**
 * The compact template editor can write one repeated work step. Richer coach-written
 * sessions keep their steps intact while their name, overall targets and notes are edited.
 */
export function canEditTemplateSteps(prescription: EndurancePrescription): boolean {
  if (prescription.nodes.length === 0) return true;
  if (prescription.nodes.length !== 1) return false;
  const block = prescription.nodes[0]!;
  if (block.kind !== "repeat" || block.steps.length !== 1) return false;
  const step = block.steps[0]!;
  const range = step.target.kind === "distance" ? step.target.metres : step.target.ms;
  const action = { running: "run", cycling: "ride", swimming: "swim" }[prescription.sport];
  return (
    step.phase === "work" &&
    step.action === action &&
    step.effort === null &&
    step.stroke === null &&
    step.notes === null &&
    range[0] === range[1]
  );
}
