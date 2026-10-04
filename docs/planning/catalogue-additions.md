# Catalogue additions: research and proposals

Date: 4 October 2026. Status: proposals only. Nothing here is in the manifests yet. Each approved item ships as a draft (`review: "draft"`), and the owner approves each one separately.

This answers the plan's call for missing common machines and exercises ([catalogue reconciliation and expansion](ONBOARDING_EQUIPMENT_TECHNIQUE_PLAN.md#catalogue-reconciliation-and-expansion)). It is not a bulk import, and it has no target count. Classes used throughout: (a) a type that is genuinely missing, (b) an exercise that is genuinely missing, (c) a common combination machine, (d) an alias of an existing item, (e) out of scope. Tiers: 1 is the recommended first batch, 2 is next, 3 is only if wanted.

## 1. Method and sources

**Who the users are: an inference.** The owner's users are taken to train mostly in India. Nobody measured this; it is inferred from the repository:

- [ADR 0002](../decisions/0002-supabase-drizzle-rls.md) records the owner confirming the `Asia/Kolkata` time zone and three gyms: Anytime Fitness, Samsung Gym and Society Gym (a housing-society gym). The test fixtures still use those three (`src/db/test/fixtures.ts`).
- The coach's schedule is fixed to Asia/Kolkata (`COACH_TIME_ZONE` in `src/domain/coach-cadence.ts`), and several server fallbacks use that zone.
- New profiles have defaulted to UTC since migration 0006. The time zone alone therefore says nothing about other users.

