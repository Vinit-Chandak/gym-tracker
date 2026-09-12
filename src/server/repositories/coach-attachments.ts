import { and, count, desc, eq, inArray } from "drizzle-orm";
import { coachAttachments, coachJobs, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { CoachingError } from "./coaching-state";

export const MAX_COACH_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_COACH_FILES = 20;
export async function listCoachAttachments(db: DbOrTx, userId: string) {
  return db
    .select({
      id: coachAttachments.id,
      name: coachAttachments.name,
      mimeType: coachAttachments.mimeType,
      sizeBytes: coachAttachments.size,
      createdAt: coachAttachments.createdAt,
    })
    .from(coachAttachments)
    .where(eq(coachAttachments.userId, userId))
    .orderBy(desc(coachAttachments.createdAt));
}
export async function getCoachAttachment(db: DbOrTx, userId: string, id: string) {
  const [file] = await db
    .select()
    .from(coachAttachments)
    .where(and(eq(coachAttachments.userId, userId), eq(coachAttachments.id, id)));
  if (!file) throw new CoachingError("File not found.", 404);
  return file;
}
export async function saveCoachAttachment(
  db: DbOrTx,
  userId: string,
  name: string,
  mimeType: string,
  bytes: Uint8Array,
) {
  if (!bytes.length || bytes.length > MAX_COACH_FILE_BYTES)
    throw new CoachingError("Choose a file between 1 byte and 3 MB.", 413);
  const data = Buffer.from(bytes);
  const safeName = name
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, 160);
  if (!safeName) throw new CoachingError("The file needs a name.", 400);
  const pdf = data.subarray(0, 5).toString() === "%PDF-";
  const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg = data[0] === 255 && data[1] === 216 && data[2] === 255;
  const text =
    ["text/plain", "text/markdown"].includes(mimeType) &&
    !data.includes(0) &&
    !data.toString("utf8").includes("\uFFFD");
  const valid =
    (mimeType === "application/pdf" && pdf) ||
    (mimeType === "image/png" && png) ||
    (mimeType === "image/jpeg" && jpg) ||
    text;
  if (!valid)
    throw new CoachingError(
      "Use a PDF, JPG, PNG or UTF-8 text file with its correct file type.",
      415,
    );
  const [total] = await db
    .select({ count: count() })
    .from(coachAttachments)
    .where(eq(coachAttachments.userId, userId));
  if ((total?.count ?? 0) >= MAX_COACH_FILES)
    throw new CoachingError(
      "You can keep up to 20 reports. Remove a file before adding another.",
      422,
    );
  const [file] = await db
    .insert(coachAttachments)
    .values({
      userId,
      name: safeName,
      mimeType,
      size: data.length,
      content: data.toString("base64"),
    })
    .returning({
      id: coachAttachments.id,
      name: coachAttachments.name,
      mimeType: coachAttachments.mimeType,
      sizeBytes: coachAttachments.size,
      createdAt: coachAttachments.createdAt,
    });
  return file!;
}
export async function removeCoachAttachment(db: DbOrTx, userId: string, id: string) {
  await getCoachAttachment(db, userId, id);
  await db
    .delete(coachAttachments)
    .where(and(eq(coachAttachments.userId, userId), eq(coachAttachments.id, id)));
  await db
    .update(coachJobs)
    .set({
      status: "superseded",
      error: "An attached report was removed.",
      completedAt: new Date(),
      leaseUntil: null,
    })
    .where(and(eq(coachJobs.userId, userId), inArray(coachJobs.status, ["queued", "claimed"])));
  await db
    .update(programDrafts)
    .set({ status: "superseded" })
    .where(
      and(
        eq(programDrafts.userId, userId),
        inArray(programDrafts.source, ["ai", "weekly"]),
        inArray(programDrafts.status, ["editing", "ready"]),
      ),
    );
}
