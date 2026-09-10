import { pgEnum } from "drizzle-orm/pg-core";

import {
  COACH_REQUEST_STATUSES,
  EQUIPMENT_CATEGORIES,
  EXERCISE_CATEGORIES,
  EXERCISE_MODALITIES,
  GYM_KINDS,
  LOAD_PORTABILITY,
  LOAD_UNITS,
  PLAN_STATUSES,
  PLAN_TRIGGERS,
  PRESCRIPTION_TYPES,
  PROGRAM_STATUSES,
  PROPOSAL_SOURCES,
  PROPOSAL_STATUSES,
  RESISTANCE_MODES,
  RUN_MODES,
  SET_TYPES,
  SEXES,
  SLOT_EVENT_STATUSES,
  SLOT_PARTS,
  TRAINING_GOALS,
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
export const slotPartEnum = pgEnum("slot_part", SLOT_PARTS);
export const planStatusEnum = pgEnum("plan_status", PLAN_STATUSES);
export const planTriggerEnum = pgEnum("plan_trigger", PLAN_TRIGGERS);
export const coachRequestStatusEnum = pgEnum("coach_request_status", COACH_REQUEST_STATUSES);
export const sexEnum = pgEnum("sex", SEXES);
export const trainingGoalEnum = pgEnum("training_goal", TRAINING_GOALS);
