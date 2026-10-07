/** Shared by the local seed and its independent database verifier. */
const months = Number(process.env.AUDIT_HISTORY_MONTHS ?? 56);
if (!Number.isInteger(months) || months < 1 || months > 120)
  throw new Error("AUDIT_HISTORY_MONTHS must be an integer from 1 to 120.");

export const AUDIT_HISTORY_MONTHS = months;
export const AUDIT_HISTORY_VERSION = `history-${months}-months-v1`;
export const AUDIT_EXTENDED_PERSONAS = process.env.AUDIT_EXTENDED_PERSONAS === "true";
export const AUDIT_HISTORY_USERNAMES = [
  "vinit",
  "shreyash",
  "priya",
  "alex",
  ...(AUDIT_EXTENDED_PERSONAS ? ["maya", "noah", "leah", "omar"] : []),
];
