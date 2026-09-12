import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { MAX_COACH_FILE_BYTES, saveCoachAttachment } from "@/server/repositories/coach-attachments";
import { CoachingError } from "@/server/repositories/coaching-state";

/**
 * The upload has to come from the app's own screen, not from another site holding the
 * athlete's cookie.
 *
 * The comparison is against the host the browser actually asked for, which is what the
 * framework itself compares for a Server Action. `request.url` is the server's own view and
 * says `localhost` whatever the athlete typed, so measuring against it refused every real
 * upload — from a custom domain, from anything behind a proxy, from an address that is not
 * the one the process happens to name itself.
 */
function fromThisApp(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const user = await requireProfiledUser();
  if (!fromThisApp(request))
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