The research covers Indian chains (Cult, Gold's Gym India, Anytime Fitness India, Snap Fitness, Talwalkars, Fitness First India) as well as local independent and housing-society gyms.

**What was checked**

1. **The current catalogue.** I read this branch's working tree by importing the manifests; no database, seeder or migration was run. It holds:
   - 93 types and 276 exercises;
   - the plan's three combinations, already drafted in `equipment-combinations.ts`;
   - the aliases in `equipment-descriptions.ts` and `exercise-aliases.ts`;
   - the presets and the gym basics.

   Another session was editing these files during the research, so the cross-check reflects their state at about 20:40 on 4 October. I searched for every candidate by name, slug and synonym.
2. **What the chains say they use:**
   - Gold's Gym India: Life Fitness and Hammer Strength [C1].
   - Cult gyms: Life Fitness, Precor and Matrix [C2].
   - Anytime Fitness: Precor's global supply deal, which names Vitality "dual-use" machines but not India [C3].
   - Fitness First Delhi: Technogym, 2009 [C4].
   - Talwalkars: Nautilus, 2007 [C5].
3. **Those suppliers' selectorised lines that include dual machines:** Precor Vitality [M1] and Life Fitness Optima [M3], plus pages for specific Life Fitness, Hammer Strength and Matrix machines.
4. **Indian makers that supply independent gyms:**
   - Jerai Fitness's catalogue: Club Line Plus, Falcon, Load-On (plate-loaded), and benches and racks [J1–J4].
   - Energie Fitness and dozens of local makers, through IndiaMart's category and search listings. These also show the names local sellers use.
5. **Exercises:** Cult.fit's HRX page [C6], the ACE exercise library, and sources on traditional Indian training.

**Rule for proposing**

- **Machines.** I propose a machine when all three of these hold:
  - it is a separate machine design or movement;
  - it appears in a chain supplier's line and also in Indian makers' listings (otherwise the table names the side that is unverified);
  - nothing in the catalogue covers it under another name.
- **Exercises.** I propose an exercise when it is a distinct movement whose load means something different from anything in the library, and a reputable description of it exists.
- **Evidence limits.** Listings show what is sold, not how many gyms own it. No usage or failed-search data exists, and none is implied.

**Not verified**

- **Analytics and reports.** No analytics, failed-search logs or user reports of missing items exist in the repository.
- **Gym inventories.** I could not check any real gym's machines, including the owner's three. Chains publish brands, not machine lists. Fitpass pages give no machine list [O4], Justdial refused access (HTTP 403), and I did not examine Google listings.
- **Forums.** Reddit is blocked to the research tools (HTTP 403), and Quora gave only generic advice. Local names here therefore come from sellers' listings, not from gym-goers.
- **Chain suppliers:**
  - I found no source for Snap Fitness India's equipment supplier.
  - Precor's 2018 deal covers Anytime Fitness in "all 32 countries" without naming India.
  - The Talwalkars and Fitness First sources are old.
- **IndiaMart.** Its product pages were rate-limited (HTTP 429), so the evidence comes from its category and search pages.
- **Technogym.** Its pages were unreachable, so it is not cited.

## 2. Proposals

The three combinations already drafted (`lat_pulldown_low_row`, `assisted_dip_chin`, `leg_extension_curl`) are not proposed again. The research confirms them: [M1], [M3]–[M5], [J8], [J10], [J12], [IM1] and [IM2] all list them. Extra local names for them are in section 3.

### 2.1 Equipment types (class a)

| Tier | Slug | Name | Local names and aliases | Category | Default mode | Purpose | What a beginner can see | Who has it |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `seated_row_machine` | Seated row machine | Low row machine; Seated rowing machine; Vertical row; Pin-loaded seated row | machine | selectorized | Rows to the ribs from a seat, chest on a pad, against a weight stack | A seat and an upright chest pad facing two handles at chest height, with a stack beside it. No footplate or long cable, and no plate horns | Both. Precor Vitality Seated Row, with an adjustable chest pad [M1][M2]; Life Fitness Optima Seated Row [M3]; Jerai Seated Row and Vertical Row [J5][J6]; local pin-loaded seated row and low row listings [IM6][IM1] |
| 1 | `flat_bench_press_station` | Flat bench press station | Olympic flat bench; Bench press bench; Bench press machine; Flat bench press | accessory | bodyweight | A flat bench with built-in bar holders for the barbell bench press | A flat padded bench with two uprights holding the bar at the head end, often with a spotter step. The back does not tilt, and it is not a cage | Both. Hammer Strength Olympic Flat Bench [M6] (Gold's [C1]); Jerai Olympic Flat Bench [J16]; many local listings [IM7] |
| 1 | `incline_bench_press_station` | Incline bench press station | Olympic incline bench; Incline bench press bench | accessory | bodyweight | A fixed incline bench with bar holders for incline barbell pressing | A fixed backrest at about 30–45° with a seat and uprights behind the head, often with a spotter platform | Both. Hammer Strength Olympic Incline Bench [M7]; Jerai Olympic Incline Bench and Flat & Incline Combo Bench [J17][J18]; local listings [IM7] |
| 2 | `military_press_bench` | Military press bench | Olympic military bench; Shoulder press bench | accessory | bodyweight | An upright seat with bar holders for the seated barbell shoulder press | A near-vertical back pad and seat with uprights above shoulder height, often with a footrest | Mostly chains. Hammer Strength Olympic Military Bench [M8]; one local "Gym Military Bench" listing [IM8] |
| 2 | `decline_press_machine` | Decline press machine | Decline chest press; Iso-lateral decline press | machine | plate_loaded | Presses forward and down from a reclined seat, for the lower chest | A seat with a thigh roller and a reclined back pad. The handles start at lower-chest height and move down and forward, usually on two plate-loaded arms | Both. Hammer Strength Iso-Lateral Decline Chest Press [M9]; Jerai Isolateral Decline Press [J19]; local "iso-lateral decline" and "seated decline chest press" listings [IM9][IM26] |
| 2 | `lever_squat_machine` | Lever squat machine | V-squat; Super squat; Power squat; Leverage squat | machine | plate_loaded | Plate-loaded squats with the shoulder pads on a pivoting lever | A standing platform with shoulder pads at the end of a long lever hinged at the far end, plates on the lever. It has no sled on rails (unlike the hack squat) and no swinging back pad (unlike the pendulum squat) | Mostly independents. Jerai Power Squat [J21]; local "Super squat", "V squat" and "Power squat" listings [IM11][IM22]. Chains not verified |
| 2 | `high_row_machine` | High row machine | Iso-lateral high row | machine | plate_loaded | Pulls handles down and back from overhead, for the upper back | A seat with thigh pads under two handles set high in front, on separate plate-loaded lever arms | Both. Hammer Strength Iso-Lateral High Row [M10]; Jerai Isolateral High Row [J20]; one local plate-loaded high row listing [IM6] |
| 3 | `multi_hip_machine` | Multi-hip machine | Multi hip; Total hip; Hip machine; Rear kick machine | machine | selectorized | Moves one leg forward, back, out or in against a rotating pad, standing | A standing platform with hand grips and one padded lever at thigh height, whose pivot at hip level turns to four positions | Independents. Energie Fitness ER-67, BMW-016 and TNT-016, and SportsArt "Total Hip" listings [IM12][IM19]. Chains not verified |

Why `seated_row_machine` is a type and not an alias. The working tree currently gives "Seated row machine" as an alias of `chest_supported_row_machine`, a plate-loaded type.

- Every selectorised line sells this machine as its own item, beside a separate cable row: [M1], [M3], [J5]–[J7], and Matrix's Aura line.
- The plan treats selectorised and iso-lateral chest presses as different members of one family.
- Onboarding and "Available" register a machine with its type's defaults. A stack machine registered as `chest_supported_row_machine` would therefore start out plate-loaded.
- If the owner prefers fewer types, the fallback is to keep the alias and make `chest_supported_row_machine`'s default resistance mode selectorised.

Why the two bench press stations are types. A bench press station holds the bar on its own uprights.

- **Gyms.** Benches and racks are assumed basics, so nothing changes there.
- **Home and outdoors.** Nothing is assumed there, and a station cannot be recorded today. `barbell-bench-press` now needs `[barbell, flat_bench, power_rack]`, so the only way to enter one is as a flat bench plus a power rack. That also makes `high-bar-squat` (`[barbell, power_rack]`) look available.
- **Decline bench.** The existing `decline_bench` already works as a station: `decline-barbell-bench` needs only `[barbell, decline_bench]`. It needs only the alias "Olympic decline bench".

### 2.2 Combination machines (class c)

The first member type is the display type. Members are existing slugs.

| Tier | Slug | Name | Member types | Local names and aliases | Purpose | What a beginner can see | Who has it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `leg_extension_lying_curl` | Leg extension and lying curl | `leg_extension`, `leg_curl_lying` | Leg extension and prone leg curl; Leg curl extension machine | Extensions sitting up, curls lying face down, on one machine | A bench whose back pad flips down to lie on for curls and props up for extensions, with rollers at the foot end. Often plate-loaded in local gyms | Mostly independents. Jerai Falcon Leg Curl / Extension Combo (the backrest flips down for curls) [J9]; local "Leg Extension & Prone Leg Curl" and "Leg Extension Lying Leg Curl" listings [IM3]; a plate-loaded "Leg Curl Extension Machine" [IM22] |
| 1 | `hip_abduction_adduction` | Hip abduction and adduction | `hip_abduction`, `hip_adduction` | Abductor adductor machine; Inner and outer thigh machine; Hip abductor adductor | Pushes the knees apart, or squeezes them together, from one seat | One seat with pads that sit outside or inside the knees, and a lever that swaps them | Both. Precor Vitality Inner / Outer Thigh [M1]; Life Fitness Optima Hip Abductor/Adductor [M3]; Jerai Adductor/Abductor combo, in all four of its selectorised lines [J13]; many local listings [IM4] |
| 1 | `multi_press` | Multi-press | `chest_press_machine`, `incline_press_machine`, `shoulder_press_machine` | Multi press machine; Chest and shoulder press machine; Multi chest press | Chest, incline and shoulder presses from one seat and stack | One seat facing a pressing arm that adjusts, or offers several grips, for flat, incline and overhead pressing | Both. Precor Vitality Multi-Press, "three machines in one" [M1]; Life Fitness Optima Multi Press [M3]; Jerai Multi Press [J11]; many local listings [IM14] |
| 1 | `leg_press_hack_squat` | Leg press and hack squat | `leg_press_45`, `hack_squat` | Leg press cum hack squat; Hack squat leg press; Leg press with hack squat | 45° leg presses sitting and hack squats standing, on one sled | An angled sled on rails with a large footplate: sit in the seat to press, or stand under the shoulder pads to squat | Mostly independents. Jerai Load-On combo [J15]; a seller's Matrix Aura "Leg Press And Hack Squat" and many local makers [IM25][IM27] |
| 1 | `biceps_triceps_machine` | Biceps and triceps machine | `biceps_curl_machine`, `triceps_extension_machine` | Bicep tricep machine; Biceps triceps machine | Curls and triceps extensions from one seat and stack | One seat with a sloped arm pad and a lever with grips to curl up or push down | Both. Precor Vitality Biceps Curl / Triceps Extension [M1]; Life Fitness Optima Biceps/Triceps [M3]; Energie Fitness ER-0607 and EFT-0607 and many local listings [IM5] |
| 1 | `knee_raise_dip_pull_up_tower` | Knee raise, dip and pull-up tower | `captains_chair`, `dip_station`, `pull_up_bar` | Power tower; Vertical knee raise dip chin; Knee raise dip chin station; Chin dip leg raise station | Knee raises, dips and pull-ups on one bodyweight frame | A tall frame with a back pad and forearm pads, dip handles at hip height and a pull-up bar on top. No weight stack | Both. Life Fitness Optima Dip/Leg Raise [M3]; Jerai Vertical Knee Up AB Dip Chin [J14]; many local listings [IM10]; Body-Solid VKR sold in India [O1]. Most useful at home and outdoors |
| 2 | `ab_crunch_back_extension` | Ab crunch and back extension | `ab_crunch_machine`, `back_extension_machine` | Ab and back machine; Low back abdominal | Crunches forward and extends the back, from one seat | One seat with a chest pad or overhead handles to crunch against and a back pad to extend against | Both. Precor Vitality Abdominal / Back Extension [M1]; a local dual-station "low back abdominal" listing [IM18] |
| 3 | `chest_press_lat_pulldown` | Chest press and lat pulldown | `chest_press_machine`, `lat_pulldown` | Seated chest press and lat pull down | Pressing forward and pulling down, from one seat | One seat with press handles at chest height and a pulldown bar overhead | Independents and park gyms: local "Seated Chest Press & Lat Pull Down" and "Multi press & lat pull down" listings [IM26][IM14]. Chains not verified |
| Decision | `home_multi_gym_single_stack` | Home multi-gym (one stack) | Owner to choose; a likely start: `chest_press_machine`, `pec_deck`, `lat_pulldown`, `seated_row_cable`, `leg_extension` | Multi gym; Home gym | Several stations sharing one weight stack | One frame and one stack, with press or butterfly arms, a high pulley and bar, a low pulley and a leg roller | Independents and homes [J27][IM20]. Each machine's stations differ, so its types would need editing through "Also used for" |

Notes on the combinations:

- **Multi-station gyms.** These usually have a stack per station (Jerai's 4-station gym has "dedicated weight stacks for each exercise" [J23]). That makes them several machines, and they should be registered as one machine per stack. This is why the working tree removed "Multi-gym" as an alias.
- **Smith machine combos.** Smith-plus-rack and Smith-plus-functional-trainer combos are common locally [J22][IM21]. They should still be registered as two machines, because the Smith bar and a free barbell carry different loads and histories.
- **Seated version of the leg extension combo.** If the lying version is approved, consider showing the drafted `leg_extension_curl` as "Leg extension and seated curl". It is not deployed yet, and the slug stays the same.

### 2.3 Exercises (class b)

Muscles use only `MUSCLE_GROUPS`. Equipment uses the manifest's notation: each entry is one alternative, and `[ ]` marks a group used together.

| Tier | Slug | Name | Aliases | Modality | Pattern | Primary muscles | Portability | Equipment | Purpose and why | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `incline-push-up` | Incline push-up | Hands-elevated push-up; Bench push-up; Wall push-up | bodyweight | horizontal_push | chest | context_dependent (the surface height sets the load) | `bodyweight` (a wall or table), `flat_bench`, `plyo_box`, `smith_machine` | The usual step below a floor push-up. Nothing in the library is easier than `push-up` | [X2] |
| 1 | `kneeling-push-up` | Kneeling push-up | Knee push-up; Modified push-up | bodyweight | horizontal_push | chest | global | `bodyweight` | A beginner regression with a shorter lever. Logged as `push-up`, it would distort history | [X1] |
| 1 | `burpee` | Burpee | Burpees | bodyweight | conditioning | quads, chest | global | `bodyweight` (reps) | A staple of HIIT and group classes, including Cult.fit's HRX sessions | [C6] |
| 1 | `mountain-climber` | Mountain climber | Mountain climbers; Climbers | bodyweight | conditioning | abs, hip_flexors | global | `bodyweight` (measure: duration) | A HIIT staple; HRX uses "slow climbers" | [X3][C6] |
| 2 | `jump-squat` | Jump squat | Squat jump | bodyweight | jump | quads, glutes | global | `bodyweight` | A plyometric squat. `box-jump` needs a box | [X4][C6] |
| 2 | `db-sumo-squat` | Dumbbell sumo squat | Sumo squat; Plié squat | dumbbell | squat | quads, glutes, adductors | global | `dumbbells`, `kettlebells` | A wide-stance squat with one weight held between the legs. Distinct from `goblet-squat` and `sumo-deadlift`. Use in India not verified | [X6][X7] |
| 2 | `hindu-push-up` | Hindu push-up | Dand | bodyweight | horizontal_push | chest, front_delts, triceps | global | `bodyweight` | A traditional Indian wrestling exercise that flows from a pike into a cobra; not a push-up | [X8][X10] |
| 2 | `hindu-squat` | Hindu squat | Baithak; Bethak | bodyweight | squat | quads | global | `bodyweight` | A traditional high-rep squat rising onto the toes; not `bodyweight-squat` | [X9][X10] |
| 2 | `decline-press-machine` | Decline press machine | Decline chest press | machine | decline_push | chest | equipment_specific | `decline_press_machine` | Comes with the new type | [M9][J19] |
| 2 | `lever-squat` | Lever squat | V-squat; Super squat; Power squat | machine | squat | quads, glutes | equipment_specific | `lever_squat_machine` | Comes with the new type | [J21][IM11] |
| 2 | `machine-high-row` | Machine high row | High row; Iso-lateral high row | machine | horizontal_pull | upper_back, lats | equipment_specific | `high_row_machine` | Comes with the new type. The pull goes down and back from overhead | [M10][J20] |
| 3 | `medicine-ball-slam` | Medicine ball slam | Ball slam; Overhead slam | cardio | conditioning | lats, abs | global | `medicine_ball` | Gives `medicine_ball`, which no exercise uses today, a primary exercise | [X5] |

### 2.4 Mapping changes the new types need

- **`chest-supported-row`.** Becomes `["seated_row_machine", "chest_supported_row_machine"]`.
  - Move the alias "Seated row machine" to the new type.
  - Consider a row family: `seated_row_cable`, `seated_row_machine`, `chest_supported_row_machine`, `iso_lateral_row`.
  - The beginner preset could offer `seated_row_machine` in place of `chest_supported_row_machine`.
- **Bench press exercises.** Each gets one more group:
  - `barbell-bench-press` and `close-grip-bench-press`: `[barbell, flat_bench_press_station]`;
  - `incline-barbell-bench`: `[barbell, incline_bench_press_station]`;
  - `seated-barbell-press`: `[barbell, military_press_bench]`.

  Move the alias "Bench press station" from `flat_bench` to `flat_bench_press_station`. The stations can also serve as the bench in dumbbell groups, for example `[dumbbells, flat_bench_press_station]`.
- **Other mappings:**
  - Add `multi_hip_machine` to `glute-kickback-machine`.
  - Add `decline_press_machine` to the `chest_press` family.
  - Move the alias "Power tower" from `captains_chair` to the tower combination.

### 2.5 Out of scope (class e), and items considered but not proposed

**Out of scope**

- **Brands, models and brand-derived names:**
  - Model names such as Precor or Life Fitness model codes belong on the user's own machine.
  - "Hammer" is used locally for plate-loaded lever machines: "Hammer chest press", "Hammer incline press", "Hammer seated rowing", "Lat pull down hammer" [IM26][IM6][IM1].
  - "Orbitrek" names elliptical and bike 2-in-1 products [O3].
  - TRX and BOSU are brands.
  - These are in the same position as "Gravitron", which was removed. Use them only if the owner wants them.
- **Rare specialty machines:** 4-way neck machine (there is no `neck` in `MUSCLE_GROUPS`), tibia trainer, kneeling leg curl (already an alias of `leg_curl_standing`), super-incline press, standing abductor.
- **Rare combinations:** pec fly with lateral raise, and triceps extension with pullover [J1][J3].
- **Not training equipment:** belt and vibration massagers, unloaded "twister" discs [J4], and park-gym stations such as air walkers and waist twisters.
- **Traditional tools:** gada (mace) and mudgar (Indian clubs) [X10].
- **Punching bag:** boxing is not a sport in the app, so defer it.

**Considered but not proposed** (no source gathered, or too close to an existing exercise)

- **Behind-the-neck pulldown and press.** I found no India-specific evidence, and these variants are widely advised against.
- **Treadmill walk.** If beginners log walks, a separate `treadmill-walk` is better than aliasing it to `incline-treadmill-walk`.
- **Floor sit-up, forward lunge, Smith split squat, band-assisted pull-up, wall sit, jumping jack, decline and pike push-ups, and glute activation drills.**
- **Utility bench.** Indian listings use the name for flat and multi-purpose benches as well as 90° seats [IM8], so it stays a `flat_bench` alias as drafted.

## 3. Aliases for existing items (class d)

Only names not already in `equipment-descriptions.ts`, `exercise-aliases.ts` or `equipment-combinations.ts`.

| Existing slug | New local names | Source | Note |
| --- | --- | --- | --- |
| `back_extension_bench` | Hyper extension | [IM13] | In Indian listings "Roman chair" means this bench (Energie Fitness ER-25, J-026) far more often than a captain's chair. List it first when "Roman chair" shows both |
| `decline_ab_bench` | Ab board; Abdominal board; Abdominal bench | [IM18][M3] | |
| `decline_bench` | Olympic decline bench | [IM7][J4] | |
| `pec_deck` | Pec dec; Peck deck; Pec fly rear delt | [IM15] | |
| `lat_pulldown` | High lat pulley; Lat pulley | [IM16] | |
| `seated_row_cable` | Long pull row; Long pull; Ground pulley row | [J7][IM16] | Indian listings also use "Low row" and "Seated rowing" for the selectorised seated row, so search should show both types |
| `t_bar_row` | T-arm machine; Incline T-bar row; Chest-supported T-bar row | [IM22][J26] | |
| `landmine` | T-bar pivot | [J25] | |
| `hack_squat` | Hack slide | [IM25] | Energie Fitness ER-957 |
| `chest_press_machine` | Vertical chest press | [J1][IM26] | |
| `functional_trainer` | Multi-functional station; Twin adjustable pulley; Functional training tower | [J1][J24] | |
| `glute_kickback_machine` | Glute isolator | [IM19] | |
| `preacher_bench` | Curl bench | [IM23] | |
| `barbell` | Olympic rod; Weightlifting rod; Gym rod | [IM17] | Search may already match "Rod" |
| `ez_bar` | Curl rod; Zigzag rod | [IM17][O2] | |
| `dumbbells` | Dumbbell rods | [IM17] | The handles, bought with plates |
| `elliptical` (type) | Elliptical cross trainer | [IM24] | |
| `stair_climber` | Step-up climber | [J28] | |
| `captains_chair` | Vertical knee up | [J14] | |
| `lat_pulldown_low_row` | Lat pull down and low row; Lat pulldown with rowing; Pull down and low row | [IM1][J8] | |
| `assisted_dip_chin` | Chin dip assist; Weight assisted chin dip; Dipping and chinning | [IM2] | |
| `leg_extension_curl` | Seated leg extension leg curl; Dual station leg curl extension | [IM3][J10] | |
| `chest-supported-row` (exercise) | Seated row machine; Low row machine | [IM6][IM1] | |
| `pec-deck-fly` (exercise) | Pec dec fly | [IM15] | |
| `seated-cable-row` (exercise) | Long pull row | [J7] | |
| `back-extension` (exercise) | Hyper extension | [IM13] | |
| `hip-abduction` / `hip-adduction` (exercises) | Outer thigh / Inner thigh | [IM4] | |
| `stationary-bike` (exercise) | Exercise cycle | [O3] | Already an alias on the `bike` type |

## 4. Recommended first batch

Thirteen items, in this order of approval. The section 3 aliases can be approved as one change alongside, and the three drafted combinations are already under way.

1. **`hip_abduction_adduction` (c).** Most gyms own one machine for both movements [M1][M3][J13][IM4]. In the beginner preset it turns two tiles into one.
2. **`multi_press` (c).** It is in every dual line and common locally [M1][M3][J11][IM14]. Today one machine cannot carry its three pressing types.
3. **`leg_press_hack_squat` (c).** It is the most frequent combination in local listings, "leg press cum hack squat" [J15][IM25].
4. **`leg_extension_lying_curl` (c).** This is how local gyms build the plan's leg extension and curl, as a flip-down bench. The drafted seated version does not describe it [J9][IM3].
5. **`biceps_triceps_machine` (c).** It is a dual machine in Precor's and Life Fitness's dual lines and Energie Fitness's range, and common locally [M1][M3][IM5].
6. **`knee_raise_dip_pull_up_tower` (c).** One frame carries three types. It matters at home and outdoors, where nothing is assumed, and takes over the alias "Power tower" [M3][J14][IM10].
7. **`seated_row_machine` (a).** The plan's own candidate. It appears in every selectorised line and registers with stack defaults (see 2.1 for the alias fallback) [M1][M3][J5][IM6].
8. **`flat_bench_press_station` (a).** It lets home and outdoor locations record a bench with uprights without claiming a squat rack [M6][J16][IM7].
9. **`incline_bench_press_station` (a).** The same reason, for incline pressing [M7][J17][IM7].
10. **`incline-push-up` (b).** A beginner regression the library lacks, which beginner programmes need [X2].
11. **`kneeling-push-up` (b).** A beginner regression whose load differs from `push-up` [X1].
12. **`burpee` (b).** A HIIT and group-class staple at Cult.fit [C6].
13. **`mountain-climber` (b).** A HIIT staple, timed [X3][C6].

## Sources

Accessed 4 October 2026. Retailer and marketplace pages show what is sold, not what gyms own.

Chains: [C1] Gold's Gym India · [C2] Cult gyms · [C3] Precor and Anytime Fitness (2018) · [C4] Fitness First Delhi (2009) · [C5] Talwalkars and Nautilus (2007) · [C6] Cult.fit HRX movements.
Manufacturers: [M1] Precor Vitality line · [M2] Vitality Seated Row (retailer) · [M3] Life Fitness Optima sell sheet · [M4] Life Fitness Insignia Assist Dip Chin · [M5] Matrix Aura Dip/Chin Assist (retailer) · [M6] Hammer Strength Olympic Flat Bench · [M7] Olympic Incline Bench · [M8] Olympic Military Bench · [M9] Iso-Lateral Decline Chest Press · [M10] Iso-Lateral High Row.
Jerai Fitness: [J1] Club Line Plus · [J2] Falcon · [J3] Load-On · [J4] Benches and racks · [J5] Vertical Row · [J6] Seated Row · [J7] Long Pull Row · [J8] Lat Pull Down With Rowing Combo · [J9] Leg Curl / Extension Combo · [J10] Seated Leg Curl / Extension Combo · [J11] Multi Press · [J12] Assisted Dip Chin · [J13] Adductor/Abductor combo · [J14] Vertical Knee Up AB Dip Chin · [J15] Leg Press Hack Squat Combo · [J16] Olympic Flat Bench · [J17] Olympic Incline Bench · [J18] Flat & Incline Combo Bench · [J19] Isolateral Decline Press · [J20] Isolateral High Row · [J21] Power Squat · [J22] Smith Squat Rack Combo · [J23] 4-station multi-gym · [J24] Multi Functional Station · [J25] T-bar pivot · [J26] Incline T-bar row · [J27] Home gyms for Indian apartments · [J28] Home page.
IndiaMart: [IM1] lat pull down low row · [IM2] assisted dip chin · [IM3] leg extension leg curl combo · [IM4] abductor adductor · [IM5] bicep tricep · [IM6] seated row machine · [IM7] Olympic flat bench · [IM8] utility bench · [IM9] decline chest press · [IM10] vertical knee raise · [IM11] V squat · [IM12] multi hip · [IM13] Roman chair · [IM14] multi press · [IM15] butterfly · [IM16] back machines · [IM17] weight rods · [IM18] abdominal · [IM19] glute · [IM20] multi gym · [IM21] Smith machine · [IM22] leg curl extension (Indian Fitness) · [IM23] preacher curl bench · [IM24] elliptical cross trainer · [IM25] hack squat · [IM26] chest press · [IM27] leg press.
Exercises: [X1] ACE, perfecting the push-up · [X2] ACE, chest training (incline push-up) · [X3] ACE Mountain Climbers · [X4] ACE Squat Jump · [X5] ACE Overhead Slams · [X6] Bodybuilding.com plié squat · [X7] Healthline sumo squat · [X8] Hindu push-up · [X9] Hindu squat · [X10] Man's World India (2025).
Other: [O1] Kibi Sports, Body-Solid VKR · [O2] Kibi Sports curling rod · [O3] Reach Orbitrek · [O4] Fitpass (no equipment list).

[C1]: https://promotion.goldsgym.in/?p=1842
[C2]: https://blog.cure.fit/posts/introducing-the-next-generation-of-cult-gyms
[C3]: https://www.healthclubmanagement.co.uk/health-club-management-features/Precor-Anytime-any-place-anywhere/33204
[C4]: https://www.healthclubmanagement.co.uk/health-club-management-news/Fitness-First-for-Delhi-and-Riyadh/125303
[C5]: https://sgbonline.com/?p=18904
[C6]: https://www.cure.fit/live/fitness/hrx-workout/calorie-burn-with-hrx-movements
[M1]: https://www.precor.com/strength/selectorized/vitality
[M2]: https://pushpedalpull.com/products/commercial-precor-vitality%E2%84%A2-series-seated-row
[M3]: https://www.lifefitness.com.au/wp-content/uploads/2019/11/English-Optima-Sell-Sheet-vf.pdf
[M4]: https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/insignia-series-assist-dip-chin
[M5]: https://fitnesssuperstore.com/products/matrix-g3-aura-g3-s60-dip-chin-assist-remanufactured
[M6]: https://www.lifefitness.com/en-hk/catalog/strength-training/benches/olympic-flat-bench
[M7]: https://www.lifefitness.com/en-gb/catalog/strength-training/benches/olympic-incline-bench
[M8]: https://www.lifefitness.com/en-hk/catalog/strength-training/benches/olympic-military-bench
[M9]: https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/iso-lateral-decline-chest-press
[M10]: https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-high-row
[J1]: https://www.jeraifitness.com/type-of-product/club-line-plus
[J2]: https://www.jeraifitness.com/type-of-product/falcon
[J3]: https://www.jeraifitness.com/type-of-product/load-on
[J4]: https://www.jeraifitness.com/type-of-product/benches-and-racks
[J5]: https://www.jeraifitness.com/products/strength-club-line-plus-vertical-row
[J6]: https://www.jeraifitness.com/products/strength-club-line-plus-seated-row
[J7]: https://www.jeraifitness.com/products/strength-club-line-plus-long-pull-row
[J8]: https://www.jeraifitness.com/products/strength-falcon-lat-pull-down-with-rowing-combo-2
[J9]: https://www.jeraifitness.com/products/strength-falcon-leg-curl-extension-combo-2
[J10]: https://www.jeraifitness.com/products/strength-club-line-plus-seated-leg-curl-extension-combo
[J11]: https://www.jeraifitness.com/products/strength-falcon-multi-press-2
[J12]: https://www.jeraifitness.com/products/strength-club-line-plus-assisted-dip-chin
[J13]: https://www.jeraifitness.com/products/strength-club-line-plus-adductor-abductor-combo
[J14]: https://www.jeraifitness.com/products/benches-and-racks-vertical-knee-up-ab-dip-chin
[J15]: https://www.jeraifitness.com/products/strength-load-on-leg-press-hack-squat-combo
[J16]: https://www.jeraifitness.com/products/benches-olympic-flat-bench
[J17]: https://www.jeraifitness.com/products/benches-and-racks-olympic-incline-bench
[J18]: https://www.jeraifitness.com/products/benches-and-racks-flat-incline-combo-bench
[J19]: https://www.jeraifitness.com/products/isolateral-decline-press
[J20]: https://www.jeraifitness.com/products/isolateral-high-row
[J21]: https://www.jeraifitness.com/products/strength-load-on-power-squat
[J22]: https://www.jeraifitness.com/products/strength-load-on-smith-squat-rack-combo
[J23]: https://www.jeraifitness.com/products/jx-fit-4-station-multi-gym-4-station-jx-fit
[J24]: https://www.jeraifitness.com/products/strength-club-line-plus-multi-functional-station
[J25]: https://www.jeraifitness.com/products/benches-and-racks-t-bar-pivot
[J26]: https://www.jeraifitness.com/products/strength-load-on-incline-t-bar
[J27]: https://www.jeraifitness.com/blog/home-gym-equipment-for-limited-space-setup-ideas-for-indian-apartments
[J28]: https://www.jeraifitness.com/
[IM1]: https://dir.indiamart.com/search.mp?ss=lat+pull+down+low+row+machine
[IM2]: https://dir.indiamart.com/search.mp?ss=assisted+dip+chin+machine
[IM3]: https://dir.indiamart.com/search.mp?ss=leg+extension+leg+curl+combo
[IM4]: https://dir.indiamart.com/search.mp?ss=abductor+adductor+machine
[IM5]: https://dir.indiamart.com/search.mp?ss=bicep+tricep+machine
[IM6]: https://dir.indiamart.com/search.mp?ss=seated+row+machine
[IM7]: https://dir.indiamart.com/search.mp?ss=olympic+flat+bench
[IM8]: https://dir.indiamart.com/search.mp?ss=utility+bench
[IM9]: https://dir.indiamart.com/search.mp?ss=decline+chest+press+machine
[IM10]: https://dir.indiamart.com/search.mp?ss=vertical+knee+raise
[IM11]: https://dir.indiamart.com/search.mp?ss=v+squat+machine
[IM12]: https://dir.indiamart.com/search.mp?ss=multi+hip+machine
[IM13]: https://dir.indiamart.com/search.mp?ss=roman+chair
[IM14]: https://m.indiamart.com/impcat/multi-press-machine.html
[IM15]: https://m.indiamart.com/impcat/butterfly-machine.html
[IM16]: https://m.indiamart.com/impcat/back-exercise-machine.html
[IM17]: https://m.indiamart.com/impcat/weight-rods.html
[IM18]: https://m.indiamart.com/impcat/abdominal-machine.html
[IM19]: https://m.indiamart.com/impcat/glute-machine.html
[IM20]: https://m.indiamart.com/impcat/multi-gym-machine.html
[IM21]: https://m.indiamart.com/impcat/smith-machine.html
[IM22]: https://m.indiamart.com/proddetail/leg-curl-extension-machine-27129041597.html
[IM23]: https://m.indiamart.com/impcat/preacher-curl-bench.html
[IM24]: https://m.indiamart.com/impcat/elliptical-cross-trainer.html
[IM25]: https://m.indiamart.com/impcat/hack-squat-machine.html
[IM26]: https://m.indiamart.com/impcat/chest-press-machine.html
[IM27]: https://m.indiamart.com/impcat/leg-press-machine.html
[X1]: https://www.acefitness.org/resources/pros/expert-articles/7265/perfecting-the-push-up-for-all-levels/
[X2]: https://www.acefitness.org/resources/pros/expert-articles/8972/be-a-chest-day-champion-an-evidence-based-approach-to-training-the-chest/
[X3]: https://www.acefitness.org/resources/everyone/exercise-library/258/mountain-climbers/
[X4]: https://www.acefitness.org/resources/everyone/exercise-library/222/squat-jump/
[X5]: https://www.acefitness.org/resources/everyone/exercise-library/182/overhead-slams/
[X6]: https://www.bodybuilding.com/exercises/plie-dumbbell-squat
[X7]: https://healthline.com/health/fitness-exercise/sumo-squat-exercises
[X8]: https://en.wikipedia.org/wiki/Hindu_push-up
[X9]: https://en.wikipedia.org/wiki/Hindu_squat
[X10]: https://www.mansworldindia.com/grooming-special/ancient-indian-fitness-techniques-that-still-pack-a-punch
[O1]: https://shop.kibisports.com/products/gvkr82b-vertical-knee-raise-pull-up
[O2]: https://shop.kibisports.com/products/weight-lifting-curling-rod
[O3]: https://www.paisawapas.com/p-reach-orbitrek-exercise-cycle-and-cross-trainer-multi-color-13199975
[O4]: https://fitpass.co.in/studio/snap-fitness-hub-nagarbhavi
