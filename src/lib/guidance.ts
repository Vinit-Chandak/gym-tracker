/**
 * What Technique and the library say about how to do an exercise (plan: exercise technique and
 * media), in the shape both screens render. The server builds it from the stored guide, the
 * demonstrations and the exercise's own notes, already filtered for drafts.
 */

/** A guide as a screen shows it: how to set up, the steps, the cues and the mistakes. */
export type GuideContent = {
  /** "draft" only where drafts are shown; it says it awaits review. */
  status: "draft" | "published";
  setup: string;
  steps: string[];
  cues: string[];
  mistakes: string[];
};

/** A demonstration elsewhere, opened there (plan: "Watch demonstration" opens YouTube). */
export type Demonstration = {
  title: string;
  channel: string;
  url: string;
  /** "candidate" only where drafts are shown: the owner has not approved it yet. */
  status: "candidate" | "approved";
};

/** Where a guide was checked. */
export type GuideSource = { title: string; publisher: string; url: string };

export type ExerciseGuidance = {
  guide: GuideContent | null;
  /** How a set of it is logged ("Load is per dumbbell."), which is not part of the movement. */
  logNote: string | null;
  /**
   * The exercise's own written notes: the athlete's on a custom exercise, or what a shared
   * exercise said before it had a guide, kept until its guide is published.
   */
  notes: string | null;
  /** Whose notes they are: a custom exercise's belong to the athlete. */
  ownNotes: boolean;
  /** An older reference page, offered only while there is no guide to read in its place. */
  formUrl: string | null;
  demonstrations: Demonstration[];
};

/** What Technique says when nothing was read: a session read without guidance. */
export const NO_GUIDANCE: ExerciseGuidance = {
  guide: null,
  logNote: null,
  notes: null,
  ownNotes: false,
  formUrl: null,
  demonstrations: [],
};

type StoredGuide = {
  status: string;
  setup: string;
  steps: string[];
  cues: string[];
  mistakes: string[];
};
type StoredMedia = { title: string; channel: string; url: string; status: string };

/**
 * One exercise's guidance from what is stored. `guide` and `media` must already be the ones the
 * viewer may see (drafts only where drafts are shown). A custom exercise has no shared guide:
 * its notes are the athlete's own.
 */
export function guidanceOf(
  exercise: {
    userId: string | null;
    formNotes: string | null;
    formUrl: string | null;
    logNote: string | null;
  },
  guide: StoredGuide | null,
  media: readonly StoredMedia[],
): ExerciseGuidance {
  const own = exercise.userId !== null;
  return {
    guide:
      guide && !own
        ? {
            status: guide.status === "published" ? "published" : "draft",
            setup: guide.setup,
            steps: guide.steps,
            cues: guide.cues,
            mistakes: guide.mistakes,
          }
        : null,
    logNote: exercise.logNote?.trim() || null,
    notes: exercise.formNotes?.trim() || null,
    ownNotes: own,
    formUrl: exercise.formUrl?.trim() || null,
    demonstrations: own
      ? []
      : media.map((item) => ({
          title: item.title,
          channel: item.channel,
          url: item.url,
          status: item.status === "approved" ? "approved" : "candidate",
        })),
  };
}
