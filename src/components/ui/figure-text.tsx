import { Fragment } from "react";

/**
 * A Jost figure whose range takes Atkinson's en dash (DESIGN.md, The Two Voices Rule): Jost's
 * own is as long as an em dash.
 */
export function FigureText({ children }: { children: string }) {
  return children.split("–").map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <span className="font-text">–</span>}
      {part}
    </Fragment>
  ));
}
