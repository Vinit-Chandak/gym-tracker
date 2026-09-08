# 0009 — Start Lower A on Tuesday with Tuesday–Monday weeks

Status: accepted, 2026-09-08. Supersedes the initial partial-cycle start in ADR 0005 and the
Monday-based reporting weeks in ADRs 0007–0008.

The user confirmed that the cycle should begin with Lower A on Tuesday, 8 September 2026.
The previous starter matched the start date to the original workbook weekday and began at
Upper A, omitting Lower A from cycle 1. New starter programmes now always begin at their first
sequence slot. Day and run weekday labels shift together:

| Day       | Session                |
| --------- | ---------------------- |
| Tuesday   | Lower A                |
| Wednesday | Upper A                |
| Thursday  | Easy Run + Arms        |
| Friday    | Lower B                |
| Saturday  | Upper B                |
| Sunday    | Easy Run + Light Upper |
| Monday    | Rest + Mobility        |

Week 1 covers 8–14 September; week 2 starts 15 September. Eight complete cycles contain 56
day slots and 48 lifting sessions, ending Monday, 2 November with uninterrupted daily progress.
Missed training still follows the existing shift policy. Reporting weeks, running volume/spike
calculations and coach summaries now use Tuesday–Monday in the account time zone.

Migration `0005_tuesday_cycle` archives the unused legacy starter version and clones its days,
prescriptions, warm-ups, equipment preferences, fallbacks and run targets into the next version
in the same family. Only the start slot and weekday alignment change. It targets the original
8 September, eight-week starter with `start_day_index = 2`, and refuses to replace a programme
with any workout, slot event or linked run. Repeating the migration does not create another
version. The user's live programme was checked before applying the migration: no workouts,
events, runs or open sessions existed.

Tests cover seed alignment, Lower A → Upper A, full-cycle length, Monday/Tuesday boundaries,
analytics grouping, Thursday/Sunday run targets, version preservation, migration idempotency
and retaining programmes with existing workouts.
