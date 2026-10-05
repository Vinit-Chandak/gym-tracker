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

  // --- Awaiting the owner's approval ------------------------------------------------------------
  // Common combinations found in chain suppliers' lines and Indian makers' listings
  // (docs/planning/catalogue-additions.md, 2.2, tiers 1 to 3). Every member is a published type.
  {
    slug: "leg_extension_lying_curl",
    name: "Leg extension and lying curl",
    types: ["leg_extension", "leg_curl_lying"],
    aliases: ["Leg extension and prone leg curl", "Leg curl extension machine"],
    purpose: "Extensions sitting up, curls lying face down, on one machine",
    identification:
      "A bench whose back pad flips down to lie on for curls and props up for extensions, with rollers at the foot end. Often plate-loaded in local gyms.",
    sortOrder: 4,
    review: "draft",
  },
  {
    slug: "hip_abduction_adduction",
    name: "Hip abduction and adduction",
    types: ["hip_abduction", "hip_adduction"],
    aliases: [
      "Abductor adductor machine",
      "Inner and outer thigh machine",
      "Hip abductor adductor",
    ],
    purpose: "Pushes the knees apart, or squeezes them together, from one seat",
    identification:
      "One seat with pads that sit outside or inside the knees, and a lever that swaps them.",
    sortOrder: 5,
    review: "draft",
  },
  {
    slug: "multi_press",
    name: "Multi-press",
    types: ["chest_press_machine", "incline_press_machine", "shoulder_press_machine"],
    aliases: ["Multi press machine", "Chest and shoulder press machine", "Multi chest press"],
    purpose: "Chest, incline and shoulder presses from one seat and stack",
    identification:
      "One seat facing a pressing arm that adjusts, or offers several grips, for flat, incline and overhead pressing.",
    sortOrder: 6,
    review: "draft",
  },
  {
    slug: "leg_press_hack_squat",
    name: "Leg press and hack squat",
    types: ["leg_press_45", "hack_squat"],
    aliases: ["Leg press cum hack squat", "Hack squat leg press"],
    purpose: "45° leg presses sitting and hack squats standing, on one sled",
    identification:
      "An angled sled on rails with a large footplate: sit in the seat to press, or stand under the shoulder pads to squat.",
    sortOrder: 7,
    review: "draft",
  },
  {
    slug: "biceps_triceps_machine",
    name: "Biceps and triceps machine",
    types: ["biceps_curl_machine", "triceps_extension_machine"],
    // "Bicep tricep machine" is how sellers write it, and search already reads it as this name.
    aliases: [],
    purpose: "Curls and triceps extensions from one seat and stack",
    identification:
      "One seat with a sloped arm pad and a lever with grips to curl up or push down.",
    sortOrder: 8,
    review: "draft",
  },
  {
    slug: "knee_raise_dip_pull_up_tower",
    name: "Knee raise, dip and pull-up tower",
    types: ["captains_chair", "dip_station", "pull_up_bar"],
    aliases: [
      "Power tower",
      "Vertical knee raise dip chin",
      "Knee raise dip chin station",
      "Chin dip leg raise station",
    ],
    purpose: "Knee raises, dips and pull-ups on one bodyweight frame",
    identification:
      "A tall frame with a back pad and forearm pads, dip handles at hip height and a pull-up bar on top. No weight stack.",
    sortOrder: 9,
    review: "draft",
  },
  {
    slug: "ab_crunch_back_extension",
    name: "Ab crunch and back extension",
    types: ["ab_crunch_machine", "back_extension_machine"],
    aliases: ["Ab and back machine", "Low back abdominal"],
    purpose: "Crunches forward and extends the back, from one seat",
    identification:
      "One seat with a chest pad or overhead handles to crunch against and a back pad to extend against.",
    sortOrder: 10,
    review: "draft",
  },
  {
    slug: "chest_press_lat_pulldown",
    name: "Chest press and lat pulldown",
    types: ["chest_press_machine", "lat_pulldown"],
    aliases: ["Seated chest press and lat pull down"],
    purpose: "Pressing forward and pulling down, from one seat",
    identification: "One seat with press handles at chest height and a pulldown bar overhead.",
    sortOrder: 11,
    review: "draft",
  },
];

/**
 * Local names for the published combinations that still await the owner's approval
 * (docs/planning/catalogue-additions.md, 3). They join a combination's aliases only where drafts
 * are seeded; approving one is moving it into the entry above.
 */
export const DRAFT_COMBINATION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  lat_pulldown_low_row: ["Lat pulldown with rowing", "Pull down and low row"],
  assisted_dip_chin: ["Chin dip assist", "Weight assisted chin dip", "Dipping and chinning"],
  leg_extension_curl: ["Seated leg extension leg curl", "Dual station leg curl extension"],
};
