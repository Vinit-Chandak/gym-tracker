import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { MAX_COACH_FILE_BYTES, saveCoachAttachment } from "@/server/repositories/coach-attachments";
import { CoachingError } from "@/server/repositories/coaching-state";

export async function POST(request: Request) {
  const user = await requireProfiledUser();
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Upload from this app's programme screen." }, { status: 403 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new CoachingError("Choose a file.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_COACH_FILE_BYTES) {
        await reader.cancel();
        throw new CoachingError("Files must be 3 MB or smaller.", 413);
      }
      chunks.push(value);
    }
    const name = decodeURIComponent(request.headers.get("x-file-name") ?? "");
    const file = await withUser(getDb(), user.id, (tx) =>
      saveCoachAttachment(
        tx,
        user.id,
        name,
        request.headers.get("content-type") ?? "",
        Buffer.concat(chunks),
      ),
    );
    return Response.json(
      { file },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof CoachingError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "The file could not be saved. Please retry." }, { status: 500 });
  }
}
