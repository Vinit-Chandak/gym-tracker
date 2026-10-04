# Onboarding equipment and exercise technique plan

Status: product direction approved; implementation plan ready for independent verification.
Date: 4 October 2026.
Branch: `codex/onboarding-equipment-technique-proposal`.
Base: freshly fetched `origin/main`, `422f6ecf3c8b4cf2799a0c1b2ec8fdaaa216436d`.

Beginners struggle to identify equipment by name, face a long catalogue before their first workout, and find little useful guidance in Technique. The owner also reported scrolling to reach Add actions and wants to add several exercises in one visit. This plan combines an optional illustrated starter selection, gradual confirmation of actual gym equipment, better reference data, exercise-specific instructions with curated demonstrations, and persistent picker actions.

The owner selected all five recommended options in the planning conversation. The current task authorises writing, reviewing, committing and pushing this plan. It does not authorise application implementation, running seeders or migrations, or deployment. A reviewing agent may correct and refine this document while retaining the agreed direction.

## Approved direction

| Area                | Decision                                                                                                    | First release boundary                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Onboarding          | Optional 8–12 illustrated equipment suggestions, then confirm additional equipment when needed in a workout | Full catalogue remains accessible; setup can be skipped                         |
| Machine recognition | Original vector illustrations matching the current app, with names, aliases and short descriptions          | Static illustrations first; optional personal gym photos later                  |
| Technique           | Reviewed written instructions plus curated YouTube demonstrations                                           | Show guidance in both the workout and library; custom exercise animations later |
| Catalogue           | Reconcile existing seeds, correct mappings, then add missing common machines and exercises                  | No indiscriminate bulk import or arbitrary target of 500 machines               |
| Picking             | Persistent action buttons and batch exercise selection                                                      | Add several exercises; substitution and fallback selection remain single-choice |

The 8–12 suggestions are a display limit and initial design hypothesis, not a claim about any particular gym's inventory. Exact presets, illustrations and technique examples are implementation deliverables to verify, not assets already produced.

## Baseline and evidence

The initial investigation used local `main` at `4e5e928`. Before writing this plan, remote `main` was fetched and the affected source was inspected again at `422f6ec`. That newer version includes Form v2 and already implements pinned actions on several relevant screens. Earlier advice about copper accents, system fonts, boxed lists and adding sticky controls from scratch is superseded by the current source and design contracts.

Read these first:

- [AGENTS.md](../../AGENTS.md) and the relevant installed Next.js guides under `node_modules/next/dist/docs/` before writing application code.
- [PRODUCT.md](../../PRODUCT.md) and [DESIGN.md](../../DESIGN.md), the current product and visual contracts.
- [Overload UI skill](../../.claude/skills/overload-ui/SKILL.md), which resolves precedence among the repository's design, accessibility and motion skills.
- [Feature inventory](../ui-redesign/revamp/features.md) and [local audit setup](../audits/local-56-months.md).

| Finding verified in source                                                                                             | Evidence                                                                                                                    | Consequence                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 93 equipment types, 276 active exercises and 503 exercise-to-equipment mappings                                        | `src/db/seed/data/equipment-types.ts`, `src/db/seed/data/exercises.ts`                                                      | Compare deployed data against the manifest before attributing omissions to skipped seeds                        |
| 59 exercises have `formNotes`, 8 have `formUrl`, and 212 have neither                                                  | Same exercise seed module; some notes only explain logging conventions                                                      | Field presence overstates actual instructional coverage; the existing URLs are guide pages, not a video library |
| Shared reference seeding is enabled on production deployment; preview writes are intentionally gated                   | `src/db/seed/run.ts`, `src/db/seed/reference.ts`, `src/db/deploy.ts`                                                        | Preserve that protection; there is no missing seeder intended to populate every person's gym                    |
| Gyms and equipment instances are owned by individual accounts                                                          | `src/db/schema/gyms.ts`                                                                                                     | Naming a commercial gym does not select a verified shared location inventory                                    |
| Onboarding currently shows the full selectable catalogue with name-only equipment choices                              | `src/app/(onboarding)/welcome/equipment/equipment-step-form.tsx`                                                            | Pictures, a short initial list and aliases address a problem search alone cannot solve                          |
| Onboarding excludes free-weight and bodyweight categories, while availability only assumes many basics at `kind = gym` | Above form and `src/domain/equipment-resolution.ts`                                                                         | Home setup must expose real equipment basics; audit home/outdoor unknown states too                             |
| Equipment onboarding and workout Add/Replace forms already use `PinnedActions`                                         | Above form; `src/app/(app)/workouts/[sessionId]/add-exercise/add-exercise-form.tsx`; `src/components/ui/pinned-actions.tsx` | Verify current behaviour and remaining consumers, extend the existing pattern                                   |
| Exercise selection and the add action accept one exercise                                                              | `src/components/exercise-picker.tsx`, `src/server/actions/sessions.ts`                                                      | Batch addition needs an explicit client and server contract                                                     |
| Workout Technique displays programme cues/load/progression notes, not canonical exercise guidance                      | `src/app/(app)/workouts/[sessionId]/exercise-logger.tsx`; compare `src/app/(app)/exercises/[exerciseId]/page.tsx`           | Seeding alone will not populate Technique; connect the content to the workout query/view model                  |

