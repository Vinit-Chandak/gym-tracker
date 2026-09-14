import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { ownerPolicy } from "./common";
import { profiles } from "./profiles";
import type { ReferenceEvidence } from "../../domain/training-evidence";
import type { ProgramBlueprint } from "../../domain/program-blueprint";
import type { LoadUnit } from "../../domain/types";

export type CoachingChangeRecord = {
  scope: string;
  kind: "progression" | "reduction" | "temporary" | "program";
  evidenceIds: string[];
  unit?: LoadUnit;
  exerciseSlug?: string;
  equipmentId?: string | null;
  runMode?: string;
  before: {
    load?: number;
    loads?: { index: number; load: number }[];
    targets?: number[];
    sets?: number;
    duration?: number;
    distance?: number;
  };
  after: {
    load?: number;
    loads?: { index: number; load: number }[];
    targets?: number[];
    sets?: number;
    duration?: number;
    distance?: number;
  };
};

export const coachEvidenceBaselines = pgTable(
  "coach_evidence_baselines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    reference: jsonb("reference").$type<ReferenceEvidence>().notNull(),
  },
  (t) => [
    uniqueIndex("coach_evidence_baselines_scope_uq").on(t.userId, t.scope),
    ownerPolicy("coach_evidence_baselines"),
  ],
).enableRLS();

export const coachChangeRecords = pgTable(
  "coach_change_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    jobId: uuid("job_id"),
    changes: jsonb("changes")
      .$type<CoachingChangeRecord[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Retain the pre-change program for cumulative checks across continuing revisions. */
    programBefore: jsonb("program_before").$type<ProgramBlueprint>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("coach_change_records_user_created_idx").on(t.userId, t.createdAt),
    ownerPolicy("coach_change_records"),
  ],
).enableRLS();
