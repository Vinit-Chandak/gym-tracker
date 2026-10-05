# Equipment art pilot

Status: pilot set for the owner's review, shown as drafts (development, or `OVERLOAD_SHOW_DRAFTS=1`) through `EquipmentArt`.
Date: 4 October 2026.

Eight original single-colour line drawings of gym equipment, so a beginner can recognise a machine by its picture. They are the "small representative set" asked for under "Discovery and recognition" in [the onboarding and technique plan](ONBOARDING_EQUIPMENT_TECHNIQUE_PLAN.md#discovery-and-recognition): three confusable pairs, a cable station and free weights. The illustration treatment goes into `DESIGN.md` once the owner has reviewed it.

The files are in `src/components/equipment-art/svg/`, named by the permanent slugs in `src/db/seed/data/equipment-types.ts`:

- `leg_press_45.svg` and `hack_squat.svg`
- `leg_curl_seated.svg` and `leg_curl_lying.svg`
- `chest_press_machine.svg` and `shoulder_press_machine.svg`
- `cable_station.svg`
- `dumbbells.svg`

## What each drawing should say

**45° leg press** (`leg_press_45`). You sit low and reclined on the left. A big footplate sits square to the 45° rails on a sled carrying two plate horns, and the rails rise away from you, so you push the sled up and away. Unlike the hack squat, the padded seat is at the bottom and the footplate is up the rails.

**Hack squat** (`hack_squat`). You stand on the tilted footplate at the bottom right. Your back goes on the long pad and the shoulder pads hook over your shoulders, all on a carriage riding the 45° rails, with horns out of the carriage's back. The rails rise behind you, the mirror image of the leg press. There is nothing to sit on, the footplate is on the floor and the pads are up the rails.

**Seated leg curl** (`leg_curl_seated`). An upright seat and back pad, a pad clamped down over the knees, and a roller behind the ankles on an arm that pivots at the knee. The arrow shows the roller swinging down and back under the seat, and the stack stands behind. Unlike the lying leg curl, you sit (tall back pad, thigh pad on top) and the roller goes down.

**Lying leg curl** (`leg_curl_lying`). A long bench with a bend at the hips that you lie on face down, handles at the head end by the stack, and the roller above the ankles at the far end. The arrow shows it curling up towards you. There is no back pad or thigh pad, just a long, low bench, and the roller goes up.

**Chest press machine** (`chest_press_machine`). An upright seat and back pad with the stack behind. The handle hangs from a pivot on the top beam, in front of the chest, and the arrow points forward. Unlike the shoulder press, the handle is low (chest height), well in front of you, and moves forward.

**Shoulder press machine** (`shoulder_press_machine`). The same seat, back pad and stack. The handle is high, beside the head at shoulder height, on an arm from the top of the tower, and the arrow points up. Unlike the chest press, the handle is higher, nearer the back pad, and moves up.

**Cable station** (`cable_station`). A tall column with the stack and its pin at the foot. The cable rises from the stack over a pulley at the top and across to the track. The pulley's carriage sits on that full-height track at about chest height (it slides up and down), and its cable runs out to a D handle.

**Dumbbells** (`dumbbells`). A pair of hex dumbbells, one lying and one stood on end, so they read as two dumbbells at any size. Their cut corners say hex. They have no look-alike in the set.

## Spec followed

- **Root.** Every file opens with `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`. Nothing else goes on the root, so there is no width or height.
- **Stroke.** 2.0 everywhere, with round caps and joins: the glyphs' grammar (`DESIGN.md`, Shapes; `src/components/ui/glyphs.tsx`). At 160 px wide the stroke is 2.7 px, close to a 24-px glyph's 2 px. At 72 px it is 1.2 px.
- **Ink only.** Everything is `currentColor`, so a picture swaps in dark, inverts in a chosen tile and survives forced colours. There is no other colour, no gradient, no stroke opacity, no dash (dashes mean skipped), and no text, id, style or transform. The elements used are `line`, `path`, `rect`, `circle` and `polygon`.
- **One tonal level, for upholstery only.** The seat, back, thigh, chest and shoulder pads and the two leg-curl rollers carry `fill="currentColor" fill-opacity="0.14"` and keep their stroke, so the tone shows where the body goes. Nothing else is filled except axle and pivot dots, which are solid with r 0.9–1 (the limit is 1.4).
- **Viewpoint.** A plain side elevation with no perspective, the same for every machine. Every machine faces right: the user faces right, the seat or pads sit left of the working parts, and the stack stands behind the user.
- **Scale.** All machines share one scale, 1 unit ≈ 2.4 cm. They stand on an implied floor at y = 84, which is not drawn: base tubes end exactly on it, and a 2 m machine would reach y ≈ 1. Each drawing is centred on x = 60 by its bounding box, arrows included.
- **Dumbbells.** These use a close-up scale, 1 unit ≈ 0.6 cm (each dumbbell is about 34 cm long, with heads about 17 cm across), and also sit on y = 84. They are not to scale with the machines.
- **Arrows.** A short stroke with an open head, used only where direction is the difference and always on both members of the pair: the presses (forward, up) and the leg curls (down and back, up). There are none on the leg press and hack squat (posture separates them), the cable station or the dumbbells.
- **Detail.** Element counts: leg press 14, hack squat 12, seated leg curl 21, lying leg curl 23, chest press 18, shoulder press 17, cable station 22, dumbbells 6. The three under the guide of 15 were each tried with more: handles on the hack squat, metal necks on the dumbbells and a pull-pin on the cable carriage. None made the picture easier to recognise, and each made the 72-px rendering busier, so they were left out.

Approximate sizes at the shared scale:

| Drawing                  | Length                            | Height                          |
| ------------------------ | --------------------------------- | ------------------------------- |
| `leg_press_45`           | 2.1 m                             | 1.4 m (1.5 m to the horn tips)  |
| `hack_squat`             | 2.0 m                             | 1.55 m                          |
| `leg_curl_seated`        | 1.7 m, with the stack behind      | 1.45 m                          |
| `leg_curl_lying`         | 2.2 m, with the stack at the head | 1.15 m (stack), bench at 0.85 m |
| `chest_press_machine`    | 1.45 m                            | 1.85 m                          |
| `shoulder_press_machine` | 1.45 m                            | 1.85 m                          |
| `cable_station`          | 1.4 m                             | 1.95 m                          |

## Verification

- **Validation.** A small Node check (`check-svg.cjs`, in the session scratch folder below) parses each file as strict XML with `saxes`. It checks:
  - the root attributes
  - that only allowed elements and attributes are used
  - that colour is only ever `currentColor` or `none`
  - the tonal-fill and dot rules
  - that there are no dashes, text, ids, styles or transforms
  - that every stroke edge stays inside the 120 × 90 box and on or above y = 84

  It was first run against deliberately broken files. All eight drawings pass, with a note on the three counts under 15.
- **Visual review.** Playwright with Chromium rendered contact sheets with each SVG inlined, so `currentColor` applies, at 72 px and 160 px wide and at 1× and 2× density. Each sheet covers three themes: light (`#16171b` on `#ffffff`), dark (`#edeef0` on `#111214`) and a chosen tile (`#ffffff` on `#16171b`). The 72-px tiles were also rendered at 1× and enlarged 4× with nearest-neighbour scaling to show real pixels. Eight review passes changed these things:
  - **Hack squat horns.** First drawn as stubs that read as stray ticks; now collared pegs out of the back of a visible carriage.
  - **Hack squat shoulder pad.** It read as a headrest, so it is now longer and tilted to hook over the shoulders.
  - **Leg press sled.** A footplate on its own read as a second back pad, because it is parallel to the seat back. The sled now has a slider and a brace, and the footplate is drawn as a thin plate.
  - **Cable handle.** A triangle read as a warning sign; it is now a D handle. A second pulley at the head of the track makes the cable's route readable.
  - **Lying leg curl.** The frame was cleaned up and the machine shortened towards a realistic length.
  - **Shoulder press.** The pivot is attached to its beam and the arrow sits over the handle.
  - **Dumbbells.** Scaled up, and their heads now have cut corners. A true side view of a hex head lying on a flat face is a plain rectangle with a ridge line across it, which read as two stacked blocks.
- **Contact sheets.** These are in the session scratch folder, not checked in. To regenerate one, inline the SVGs in a page per theme and set its `color`.
  - `/tmp/claude-0/-home-user-gym-tracker/06594960-b8d4-52de-92ad-add85c85dd34/scratchpad/art/equipment-art-pilot-contact-dpr2.png`: three themes, 72 px and 160 px, at 2×.
  - `/tmp/claude-0/-home-user-gym-tracker/06594960-b8d4-52de-92ad-add85c85dd34/scratchpad/art/equipment-art-pilot-contact-dpr1.png`: the same at 1×.
  - `/tmp/claude-0/-home-user-gym-tracker/06594960-b8d4-52de-92ad-add85c85dd34/scratchpad/art/equipment-art-pilot-72px-zoom4x.png`: the 72-px tiles at 1×, enlarged 4×, in all three themes.

## Judgement calls

- **Plate horns.** Drawn as pegs with a collar, in the plane of the drawing. In a strict side elevation, horns that point sideways would be end-on circles and read as wheels. On the leg press they stand on the sled. On the hack squat they come out of the carriage's back below the rails, the only free room between the rear post and the shoulder pads.
- **Hex dumbbells.** Stylised with cut corners rather than drawn as a true elevation (see above).
- **Lever and cable geometry.** Generic, not any maker's:
  - The chest press arm hangs from the front of the top beam.
  - The shoulder press arm runs down from the top of the tower.
  - The cable runs from the stack over the top pulley to the track pulley, then from the carriage pulley to the handle. Real adjustable columns often route it 2:1 or more, inside the column.
- **Stack position.** The stack stands behind the user on all four selectorised machines, so their frames match and only the pads, handles and arrows differ. The lying leg curl's stack stands at the head end, with the handles.

## Open questions for the owner

1. **Light, dark and selected.**
   - **Real tiles.** The sheets used `ground`. Tick tiles sit on `surface` (`#f4f4f5`, or `#1b1c20` in dark) until ticked, then turn ink. In dark, a ticked tile is `#edeef0` with `#111214` lines, close to the light rendering.
   - **Tone strength.** At 72 px on a 1× screen, the 0.14 tone almost disappears in dark and on the chosen tile; at 2× and 3× it shows. Keep 0.14, raise it for dark and chosen (to 0.2, say), or make it a token?
2. **Arrows.** Keep them on the presses and leg curls, or drop them and let handle height and roller position carry the difference? Should the identification view also say the direction in words ("pushes forward", "pushes up")?
3. **Facing.** Is "every machine faces right" the right convention? It makes the leg press and hack squat mirror diagonals, which helps tell them apart. The cost is that the hack squat's user faces away from the high end of the rails.
4. **Departures from a strict elevation.** Are stylised hex heads and in-plane horns acceptable?
5. **Cable station.** Is a carriage on a full-height track enough to say "slides up and down"? The alternative is a pull-pin on the carriage, which was tried; it echoed the stack's pin and cluttered the 72-px picture.
6. **Beginner test.** Try the pictures with two or three beginners before drawing the rest of the catalogue:
   - Use a real phone, in light and dark, with the pictures at tile size and the names hidden.
   - Show each pair side by side. Ask which machine you sit in and which you stand in, where your back goes, and which way the handle or roller moves.
   - Then show the real machine (or a photo) and ask them to pick its picture.
   - Note every misreading and redraw what fails.
7. **Delivery.** Server-rendered inline SVG or CSS masks over `currentColor`, as the plan allows. A mask takes the SVG's alpha, so the tone should survive either way; check that in Safari. Beside a visible name a picture is decorative (`alt=""`). The "What each drawing should say" lines above can seed the identification view's text.