Counts are repository facts, not a production database audit. Earlier live inspection used an existing local audit database and the older source. No claim is made that Form v2 has been tested on a physical phone in this planning task. The production catalogue version, specific missing items reported by friends, and real inventories of their gyms remain unverified.

## Experience to build

### Optional starter equipment

Keep the current account/profile/sports/gym/programme flow. Improve the equipment step without requiring a new tutorial or a full gym inventory.

1. Use the chosen training setting to offer an appropriate starter preset. The existing `gym`, `home` and `outdoor` model remains meaningful; a smaller commercial gym can use a different setup preset without inventing a new physical gym kind.
2. Show up to 8–12 recognisable equipment families. Each choice has a picture, name and short purpose. Suggestions start unchecked. Retain an obvious way to skip, review selections, and browse all equipment.
3. When a family includes materially different types, let the person identify the actual variant before registering it. For example, a seated and lying leg curl should be distinguishable. Being unsure does not force a guess.
4. On submission, register only the specific types the person confirms, once, at that gym. Preserve chosen units and existing instances. Revisiting setup must show existing equipment and must not duplicate it.
5. Continue to the programme/first workout. Confirm further equipment as it becomes relevant.

Commercial-gym suggestions might cover common presses, pulldown/row, a cable station and common leg machines; the exact list comes from the curated catalogue and starter programmes. Home suggestions must include dumbbells, a bench, bands and other appropriate basics. Do not assume a home has barbells, and do not treat equipment-free movement as requiring a fictitious machine.

Remove the whole-catalogue “Select all machines” shortcut from beginner setup. If a bulk selector remains in advanced inventory management, its scope must be explicit and limited to what is visibly being confirmed. A search must not silently select hidden equipment. Keep selected items available through a compact review control instead of letting selections distort every search result.

### Gradual confirmation during workouts

When an exercise needs unconfirmed equipment, show its identification picture and provide “Available”, “Not here” and “Not sure”. Use this when needed, not as a repeated modal before every workout.

| Answer or state                           | Inventory effect                                                                                   | Workout behaviour                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Suggested or untouched                    | No instance and no absence record                                                                  | Availability stays unknown                                                                                                              |
| Available                                 | Create or select the owner's compatible instance in this gym; clear a contradictory absence record | Use that instance for subsequent machine history                                                                                        |
| Not here                                  | Record explicit absence where no active matching instance contradicts it                           | Offer appropriate substitutes or the existing skip path                                                                                 |
| Not sure                                  | No inventory mutation                                                                              | Keep unknown; let the person defer, inspect the illustration, choose another exercise or use the existing explicit skip/defer behaviour |
| Known machine is occupied or broken today | Do not mark the whole equipment type permanently absent                                            | Allow a session-specific substitute                                                                                                     |

If multiple machines of one type exist, retain their separate names, IDs and histories; ask which one is being used when necessary. “Not here” should reconcile a conflicting saved instance with the person rather than deleting or hiding it automatically. Equipment absence, unknown availability, temporary occupancy and skipped exercise are different states.

