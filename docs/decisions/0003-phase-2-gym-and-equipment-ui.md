# ADR 0003: Phase 2 gym and equipment management

Date: 2026-09-08
Status: accepted

## Context

Phase 2 adds the first data-entry screens: gyms and the machines at each gym. The user trains
at three gyms, so switching gyms has to be a one-tap action, and machine identity must survive
renames and archiving because set history is keyed on it.

## Decisions

1. **Full-page forms, not modals.** Create and edit screens are routes
   (`/gyms/new`, `/gyms/[gymId]/edit`, `/gyms/[gymId]/equipment/new`,
   `/gyms/[gymId]/equipment/[equipmentId]`). Back navigation and the browser history work as
   expected on iPhone, and each screen stays small.

2. **Server actions + `useActionState`.** Every form posts to a server action that validates
   with Zod (`src/server/validation/`), calls a repository function inside `withUser`, then
   revalidates and redirects. Validation errors come back per field with the submitted values,
   so nothing typed is lost. Repositories (`src/server/repositories/`) hold the database logic
   and are tested against PGlite; actions stay thin.

3. **Archive, never delete.** Gyms and machines get `is_active = false`. Archived items are
   hidden from pickers and shown under an "Archived" disclosure with a Restore button. Foreign
   keys on sessions and workout exercises use `ON DELETE RESTRICT`, so deletion is not offered.

4. **Default gym rules.** Exactly one default per user (partial unique index). The first real
   gym a user creates becomes the default automatically. Archiving the default clears the flag;
   an archived gym cannot be made default. The Today tab shows the default gym with a
   bottom-sheet switcher that changes it in one tap; Phase 4 reuses the same sheet to pick the
   gym for a session.

5. **Machine names are unique per gym, case-insensitively**, checked before insert and again
   via the unique index. Renaming a gym keeps its slug; slugs are internal identifiers, URLs use
   ids.

6. **Controls chosen for gym use.** Native `<select>` for the equipment type (iOS shows its
   own picker for the long list, grouped by category), radio-backed segmented controls for
   gym type, load mode and unit (work without JavaScript), 44px+ tap targets everywhere, and a
   native `<dialog>` bottom sheet for the gym switcher.

7. **Choosing an equipment type prefills** the load mode, unit and a name from the type's
   defaults until the user edits those fields.

## Consequences

- Phase 3 can compute "available at this gym" from `equipment_instances` plus the exercise's
  equipment options, with barbells, dumbbells and bodyweight assumed present at every real gym.
- Free weights are not registered as machines; a gym with no machines is a valid state.
