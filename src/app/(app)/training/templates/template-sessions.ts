import { ENDURANCE_SPORTS, type ActivitySport, type EnduranceSport } from "@/domain/activity";

const SESSION_WORDS: Record<EnduranceSport, string> = {
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

/**
 * What a template is written for, in the sports the athlete has on: "a run", "a run or ride",
 * "a run, ride or swim". Templates told Meera, who only runs, to write a ride or a swim, and a
 * lifter with no endurance on the same (year audit, October 2026). With none on it names all
 * three, which is what a template can be: the page is still there for anyone who opens it,
 * though Training no longer leads there (`hasTemplateSports`).
 */
export function templateSessions(enabled: readonly ActivitySport[]): string {
  const own = ENDURANCE_SPORTS.filter((sport) => enabled.includes(sport));
  const words = (own.length > 0 ? own : ENDURANCE_SPORTS).map((sport) => SESSION_WORDS[sport]);
  return `a ${
    words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`
  }`;
}

/** Whether templates are anything to this athlete: a run, ride or swim they have on. */
export function hasTemplateSports(enabled: readonly ActivitySport[]): boolean {
  return ENDURANCE_SPORTS.some((sport) => enabled.includes(sport));
}
