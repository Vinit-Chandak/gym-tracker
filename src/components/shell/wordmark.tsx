/**
 * The app's name, and the only mark it carries: a full stop in the accent.
 *
 * Both places that say it — the masthead on Today and the rail at desktop widths — render
 * this, so the two cannot drift apart. The stop is decoration, so it is hidden from the
 * screen reader that would otherwise read the name as a sentence.
 */
export function Wordmark() {
  return (
    <>
      Overload
      <span className="text-accent" aria-hidden>
        .
      </span>
    </>
  );
}
