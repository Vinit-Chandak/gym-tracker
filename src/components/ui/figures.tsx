import { Fragment } from "react";

const RUN = /(\d+(?:[.,:]\d+)*)/;

/**
 * A fact's figures in Jost's tabular digits, whose zero is plain (Atkinson's is slashed, and
 * reads as a machine's): "70–90 min" sets 70 and 90 in Jost and keeps the en dash and the unit
 * in Atkinson, since Jost's dash is as long as an em dash (DESIGN.md, The Two Voices Rule).
 */
export function Figures({ children }: { children: string }) {
  // One span around the runs: in a flex fact (the meta line's), each run would otherwise be an
  // item of its own, the gap between them opening "70–90" to "70 – 90".
  return (
    <span>
      {children.split(RUN).map((part, index) =>
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
