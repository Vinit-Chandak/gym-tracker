/** Match the route Next would render: a literal sibling wins over a dynamic segment. */
export function createRouteMatcher(templates) {
  const priority = (part) => (part.startsWith("[...") ? 0 : part.startsWith("[") ? 1 : 2);
  const routes = templates
    .map((template) => ({
      template,
      parts: template.split("/"),
      matcher: new RegExp(
        `^${template
          .split("/")
          .map((part) =>
            part.startsWith("[...")
              ? ".+"
              : part.startsWith("[")
                ? "[^/]+"
                : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          )
          .join("/")}$`,
      ),
    }))
    .sort((a, b) => {
      for (let index = 0; index < Math.min(a.parts.length, b.parts.length); index++) {
        const difference = priority(b.parts[index]) - priority(a.parts[index]);
        if (difference) return difference;
      }
      return b.parts.length - a.parts.length;
    });
  return (pathname) => routes.find((route) => route.matcher.test(pathname))?.template ?? null;
}

/** A caught server failure can render the error boundary after HTTP 200 has already streamed. */
export function hasUnexpectedErrorScreen(row) {
  const requested = new URL(row.route ?? "/", "http://localhost").pathname;
  const rendered = new URL(row.url ?? row.route ?? "/", "http://localhost").pathname;
  if (requested === "/preview/error" && rendered === "/preview/error") return false;
  if (typeof row.errorScreen === "boolean") return row.errorScreen;
  // Older captures have only body text. Require the boundary's heading and explanation,
  // so an ordinary note containing the heading does not invalidate an otherwise good visit.
  return (
    /(^|\n)Something went wrong(\n|$)/.test(row.text ?? "") &&
    /(?:The page could not load\.|The app could not start\.|You’re offline\. Reconnect and)/.test(
      row.text ?? "",
    )
  );
}

/** Streamed not-found/error responses can have HTTP 200 without rendering the requested screen. */
export function isSuccessfulScreenVisit(row) {
  return (
    !row.error &&
    row.status < 400 &&
    !row.expectedNotFound &&
    !row.unexpectedNotFound &&
    !row.unexpectedErrorScreen &&
    !hasUnexpectedErrorScreen(row) &&
    !row.unexpectedDestination &&
    !row.overflow &&
    !row.errors?.length &&
    !row.accessibility?.length
  );
}
