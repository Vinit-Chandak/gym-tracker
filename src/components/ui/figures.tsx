import { Fragment } from "react";

import { FIGURE_RUN } from "./fit";

/**
 * A fact's figures as figures (DESIGN.md, The One Voice Rule): "70–90 min" sets 70 and 90 tabular
 * and lining, so a figure that updates never moves its line, and leaves the en dash and the unit
 * as words.
 */
export function Figures({ children }: { children: string }) {
  // One span around the runs: in a flex fact (the meta line's), each run would otherwise be an
  // item of its own, the gap between them opening "70–90" to "70 – 90".
  return (
    <span>
      {children.split(FIGURE_RUN).map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="figures">
            {part}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </span>
  );
}
