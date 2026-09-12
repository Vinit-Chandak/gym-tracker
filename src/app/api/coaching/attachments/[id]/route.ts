import { z } from "zod";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { getCoachAttachment } from "@/server/repositories/coach-attachments";
import { CoachingError } from "@/server/repositories/coaching-state";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireProfiledUser();
  try {
    const id = z.uuid().parse((await context.params).id);
    const file = await withUser(getDb(), user.id, (tx) => getCoachAttachment(tx, user.id, id), {
      readOnly: true,
    });
    return new Response(Buffer.from(file.content, "base64"), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      { error: "File not found." },
      { status: error instanceof CoachingError ? error.status : 404 },
    );
  }
}
