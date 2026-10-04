/**
 * Words that help a beginner recognise each kind of equipment (plan: discovery and recognition).
 * The purpose is the short line under a tile's name. The identification is what the picture view
 * says in words: the features that tell a machine from its look-alikes, for anyone who cannot see
 * the drawing or tell two apart. The aliases are names people actually use for it, local ones
 * included, and search matches them as it matches the name; when one alias names two types
 * ("Roman chair"), search shows both side by side rather than guessing.
 *
 * Keyed by the permanent slugs in `equipment-types.ts`, one entry for every type.
 */
export type EquipmentDescription = {
  /** What it is for, in a few plain words: at most 70 characters, no full stop needed. */
  purpose: string;
  /** What to look for to recognise it, one or two sentences, at most 200 characters. */
  identification: string;
  /** Other names people use for it, local ones included; never the canonical name itself. */
  aliases: readonly string[];
};

export const EQUIPMENT_DESCRIPTIONS: Readonly<Record<string, EquipmentDescription>> = {
  // --- Free weights ------------------------------------------------------------------------
  barbell: {
    purpose: "Squats, bench presses, deadlifts and rows",
    identification:
      "A long, straight steel bar with knurled grips and plain sleeves at each end that take plates; the standard Olympic bar is 2.2 m long and weighs 20 kg.",
    aliases: ["Olympic bar", "Straight bar", "Rod"],
  },
  ez_bar: {
    purpose: "Curls and triceps extensions, easier on the wrists",
    identification:
      "A short bar bent into a zigzag in the middle, so the hands grip at an angle; the sleeves take plates, or the plates come fixed on.",
    aliases: ["EZ bar", "Curl bar", "Z bar", "Z rod", "Zigzag bar"],
  },
  dumbbells: {
    purpose: "A weight in each hand for presses, rows, curls and lunges",
    identification:
      "Short one-handed bars with a weight at each end, racked in pairs in rising steps; adjustable ones take small plates and collars, or change weight with a dial.",
    aliases: ["DB", "Hand weights"],
  },
  kettlebells: {
    purpose: "Swings, goblet squats, carries and presses",
    identification:
      "A cast-iron ball with a flat base and a thick handle looped over the top, so the weight hangs below your hand rather than either side of it as on a dumbbell.",
    aliases: ["KB"],
  },
  trap_bar: {
    purpose: "Deadlifts, shrugs and carries, easier on the lower back",
    identification:
      "An open hexagon or diamond of steel that you stand inside, with a handle at each side and sleeves for plates; many have a second, raised pair of handles.",
    aliases: ["Hexagonal bar", "Shrug bar", "Diamond bar"],
  },
  weight_plates: {
    purpose: "Loads bars and machines, or is held for raises and carries",
    identification:
      "Flat iron or rubber discs that slide onto a bar or a machine's plate horn through a centre hole, with the weight marked on the face.",
    aliases: ["Discs", "Bumper plates", "Olympic plates"],
  },
  medicine_ball: {
    purpose: "Throws, slams, twists and carries",
    identification:
      "A heavy ball about the size of a football, rubber or leather, often with its weight printed on it; far smaller and heavier than a stability ball.",
    aliases: ["Med ball", "Slam ball", "Wall ball"],
  },
  resistance_bands: {
    purpose: "Elastic resistance for warm-ups, pull-aparts and assisted pull-ups",
    identification:
      "Stretchy rubber loops or tubes, colour-coded by strength: long flat loops, small mini bands that go round the legs, or tubes with a handle at each end.",
    aliases: ["Loop bands", "Mini bands", "Power bands", "Resistance tubes", "Exercise bands"],
  },
  landmine: {
    purpose: "Presses, rows and twists with a pivoting barbell",
    identification:
      "A swivelling sleeve, on a floor plate or a rack upright, that holds one end of a barbell while you lift the other.",
    aliases: [],
  },
  safety_squat_bar: {
    purpose: "Squats that are kinder to stiff shoulders",
    identification:
      "A barbell with a padded yoke that sits on your shoulders and two handles reaching forward, so you hold them in front of you rather than gripping the bar.",
    aliases: ["SSB", "Safety bar", "Yoke bar"],
  },
  swiss_bar: {
    purpose: "Presses, rows and curls with a neutral grip",
    identification:
      "A long, flat, ladder-like frame with short handles across it, so the palms face each other at two or three widths; the ends take plates.",
    aliases: ["Multi-grip bar", "Neutral-grip bar"],
  },
  farmers_handles: {
    purpose: "Heavy carries and holds, for grip and trunk",
    identification:
      "A pair of long bars, each with a grip in the middle and a sleeve or frame for plates, lifted one beside each hip like heavy suitcases.",
    aliases: ["Farmer's carry handles", "Farmer's bars"],
  },

  // --- Bodyweight --------------------------------------------------------------------------
  pull_up_bar: {
    purpose: "Pull-ups, chin-ups and hanging leg raises",
    identification:
      "A fixed bar above head height, on a rack, a wall or a frame of its own, often with angled or neutral-grip handles at the ends.",
    aliases: ["Chin-up bar", "Chinning bar"],
  },
  bodyweight: {
    purpose: "No equipment: your own body weight",
    identification:
      "Nothing to find: a clear patch of floor is enough, with a mat or a wall for some exercises.",
    aliases: [],
  },
  dip_station: {
    purpose: "Dips, leg raises and L-sits",
    identification:
      "Two parallel bars at about hip height, free-standing or on a rack or wall, that you hold to lift yourself between them; no seat, pads or weight stack.",
    aliases: ["Dip bars", "Parallel bars", "Dip stand"],
  },
  gymnastic_rings: {
    purpose: "Dips, rows, push-ups and pull-ups, with the hands free to turn",
    identification:
      "Two wooden or plastic rings on long adjustable straps, hung from a bar or beam and free to swing; a suspension trainer has handles and foot loops instead.",
    aliases: ["Rings", "Gym rings"],
  },
  suspension_trainer: {
    purpose: "Rows, push-ups and lunges at any difficulty",
    identification:
      "Two adjustable nylon straps from one anchor overhead, each ending in a handle with a foot loop; how far you lean sets how hard it is.",
    aliases: ["Suspension straps"],
  },
  captains_chair: {
    purpose: "Knee and leg raises without swinging",
    identification:
      "An upright frame with a tall back pad and padded armrests with handles; you rest on your forearms, legs hanging free. A back-extension bench, also called a Roman chair, has you lie face down.",
    aliases: [
      "Roman chair",
      "Vertical knee raise station",
      "VKR",
      "Leg raise station",
      "Power tower",
    ],
  },
  plyo_box: {
    purpose: "Box jumps, step-ups and box squats",
    identification:
      "A sturdy box of wood, steel or dense foam, often a different height on each side, that you jump or step onto.",
    aliases: ["Jump box", "Plyometric box"],
  },
  parallettes: {
    purpose: "Push-ups, dips and L-sits with the wrists straight",
    identification:
      "A pair of short, low bars on feet, from a few centimetres to a forearm's length off the floor, used one under each hand.",
    aliases: ["P-bars", "Push-up bars"],
  },
  stability_ball: {
    purpose: "Rollouts, crunches, hamstring curls and balance work",
    identification:
      "A large inflatable ball, roughly knee to hip height and light enough to lift with one hand; a medicine ball is small and heavy.",
    aliases: ["Swiss ball", "Exercise ball", "Gym ball", "Fitness ball", "Physio ball"],
  },

  // --- Machines: pressing and pulling -------------------------------------------------------
  smith_machine: {
    purpose: "Squats and presses with the bar on a guided path",
    identification:
      "A barbell fixed to two upright rails in a frame, so it slides only along them; you rack it by twisting it onto hooks on the frame. In a power rack the bar is free.",
    aliases: ["Smith rack"],
  },
  chest_press_machine: {
    purpose: "Presses the weight away from the chest while seated",
    identification:
      "An upright seat and back pad with two handles at chest height that move straight forward, loaded by a pin in a weight stack; on a shoulder press the handles go up.",
    aliases: ["Seated chest press"],
  },
  incline_press_machine: {
    purpose: "Presses at an incline, for the upper chest",
    identification:
      "A reclined seat with handles that drive up and forward at an angle between a chest press and a shoulder press, often on separate plate-loaded arms.",
    aliases: ["Incline chest press"],
  },
  shoulder_press_machine: {
    purpose: "Presses the weight overhead while seated",
    identification:
      "An upright seat with two handles at shoulder height that move straight up, loaded by a weight stack; on a chest press the handles go forward.",
    aliases: ["Overhead press machine", "Military press machine", "Seated shoulder press"],
  },
  dip_machine: {
    purpose: "Takes some of your weight off for dips",
    identification:
      "Dip handles above a padded platform you kneel or stand on, which the stack pushes up, so more weight makes it easier; many also have pull-up handles.",
    aliases: ["Dip assist machine"],
  },
  triceps_dip_machine: {
    purpose: "Seated dips for the triceps",
    identification:
      "You sit against a back pad, held down by a thigh pad or belt, and push two handles from beside your ribs down to your hips; the stack adds load, not assistance.",
    aliases: ["Triceps dip machine", "Seated triceps dip"],
  },
  iso_lateral_press: {
    purpose: "Chest presses with each arm working on its own",
    identification:
      "A seat between two separate lever arms, each with its own handle and plate horn; a chest press machine uses a weight stack instead.",
    aliases: ["Plate-loaded chest press", "Iso chest press"],
  },
  iso_lateral_row: {
    purpose: "Rows with each arm working on its own",
    identification:
      "A chest pad and seat facing two separate lever arms, each with its own handle and plate horn; on a chest-supported row machine the handles move together.",
    aliases: ["Plate-loaded row", "Iso row"],
  },
  shrug_machine: {
    purpose: "Heavy shrugs for the upper traps",
    identification:
      "You stand between two low handles on plate-loaded lever arms, or under padded shoulder levers, and lift the load a few centimetres by shrugging.",
    aliases: [],
  },

  // --- Cables --------------------------------------------------------------------------------
  cable_station: {
    purpose: "Pulls and presses on a cable from any height",
    identification:
      "One weight stack with a pulley that slides up and down a column, or fixed high and low pulleys, taking clip-on handles, ropes and bars. A crossover has two towers.",
    aliases: ["Cable machine", "Cable tower", "Cable column", "Pulley machine"],
  },
  cable_crossover: {
    purpose: "Cable flies and pulls with a handle in each hand",
    identification:
      "Two tall towers set well apart, each with its own weight stack and adjustable pulley, joined overhead by a frame that often carries a pull-up bar; you stand between them.",
    aliases: ["Crossover machine"],
  },
  functional_trainer: {
    purpose: "Cable work at any height, one arm or both",
    identification:
      "One compact frame with two weight stacks side by side and a pulley arm on each that swivels and slides to any height; a crossover's towers stand far apart.",
    aliases: ["Dual adjustable pulley", "Dual pulley machine", "Dual cable machine"],
  },
  seated_row_cable: {
    purpose: "Seated rows, pulling a low cable handle to the waist",
    identification:
      "A fixed seat or long low bench with a footplate, facing a pulley at about waist height on a weight stack. Unlike a rower's, the seat does not slide.",
    aliases: ["Seated row", "Low row", "Seated rowing"],
  },
  lat_pulldown: {
    purpose: "Pulls a bar down to the chest, for the lats and upper back",
    identification:
      "A seat with padded rollers over your thighs under a high pulley and a long bar; many share the stack with a low row.",
    aliases: ["Lat machine", "Lat pull", "Pulldown machine"],
  },
  chest_supported_row_machine: {
    purpose: "Rows without loading the lower back",
    identification:
      "You sit or stand facing a chest pad and pull handles back towards your ribs, loaded by plates or a stack. A seated cable row has no chest pad.",
    aliases: ["Seated row machine", "Machine row"],
  },
  assisted_pullup: {
    purpose: "Takes some of your weight off for pull-ups and chin-ups",
    identification:
      "Pull-up handles above a padded platform you kneel or stand on, which the stack pushes up, so more weight makes it easier; many also have dip handles.",
    aliases: ["Assisted chin-up machine"],
  },
  t_bar_row: {
    purpose: "Heavy rows for the upper back, bent over or chest down",
    identification:
      "A long lever hinged at the floor at one end, with plates and a crossbar of handles at the other; you straddle it, or lie on an incline chest pad, and row it up.",
    aliases: [],
  },
  pullover_machine: {
    purpose: "Works the lats with straight-arm pullovers",
    identification:
      "You sit belted in and push a bar or padded elbow levers from behind your head down to your waist, turning about the shoulders, against a weight stack.",
    aliases: ["Lat pullover machine"],
  },

  // --- Machines: shoulders, chest and arms ---------------------------------------------------
  pec_deck: {
    purpose: "Chest flies, and reverse flies for the rear delts",
    identification:
      "A tall seat between two swinging arms with handles or upright elbow pads, which meet in front of your chest; for reverse flies you sit facing the back pad.",
    aliases: ["Butterfly machine", "Pec fly machine", "Chest fly machine", "Fly machine"],
  },
  rear_delt_machine: {
    purpose: "Reverse flies for the backs of the shoulders",
    identification:
      "You sit facing a chest pad and sweep two handles out and back to your sides, and that is all it does; a pec deck does the same with you facing its back pad.",
    aliases: ["Reverse fly machine", "Rear deltoid machine", "Reverse pec deck"],
  },
  lateral_raise_machine: {
    purpose: "Raises the arms out to the sides, for the side delts",
    identification:
      "A seat with two padded arms beside you that rest against your upper arms and swing up to shoulder height, loaded by a stack or plates.",
    aliases: ["Side raise machine"],
  },
  preacher_bench: {
    purpose: "Strict curls with a bar or dumbbells, upper arms braced",
    identification:
      "A seat facing a sloped pad at chest height, often with uprights to rest a bar on; no lever and no weight stack.",
    aliases: ["Preacher bench", "Scott bench"],
  },
  preacher_curl_machine: {
    purpose: "Preacher curls with the load on a lever",
    identification:
      "A seat facing a sloped arm pad, with handles on a lever that swings up as you curl, loaded by a stack or plates; a preacher bench is just a pad for a bar.",
    aliases: [],
  },
  biceps_curl_machine: {
    purpose: "Curls against a weight stack, upper arms braced",
    identification:
      "You sit with your upper arms on a pad in front of you and curl two handles that pivot in line with your elbows; on a preacher curl machine you lean over a high, sloped pad.",
    aliases: ["Arm curl machine"],
  },
  triceps_extension_machine: {
    purpose: "Straightens the elbows against a lever, for the triceps",
    identification:
      "A seat facing a sloped pad for your upper arms, with handles or a pad on a lever beyond it that you push down and away; a seated dip machine's handles are at your sides.",
    aliases: ["Arm extension machine"],
  },
  wrist_curl_machine: {
    purpose: "Wrist curls against a light stack, for the forearms",
    identification:
      "A small seat with a flat pad for your forearms and a short handle just past its edge that only your wrists move.",
    aliases: ["Forearm machine"],
  },

  // --- Machines: legs -------------------------------------------------------------------------
  leg_press_45: {
    purpose: "Pushes a sled of plates away with the legs",
    identification:
      "You sit reclined in a low seat and push a footplate on a sled that runs up rails at about 45°, loaded with plates on its horns; on a hack squat you stand with pads on your shoulders.",
    aliases: ["Incline leg press", "Angled leg press", "Sled leg press"],
  },
  leg_press_horizontal: {
    purpose: "Pushes a footplate away with the legs, on a weight stack",
    identification:
      "You sit nearly upright and push a vertical footplate straight ahead; either the seat slides back on a rail or the plate moves away.",
    aliases: ["Seated leg press"],
  },
  leg_extension: {
    purpose: "Straightens the knees against a padded lever, for the quads",
    identification:
      "An upright seat with a padded roller in front of your ankles on a lever that swings up; on a seated leg curl the roller sits behind your calves.",
    aliases: ["Quad extension machine", "Knee extension machine"],
  },
  leg_curl_seated: {
    purpose: "Bends the knees against a padded lever, for the hamstrings",
    identification:
      "You sit with your legs out straight, a pad clamped over your thighs and a roller behind your calves, and press it down and back; a leg extension's roller is in front.",
    aliases: ["Seated hamstring curl"],
  },
  leg_curl_lying: {
    purpose: "Bends the knees against a padded lever, for the hamstrings",
    identification:
      "A padded bench you lie on face down, often bent at the hips, with your ankles under a roller that you curl up behind you; loaded by a stack or plates.",
    aliases: ["Leg curl bench", "Prone leg curl", "Lying hamstring curl", "Hamstring curl machine"],
  },
  leg_curl_standing: {
    purpose: "Bends one knee at a time against a padded lever, for the hamstrings",
    identification:
      "You stand on a platform leaning on a pad, with a roller behind one ankle; kneeling versions have a knee pad instead.",
    aliases: ["Standing hamstring curl", "Kneeling leg curl"],
  },
  hip_abduction: {
    purpose: "Pushes the knees apart against pads, for the outer hips",
    identification:
      "A seat with pads against the outside of your knees that swing outwards; on the adduction machine the pads are inside. Often one machine does both.",
    aliases: ["Abductor machine", "Outer thigh machine"],
  },
  hip_adduction: {
    purpose: "Squeezes the knees together against pads, for the inner thighs",
    identification:
      "A seat with pads against the inside of your knees that swing inwards; on the abduction machine the pads are outside. Often one machine does both.",
    aliases: ["Adductor machine", "Inner thigh machine"],
  },
  calf_raise_machine: {
    purpose: "Raises the heels against a heavy load, for the calves",
    identification:
      "A block to stand on under two padded shoulder rests, on a lever or a weight stack; the seated calf raise machine has its pad on your knees instead.",
    aliases: ["Calf machine"],
  },
  seated_calf_raise: {
    purpose: "Raises the heels with bent knees, for the lower calves",
    identification:
      "You sit with the balls of your feet on a footrest and a padded lever across your thighs just above the knees, loaded with plates.",
    aliases: [],
  },
  hip_thrust_machine: {
    purpose: "Hip thrusts without setting up a barbell and bench",
    identification:
      "You sit with your upper back on a low pad and your feet on a platform, under a padded belt or lever, and drive your hips up; loaded by plates or a stack.",
    aliases: ["Glute bridge machine"],
  },
  glute_kickback_machine: {
    purpose: "Kicks one leg back against a lever, for the glutes",
    identification:
      "A frame you stand or kneel in, chest or forearms on a pad, with a footplate or padded lever behind one leg.",
    aliases: ["Glute machine"],
  },
  hack_squat: {
    purpose: "Squats down fixed rails, back supported",
    identification:
      "You stand on an angled footplate with your back on a sled and pads on your shoulders; on a 45° leg press you sit and push a sled away.",
    aliases: ["Squat machine"],
  },
  belt_squat: {
    purpose: "Squats with nothing on your back or shoulders",
    identification:
      "A raised platform you stand on, with a belt round your hips hooked to a lever or chain below and handles to hold for balance.",
    aliases: [],
  },
  glute_ham_raise: {
    purpose: "Glute-ham raises and back extensions with the feet locked in",
    identification:
      "A long, flat frame with a footplate and ankle hooks at one end and a large rounded thigh pad; a back-extension bench is shorter, often at 45°, with a flat hip pad.",
    aliases: ["GHD", "GHR bench", "Glute-ham bench"],
  },
  pendulum_squat: {
    purpose: "Deep squats with your back and shoulders braced",
    identification:
      "You stand on a platform with your back on a pad, and squat as a long lever swings in an arc behind you; a hack squat slides on straight rails.",
    aliases: [],
  },
  sissy_squat_bench: {
    purpose: "Knees-forward squats that load the quads",
    identification:
      "A small frame with a foot platform, a pad against the front of your shins and a roller behind your ankles; you lean back and lower your knees towards the floor.",
    aliases: [],
  },
  leg_press_vertical: {
    purpose: "Pushes a sled straight up with the legs",
    identification:
      "You lie flat on your back with the footplate above you on vertical rails, loaded with plates; a 45° leg press has you sitting, the sled at an angle.",
    aliases: [],
  },
  reverse_hyper: {
    purpose: "Swings the legs up behind you, for the glutes and lower back",
    identification:
      "You lie face down on a high pad, hips at its edge, holding handles, with your legs hanging from a loaded pendulum; on a back-extension bench your torso moves instead.",
    aliases: [],
  },
  calf_block: {
    purpose: "A raised edge so your heels can drop below your toes",
    identification:
      "A low wooden or rubber block or step with a bevelled front edge, sometimes with an upright handle to hold for balance.",
    aliases: [],
  },

  // --- Machines: core and back ----------------------------------------------------------------
  ab_crunch_machine: {
    purpose: "Crunches against a weight stack",
    identification:
      "A seat with rollers to hook your feet under and handles by your head or pads at your chest that move forward and down as you curl.",
    aliases: ["Abdominal machine", "Crunch machine"],
  },
  back_extension_machine: {
    purpose: "Extends the lower back against a weight stack",
    identification:
      "An upright seat and footplate with a padded bar behind your upper back that swings back as you straighten; a back-extension bench uses your body weight.",
    aliases: ["Lower back machine", "Seated back extension", "Lumbar extension machine"],
  },
  back_extension_bench: {
    purpose: "Back extensions for the lower back, glutes and hamstrings",
    identification:
      "You lie face down at 45° or flat, hips on a pad and ankles under rollers, and bend and straighten at the hips; a captain's chair, also called a Roman chair, is upright.",
    aliases: [
      "Roman chair",
      "Hyperextension bench",
      "45° back extension",
      "Hyperextension machine",
    ],
  },
  torso_rotation_machine: {
    purpose: "Twists the trunk against a weight stack, for the obliques",
    identification:
      "A seat with pads to hold your hips or legs and a chest pad or handles; either your torso turns or the seat turns under you.",
    aliases: ["Rotary torso"],
  },

  // --- Benches, racks and accessories ---------------------------------------------------------
  flat_bench: {
    purpose: "A bench for presses, rows and step-ups",
    identification:
      "A padded bench about knee height that stays level; some have uprights to rack a bar. An adjustable bench has a back pad that tilts up.",
    aliases: ["Weight bench", "Utility bench", "Bench press station"],
  },
  adjustable_bench: {
    purpose: "Incline, flat and seated work on one bench",
    identification:
      "A padded bench whose back pad tilts in steps from flat to upright, often with a seat pad that tilts too; a flat bench stays level.",
    aliases: ["Incline bench", "FID bench", "Multi-adjustable bench"],
  },
  decline_bench: {
    purpose: "Decline presses for the lower chest",
    identification:
      "A bench set head-down with rollers at the high end to hook your legs under, often with uprights to rack a bar; a decline ab bench is narrower, for sit-ups.",
    aliases: [],
  },
  power_rack: {
    purpose: "Holds the barbell for squats and presses, and catches a missed rep",
    identification:
      "A steel frame of four or two uprights with hooks to rest a bar on and safety arms to catch it; the bar is free, unlike a Smith machine's, which runs on rails.",
    aliases: ["Power cage", "Squat cage", "Half rack", "Squat stands"],
  },
  ab_wheel: {
    purpose: "Rollouts from the knees or feet, for the core",
    identification: "A small wheel, sometimes doubled, with a handle sticking out on each side.",
    aliases: ["Ab roller", "Ab rollout wheel"],
  },
  dip_belt: {
    purpose: "Hangs extra weight from your hips for dips and pull-ups",
    identification:
      "A wide padded belt with a chain or strap at the front that threads through plates or a kettlebell.",
    aliases: ["Dipping belt", "Chain belt"],
  },
  foam_roller: {
    purpose: "Rolls out tight muscles and mobilises the upper back",
    identification:
      "A firm foam cylinder about forearm length or longer, smooth, ridged or knobbly.",
    aliases: ["Massage roller", "Muscle roller"],
  },
  jump_rope: {
    purpose: "Skipping, for conditioning and warm-ups",
    identification: "A light rope or cable with a handle at each end; some are weighted.",
    aliases: ["Skipping rope", "Speed rope"],
  },
  decline_ab_bench: {
    purpose: "Decline sit-ups and crunches",
    identification:
      "A narrow head-down bench with rollers or a foot hook at the high end and no bar uprights; many adjust to steeper angles.",
    aliases: ["Sit-up bench", "Ab bench", "Crunch bench"],
  },
  wrist_roller: {
    purpose: "Winds a hanging weight up and down, for the forearms",
    identification:
      "A short bar with a cord tied to its middle and a plate or weight on the cord's end; some are fixed to a wall or rack.",
    aliases: ["Forearm roller"],
  },
  grip_trainer: {
    purpose: "Builds grip strength",
    identification:
      "A small handheld spring, usually two handles joined by a coil, that you squeeze shut; some adjust the tension.",
    aliases: ["Hand gripper", "Grip strengthener", "Hand grip"],
  },
  weight_vest: {
    purpose: "Adds weight to your body for push-ups, pull-ups and walks",
    identification:
      "A snug vest with pockets for small weights or sand, worn like a jacket so the load spreads over your chest and back.",
    aliases: ["Weighted vest"],
  },
  battle_ropes: {
    purpose: "Waves and slams with a heavy rope, for conditioning",
    identification:
      "A long, thick rope looped round an anchor, a post or a weight, so you hold one end in each hand.",
    aliases: ["Conditioning ropes", "Heavy ropes"],
  },
  sled: {
    purpose: "Heavy pushes and drags across turf or a track",
    identification:
      "A metal sled on flat runners with a post for plates, pushed by tall or low poles or dragged by a strap or harness.",
    aliases: ["Push sled", "Drag sled", "Weight sled"],
  },

  // --- Cardio ----------------------------------------------------------------------------------
  treadmill: {
    purpose: "Walks and runs at a set speed and incline",
    identification:
      "A long moving belt between two side rails with a console at the front; curved ones have no motor and are driven by your own feet.",
    aliases: ["Running machine"],
  },
  bike: {
    purpose: "Steady pedalling at a set resistance",
    identification:
      "A fixed bike with a padded seat, pedals and a console: the upright one is like a bicycle, the recumbent one has a backrest and pedals in front. A spin bike has a heavy front flywheel.",
    aliases: ["Exercise bike", "Static bike", "Upright bike", "Recumbent bike", "Exercise cycle"],
  },
  spin_bike: {
    purpose: "Studio-style cycling, seated or out of the saddle",
    identification:
      "A bike-like frame with a weighted flywheel at the front, a narrow saddle, raised handlebars and a resistance knob; usually no screen.",
    aliases: ["Indoor cycle", "Indoor cycling bike"],
  },
  air_bike: {
    purpose: "Hard intervals with arms and legs together",
    identification:
      "A bike with a large fan in place of a front wheel and moving handlebars that you push and pull as you pedal; the harder you go, the harder it gets.",
    aliases: ["Fan bike"],
  },
  rowing_machine: {
    purpose: "Full-body rowing strokes, for conditioning",
    identification:
      "A long low rail with a sliding seat, foot straps and a handle on a chain or strap from a flywheel or water tank at the front; a seated cable row's seat stays put.",
    aliases: ["Rower", "Indoor rower", "Rowing ergometer", "Erg"],
  },
  elliptical: {
    purpose: "Low-impact striding, arms and legs together",
    identification:
      "Two long foot pedals that glide in an oval path while two tall handles swing back and forth with them; your feet never leave the pedals.",
    aliases: ["Cross trainer", "Elliptical trainer"],
  },
  stair_climber: {
    purpose: "Climbs stairs on the spot, for conditioning",
    identification:
      "A short revolving staircase between handrails, or two pedals that sink as you step on them.",
    aliases: ["Stair stepper", "Stepper", "Step machine", "Stair machine"],
  },
  ski_erg: {
    purpose: "Pulls two handles down from overhead, like cross-country skiing",
    identification:
      "A tall, narrow upright unit on a floor stand or a wall, with two handles on cords that come down from a fan at the top.",
    aliases: ["Ski ergometer", "Ski machine"],
  },
};
