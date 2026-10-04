/**
 * How to perform a movement, written for Overload and reviewed before anyone sees it.
 *
 * A guide belongs to one exercise variant: a seated leg curl and a lying one are different
 * guides. It says how to set up, the movement's steps, two or three cues worth remembering and
 * the mistakes people make. How to log a set (per dumbbell, added load only) is not part of the
 * movement and lives on the exercise as its `logNote`.
 *
 * Every guide starts as a draft. A draft is shown only in development and in environments that
 * opt in (`OVERLOAD_SHOW_DRAFTS=1`); it is published when the owner has reviewed it, and the
 * reviewer and the date are recorded here (plan: owner decisions, content and delivery).
 */
export type GuideStatus = "draft" | "published";

export type GuideSource = {
  /** What the page or paper is called. */
  title: string;
  /** Who publishes it: ACE, NASM, NHS, NSCA, a journal. */
  publisher: string;
  url: string;
};

export type GuideSeed = {
  /** The exercise's permanent slug. */
  exercise: string;
  /** Raised whenever the text changes after review, so a reviewer knows what they approved. */
  version: number;
  status: GuideStatus;
  /** One to three sentences: where to stand or sit, what to adjust, how to hold it. */
  setup: string;
  /** Three to six steps, each one sentence, in the order they happen. */
  steps: string[];
  /** Two or three short cues to keep in mind during the set. */
  cues: string[];
  /** Two to four common mistakes, each saying what goes wrong. */
  mistakes: string[];
  /** Where the instruction was checked. The text is Overload's own, never copied. */
  sources: GuideSource[];
  /** Who wrote the draft, for example "Claude (AI draft)". */
  draftedBy: string;
  /** Who approved it for publication; null until reviewed. */
  reviewer: string | null;
  /** ISO date of the review; null until reviewed. */
  reviewedOn: string | null;
};

export type MediaStatus = "candidate" | "approved";

/**
 * A demonstration on YouTube, opened there rather than embedded (plan: Technique and media).
 * A candidate is a proposal awaiting the owner; only an approved one is offered in production.
 */
export type MediaSeed = {
  exercise: string;
  provider: "youtube";
  /** The 11-character video id. */
  videoId: string;
  /** Where the demonstration starts, when the video has an introduction to skip. */
  startSeconds?: number;
  title: string;
  channel: string;
  url: string;
  /** Why linking is allowed: "Link to YouTube; nothing embedded or rehosted." */
  usageBasis: string;
  /** ISO date the link was last checked to exist and match the exercise. */
  checkedOn: string;
  status: MediaStatus;
};
