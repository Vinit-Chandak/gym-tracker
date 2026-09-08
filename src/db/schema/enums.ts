import { pgEnum } from "drizzle-orm/pg-core";

import {
  EQUIPMENT_CATEGORIES,
  EXERCISE_CATEGORIES,
  EXERCISE_MODALITIES,
  GYM_KINDS,
  LOAD_PORTABILITY,
  LOAD_UNITS,
  PRESCRIPTION_TYPES,
  PROGRAM_STATUSES,
  PROPOSAL_SOURCES,
  PROPOSAL_STATUSES,
  RESISTANCE_MODES,
  RUN_MODES,
  SET_TYPES,
  SLOT_EVENT_STATUSES,
} from "../../domain/types";

export const gymKindEnum = pgEnum("gym_kind", GYM_KINDS);
export const resistanceModeEnum = pgEnum("resistance_mode", RESISTANCE_MODES);
export const loadUnitEnum = pgEnum("load_unit", LOAD_UNITS);
export const equipmentCategoryEnum = pgEnum("equipment_category", EQUIPMENT_CATEGORIES);
export const exerciseCategoryEnum = pgEnum("exercise_category", EXERCISE_CATEGORIES);
export const exerciseModalityEnum = pgEnum("exercise_modality", EXERCISE_MODALITIES);
export const loadPortabilityEnum = pgEnum("load_portability", LOAD_PORTABILITY);
export const prescriptionTypeEnum = pgEnum("prescription_type", PRESCRIPTION_TYPES);
export const programStatusEnum = pgEnum("program_status", PROGRAM_STATUSES);
export const setTypeEnum = pgEnum("set_type", SET_TYPES);
export const runModeEnum = pgEnum("run_mode", RUN_MODES);
export const proposalSourceEnum = pgEnum("proposal_source", PROPOSAL_SOURCES);
export const proposalStatusEnum = pgEnum("proposal_status", PROPOSAL_STATUSES);
export const slotEventStatusEnum = pgEnum("slot_event_status", SLOT_EVENT_STATUSES);
