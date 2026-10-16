# ADR 0056: Each sport owns its programme and progress

Date: 2026-10-16
Status: accepted by the owner; amends the combined-day progression in ADR 0021 and the
programme placement in Profile. ADR 0054's closed-programme policy remains in force pending
the owner's answer about historical scheduled logs after replacement or archive.

## Decision

Strength, running, cycling and swimming each have at most one active programme per athlete.
Starting, editing, reviewing or archiving one sport cannot replace or advance another sport.
Strength keeps its session sequence. Endurance uses dated occurrences: a missed session does
not move onto Today, and it cannot block the next lifting session or another sport.

Training is the management hub. Logging comes first, then cards for existing programmes,
with Edit, Replace programme and outstanding proposals on their own card. Add programme
offers a sport and coach/manual creation. General coach settings remain in Profile.

The coach reads all programmes as coordination context. Its result changes only its target
sport. A suggested change to another sport is a separately reviewable draft. Each sport has
its own intake, review cadence and programme requests. A shared account-level switch, quota
and evidence history remain shared. A standalone coach session saves as a reusable routine
or endurance template, with an idempotent receipt, without replacing any programme.

## Logging a date

Training accepts today or an earlier local date. An exact scheduled session is explicitly
selected before logging; its occurrence/revision or lifting cycle/day identifies what counts.
Choosing a date or logging an independent session never matches a programme implicitly.
Past sessions in a continuing endurance programme retain their prescriptions and remain
available for later logging. Future programme edits cannot delete or rewrite that history.

Backdated entries store the actual training date/time. Lifting entered through the date
chooser is explicitly marked retrospective: it has no live rest timer or abandoned-workout
prompt, asks for its actual finish time, and returns to Training. Existing live workout and
overnight-finish behaviour is preserved.

## Existing combined programmes

The additive migration keeps the original lifting programme, day IDs, exercise lineage and
slot events. It moves each endurance sport's existing occurrences into its own family,
retaining occurrence IDs, immutable revisions and logged activity links. Raw run rows remain
on the original for history and are copied to the running programme where needed. Replaying
the split is idempotent. Existing queued combined jobs are superseded; a revised future
endurance schedule is requested from the coach for athlete review.

No workout, set, activity, logged prescription or completion is deleted. Local integration
tests compare the history tables before/after the real migration and verify lifting progress.
The migration is prepared and tested locally; applying it to a hosted database is a deployment
step, not a side effect of working on this feature.

## Responsive and PWA behaviour

This extends Form v2's existing tokens and controls. Programme cards fold to one column as
space or text requires. Logging shortcuts use container queries with text-relative thresholds:
one column below 14rem of content, two ordinarily, four from 32rem. No fixed font size is
introduced. The existing online PWA, network-only private pages and local draft recovery
remain the contract; no private-page cache or offline submission queue is added.