The existing resolver has `direct`, `fallback`, `unknown` and `unavailable`, but currently returns `unknown` only for gyms, not all home/outdoor cases. Reconcile that with the new flow and distinguish explicit absence from unrecorded equipment in all settings. Preserve real equipment-free availability. Do not infer inventory from a chain name or another account's private data.

### Discovery and recognition

Retain access to all exercises and all equipment. Put starter suggestions and confirmed equipment within easy reach without hiding the wider catalogue. Search should recognise canonical names, aliases and plain descriptions; exercise search should retain existing muscle/equipment matching and ranking.

Create a small representative set of original SVG illustrations first: include visually confusable pairs, a cable station and free weights. Use a consistent viewpoint, scale and level of detail. Seats, pads, handles, cables and loading arrangement should explain what to recognise. A generic gym glyph alone is insufficient. An enlarged view can explain distinguishing features and show exercises supported by that equipment.

These are functional identification illustrations. In Form v2, names still align to the established edge; use a compact image area above or within the identification detail rather than adding decorative marks to ordinary exercise rows. Reuse current glyphs for navigation and modality. Use monochrome semantic colours and avoid sport pigments or printed training artwork to imply a machine's identity or availability. Record any necessary new illustration treatment in `DESIGN.md` during implementation.

## Reference data and seed strategy

### Catalogue reconciliation and expansion

First produce a reproducible report: reference counts, missing or unexpected deployed slugs where an authorised read-only environment is available, duplicate/alias candidates, missing guidance, invalid mappings and missing assets. Do not read production credentials or run database scripts merely to complete a planning review. If environment access is unavailable, clearly label the comparison as unverified.

Build the addition list from common gym equipment, supported beginner programme coverage, specific user reports, and failed-search evidence if it exists. Do not invent analytics. Missing metadata, an unfamiliar synonym and a genuinely absent exercise require different fixes. A manufacturer/model usually belongs on an equipment instance, while a materially different movement or machine design can warrant a canonical variant.

Use the existing repeatable reference seeder with stable slugs and IDs. Add curated reference rows and update metadata without replacing user-owned gyms, machines, exercises, programmes or historical records. Programme blueprints, load comparability, rep/time/distance measures, and existing exercise links must remain valid. New records do not justify merging historical exercises or machines.

Suggested authoring contract, to be finalised in the technical review:

| Record              | Content and ownership                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equipment reference | Stable slug, canonical name, aliases, purpose, identification cues, family/variant relationship, illustration reference and source/license metadata |
| Starter preset      | Versioned list of equipment family/type slugs by setup context, ordered for discovery; reference data only                                          |
| Gym equipment       | Existing owner/gym/type/instance identity, units and model details; only confirmed choices create inventory                                         |
| Exercise guide      | Stable exercise association, version, setup, movement steps, concise cues, common mistakes, sources, review state/date and optional demonstration   |
| Media               | Asset/provider identifier, URL or local path, poster if authorised, source/creator, license/usage basis, and review/check date                      |

Prefer checked-in, validated authoring manifests that feed the normal seed pipeline. Persist canonical metadata where the existing server queries can read it; avoid making each user wait on a third-party exercise API. Exact additive columns versus separate guide/media tables may be refined by the reviewer. Preserve existing `formNotes` and `formUrl` consumers during transition and avoid two independently edited sources of truth.

### Correct equipment requirements before relying on presets

The current equipment-option arrays are ranked alternatives. Some entries contain equipment needed together: `smith-hip-thrust` includes a flat bench as an alternative to the Smith machine. A flat bench can therefore satisfy the current lookup by itself. `reverse-cable-curl` also includes an EZ bar as an equipment alternative rather than modelling the different exercise.

Audit seed mappings and their consumers in the resolver, workout-equipment repository, session creation, programme generation and coaching catalogue. Distinguish:

- Alternative compatible machines for the same movement.
- Additional required implements, such as a bench together with a Smith machine.
- An alternative exercise, such as a free-weight curl instead of a cable curl.
- The primary machine whose load/history identifies the logged performance.

