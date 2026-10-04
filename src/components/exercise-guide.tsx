import type { Route } from "next";
import type { ReactNode } from "react";

import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import type { ExerciseGuidance, GuideSource } from "@/lib/guidance";

/** A caption over its text, under a hairline (the Technique board). */
function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="guide-row">
      <dt className="type-caption text-ink-2">{term}</dt>
      <dd className="guide-text">{children}</dd>
    </div>
  );
}

function Lines({ items, numbered = false }: { items: readonly string[]; numbered?: boolean }) {
  const List = numbered ? "ol" : "ul";
  return (
    <List className={numbered ? "guide-list guide-steps" : "guide-list"}>
      {items.map((item, index) => (
        <li key={`${index}:${item}`}>{item}</li>
      ))}
    </List>
  );
}

/**
 * How to do an exercise (plan: exercise technique and media), the same in the workout's
 * Technique tab and in the library: the guide's Setup, Steps, Cues and Common mistakes, then How
 * to log, then the programme's cue when the slot has one, then the demonstration and the way to
 * the library. An exercise with no guide says so plainly rather than inventing one, and keeps
 * everything else that is written about it. Guidance is the same for everyone. A draft, shown
 * only where drafts are, says it awaits review.
 */
export function ExerciseGuide({
  guidance,
  programmeCue = null,
  libraryHref,
  sources,
}: {
  guidance: ExerciseGuidance;
  /** The programme slot's cue, in the workout only. */
  programmeCue?: string | null;
  /** The exercise's library page, from the workout; the library itself has none. */
  libraryHref?: Route;
  /** Where the guide was checked: the library lists them, the workout leaves them out. */
  sources?: readonly GuideSource[];
}) {
  const { guide, logNote, notes, ownNotes, formUrl, demonstrations } = guidance;
  const draft = guide?.status === "draft" || demonstrations.some((d) => d.status !== "approved");
  const shownNotes = notes && (ownNotes || !guide) ? notes : null;
  return (
    <div className="guide">
      {draft && <p className="guide-draft">Draft for review</p>}
      {/* A custom exercise is the athlete's own: their notes are its guide. */}
      {!guide && !ownNotes && (
        <p className="guide-row guide-text text-ink-2">Guide not available yet.</p>
      )}
      {(guide || shownNotes || logNote || programmeCue) && (
        <dl>
          {guide && (
            <>
              <Row term="Setup">{guide.setup}</Row>
              <Row term="Steps">
                <Lines items={guide.steps} numbered />
              </Row>
              <Row term="Cues">
                <Lines items={guide.cues} />
              </Row>
              <Row term="Common mistakes">
                <Lines items={guide.mistakes} />
              </Row>
            </>
          )}
          {shownNotes && (
            <Row term={ownNotes ? "Your notes" : "Notes"}>
              <span className="whitespace-pre-line">{shownNotes}</span>
            </Row>
          )}
          {logNote && <Row term="How to log">{logNote}</Row>}
          {programmeCue && <Row term="Programme cue">{programmeCue}</Row>}
        </dl>
      )}
      {demonstrations.map((demo) => (
        <a
          key={demo.url}
          href={demo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="guide-link"
        >
          <span className="min-w-0 flex-1">
            <span className="block">Watch demonstration</span>
            <span className="block type-meta-small font-medium text-ink-2">
              {demo.channel}, on YouTube
            </span>
          </span>
          <Glyph name="play" className="glyph-20" />
        </a>
      ))}
      {!guide && formUrl && (
        <a href={formUrl} target="_blank" rel="noopener noreferrer" className="guide-link">
          <span className="min-w-0 flex-1">Read a form guide</span>
          <Glyph name="chevronRight" className="glyph-20" />
        </a>
      )}
      {libraryHref && (
        <Link href={libraryHref} className="guide-link">
          <span className="min-w-0 flex-1">Open in the exercise library</span>
          <Glyph name="chevronRight" className="glyph-20" />
        </Link>
      )}
      {guide && sources && sources.length > 0 && (
        <p className="guide-sources type-meta-small text-ink-2">
          Checked against{" "}
          {sources.map((source, index) => (
            <span key={source.url}>
              {index > 0 && (index === sources.length - 1 ? " and " : ", ")}
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
                {source.publisher}
              </a>
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}
