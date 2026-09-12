/** A return address must stay inside this app, including after URL normalization. */
export function safeAppPath(value: string | null | undefined): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value))
    return null;
  const base = "https://app.invalid";
  try {
    return new URL(value, base).origin === base ? value : null;
  } catch {
    return null;
  }
}