For combinations, model valid alternatives as groups whose required items must all be satisfied, or an equivalent explicit requirement structure. A reviewed mapping may initially correct the false primary alternative, but must not claim all accessories are verified when the model cannot express them. Preserve existing valid option behaviour during the additive transition. Required combinations and explicit absence must take precedence over broad modality assumptions where relevant. Do not automatically change old sessions or reassign their history while correcting future availability.

## Exercise technique and media

Technique belongs to the exercise variant. Generic machine identification answers what the object is; a guide answers how to perform a movement. Exact seat/pad settings can vary by physical model and should not be presented as universal numbered settings.

Author each guide with a short setup, movement sequence, two or three useful cues, common mistakes, and reviewed sources. Keep load-entry conventions separate from movement instructions. Add a curated demonstration when it matches the actual exercise and equipment variant. Record review status explicitly; AI-generated or imported drafts are not automatically published instruction.

Start with every exercise in the beginner paths and programme templates exposed there. A first authoring batch of roughly 40–60 guides is a sizing proposal, not a release quota: actual programme coverage decides the number. Expand through the remaining common catalogue in tracked batches. Each newly promoted beginner exercise must have a reviewed text guide. Less-used incomplete entries remain discoverable with an honest “Guide not available yet” state rather than fabricated instruction.

The workout query/view model must load the canonical guide for both planned and ad hoc exercises. Show the same reusable guide in Technique and the library. Keep programme-specific cues available alongside it; targets and progression notes should retain clear labels and should not masquerade as generic technique. Missing media must not leave the tab blank or remove useful text.

For the first version, use reviewed YouTube links; an on-demand embed may be added where it works reliably. Keep a “Watch demonstration” external fallback. Do not autoplay or mount players throughout long lists. A unavailable/deleted/blocked video should leave the text usable. Provide captions where available, accessible player labelling, and reduced-motion/static alternatives to any later custom animation. Text rendering without a player does not imply a new offline content-sync feature.

Keep local presentation in Form v2, while accepting that YouTube's player has its own branding and behaviour. Do not download and rehost third-party videos or thumbnails without an appropriate usage basis. Store source, reviewer and last check date; run link/content checks as part of content maintenance, without creating a scheduled service in this task.

No new animation dependency is needed for this first release. CSS and existing components handle interface feedback. Lottie can later play authored exercise demonstrations; Rive is justified only if teaching becomes interactive. Neither runtime provides accurate exercise content. If later adopted, record bundle cost and design rationale and review every movement before publication.

## Persistent actions and batch addition

### Reuse the current pinned action system

`PinnedActions` already measures its height and informs page spacing. Review its current CSS and all relevant consumers before changing it. Verify equipment onboarding, gym equipment creation, exercise addition, substitution and fallback picking. Extend or correct gaps rather than introduce a second footer system.

The primary action and selected count remain reachable while searching and scrolling. Content clears the footer, safe area, applicable navigation/session strip and keyboard. Error messages do not push the action outside the usable viewport. In tall-text or small-screen states, a compact selected summary opens a review view; never stack every selected exercise into an expanding fixed footer. Keep one main scroll region, visible focus, long names and accessible selection announcements.

### Add several exercises in one submission

Use multi-select only for adding exercises to the active workout. The existing picker/form is also used for replacement and fallback decisions; those retain their one-exercise semantics, including “remember this fallback”. Support a clear mode or a separate batch form rather than silently changing every consumer.

Selection survives searches and filters and has a review/remove control. Within one selection, each exercise appears once. Append in selection order; do not reorder existing workout exercises or introduce workout reordering. If the same exercise is already in the workout, make that visible and preserve any existing intentional-repeat workflow rather than confusing it with a duplicate retry.

Resolve equipment per selected exercise: automatically name the sole valid known instance, ask when several exist, and offer the confirmation flow when inventory is unknown. A machine required for comparable history must not be silently submitted as “Not on a machine”. Optional equipment and portable exercises retain their correct logging semantics. Changing an exercise or gym context invalidates stale selections of incompatible machines; the active session's gym itself remains fixed.

On the server:

