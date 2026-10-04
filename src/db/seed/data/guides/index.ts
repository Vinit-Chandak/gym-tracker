import { GUIDES_A, MEDIA_A } from "./batch-a";
import { GUIDES_B, MEDIA_B } from "./batch-b";
import { GUIDES_C, MEDIA_C } from "./batch-c";
import type { GuideSeed, MediaSeed } from "./types";

/**
 * Every exercise guide and demonstration link, in batches as they were drafted. The first
 * release covers the core set (plan: Technique and media): the template's exercises and
 * fallbacks, what the gym basics and starter extras make available, and the movements beginner
 * programmes use.
 *
 * - Batches A and B: the template's 34 exercises, fallbacks included, and machines people meet
 *   first (chest press, shoulder press, Smith squat, assisted pull-up).
 * - Batch C: the starter extras' machines (hack squat, hip thrust, ab crunch, adductor, standing
 *   calf raise, chest-supported row, assisted dip) and the movements beginner programmes use
 *   (goblet squat, push-up, plank, dead bug, glute bridge, rows, presses, hinges, chin-up).
 *
 * All are drafts and every video a candidate until the owner reviews them; the seed lays them
 * down everywhere, and only screens where drafts are shown display them (`showsDrafts`).
 */
export const GUIDES: readonly GuideSeed[] = [...GUIDES_A, ...GUIDES_B, ...GUIDES_C];
export const MEDIA: readonly MediaSeed[] = [...MEDIA_A, ...MEDIA_B, ...MEDIA_C];
