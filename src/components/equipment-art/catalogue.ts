/**
 * Which equipment has a line drawing, and whether the owner has approved it (plan: owner
 * decisions, illustrations). Pure data, so the seed can record the reference and any screen can
 * ask without loading a drawing.
 *
 * A draft drawing is shown only where drafts are switched on (`next dev`, or
 * `OVERLOAD_SHOW_DRAFTS=1`); elsewhere a tile shows its name and purpose without a picture.
 * Approving one is setting its status here, with the reviewer and the date.
 */
export type ArtStatus = "draft" | "approved";

export type ArtEntry = {
  status: ArtStatus;
  /** The pilot set the owner reviews and tries with beginners before the rest are drawn. */
  pilot?: boolean;
  reviewer?: string;
  reviewedOn?: string;
};

/** Keyed by drawing, which is the equipment type's or combination's slug. */
export const EQUIPMENT_ART: Readonly<Record<string, ArtEntry>> = {
  // The pilot (docs/planning/equipment-art-pilot.md): three confusable pairs, a cable station and
  // free weights, drawn first for the owner and two or three beginners to try.
  leg_press_45: { status: "draft", pilot: true },
  hack_squat: { status: "draft", pilot: true },
  leg_curl_seated: { status: "draft", pilot: true },
  leg_curl_lying: { status: "draft", pilot: true },
  chest_press_machine: { status: "draft", pilot: true },
  shoulder_press_machine: { status: "draft", pilot: true },
  cable_station: { status: "draft", pilot: true },
  dumbbells: { status: "draft", pilot: true },
};