- Parse an ordered structured list or use `FormData.getAll`; the current generic form-values helper collapses repeated names, so it cannot carry batch state unchanged.
- Validate authenticated ownership, open session, active exercises, compatible owner/gym instances and appropriate units/measures. Never trust client compatibility maps alone.
- Use one transaction and preserve existing write/session locks. Validate the whole batch before inserting contiguous appended order positions. A failure leaves no partial batch.
- Add a stable submission token/receipt scoped to user and session so a lost response, retry or double tap cannot insert twice. A later intentional add uses a new token; a reused token with a different payload is rejected.
- Retain ordered selections and per-exercise machine choices through validation/network errors. Only announce success and leave the page after server confirmation. Do not imply that an offline request has been saved.
- Reuse session defaults and cache invalidation, and preserve existing set drafts, logged sets, supersets and one-open-session behaviour.

## Current design and motion requirements

Follow root `DESIGN.md` over historical Form v1 documents. Form v2 uses Jost for titles/figures, Atkinson Hyperlegible Next for read text, monochrome ink/ground controls, flat rows and hairlines, and custom glyphs. Colour belongs to the documented sports/prints, not a new accent for equipment selection. Do not copy the earlier planning conversation's copper palette or filled grouped-list direction.

Reuse current components, semantic tokens, onboarding layouts and sheets. The repository's `.claude/skills/` are usable guidance; read `overload-ui` first, then the relevant accessibility or motion skill when doing that work. Do not install or introduce a library just because a skill names one.

Apply current motion rules: button press feedback is 120 ms; sheets follow the documented 0.4-second response/0.08 bounce and 200 ms scrim, with reduced-motion alternatives. The old blanket 180 ms sheet/no-spring rule is retired. Selection and count changes should clarify state without blocking input or moving controls under the thumb. No ambient machine animations in search lists.

Keep at least 44 CSS-pixel touch targets, entered text at least 16 px, visible focus, image-plus-text identification, and support for System/Light/Dark. Verify 320, 360, 375, 402 and 440 CSS-pixel widths, larger screens and 200% text. Assess safe areas, keyboard and installed behaviour on physical iPhone and Android where available; record any unverified cases. Preserve the shared-shell/route JavaScript budget targets in the UI skill.

## Delivery sequence

Each phase should produce a reviewable increment after implementation is authorised. The existing sticky behaviour may be verified in parallel with the data work; new onboarding depends on trustworthy mappings and reference metadata.

| Phase                         | Deliverables                                                                                                                                 | Completion evidence                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1. Reconcile and specify      | Recheck current main, catalogue/guide coverage report, curated missing-item list, explicit equipment-requirement contract and data additions | Source and available environment findings separated; no inferred inventory; reviewed stable-ID compatibility |
| 2. Repair and seed            | Correct mappings, add common missing entries and aliases, introduce versioned recognition/preset/guide metadata, seed validation             | Repeated seed stable; user data/history unchanged; equipment combination and absence cases correct           |
| 3. Pickers                    | Verify current pinned actions, fix uncovered cases, implement batch addition and retry contract                                              | Long-list/keyboard actions reachable; batch atomic and idempotent; substitution/fallback unchanged           |
| 4. Onboarding and recognition | Representative SVGs, curated starter presets, optional short setup, full catalogue access and first-use confirmation                         | Beginners can identify confusable machines; only confirmed equipment becomes inventory; home basics work     |
| 5. Technique                  | Reviewed beginner coverage, curated demos and a shared guide renderer in library/workout                                                     | Planned and ad hoc Technique populated; variants match; text survives media failure                          |
| 6. Review and release         | Independent source/pixel review, targeted regression suite, content review and isolated deployment rehearsal                                 | Acceptance cases pass; production state verified before any authorised deployment; limitations recorded      |

Phases 2, 4 and 5 include content authoring, not just UI code. Do not ship empty guide/illustration placeholders as completed coverage. The exact artwork and first guide batch should be reviewed early so content work does not become a hidden dependency at the end.

## Acceptance and verification

