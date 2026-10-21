/**
 * "About weekly distance", "About max HR", "About RIR": an ⓘ's name, the label in its own case,
 * its first letter lowered unless it starts an initialism, so the name reads as a phrase without
 * flattening an abbreviation. A plain module, not the tip's: server components name tips too, and
 * a function from a client module is only a reference there.
 */
export function aboutLabel(label: string): string {
  const phrase = /^\p{Lu}{2}/u.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
  return `About ${phrase}`;
}
