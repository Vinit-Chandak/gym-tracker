import type { Route } from "next";
import type { ReactNode } from "react";

import { FitTitle } from "@/components/ui/fit-title";

import { BackLink } from "./back-link";

type PageHeaderProps<T extends string> = {
  tab?: never;
  /** The screen's name. */
  title: ReactNode;
  /** The one fact that qualifies it: the range Progress is drawn over, the gym a form is for. */
  meta?: ReactNode;
  /**
   * The fact is said with the title rather than shown under it, where the screen already shows
   * it (a meal of today's: board Dinner).
   */
  metaHidden?: boolean;
  /** Fallback for a direct link; otherwise Back returns to the previous browser entry. */
  backHref?: Route<T>;
  /** What to call that destination, when the section it sits in is vaguer than the page. */
  backLabel?: string;
  /** At most one control: beside a destination's title, or at the end of a nested screen's bar. */
  action?: ReactNode;
};

type RootHeaderProps = {
  /** The tab whose root this is, which the h1 names first for a screen reader: "Today". */
  tab: string;
  /** The subject, the visible headline in Title: "Wednesday", "This week", the athlete's name. */
  title: string;
  /**
   * What the h1 says after the title, where the title alone is not the whole subject: the day
   * a weekday is ("21 October"). Said, not shown: the meta under the title shows it.
   */
  said?: string;
  /**
   * The headline as a control (Progress's section chooser), standing where the title stands.
   * The h1 then names the tab and the title for a screen reader alone, beside it.
   */
  chooser?: ReactNode;
  /** Before the headline: the athlete's avatar. */
  lead?: ReactNode;
  /** Under the headline, in Meta: "21 October · 1 of 3 done", the week's dates, the range. */
  meta?: ReactNode;
  /** At most one action, at the end. */
  action?: ReactNode;
};

/**
 * A tab's root (DESIGN.md, Layout: Tab roots). The lit tab already says where you are, so the
 * root opens on its subject, never on the tab's name: Title, at the same place and size on every
 * tab, what it needs to say under it in Meta, and at most one action at its end, which goes
 * under the headline and its Meta, at the end, where the headline would not have its own width
 * beside it (large text, a long name). The h1 still names the tab first for a screen reader:
 * "Today, Wednesday 21 October".
 */
function RootHeader({ tab, title, said, chooser, lead, meta, action }: RootHeaderProps) {
  const heard = `${tab}, ${title}${said ? ` ${said}` : ""}`;
  // The headline's own width, as Jost 700 sets it (about 0.52 em a character), the chooser's
  // chevron and the avatar added: the room it keeps before the action goes under it, so a name
  // stands on one line wherever the screen has the line for it ("Vinit Chandak"), and wraps
  // only where it does not.
  const room = `min(100%, calc(${(title.length * 0.52 + (chooser ? 1 : 0)).toFixed(2)} * var(--ov-type-title)${
    lead ? " + 70 * var(--ov-u)" : ""
  }))`;
  // Beside the avatar, the headline keeps at least its longest word's room (about 0.56 em a
  // letter), else it goes under the avatar rather than break inside a word (large text).
  const longest = Math.max(...title.split(/\s+/).map((word) => word.length));
  const word = `min(100%, calc(${(longest * 0.56).toFixed(2)} * var(--ov-type-title)))`;
  return (
    <header className="page-header page-root page-width pt-safe">
      <div className="page-root-top">
        <div className="page-root-head" style={action ? { flexBasis: room } : undefined}>
          {lead && <div className="page-root-lead">{lead}</div>}
          <div className="page-root-text" style={lead ? { flexBasis: word } : undefined}>
            {chooser ? (
              <>
                <h1 className="sr-only">{heard}</h1>
                <div className="page-root-chooser">{chooser}</div>
              </>
            ) : (
              // The spaces stand between the words' boxes, so the name is read with them.
              <h1 className="page-root-title">
                <span className="sr-only">{tab},</span> {title}
                {said && (
                  <>
                    {" "}
                    <span className="sr-only">{said}</span>
                  </>
                )}
              </h1>
            )}
            {meta && (
              <div className="page-root-meta">
                {typeof meta === "string" ? <span className="min-w-0">{meta}</span> : meta}
              </div>
            )}
          </div>
        </div>
        {action && <div className="page-header-action page-root-action">{action}</div>}
      </div>
    </header>
  );
}

/**
 * Every screen's opening (DESIGN.md, Navigation), in three shapes, scrolling with the page:
 *
 * - a tab's root (`tab`) opens on its subject, with its tab named first for a screen reader
 *   (`RootHeader`);
 * - a destination with no tab of its own (Not found, a loading screen) has its title, Jost 36
 *   (32 under 360 pt), and at most one action beside it;
 * - a nested screen has a back link that names where it goes, then its name as the screen's
 *   display title, stepping down for a long name, and its one fact under it.
 */
export function PageHeader<T extends string>(props: PageHeaderProps<T> | RootHeaderProps) {
  if (props.tab !== undefined) return <RootHeader {...props} />;
  const { title, meta, metaHidden = false, backHref, backLabel, action } = props;
  if (!backHref)
    return (
      <header className="page-header page-width pt-safe">
        <div className="page-header-top">
          <div className="min-w-0">
            <h1 className="type-title [overflow-wrap:break-word]">{title}</h1>
            {meta && (
              <p className="mt-1 type-meta-small [overflow-wrap:break-word] text-ink-2 tabular-nums">
                {meta}
              </p>
            )}
          </div>
          {action && <div className="page-header-action">{action}</div>}
        </div>
      </header>
    );

  return (
    <header className="page-header page-width pt-safe">
      <div className="page-header-bar">
        <BackLink fallback={backHref} label={backLabel} />
        {action && <div className="page-header-action">{action}</div>}
      </div>
      {typeof title === "string" ? (
        <FitTitle
          as="h1"
          sizes={{ base: 34, narrow: 30 }}
          className="mt-0.5"
          said={metaHidden && typeof meta === "string" ? meta : undefined}
        >
          {title}
        </FitTitle>
      ) : (
        <h1 className="mt-0.5 type-display [overflow-wrap:break-word]">{title}</h1>
      )}
      {meta && !metaHidden && (
        // Words are one fact; facts given as elements are laid out by the line.
        <p className="meta-line mt-1 [overflow-wrap:break-word]">
          {typeof meta === "string" ? <span className="min-w-0">{meta}</span> : meta}
        </p>
      )}
    </header>
  );
}
