/** Server-only rollout switches. The workflow master switch still protects every service call. */
export function coachRollout() {
  return {
    intake: process.env.COACH_INTAKE_ENABLED !== "false",
    generation: process.env.COACH_GENERATION_ENABLED !== "false",
    dispatcher: process.env.COACH_DISPATCHER_ENABLED !== "false",
    automaticReviews: process.env.COACH_AUTOMATIC_REVIEWS_ENABLED !== "false",
  };
}
