/**
 * Machines sold as one piece that do the work of several types (owner decision: combination
 * machines). Each appears in the catalogue as its own item; choosing it registers one machine that
 * carries every type, named after the combination. The first type is the machine's display type.
 * A machine's history stays per exercise and machine, so the two halves never share records, and
 * its load ladder is one per machine, which matches the one shared stack.
 */
export type EquipmentCombinationSeed = {
  slug: string;
  name: string;
  types: readonly string[];
  aliases: readonly string[];
  purpose: string;
  identification: string;
  sortOrder: number;
  /** A catalogue addition awaiting the owner: seeded only where drafts are (see `reference.ts`). */
  review?: "draft";
};

export const EQUIPMENT_COMBINATIONS: readonly EquipmentCombinationSeed[] = [
  {
    slug: "lat_pulldown_low_row",
    name: "Lat pulldown and low row",
    types: ["lat_pulldown", "seated_row_cable"],
    aliases: ["Lat machine", "Lat pulldown with low row", "Pulldown and row combo"],
    purpose: "Pulls down from overhead, and rows from a low pulley",
    identification:
      "One weight stack with a high pulley and a bar above a seat with thigh pads, and a low pulley with a foot plate for seated rows.",
    sortOrder: 1,
  },
  {
    slug: "assisted_dip_chin",
    name: "Assisted dip and chin",
    types: ["assisted_pullup", "dip_machine"],
    aliases: ["Assisted pull-up and dip", "Dip and chin assist"],
    purpose: "Takes some of your weight off for pull-ups and dips",
    identification:
      "A tall frame with pull-up handles at the top, dip handles lower down and a pad you kneel or stand on that the stack pushes up.",
    sortOrder: 2,
  },
  {
    slug: "leg_extension_curl",
    name: "Leg extension and curl",
    types: ["leg_extension", "leg_curl_seated"],
    aliases: [
      "Leg extension and leg curl",
      "Leg extension cum leg curl",
      "Dual leg machine",
      "Leg extension/curl",
    ],
    purpose: "Straightens the knee against a pad, and curls it against another",
    identification:
      "One seat with two leg pads: a roller in front of the shins for extensions, and a pad set behind the ankles with a thigh pad for curls.",
    sortOrder: 3,
  },
];
