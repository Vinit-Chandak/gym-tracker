/**
 * Avatars are drawn, not uploaded: the first letter of the name on a circle whose hue comes
 * from the username, so the same person is the same colour on every screen and in every
 * account that sees them, with nothing stored.
 */

/** A hue in degrees, the same for a username every time. FNV-1a over the code units. */
export function avatarHue(username: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < username.length; i++) {
    hash ^= username.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

/** The letter on the circle: the display name's first, or the username's when there is none. */
export function avatarInitial(displayName: string | null | undefined, username: string): string {
  const source = displayName?.trim() || username;
  const first = [...source][0] ?? "?";
  return first.toLocaleUpperCase();
}
