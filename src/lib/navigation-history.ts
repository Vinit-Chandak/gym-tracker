/** A marker on each real browser entry, so Back also survives reload and browser Back/Forward. */
const KEY = "overloadPreviousPage";
const CHANGE = "overload-navigation-history";

function appPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/^\/(?:login|signup|forgot-password|reset-password|auth)(?:[/?#]|$)/.test(value)
  );
}

export function previousAppPage(): string | null {
  const value: unknown = window.history.state?.[KEY];
  return appPath(value) ? value : null;
}

export function subscribeNavigation(listener: () => void) {
  window.addEventListener(CHANGE, listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener(CHANGE, listener);
    window.removeEventListener("popstate", listener);
  };
}

/** Preserve Next's history state and methods; add only our own previous-page marker. */
export function trackNavigationHistory() {
  const history = window.history;
  const push = history.pushState;
  const replace = history.replaceState;
  const notify = () => window.dispatchEvent(new Event(CHANGE));
  const path = () => window.location.pathname + window.location.search + window.location.hash;
  const pushState: History["pushState"] = function (data, unused, url) {
    const from = path();
    push.call(history, { ...data, [KEY]: appPath(from) ? from : null }, unused, url);
    notify();
  };
  const replaceState: History["replaceState"] = function (data, unused, url) {
    replace.call(history, { ...data, [KEY]: previousAppPage() }, unused, url);
    notify();
  };
  history.pushState = pushState;
  history.replaceState = replaceState;
  return () => {
    if (history.pushState === pushState) history.pushState = push;
    if (history.replaceState === replaceState) history.replaceState = replace;
  };
}
