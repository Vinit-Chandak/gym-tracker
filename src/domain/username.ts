/**
 * The public handle: what appears after `@` on a profile and in `/u/[username]`.
 *
 * Lowercase letters, digits, dots and underscores, three to twenty characters, starting and
 * ending with a letter or digit, never two dots in a row. Stored lowercase so the unique index
 * needs no `lower()`, and short enough to read in a phone's address bar. The same rules live in
 * SQL — the check constraint on `profiles.username` and `generate_username()` — and a test holds
 * the reserved list here and the one in the migration to the same words.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$/;

/** Every route segment a username could collide with, and a few names nobody should own. */
export const RESERVED_USERNAMES: readonly string[] = [
  "me",
  "u",
  "profile",
  "settings",
  "friends",
  "compare",
  "leaderboard",
  "admin",
  "overload",
  "coach",
  "api",
  "auth",
  "login",
  "signup",
  "welcome",
  "today",
  "runs",
  "history",
  "progress",
  "gyms",
  "exercises",
  "workouts",
  "preview",
  "support",
  "help",
];

/** What people type, made canonical: trimmed, lowercased, a leading `@` dropped. */
export function normaliseUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function isReservedUsername(candidate: string): boolean {
  return RESERVED_USERNAMES.includes(candidate);
}

/** True for a canonical name that meets every rule, reservations included. */
export function isValidUsername(candidate: string): boolean {
  return (
    USERNAME_PATTERN.test(candidate) && !candidate.includes("..") && !isReservedUsername(candidate)
  );
}

/**
 * The one-line reason a name is refused, or null when it is fine. The forms show it under the
 * field and the availability check uses it to skip the server for a name that could never be
 * taken.
 */
export function usernameProblem(candidate: string): string | null {
  if (candidate.length < USERNAME_MIN_LENGTH || candidate.length > USERNAME_MAX_LENGTH) {
    return `Use ${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_PATTERN.test(candidate) || candidate.includes("..")) {
    return "Lowercase letters, digits, dots and underscores; start and end with a letter or digit.";
  }
  if (isReservedUsername(candidate)) return "That name is reserved.";
  return null;
}

/**
 * A starting point for a username, from the local part of an email address: lowercased,
 * characters outside the alphabet dropped, runs of dots collapsed, the ends tidied, padded with
 * zeros to the minimum length. Empty when nothing usable is left, in which case the caller falls
 * back to a name derived from the account id. Mirrors the SQL in `generate_username()`.
 */
export function usernameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  let base = local
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, USERNAME_MAX_LENGTH)
    .replace(/[._]+$/, "");
  if (base === "") return "";
  while (base.length < USERNAME_MIN_LENGTH) base += "0";
  return base;
}

/**
 * The username sign-up asks Auth for, made from the name given there: "Bea Newcomer" is
 * `bea.newcomer`. Accents are dropped rather than the letters under them, and the words are
 * joined by dots. Empty when the name leaves nothing that meets the rules (too short, or
 * reserved), and then the auth trigger makes one from the email, as it does when it finds
 * this one taken.
 */
export function usernameFromName(name: string): string {
  const candidate = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s\-–—]+/g, ".")
    .replace(/[^a-z0-9._]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, USERNAME_MAX_LENGTH)
    .replace(/[._]+$/, "");
  return isValidUsername(candidate) ? candidate : "";
}

/**
 * The names sign-up tries, in order, for a username made from a name: `kit`, then `kit2` to
 * `kit9`, each kept to the length limit and the rules. The first one free is asked for; when none
 * is, the auth trigger falls back to the email.
 */
export function numberedUsernames(base: string): string[] {
  if (!isValidUsername(base)) return [];
  const candidates = [base];
  for (let n = 2; n <= 9; n++) {
    const stem = base.slice(0, USERNAME_MAX_LENGTH - 1).replace(/[._]+$/, "");
    const candidate = `${stem}${n}`;
    if (isValidUsername(candidate)) candidates.push(candidate);
  }
  return candidates;
}