| Area                     | Required checks                                                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference seeds          | Unique stable slugs, valid aliases/preset references and assets; valid exercise measures and mappings; seed twice without duplicates; preserve user-owned rows and history                                                                                 |
| Availability             | Confirmed/unknown/absent distinction; home/outdoor basics; Smith machine plus bench cannot resolve from bench alone; substitute exercise is not an interchangeable machine; conflicting presence/absence handled explicitly                                |
| Onboarding               | Short default view even with a 500-item test catalogue; skip/browse-all work; no suggestions saved until confirmed; returning/retrying does not duplicate instances; false global select-all removed                                                       |
| Recognition              | Representative novices distinguish visually similar equipment using picture and text; naming/alias search finds the same canonical item; dark mode keeps diagram details visible                                                                           |
| Batch addition           | Multiple choices across searches; stable append order; per-item machines; invalid/cross-user/cross-gym input rejects the entire batch; concurrent additions keep unique order; lost-response retry inserts once; intentional later repeat remains possible |
| Existing workflows       | Single-choice replacement/fallback remains correct; prior sets, drafts, history, load comparisons, supersets, programme identity and session gym remain intact                                                                                             |
| Technique                | Same reviewed guide in library/workout; ad hoc exercises have guidance; programme cues retained; incomplete/unreviewed guide clearly distinguished; demo matches variant; missing video leaves readable instructions                                       |
| Mobile and accessibility | Pinned actions and last result visible with keyboard, safe areas and 200% text; names wrap; focus not covered; selection announcements useful; reduced motion; screen-reader labels; both themes                                                           |
| Performance              | No per-row player mounts or external API dependency; guides fetched with appropriate page data; illustration size/lazy loading appropriate; bundle budget changes documented                                                                               |

During implementation, extend existing tests where they exercise these contracts: `src/db/seed/seed.test.ts`, equipment-resolution and workout-equipment tests, session repository/action tests, onboarding form tests, picker tests and logger tests. Use isolated local fixtures for mutations. Follow the UI skill's required checks and the repository's `npm run check`; run relevant browser audits and build checks for actual application changes. A documentation-only commit does not establish application correctness.

Pilot the flow with a few beginners using actual gym equipment before expanding artwork. Observe whether they can recognise a machine, reach their first workout without inventorying the whole gym, find its guide, and add several exercises without scrolling to the page bottom. Treat recognition rate and time-to-first-workout as measurements to collect, not invented success figures.

## Deferred scope and research basis

Deferred: shared verified gym directories, gym-owner administration, camera/AI machine recognition, personal photo uploads, broad paid-media integration, custom movement animation libraries, automated content-maintenance services and unrelated redesigns. These remain options for later evidence, not prerequisites for the approved first release.

Research reviewed on 4 October 2026:

- [NN/g on recognition](https://www.nngroup.com/articles/recognition-and-recall/) and [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) support recognisable choices and deferring detail. They do not establish the exact starter-list size or prove this app's conversion impact.
- [YouTube player parameters](https://developers.google.com/youtube/player_parameters) and [embedding help](https://support.google.com/youtube/answer/171780?hl=en) document player limitations and embed availability. `rel=0` does not remove related videos, and privacy-enhanced embedding does not promise no ads. Keep a link fallback and recheck provider behaviour during implementation.
- [wger](https://wger.readthedocs.io/en/latest/) distinguishes application licensing from exercise-data and image-source licensing. It is a candidate for curated reference work, not an approved wholesale import.
- [free-exercise-db](https://github.com/yuhonas/free-exercise-db) offers a broad candidate catalogue with instructions and images. Its declared licensing and every media asset's provenance still need appropriate review before importing; normalize duplicates and variant names.
- [Motion configuration](https://motion.dev/docs/react-motion-config) illustrates reduced-motion support, but no new runtime is selected for this release. An animation player does not supply reviewed movement instruction.

## Instructions for the verifying agent

Review this plan against the current branch and any newer main changes. Verify code-level claims, source counts, availability semantics, all shared picker consumers, session locks/retry behaviour and the actual Form v2 contract. Recheck external sources if relying on their current licensing or API behaviour. Correct stale facts in place and strengthen missing implementation steps and acceptance cases.

Preserve the five approved product decisions. Label any proposed scope change and explain its tradeoff rather than silently selecting a different approach. The reviewer may refine exact schema layout, presets, asset presentation and guide batches within those decisions. Do not start application implementation, run seeders/migrations, install media/animation dependencies or deploy as part of this verification request. Finish with the material corrections, unresolved decisions and an assessment of implementation readiness.
