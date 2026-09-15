import { z } from "zod";

/** What the Find people field sends: a handle, the start of a name, or an email. */
export const searchQuerySchema = z
  .string()
  .trim()
  .min(1, "Type a username or email.")
  .max(64, "Keep this under 64 characters.");
