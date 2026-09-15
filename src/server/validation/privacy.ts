/** The four switches on Profile › Privacy (plan §3.7), each a column on the profile. */
export const PRIVACY_KEYS = [
  "followApproval",
  "shareTraining",
  "shareBodyWeight",
  "discoverableByEmail",
] as const;
export type PrivacyKey = (typeof PRIVACY_KEYS)[number];
