import { Fragment } from "react";

/**
 * A figure whose range keeps its en dash a word's (DESIGN.md, The One Voice Rule): the dash is
 * set in the text role, so a figure role's tight tracking never closes it up.
 */
export function FigureText({ children }: { children: string }) {
  return children.split("–").map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <span className="font-text">–</span>}
      {part}
    </Fragment>
  ));
}
