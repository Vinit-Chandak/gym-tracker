/** Walks Drizzle's wrapped errors (`Failed query …` → cause) to find a Postgres error code. */
export function postgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current.cause;
  }
  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  if (postgresErrorCode(error) === "23505") return true;
  let current: unknown = error;
  while (current instanceof Error) {
    if (/duplicate key value/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}
