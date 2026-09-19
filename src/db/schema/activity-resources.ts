import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { serverWritePolicies, timestamps } from "./common";
import { activityResourceKindEnum, lengthUnitEnum } from "./multisport-enums";
import { profiles } from "./profiles";

/**
 * The pool, the bike, the trainer, the lake (plan §6.3, DATA-03).
 *
 * Small owned identities that make a comparison meaningful — two rides on the same trainer
 * can be compared; two swims in pools of different lengths cannot be pretended equal. They
 * are not gyms, they are not a location history, and nothing here is ever shared: a log keeps
 * its own snapshot of the label and the size, so renaming a pool next year does not rewrite
 * what was swum in it.
 */
export const activityResources = pgTable(
  "activity_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: activityResourceKindEnum("kind").notNull(),
    name: text("name").notNull(),
    /** Pools only: the length, in the unit it is described in, and its canonical metres. */
    poolLengthNative: numeric("pool_length_native", { precision: 14, scale: 6, mode: "number" }),
    poolLengthUnit: lengthUnitEnum("pool_length_unit"),
    poolLengthMetres: numeric("pool_length_metres", { precision: 14, scale: 6, mode: "number" }),
    notes: text("notes"),
    isDefault: boolean("is_default").notNull().default(false),
    /** Referenced by history, so archived rather than deleted. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("activity_resources_owner_id_uq").on(t.userId, t.id),
    uniqueIndex("activity_resources_owner_kind_name_uq").on(t.userId, t.kind, t.name),
    index("activity_resources_owner_kind_idx").on(t.userId, t.kind),
    check("activity_resources_name_chk", sql`length(name) between 1 and 80`),
    check(
      "activity_resources_pool_chk",
      sql`((pool_length_native is null) = (pool_length_unit is null))
        and ((pool_length_native is null) = (pool_length_metres is null))
        and (pool_length_native is null or (pool_length_native > 0 and pool_length_native <= 1000))
        and (pool_length_native is null or kind = 'pool')`,
    ),
    ...serverWritePolicies("activity_resources"),
  ],
).enableRLS();
